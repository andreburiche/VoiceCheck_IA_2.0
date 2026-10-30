"""Motor interno de análise acústica (numpy/scipy).

Segue as definições do Praat sempre que possível (Boersma, 1993; manual do
Praat, "Voice"), mas é uma implementação própria. Os valores absolutos de
HNR e CPPS podem diferir do Praat; para comparar com pontos de corte
publicados, use o motor "praat".
"""

from __future__ import annotations

import numpy as np

from . import excitacao, graficos
from .audio import Audio, reamostrar

PASSO = 0.01  # s entre quadros de pitch
LIMIAR_VOZEAMENTO = 0.45  # correlação normalizada mínima
LIMIAR_SILENCIO = 0.03  # fração do pico global
FATOR_MAX_AMPLITUDE = 1.6  # Praat: "maximum amplitude factor" do shimmer
FATOR_MAX_PERIODO = 1.3  # como no Praat
PERIODO_MIN, PERIODO_MAX = 0.0001, 0.02  # s, como no Praat


# --------------------------------------------------------------------------
# Pitch e harmonicidade por autocorrelação normalizada (Boersma, 1993)
# --------------------------------------------------------------------------

def _quadros(n: int, janela: int, passo: int) -> np.ndarray:
    if n < janela:
        return np.array([], dtype=int)
    return np.arange(0, n - janela + 1, passo)


def _autocorr(x: np.ndarray, nfft: int) -> np.ndarray:
    espec = np.fft.rfft(x, nfft)
    return np.fft.irfft(np.abs(espec) ** 2, nfft)[: len(x)]


def rastrear_pitch(audio: Audio, f0_min: float, f0_max: float):
    """Devolve (tempos, f0, correlacao) por quadro; f0 = nan se surdo."""
    taxa = audio.taxa
    x = audio.amostras
    janela = int(round(3.0 / f0_min * taxa))  # 3 períodos do f0 mínimo
    passo = int(round(PASSO * taxa))
    inicios = _quadros(len(x), janela, passo)

    w = np.hanning(janela)
    nfft = 1 << int(np.ceil(np.log2(2 * janela)))
    rw = _autocorr(w, nfft)
    rw = rw / rw[0]

    lag_min = max(2, int(np.floor(taxa / f0_max)))
    lag_max = min(janela // 2, int(np.ceil(taxa / f0_min)))
    pico_global = np.max(np.abs(x))

    tempos, f0s, corrs = [], [], []
    for ini in inicios:
        quadro = x[ini : ini + janela]
        tempos.append((ini + janela / 2) / taxa)
        if np.max(np.abs(quadro)) < LIMIAR_SILENCIO * pico_global:
            f0s.append(np.nan)
            corrs.append(0.0)
            continue
        xw = (quadro - quadro.mean()) * w
        r = _autocorr(xw, nfft)
        if r[0] <= 0:
            f0s.append(np.nan)
            corrs.append(0.0)
            continue
        rn = (r / r[0]) / np.maximum(rw, 1e-3)
        trecho = rn[lag_min : lag_max + 1]
        # máximos locais candidatos
        candidatos = [
            i for i in range(1, len(trecho) - 1)
            if trecho[i] >= trecho[i - 1] and trecho[i] > trecho[i + 1]
        ]
        if not candidatos:
            f0s.append(np.nan)
            corrs.append(0.0)
            continue
        melhor = max(trecho[i] for i in candidatos)
        if not melhor > LIMIAR_VOZEAMENTO:
            # sem periodicidade (o pico pode até ser negativo, e aí "≥ 95 % do melhor" não acha nenhum)
            f0s.append(np.nan)
            corrs.append(float(max(melhor, 0.0)) if np.isfinite(melhor) else 0.0)
            continue
        # prefere o menor atraso próximo do máximo (evita erro de oitava abaixo)
        i = next(i for i in candidatos if trecho[i] >= 0.95 * melhor)
        a, b, c = trecho[i - 1], trecho[i], trecho[i + 1]
        denom = a - 2 * b + c
        desloc = 0.5 * (a - c) / denom if denom != 0 else 0.0
        lag = lag_min + i + desloc
        valor = b - 0.25 * (a - c) * desloc
        if valor < LIMIAR_VOZEAMENTO:
            f0s.append(np.nan)
            corrs.append(float(valor))
            continue
        f0s.append(taxa / lag)
        corrs.append(float(min(valor, 0.999999)))
    return np.array(tempos), corrigir_oitavas(np.array(f0s), f0_min, f0_max), np.array(corrs)


def corrigir_oitavas(f0s: np.ndarray, f0_min: float, f0_max: float, raio: int = 5) -> np.ndarray:
    """Corrige saltos isolados de oitava (metade ou dobro da mediana local)."""
    saida = f0s.copy()
    for i, f in enumerate(f0s):
        if np.isnan(f):
            continue
        vizinhos = f0s[max(0, i - raio) : i + raio + 1]
        vizinhos = vizinhos[~np.isnan(vizinhos)]
        if len(vizinhos) < 3:
            continue
        ref = np.median(vizinhos)
        for fator in (2.0, 0.5):
            candidato = f * fator
            if f0_min <= candidato <= f0_max and abs(np.log2(candidato / ref)) < 0.25 < abs(np.log2(f / ref)):
                saida[i] = candidato
                break
    return saida


# --------------------------------------------------------------------------
# Marcação de ciclos glóticos por correlação cruzada (como "periodic, cc")
# --------------------------------------------------------------------------

def _trechos_vozeados(tempos, f0s, folga=0.03):
    """Agrupa quadros vozeados contíguos em trechos (inicio, fim) em s."""
    trechos = []
    inicio = None
    for t, f in zip(tempos, f0s):
        if not np.isnan(f) and inicio is None:
            inicio = t
        elif np.isnan(f) and inicio is not None:
            trechos.append((inicio - folga, t - PASSO + folga))
            inicio = None
    if inicio is not None:
        trechos.append((inicio - folga, tempos[-1] + folga))
    return trechos


def marcar_ciclos(audio: Audio, tempos, f0s):
    """Devolve lista de trechos; cada trecho = (instantes_s, amplitudes)."""
    x = audio.amostras
    taxa = audio.taxa
    vozeado = ~np.isnan(f0s)
    if not vozeado.any():
        return []
    tv, fv = tempos[vozeado], f0s[vozeado]

    def periodo_em(amostra: float) -> float:
        return taxa / np.interp(amostra / taxa, tv, fv)

    pico_global = float(np.max(np.abs(x)))

    def _parabola(a: float, b: float, c: float) -> float:
        """Deslocamento (−0,5..0,5) do máximo de uma parábola por três pontos vizinhos."""
        den = a - 2 * b + c
        return float(np.clip(0.5 * (a - c) / den, -0.5, 0.5)) if den != 0 else 0.0

    def seguir_ciclos(p: int, fim: int):
        """Segue ciclo a ciclo a partir do pico p. Devolve (marcas, amps, onde_parou).

        Como o "To PointProcess (periodic, cc)" do Praat, o instante de cada ciclo vem da
        correlação com o ciclo anterior (interpolada abaixo da amostra), não do pico da onda:
        em voz aguda a ressonância do ciclo anterior ainda soa e desloca o pico, o que
        inflava o jitter. A amplitude de cada ciclo segue o Praat (RMS com janela de Hann
        em volta da marca).
        """
        marcas: list[float] = [float(p)]
        pos = float(p)
        while True:
            q = int(round(pos))
            T = periodo_em(q)
            meio = int(round(T / 2))
            if q - meio < 0 or q + int(1.25 * T) + meio + 1 >= fim:
                break
            molde = x[q - meio : q + meio]
            norma_m = np.linalg.norm(molde)
            if norma_m < 1e-9:  # silêncio: nada a seguir aqui
                break
            dmin, dmax = int(0.75 * T), int(np.ceil(1.25 * T))
            corr = np.empty(dmax - dmin + 1)
            for k, d in enumerate(range(dmin, dmax + 1)):
                alvo = x[q + d - meio : q + d + meio]
                corr[k] = np.dot(molde, alvo) / (norma_m * np.linalg.norm(alvo) + 1e-12)
            k = int(np.argmax(corr))
            if corr[k] < 0.3:
                break
            frac = _parabola(corr[k - 1], corr[k], corr[k + 1]) if 0 < k < len(corr) - 1 else 0.0
            # a marca anda pelo deslocamento medido a partir da posição arredondada
            pos = pos + (q - pos) + dmin + k + frac
            marcas.append(pos)
        # amplitude de cada ciclo como o Praat (PointProcess_Sound_to_AmplitudeTier_period):
        # RMS com janela de Hann em volta do pulso, de 20 % do período anterior a 20 % do
        # seguinte. O pulso é o maior valor absoluto do ciclo (até meio período da marca da
        # correlação, que pode estar noutra fase da onda). Conferido contra o Praat com vozes
        # sintéticas (scripts/concordancia_motores.py). Só marcas com vizinhas dos dois lados.
        amps = []
        for i in range(1, len(marcas) - 1):
            m = marcas[i]
            r = max(1, int(0.25 * (marcas[i + 1] - marcas[i - 1])))
            c0 = int(round(m))
            if c0 - r - 1 >= 0 and c0 + r + 2 <= len(x):
                jan = np.abs(x[c0 - r : c0 + r + 1])
                j = int(np.argmax(jan))
                m = c0 - r + j + (_parabola(jan[j - 1], jan[j], jan[j + 1]) if 0 < j < len(jan) - 1 else 0.0)
            esq, dir_ = 0.2 * (m - marcas[i - 1]), 0.2 * (marcas[i + 1] - m)
            if esq <= 0 or dir_ <= 0:
                amps.append(float(abs(x[c0])))
                continue
            i0, i1 = max(0, int(np.ceil(m - esq))), min(len(x), int(np.floor(m + dir_)) + 1)
            s = np.arange(i0, i1, dtype=float)
            u = np.where(s < m, (s - (m - esq)) / esq, (m + dir_ - s) / dir_)  # 0 nas pontas, 1 no pulso
            w = np.sin(0.5 * np.pi * np.clip(u, 0, 1)) ** 2  # Hann
            amps.append(float(np.sqrt(np.sum((w * x[i0:i1]) ** 2) / max(np.sum(w * w), 1e-12))))
        parou = int(round(marcas[-1]))
        # a primeira marca sai da série: o período i (marca i → i+1) fica com a amplitude da marca i
        return marcas[1:], amps, parou

    resultado = []
    for ini_s, fim_s in _trechos_vozeados(tempos, f0s):
        ini = max(0, int(ini_s * taxa))
        fim = min(len(x), int(fim_s * taxa))
        pos = ini
        # quando um ciclo não é reconhecido (silêncio no início, ruído, ciclo
        # irregular), recomeça um período adiante em vez de perder o trecho
        while fim - pos >= 3 * periodo_em(pos):
            T = periodo_em(pos)
            ini_busca = pos + int(np.ceil(T / 2)) + 1  # meio período antes do 1º pico
            janela = x[ini_busca : ini_busca + int(T)]
            if np.max(np.abs(janela)) < LIMIAR_SILENCIO * pico_global:
                pos += int(T)
                continue
            p = ini_busca + int(np.argmax(janela))
            marcas, amps, parou = seguir_ciclos(p, fim)
            if len(marcas) >= 4:
                # período i = marcas[i+1] - marcas[i]; amplitude i = pico dentro dele
                resultado.append((np.array(marcas) / taxa, np.array(amps)))
            pos = parou + int(T)
    return resultado


# --------------------------------------------------------------------------
# Medidas de perturbação (definições do manual do Praat)
# --------------------------------------------------------------------------

def _periodos_validos(trechos):
    """Lista de arrays de períodos já filtrados pelos critérios do Praat."""
    saida = []
    for instantes, amps in trechos:
        per = np.diff(instantes)
        ok = (per >= PERIODO_MIN) & (per <= PERIODO_MAX)
        saida.append((per, amps[: len(per)], ok))
    return saida


def perturbacao(trechos) -> dict:
    dif_per, soma_per, n_per = [], 0.0, 0
    rap, ppq5 = [], []
    dif_amp, db_amp, soma_amp, n_amp = [], [], 0.0, 0
    apq3, apq5 = [], []

    for per, amps, ok in _periodos_validos(trechos):
        soma_per += per[ok].sum()
        n_per += int(ok.sum())
        soma_amp += amps[ok].sum()
        n_amp += int(ok.sum())
        for i in range(1, len(per)):
            if ok[i] and ok[i - 1] and max(per[i], per[i - 1]) / min(per[i], per[i - 1]) <= FATOR_MAX_PERIODO:
                dif_per.append(abs(per[i] - per[i - 1]))
                if amps[i] > 0 and amps[i - 1] > 0 and max(amps[i], amps[i - 1]) / min(amps[i], amps[i - 1]) <= FATOR_MAX_AMPLITUDE:
                    dif_amp.append(abs(amps[i] - amps[i - 1]))
                    db_amp.append(abs(20 * np.log10(amps[i] / amps[i - 1])))
        for i in range(1, len(per) - 1):
            if ok[i - 1 : i + 2].all():
                rap.append(abs(per[i] - per[i - 1 : i + 2].mean()))
                apq3.append(abs(amps[i] - amps[i - 1 : i + 2].mean()))
        for i in range(2, len(per) - 2):
            if ok[i - 2 : i + 3].all():
                ppq5.append(abs(per[i] - per[i - 2 : i + 3].mean()))
                apq5.append(abs(amps[i] - amps[i - 2 : i + 3].mean()))

    if n_per < 3 or not dif_per:
        return {}
    media_per = soma_per / n_per
    media_amp = soma_amp / n_amp

    def pct(lista, media):
        return round(100 * float(np.mean(lista)) / media, 3) if lista else None

    return {
        "jitter_local_pct": pct(dif_per, media_per),
        "jitter_local_abs_us": round(1e6 * float(np.mean(dif_per)), 2),
        "jitter_rap_pct": pct(rap, media_per),
        "jitter_ppq5_pct": pct(ppq5, media_per),
        "shimmer_local_pct": pct(dif_amp, media_amp),
        "shimmer_local_db": round(float(np.mean(db_amp)), 3) if db_amp else None,
        "shimmer_apq3_pct": pct(apq3, media_amp),
        "shimmer_apq5_pct": pct(apq5, media_amp),
        "ciclos": int(n_per),
    }


# --------------------------------------------------------------------------
# CPPS (Hillenbrand et al., 1994; parâmetros próximos aos do Praat)
# --------------------------------------------------------------------------

def cpps(audio: Audio, f0_min=60.0, f0_max=330.0, suavizar: bool = True) -> float | None:
    """CPPS (suavizado, Hillenbrand) ou, com suavizar=False, CPP: pico cepstral de cada quadro sem média."""
    taxa = 10000
    x = reamostrar(audio.amostras, audio.taxa, taxa)
    janela = int(0.04 * taxa)
    passo = int(0.002 * taxa)
    inicios = _quadros(len(x), janela, passo)
    if len(inicios) < 5:
        return None
    w = np.hanning(janela)
    nfft = 1024
    pico = np.max(np.abs(x))
    quadros, ativos = [], []
    for ini in inicios:
        q = x[ini : ini + janela]
        ativos.append(np.max(np.abs(q)) >= LIMIAR_SILENCIO * pico)
        espec_db = 10 * np.log10(np.abs(np.fft.rfft(q * w, nfft)) ** 2 + 1e-20)
        # cepstro de potência: transformada inversa do espectro em dB
        cep = np.abs(np.fft.irfft(espec_db - espec_db.mean(), nfft)[: nfft // 2]) ** 2
        quadros.append(cep)
    cg = np.array(quadros)  # quadros x quefrência, potência linear

    # suavização na escala linear (antes do dB): 10 ms no tempo, 1 ms na quefrência
    dq = 1.0 / taxa  # passo de quefrência (s)
    k_t = 5 if suavizar else 1
    k_q = max(1, int(round(0.001 / dq))) if suavizar else 1
    nucleo_t = np.ones(k_t) / k_t
    nucleo_q = np.ones(k_q) / k_q
    cg = np.apply_along_axis(lambda c: np.convolve(c, nucleo_t, mode="same"), 0, cg)
    cg = np.apply_along_axis(lambda c: np.convolve(c, nucleo_q, mode="same"), 1, cg)
    cg = 10 * np.log10(cg + 1e-20)

    quef = np.arange(cg.shape[1]) * dq
    faixa = (quef >= 1.0 / f0_max) & (quef <= 1.0 / f0_min)
    ajuste = (quef >= 0.001) & (quef <= 0.0167)
    valores = []
    for linha, ativo in zip(cg, ativos):
        if not ativo:
            continue
        a, b = np.polyfit(quef[ajuste], linha[ajuste], 1)
        idx = np.flatnonzero(faixa)
        i = idx[np.argmax(linha[idx])]
        valores.append(linha[i] - (a * quef[i] + b))
    return round(float(np.mean(valores)), 2) if valores else None


# --------------------------------------------------------------------------
# Formantes por LPC
# --------------------------------------------------------------------------

def _lpc(x: np.ndarray, ordem: int) -> np.ndarray:
    r = np.correlate(x, x, mode="full")[len(x) - 1 : len(x) + ordem]
    a = np.zeros(ordem + 1)
    a[0] = 1.0
    erro = r[0]
    if erro <= 0:
        return a
    for i in range(1, ordem + 1):
        acc = r[i] + np.dot(a[1:i], r[i - 1 : 0 : -1])
        k = -acc / erro
        a[1 : i + 1] = a[1 : i + 1] + k * np.concatenate((a[i - 1 : 0 : -1], [1.0]))
        erro *= 1 - k * k
        if erro <= 0:
            break
    return a


def formantes(audio: Audio, tempos, f0s, teto=5500.0) -> dict:
    taxa = int(2 * teto)
    x = reamostrar(audio.amostras, audio.taxa, taxa)
    x = np.append(x[0], x[1:] - np.exp(-2 * np.pi * 50 / taxa) * x[:-1])
    janela = int(0.025 * taxa)
    w = np.hamming(janela)
    f1s, f2s, f3s = [], [], []
    for t, f in zip(tempos, f0s):
        if np.isnan(f):
            continue
        ini = int(t * taxa) - janela // 2
        if ini < 0 or ini + janela > len(x):
            continue
        a = _lpc(x[ini : ini + janela] * w, 10)
        raizes = [r for r in np.roots(a) if np.imag(r) > 0]
        cand = sorted(
            (np.angle(r) * taxa / (2 * np.pi), -taxa / np.pi * np.log(abs(r)))
            for r in raizes
        )
        freqs = [fr for fr, bw in cand if fr > 90 and bw < 400]
        if len(freqs) >= 2:
            f1s.append(freqs[0])
            f2s.append(freqs[1])
            if len(freqs) >= 3:
                f3s.append(freqs[2])

    def med(v):
        return round(float(np.median(v)), 1) if v else None

    return {"f1_hz": med(f1s), "f2_hz": med(f2s), "f3_hz": med(f3s)}


# --------------------------------------------------------------------------
# Análise completa
# --------------------------------------------------------------------------

def _semitons(f, ref=100.0):
    return 12 * np.log2(f / ref)


def estatisticas_f0(f0s: np.ndarray) -> dict:
    f0v = f0s[~np.isnan(f0s)]
    st = _semitons(f0v)
    return {
        "media_hz": round(float(np.mean(f0v)), 2),
        "mediana_hz": round(float(np.median(f0v)), 2),
        "dp_hz": round(float(np.std(f0v)), 2),
        "min_hz": round(float(np.min(f0v)), 2),
        "max_hz": round(float(np.max(f0v)), 2),
        "dp_semitons": round(float(np.std(st)), 3),
        "faixa_semitons": round(float(np.ptp(st)), 2),
    }


def medidas_fonacao(tempos: np.ndarray, f0s: np.ndarray, f0_min: float, passo=PASSO) -> dict:
    """TMF, fração de quadros surdos e quebras de voz a partir do rastreio de pitch."""
    vozeado = ~np.isnan(f0s)
    i_ini, i_fim = np.flatnonzero(vozeado)[[0, -1]]
    miolo = vozeado[i_ini : i_fim + 1]
    lacunas = np.diff(np.flatnonzero(miolo)) - 1
    limite_quebra = int(np.ceil(1.25 / f0_min / passo))
    quebras = int(np.sum(lacunas >= limite_quebra))

    # maior trecho vozeado, tolerando lacunas de até 100 ms
    maior, atual, ultimo = 0.0, 0.0, None
    for t in tempos[vozeado]:
        if ultimo is not None and t - ultimo <= 0.1 + 1e-9:
            atual += t - ultimo
        else:
            atual = 0.0
        maior = max(maior, atual)
        ultimo = t
    return {
        "tmf_s": round(float(maior), 2),
        "fracao_surdos_pct": round(100 * float(np.mean(~miolo)), 2),
        "quebras_de_voz": quebras,
    }


def analisar(audio: Audio, f0_min=75.0, f0_max=600.0) -> dict:
    tempos, f0s, corrs = rastrear_pitch(audio, f0_min, f0_max)
    vozeado = ~np.isnan(f0s)
    avisos = []
    if vozeado.sum() < 5:
        return {
            "motor": "interno",
            "duracao_s": round(audio.duracao, 3),
            "avisos": ["Não foi encontrada voz suficiente na gravação."],
        }

    # intensidade relativa (dBFS), quadros de 40 ms
    janela = int(0.04 * audio.taxa)
    rms_db = []
    for t in tempos[vozeado]:
        ini = max(0, int(t * audio.taxa) - janela // 2)
        q = audio.amostras[ini : ini + janela]
        rms_db.append(20 * np.log10(np.sqrt(np.mean(q**2)) + 1e-12))
    rms_db = np.array(rms_db)

    # harmonicidade (HNR) a partir da correlação dos quadros vozeados
    r = np.clip(corrs[vozeado], 1e-6, 0.999999)
    hnr = 10 * np.log10(r / (1 - r))

    ciclos = marcar_ciclos(audio, tempos, f0s)
    pert = perturbacao(ciclos)
    exc = excitacao.medir(audio.amostras, audio.taxa, _trechos_vozeados(tempos, f0s), ciclos)
    if not pert:
        avisos.append("Ciclos insuficientes para jitter e shimmer; use vogal sustentada de 3 s ou mais.")
    if np.max(np.abs(audio.amostras)) >= 0.999:
        avisos.append("A gravação saturou (clipping); afaste o microfone e grave de novo.")
    avisos.append("Intensidade em dBFS (relativa): sem microfone calibrado não há dB SPL.")

    return {
        "motor": "interno",
        "duracao_s": round(audio.duracao, 3),
        "f0": estatisticas_f0(f0s),
        "intensidade": {
            "media_dbfs": round(float(10 * np.log10(np.mean(10 ** (rms_db / 10)))), 2),
            "min_dbfs": round(float(np.min(rms_db)), 2),
            "max_dbfs": round(float(np.max(rms_db)), 2),
        },
        "perturbacao": pert,
        "ruido": {"hnr_db": round(float(np.mean(hnr)), 2)},
        "cpps_db": cpps(audio),
        "excitacao": exc,
        "graficos": graficos.montar(audio, tempos, f0s),
        "formantes": formantes(audio, tempos, f0s),
        "fonacao": medidas_fonacao(tempos, f0s, f0_min),
        "avisos": avisos,
    }
