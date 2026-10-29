"""VoiceCheck IA — "Aprimorar com IA": voz isolada, limpa e corrigida por trecho.

Cadeia (tudo local):
1. Isolar a voz (Demucs, rede neural; roda no worker) — opcional;
2. Limpeza espectral: corta graves inúteis, reduz ruído/vazamento, suaviza "s";
3. Afinação por trecho: força total nos erros apontados pela análise,
   correção leve (configurável) no resto, preservando expressão;
4. Nivelamento: equilibra quedas de intensidade e atenua respirações audíveis;
5. Normalização com limitador de pico.

Este módulo é só numpy e é importado tanto pela API quanto pelo worker.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any, Callable

import numpy as np

from app.services.voicecheck_autotune import (
    AutotuneParams,
    Segment,
    autotune_detailed,
    segment_tuning,
)

Progress = Callable[[str, int], None]


_LABELS = {
    "early_onset": "Entrada adiantada",
    "late_onset": "Entrada atrasada",
    "prolonged_note": "Nota mais longa que a referência",
    "shortened_note": "Nota mais curta que a referência",
    "possible_missing_note": "Nota da referência não cantada",
    "pitch_above_reference": "Altura acima da referência",
    "pitch_below_reference": "Altura abaixo da referência",
}


def _label(category: str, title: str) -> str:
    """Nome em português do tipo de ocorrência (quando o título não veio)."""
    t = title.strip()
    if t and t != category:
        return t
    if category in _LABELS:
        return _LABELS[category]
    try:
        from app.services.voicecheck_student_report import _CAT

        return _CAT.get(category, {}).get("name") or category.replace("_", " ")
    except Exception:  # noqa: BLE001
        return category.replace("_", " ")

NOTE_RE = re.compile(r"^([A-G])(#|b)?(-?\d)$")
_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

#: Categorias de erro de afinação → (intensidade, velocidade ms)
PITCH_FIXES: dict[str, tuple[float, float]] = {
    "pitch_above_reference": (1.0, 25.0),
    "pitch_below_reference": (1.0, 25.0),
    "melodic_consistency_variation": (1.0, 30.0),
    "unstable_sustained_pitch": (0.9, 70.0),
    "irregular_pitch_modulation": (0.85, 80.0),
}
#: Categorias tratadas no nivelamento
LEVEL_FIXES = {"abrupt_intensity_drop"}
BREATH_FIXES = {"possible_audible_breath"}
#: Apontadas pela análise, mas não dá para "consertar" o áudio sem inventar voz
NOT_FIXABLE: dict[str, str] = {
    "possible_voice_break": "Quebra de voz: não dá para reconstruir sem inventar som — treine a passagem.",
    "possible_clipping": "Saturação na gravação: o trecho distorcido não pode ser recuperado; grave com menos volume.",
    "possible_missing_note": "Nota não cantada: o áudio não é inventado.",
    "possible_transposition": "Possível transposição: confira a tonalidade escolhida.",
    "shortened_note": "Duração da nota: questão de ritmo, não de afinação.",
    "prolonged_note": "Duração da nota: questão de ritmo, não de afinação.",
    "early_onset": "Entrada adiantada: ritmo não é alterado — treine com metrônomo.",
    "late_onset": "Entrada atrasada: ritmo não é alterado — treine com metrônomo.",
}
#: Pontos positivos / informativos — nunca mexer
KEEP = {"regular_vibrato", "phrase_pause", "phrase_micro_gap", "insufficient_confidence"}

MAX_EVENTS = 2000


def note_name_to_midi(name: str | None) -> float | None:
    if not name:
        return None
    m = NOTE_RE.match(name.strip())
    if not m:
        return None
    pc = _PC[m.group(1)] + (1 if m.group(2) == "#" else -1 if m.group(2) == "b" else 0)
    return float((int(m.group(3)) + 1) * 12 + pc)


@dataclass
class EventIn:
    id: str
    category: str
    title: str
    start: float
    end: float
    expected_note: str | None = None


@dataclass
class EnhanceOptions:
    #: "enhance" = cadeia completa; "isolate" = só separar a voz (para a análise)
    mode: str = "enhance"
    isolate: bool = True
    denoise: bool = True
    pitch_mode: str = "events"  # events | all | off
    base_strength: float = 0.3  # fora dos trechos com erro (modo events)
    key: int | None = None
    scale: str = "auto"
    retune_ms: float = 60.0
    humanize_cents: float = 12.0
    leveling: bool = True
    breaths: bool = True
    events: list[EventIn] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "EnhanceOptions":
        def fnum(v: Any, lo: float, hi: float, default: float) -> float:
            try:
                x = float(v)
            except (TypeError, ValueError):
                return default
            if not math.isfinite(x):
                return default
            return max(lo, min(hi, x))

        key_raw = d.get("key", "auto")
        key: int | None
        if key_raw in (None, "", "auto"):
            key = None
        else:
            try:
                key = int(key_raw) % 12
            except (TypeError, ValueError):
                key = None
        scale = str(d.get("scale", "auto"))
        if scale not in {"chromatic", "major", "minor", "auto"}:
            scale = "auto"
        mode = str(d.get("pitch_mode", "events"))
        if mode not in {"events", "all", "off"}:
            mode = "events"
        events: list[EventIn] = []
        for raw in (d.get("events") or [])[:MAX_EVENTS]:
            if not isinstance(raw, dict):
                continue
            try:
                start = float(raw.get("start_seconds"))
                end = float(raw.get("end_seconds", start))
            except (TypeError, ValueError):
                continue
            if not (math.isfinite(start) and math.isfinite(end)) or end < start or start < 0:
                continue
            events.append(
                EventIn(
                    id=str(raw.get("id", ""))[:64],
                    category=str(raw.get("category", ""))[:64],
                    title=_label(str(raw.get("category", ""))[:64], str(raw.get("title", "") or ""))[:160],
                    start=start,
                    end=min(end, start + 60.0),
                    expected_note=(str(raw["expected_note"])[:8] if raw.get("expected_note") else None),
                )
            )
        job_mode = str(d.get("mode", "enhance"))
        if job_mode not in {"enhance", "isolate"}:
            job_mode = "enhance"
        return cls(
            mode=job_mode,
            isolate=True if job_mode == "isolate" else bool(d.get("isolate", True)),
            denoise=bool(d.get("denoise", True)),
            pitch_mode=mode,
            base_strength=fnum(d.get("base_strength"), 0, 100, 30) / 100.0,
            key=key,
            scale=scale,
            retune_ms=fnum(d.get("retune_ms"), 0, 400, 60),
            humanize_cents=fnum(d.get("humanize_cents"), 0, 50, 12),
            leveling=bool(d.get("leveling", True)),
            breaths=bool(d.get("breaths", True)),
            events=events,
        )


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------


def _db(x: float) -> float:
    return 20.0 * math.log10(max(x, 1e-9))


def _frame_rms(x: np.ndarray, size: int, hop: int) -> np.ndarray:
    if x.size < size:
        return np.array([float(np.sqrt(np.mean(x.astype(np.float64) ** 2)))]) if x.size else np.zeros(0)
    n = 1 + (x.size - size) // hop
    sq = np.cumsum(np.concatenate([[0.0], x.astype(np.float64) ** 2]))
    starts = np.arange(n) * hop
    return np.sqrt(np.maximum((sq[starts + size] - sq[starts]) / size, 0.0))


def _smooth_gain(g: np.ndarray, attack: float, release: float) -> np.ndarray:
    """Suaviza ganho por frame: desce rápido (attack), sobe devagar (release)."""
    out = np.empty_like(g)
    acc = float(g[0]) if g.size else 1.0
    for i, v in enumerate(g):
        a = attack if v < acc else release
        acc += a * (float(v) - acc)
        out[i] = acc
    return out


def _gain_to_samples(g: np.ndarray, hop: int, size: int, n: int) -> np.ndarray:
    centers = np.arange(g.size) * hop + size / 2.0
    return np.interp(np.arange(n, dtype=np.float32), centers, g).astype(np.float32)


# ---------------------------------------------------------------------------
# 2. Limpeza espectral (em blocos para não estourar a memória)
# ---------------------------------------------------------------------------

N_FFT = 2048
HOP = 512


def spectral_cleanup(x: np.ndarray, sr: int, *, denoise: bool, strong: bool) -> tuple[np.ndarray, dict]:
    n = x.size
    if n < N_FFT * 2:
        return x.astype(np.float32), {}
    win = np.hanning(N_FFT).astype(np.float32)
    pad = N_FFT // 2
    xp = np.pad(x.astype(np.float32), (pad, pad + N_FFT))
    n_frames = 1 + (xp.size - N_FFT) // HOP
    freqs = np.fft.rfftfreq(N_FFT, 1.0 / sr)

    # Curva fixa: passa-altas (corta ronco < 70 Hz), menos "embolado", mais presença.
    eq = np.ones_like(freqs, dtype=np.float32)
    eq[freqs < 60] = 0.0
    ramp = (freqs >= 60) & (freqs < 100)
    eq[ramp] = ((freqs[ramp] - 60) / 40.0).astype(np.float32)
    eq[(freqs >= 200) & (freqs < 450)] *= 0.89  # −1 dB
    eq[(freqs >= 2500) & (freqs < 5000)] *= 1.12  # +1 dB
    sib = (freqs >= 5000) & (freqs < 10000)

    frames_view = np.lib.stride_tricks.sliding_window_view(xp, N_FFT)[::HOP][:n_frames]
    block = 2048

    # Passo 1: perfil de ruído (percentil baixo da magnitude em cada faixa)
    noise = None
    if denoise:
        pcts = []
        for a in range(0, n_frames, block):
            spec = np.abs(np.fft.rfft(frames_view[a : a + block] * win, axis=1))
            if spec.shape[0] >= 8:
                pcts.append(np.percentile(spec, 10, axis=0))
        noise = np.median(np.stack(pcts), axis=0).astype(np.float32) if pcts else None

    over = 2.5 if strong else 1.6
    g_min = 0.1 if strong else 0.18
    out = np.zeros(xp.size, dtype=np.float32)
    wsum = np.zeros(xp.size, dtype=np.float32)
    prev_gain: np.ndarray | None = None
    deessed = 0
    for a in range(0, n_frames, block):
        fr = frames_view[a : a + block] * win
        spec = np.fft.rfft(fr, axis=1)
        mag = np.abs(spec).astype(np.float32)
        gain = np.ones_like(mag)
        if noise is not None:
            p2 = mag * mag
            g = (p2 - over * noise * noise) / np.maximum(p2, 1e-12)
            gain = np.clip(g, g_min, 1.0).astype(np.float32)
            # suaviza em frequência para evitar "ruído musical"
            gain[:, 1:-1] = 0.25 * gain[:, :-2] + 0.5 * gain[:, 1:-1] + 0.25 * gain[:, 2:]
        # de-esser: se o "s" domina o frame, abaixa só essa faixa
        tot = np.sum(mag * mag, axis=1) + 1e-12
        ratio = np.sum((mag[:, sib] ** 2), axis=1) / tot
        cut = np.where(ratio > 0.35, np.sqrt(0.35 / np.maximum(ratio, 1e-9)), 1.0).clip(0.35, 1.0)
        deessed += int(np.sum(cut < 0.95))
        gain[:, sib] *= cut[:, None].astype(np.float32)
        gain *= eq[None, :]
        # suaviza no tempo (sobe devagar, desce rápido) entre frames
        for i in range(gain.shape[0]):
            if prev_gain is not None:
                gain[i] = np.where(gain[i] > prev_gain, 0.55 * prev_gain + 0.45 * gain[i], gain[i])
            prev_gain = gain[i]
        y = np.fft.irfft(spec * gain, n=N_FFT, axis=1).astype(np.float32) * win
        for i in range(y.shape[0]):
            s0 = (a + i) * HOP
            out[s0 : s0 + N_FFT] += y[i]
            wsum[s0 : s0 + N_FFT] += win * win
    good = wsum > 1e-4
    out[good] /= wsum[good]
    y = out[pad : pad + n]

    floor_before = float(np.percentile(_frame_rms(x, 2048, 1024), 10)) if n > 4096 else 0.0
    floor_after = float(np.percentile(_frame_rms(y, 2048, 1024), 10)) if n > 4096 else 0.0
    return y, {
        "noise_floor_before_db": round(_db(floor_before), 1),
        "noise_floor_after_db": round(_db(floor_after), 1),
        "noise_reduction_db": round(_db(floor_before) - _db(floor_after), 1) if floor_after > 0 else None,
        "deessed_frames": deessed,
    }


# ---------------------------------------------------------------------------
# 4/5. Nivelamento, respirações e normalização
# ---------------------------------------------------------------------------


def level_and_normalize(
    x: np.ndarray,
    sr: int,
    *,
    leveling: bool,
    gate_bleed: bool,
    breath_segments: list[tuple[float, float]],
    drop_segments: list[tuple[float, float]],
) -> tuple[np.ndarray, dict]:
    size = max(256, int(0.05 * sr))
    hop = size // 2
    rms = _frame_rms(x, size, hop)
    if rms.size == 0:
        return x, {}
    active = rms > 10 ** (-50 / 20)
    ref = float(np.median(rms[active])) if active.any() else float(np.max(rms))
    g = np.ones_like(rms)
    t = (np.arange(rms.size) * hop + size / 2) / sr
    leveled_frames = 0
    if leveling and active.any():
        # leve em toda a música (±4 dB) e mais forte onde a análise viu queda (±8 dB)
        want = np.clip(ref / np.maximum(rms, 1e-9), 10 ** (-4 / 20), 10 ** (4 / 20))
        for a, b in drop_segments:
            m = (t >= a - 0.1) & (t <= b + 0.1)
            want[m] = np.clip(ref / np.maximum(rms[m], 1e-9), 10 ** (-6 / 20), 10 ** (8 / 20))
        g = np.where(active, want, 1.0)
        leveled_frames = int(np.sum(np.abs(_db_arr(g)) > 1.0))
    if gate_bleed and active.any():
        # entre frases: abaixa o que sobrou de instrumento (−14 dB)
        quiet = rms < ref * 10 ** (-30 / 20)
        g = np.where(quiet, np.minimum(g, 0.2), g)
    for a, b in breath_segments:
        m = (t >= a - 0.03) & (t <= b + 0.03)
        g[m] = np.minimum(g[m], 0.5)  # −6 dB
    g = _smooth_gain(g, attack=0.5, release=0.12)
    y = x * _gain_to_samples(g, hop, size, x.size)

    # Normaliza o volume das partes cantadas para ~−18 dBFS RMS
    rms2 = _frame_rms(y, size, hop)
    act2 = rms2 > 10 ** (-45 / 20)
    level_before = float(np.median(rms[active])) if active.any() else 0.0
    if act2.any():
        cur = float(np.sqrt(np.mean(rms2[act2] ** 2)))
        y = y * min(8.0, 10 ** (-18 / 20) / max(cur, 1e-9))
    # Limitador suave de picos (teto ~ −0,5 dBFS)
    thr, ceil = 0.8, 0.94
    a = np.abs(y)
    over = a > thr
    if over.any():
        y = y.copy()
        y[over] = np.sign(y[over]) * (thr + (ceil - thr) * np.tanh((a[over] - thr) / (ceil - thr)))
    rms3 = _frame_rms(y, size, hop)
    act3 = rms3 > 10 ** (-45 / 20)
    return y.astype(np.float32), {
        "level_before_db": round(_db(level_before), 1),
        "level_after_db": round(_db(float(np.median(rms3[act3])) if act3.any() else 0.0), 1),
        "leveled_frames": leveled_frames,
        "breaths_softened": len(breath_segments),
        "peak_db": round(_db(float(np.max(np.abs(y))) if y.size else 0.0), 1),
    }


def _db_arr(g: np.ndarray) -> np.ndarray:
    return 20.0 * np.log10(np.maximum(g, 1e-9))


# ---------------------------------------------------------------------------
# Cadeia completa (depois da separação)
# ---------------------------------------------------------------------------


def enhance_pipeline(
    x: np.ndarray,
    sr: int,
    opts: EnhanceOptions,
    *,
    isolated: bool,
    progress: Progress | None = None,
) -> tuple[np.ndarray, dict]:
    def step(label: str, pct: int) -> None:
        if progress:
            progress(label, pct)

    stats: dict[str, Any] = {"isolated": isolated}
    corrections: list[dict[str, Any]] = []
    y = x.astype(np.float32)

    step("Limpando ruído e equalizando", 55)
    y, s_clean = spectral_cleanup(y, sr, denoise=opts.denoise, strong=isolated)
    stats["cleanup"] = s_clean

    # Segmentos de afinação a partir dos erros da análise
    pitch_segments: list[Segment] = []
    pitch_events: list[EventIn] = []
    for ev in opts.events:
        cat = ev.category
        fix = PITCH_FIXES.get(cat)
        if fix is None and cat.startswith("pitch_") and cat not in KEEP:
            fix = (1.0, 25.0)
        if fix is not None and opts.pitch_mode != "off":
            pitch_segments.append(
                Segment(
                    start=ev.start,
                    end=ev.end,
                    strength=fix[0],
                    retune_ms=fix[1],
                    target_midi=note_name_to_midi(ev.expected_note),
                )
            )
            pitch_events.append(ev)

    detail = None
    if opts.pitch_mode != "off":
        step("Corrigindo a afinação trecho a trecho", 70)
        base = opts.base_strength if opts.pitch_mode == "events" else 1.0
        params = AutotuneParams(
            key=opts.key,
            scale=opts.scale,  # type: ignore[arg-type]
            strength=base,
            retune_ms=opts.retune_ms,
            humanize_cents=opts.humanize_cents,
        )
        try:
            y, s_pitch, detail = autotune_detailed(y, sr, params, pitch_segments)
            stats["pitch"] = s_pitch
        except ValueError as exc:
            msg = str(exc)
            if isolated and "voz" in msg.lower():
                msg = "a separação deixou pouca voz cantada para medir a afinação"
            stats["pitch"] = {"skipped": msg}

    skipped = (stats.get("pitch") or {}).get("skipped")
    for ev in pitch_events:
        if detail is None:
            corrections.append(_simple(ev, f"Afinação não corrigida: {skipped or 'correção desligada'}", False))
            continue
        res = segment_tuning(detail, ev.start, ev.end)
        before, after = res.get("before_cents"), res.get("after_cents")
        fixed = before is not None and after is not None and after < before
        if before is None:
            action = "Sem voz detectada neste trecho — nada a corrigir"
        elif fixed:
            action = "Afinação corrigida" + (
                f" para {ev.expected_note}" if ev.expected_note else " para a nota da escala"
            )
        else:
            action = "Já estava perto da nota — mantido"
        corrections.append(
            {
                "event_id": ev.id,
                "category": ev.category,
                "title": ev.title,
                "start_seconds": round(ev.start, 3),
                "end_seconds": round(ev.end, 3),
                "action": action,
                "fixed": fixed,
                **res,
            }
        )

    drops = [(e.start, e.end) for e in opts.events if e.category in LEVEL_FIXES]
    breaths = [(e.start, e.end) for e in opts.events if e.category in BREATH_FIXES] if opts.breaths else []
    for e in opts.events:
        if e.category in LEVEL_FIXES and opts.leveling:
            corrections.append(_simple(e, "Volume equilibrado no trecho", True))
        elif e.category in BREATH_FIXES and opts.breaths:
            corrections.append(_simple(e, "Respiração suavizada (−6 dB)", True))
        elif e.category in NOT_FIXABLE:
            corrections.append(_simple(e, NOT_FIXABLE[e.category], False))

    step("Equilibrando volume", 88)
    y, s_level = level_and_normalize(
        y,
        sr,
        leveling=opts.leveling,
        gate_bleed=isolated,
        breath_segments=breaths,
        drop_segments=drops if opts.leveling else [],
    )
    stats["level"] = s_level
    corrections.sort(key=lambda c: c["start_seconds"])
    stats["corrections"] = corrections
    stats["fixed_count"] = sum(1 for c in corrections if c.get("fixed"))
    stats["not_fixable_count"] = sum(1 for c in corrections if not c.get("fixed") and c["category"] in NOT_FIXABLE)
    return y, stats


def _simple(e: EventIn, action: str, fixed: bool) -> dict[str, Any]:
    return {
        "event_id": e.id,
        "category": e.category,
        "title": e.title,
        "start_seconds": round(e.start, 3),
        "end_seconds": round(e.end, 3),
        "action": action,
        "fixed": fixed,
        "before_cents": None,
        "after_cents": None,
    }
