"""Motor Praat: usa o próprio Praat via Parselmouth (pip install praat-parselmouth).

Os parâmetros seguem os padrões do Praat ("Voice report") e do roteiro de AVQI
para o CPPS, para que os números sejam comparáveis aos da literatura.
Cada medida é calculada separadamente: se uma chamada falhar (por exemplo, por
diferença de versão do Praat), as outras continuam e o motivo vai para "avisos".
"""

from __future__ import annotations

import numpy as np

from .audio import Audio
from . import ddf_segmentos, excitacao, graficos
from .motor_interno import _trechos_vozeados, estatisticas_f0, marcar_ciclos, medidas_fonacao

try:  # importação opcional
    import parselmouth
    from parselmouth.praat import call

    DISPONIVEL = True
except ImportError:  # pragma: no cover - depende do ambiente
    parselmouth = None
    call = None
    DISPONIVEL = False

DB_REF_PRAAT = 20 * np.log10(2e-5)  # Praat assume Pa; converte para dBFS
PERT = (0, 0, 0.0001, 0.02, 1.3)  # intervalo, período mín./máx., fator máx.


def _seguro(avisos: list, nome: str, funcao):
    try:
        valor = funcao()
    except Exception as exc:  # parselmouth.PraatError e outros
        avisos.append(f"{nome}: não calculado ({exc.__class__.__name__}).")
        return None
    if valor is None:
        return None
    valor = float(valor)
    return None if np.isnan(valor) else valor


def _r(v, casas=3):
    return None if v is None else round(v, casas)


def _cpps(snd) -> float:
    cepstrograma = call(snd, "To PowerCepstrogram", 60, 0.002, 5000, 50)
    try:  # sintaxe do Praat 6.1+ (mesma do roteiro de AVQI)
        return call(cepstrograma, "Get CPPS", False, 0.01, 0.001, 60, 330, 0.05,
                    "parabolic", 0.001, 0.0, "Straight", "Robust")
    except Exception:  # versões mais novas aceitam outros nomes de opção
        return call(cepstrograma, "Get CPPS", False, 0.01, 0.001, 60, 330, 0.05,
                    "parabolic", 0.001, 0.05, "Straight", "Robust slow")


def analisar(audio: Audio, f0_min=75.0, f0_max=600.0) -> dict:
    if not DISPONIVEL:
        raise RuntimeError("Parselmouth não está instalado.")

    avisos: list[str] = []
    snd = parselmouth.Sound(audio.amostras, sampling_frequency=audio.taxa)

    pitch = snd.to_pitch_ac(time_step=0.01, pitch_floor=f0_min, pitch_ceiling=f0_max)
    tempos = np.asarray(pitch.xs())
    f0s = np.asarray(pitch.selected_array["frequency"], dtype=float)
    f0s[f0s <= 0] = np.nan
    if np.sum(~np.isnan(f0s)) < 5:
        return {
            "motor": "praat",
            "duracao_s": round(audio.duracao, 3),
            "avisos": ["Não foi encontrada voz suficiente na gravação."],
        }

    pp = call(snd, "To PointProcess (periodic, cc)", f0_min, f0_max)

    def jit(nome):
        return _seguro(avisos, nome, lambda: call(pp, f"Get {nome}", *PERT))

    def shim(nome):
        return _seguro(avisos, nome, lambda: call([snd, pp], f"Get {nome}", *PERT, 1.6))

    j_local = jit("jitter (local)")
    j_abs = jit("jitter (local, absolute)")
    perturbacao = {
        "jitter_local_pct": _r(None if j_local is None else 100 * j_local),
        "jitter_local_abs_us": _r(None if j_abs is None else 1e6 * j_abs, 2),
        "jitter_rap_pct": _r(None if (v := jit("jitter (rap)")) is None else 100 * v),
        "jitter_ppq5_pct": _r(None if (v := jit("jitter (ppq5)")) is None else 100 * v),
        "shimmer_local_pct": _r(None if (v := shim("shimmer (local)")) is None else 100 * v),
        "shimmer_local_db": _r(shim("shimmer (local_dB)")),
        "shimmer_apq3_pct": _r(None if (v := shim("shimmer (apq3)")) is None else 100 * v),
        "shimmer_apq5_pct": _r(None if (v := shim("shimmer (apq5)")) is None else 100 * v),
        "ciclos": int(call(pp, "Get number of periods", 0, 0, *PERT[2:])),
    }

    hnr = _seguro(avisos, "HNR", lambda: call(
        call(snd, "To Harmonicity (cc)", 0.01, f0_min, 0.1, 1.0), "Get mean", 0, 0))

    intensidade = snd.to_intensity(minimum_pitch=f0_min)
    i_media = _seguro(avisos, "intensidade", lambda: call(intensidade, "Get mean", 0, 0, "energy"))
    i_min = _seguro(avisos, "intensidade", lambda: call(intensidade, "Get minimum", 0, 0, "Parabolic"))
    i_max = _seguro(avisos, "intensidade", lambda: call(intensidade, "Get maximum", 0, 0, "Parabolic"))

    formante = snd.to_formant_burg(time_step=0.01, max_number_of_formants=5, maximum_formant=5500)
    vozeados = tempos[~np.isnan(f0s)]

    def mediana_formante(n):
        valores = [formante.get_value_at_time(n, t) for t in vozeados]
        valores = [v for v in valores if v is not None and not np.isnan(v)]
        return round(float(np.median(valores)), 1) if valores else None

    cpps = _seguro(avisos, "CPPS", lambda: _cpps(snd))
    # GNE e MWC (medidas do GHD): calculadas aqui mesmo, sobre o pitch do Praat
    try:
        exc = excitacao.medir(
            audio.amostras, audio.taxa, _trechos_vozeados(tempos, f0s), marcar_ciclos(audio, tempos, f0s))
    except Exception as erro:  # a análise principal não pode cair por causa de uma medida extra
        avisos.append(f"GNE/MWC: não calculado ({erro.__class__.__name__}).")
        exc = {}
    # nuvem de pontos do Diagrama de Desvio Fonatório: jitter e shimmer do PRÓPRIO Praat em cada trecho
    def pert_trecho(a: float, b: float):
        j = call(pp, "Get jitter (local)", a, b, *PERT[2:])
        s = call([snd, pp], "Get shimmer (local)", a, b, *PERT[2:], 1.6)
        ok = lambda v: v is not None and not (isinstance(v, float) and np.isnan(v))  # noqa: E731
        return (100 * j if ok(j) else None, 100 * s if ok(s) else None)

    try:
        segmentos = ddf_segmentos.medir(audio.amostras, audio.taxa, _trechos_vozeados(tempos, f0s), pert_trecho)
    except Exception as erro:
        avisos.append(f"Diagrama de desvio por trecho: não calculado ({erro.__class__.__name__}).")
        segmentos = []
    try:
        graf = graficos.montar(audio, tempos, f0s)
    except Exception as erro:  # os gráficos nunca derrubam a análise
        avisos.append(f"Gráficos: não calculados ({erro.__class__.__name__}).")
        graf = None

    if np.max(np.abs(audio.amostras)) >= 0.999:
        avisos.append("A gravação saturou (clipping); afaste o microfone e grave de novo.")
    avisos.append("Intensidade em dBFS (relativa): sem microfone calibrado não há dB SPL.")

    def dbfs(v):
        return None if v is None else round(v + DB_REF_PRAAT, 2)

    return {
        "motor": "praat",
        "versao_praat": parselmouth.PRAAT_VERSION,
        "duracao_s": round(audio.duracao, 3),
        "f0": estatisticas_f0(f0s),
        "intensidade": {"media_dbfs": dbfs(i_media), "min_dbfs": dbfs(i_min), "max_dbfs": dbfs(i_max)},
        "perturbacao": perturbacao,
        "ruido": {"hnr_db": _r(hnr, 2)},
        "cpps_db": _r(cpps, 2),
        "excitacao": exc,
        "ddf_segmentos": segmentos,
        **({"graficos": graf} if graf else {}),
        "formantes": {"f1_hz": mediana_formante(1), "f2_hz": mediana_formante(2), "f3_hz": mediana_formante(3)},
        "fonacao": medidas_fonacao(tempos, f0s, f0_min),
        "avisos": avisos,
    }
