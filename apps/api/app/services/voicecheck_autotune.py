"""VoiceCheck IA — afinação automática ("autotune") da voz analisada.

Corrige a altura de cada trecho cantado para a nota mais próxima da escala
escolhida, sem mudar a duração. Usa TD-PSOLA guiado pela curva de F0 (YIN):

1. mede a F0 a cada ~10 ms;
2. calcula o desvio (em semitons) até a nota-alvo da escala;
3. suaviza o desvio com a "velocidade de correção" (0 ms = efeito robótico);
4. reposiciona os ciclos da onda (pitch marks) com o novo período.

Ferramenta de estúdio para comparar e treinar. Não altera o arquivo original.
"""

from __future__ import annotations

import io
import math
import wave
from dataclasses import dataclass
from typing import Callable, Literal

import numpy as np

from app.services.voicecheck_pitch import YinParams, extract_f0, hz_to_midi_float

NOTE_NAMES_PT = ["Dó", "Dó#", "Ré", "Ré#", "Mi", "Fá", "Fá#", "Sol", "Sol#", "Lá", "Lá#", "Si"]

ScaleName = Literal["chromatic", "major", "minor"]
ScaleChoice = Literal["chromatic", "major", "minor", "auto"]
SCALES: dict[str, tuple[int, ...]] = {
    "chromatic": tuple(range(12)),
    "major": (0, 2, 4, 5, 7, 9, 11),
    "minor": (0, 2, 3, 5, 7, 8, 10),
}

# Perfis de Krumhansl–Kessler para estimar a tonalidade.
_KK_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_KK_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

#: Margem (semitons) para manter a nota-alvo atual: 0,5 = metade + 15 cents.
HYSTERESIS_SEMITONES = 0.65

#: Limite de duração para manter o processamento rápido (CPU).
MAX_SECONDS = 15 * 60


@dataclass
class AutotuneParams:
    key: int | None = None  # 0..11 (Dó..Si); None = detectar
    scale: ScaleChoice = "chromatic"  # "auto" = maior/menor detectada
    strength: float = 1.0  # 0..1
    retune_ms: float = 40.0  # 0 = instantâneo (robótico)
    humanize_cents: float = 0.0  # desvios menores que isso ficam como estão


@dataclass
class Segment:
    """Trecho com correção própria (ex.: um erro apontado pela análise)."""

    start: float
    end: float
    strength: float = 1.0
    retune_ms: float = 30.0
    #: Nota-alvo conhecida (ex.: da partitura); None = nota da escala mais próxima.
    target_midi: float | None = None


@dataclass
class FrameControls:
    strength: np.ndarray
    alpha: np.ndarray
    target: np.ndarray  # NaN = usar a escala
    humanize: np.ndarray  # bool: desvios pequenos ficam como estão


@dataclass
class AutotuneDetail:
    centers: np.ndarray
    hz_in: np.ndarray
    target_midi: np.ndarray  # alvo usado por frame (0 sem voz)
    centers_out: np.ndarray
    hz_out: np.ndarray
    sample_rate: int


@dataclass
class AutotuneResult:
    wav_bytes: bytes
    stats: dict


def key_label(key: int, scale: str) -> str:
    name = NOTE_NAMES_PT[key % 12]
    if scale == "major":
        return f"{name} maior"
    if scale == "minor":
        return f"{name} menor"
    return "Cromática"


def detect_key(midis: np.ndarray, weights: np.ndarray | None = None) -> tuple[int, ScaleName, float]:
    """Tonalidade mais provável a partir do histograma de classes de altura."""
    if midis.size == 0:
        return 0, "major", 0.0
    pcs = np.mod(np.rint(midis).astype(int), 12)
    w = weights if weights is not None else np.ones_like(midis, dtype=float)
    hist = np.bincount(pcs, weights=w, minlength=12).astype(float)
    if hist.sum() <= 0:
        return 0, "major", 0.0
    best = (0, "major", -2.0)
    for k in range(12):
        for name, prof in (("major", _KK_MAJOR), ("minor", _KK_MINOR)):
            r = float(np.corrcoef(hist, np.roll(prof, k))[0, 1])
            if r > best[2]:
                best = (k, name, r)  # type: ignore[assignment]
    return best[0], best[1], best[2]  # type: ignore[return-value]


def snap_to_scale(midi: np.ndarray, key: int, scale: str) -> np.ndarray:
    """Nota permitida mais próxima (em semitons MIDI) para cada valor."""
    allowed = np.array(SCALES.get(scale, SCALES["chromatic"]), dtype=float)
    pcs_allowed = np.mod(allowed + key, 12)
    base = np.floor(midi / 12.0) * 12.0
    cands = []
    for off in (-12.0, 0.0, 12.0):
        cands.append(base[:, None] + off + pcs_allowed[None, :])
    c = np.concatenate(cands, axis=1)
    idx = np.argmin(np.abs(c - midi[:, None]), axis=1)
    return c[np.arange(len(midi)), idx]


def _write_wav(samples: np.ndarray, sr: int) -> bytes:
    pcm = np.clip(samples, -1.0, 1.0)
    pcm16 = (pcm * 32767.0).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm16.tobytes())
    return buf.getvalue()


def _f0_track(samples: np.ndarray, sr: int, hop: int) -> tuple[np.ndarray, np.ndarray]:
    params = YinParams(hop_length=hop, median_smooth=3)
    frames = extract_f0(samples, sr, params, adapt_duration=False)
    centers = np.array([f.time_seconds * sr + params.frame_length / 2 for f in frames], dtype=float)
    hz = np.array([f.frequency_hz if (f.is_valid and f.frequency_hz) else 0.0 for f in frames], dtype=float)
    return centers, hz


def _tuning_stats(midi: np.ndarray, key: int, scale: str) -> dict:
    if midi.size == 0:
        return {"mean_abs_cents": None, "in_tune_percent": None, "voiced_frames": 0}
    dev = (midi - snap_to_scale(midi, key, scale)) * 100.0
    return {
        "mean_abs_cents": round(float(np.mean(np.abs(dev))), 1),
        "in_tune_percent": round(float(np.mean(np.abs(dev) <= 25.0) * 100.0), 1),
        "voiced_frames": int(midi.size),
    }


def _correction_curve(
    hz: np.ndarray,
    hop_sec: float,
    key: int,
    scale: str,
    p: AutotuneParams,
    ctl: FrameControls | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Desvio a aplicar (semitons) por frame, já suavizado, e a nota-alvo usada.

    `ctl` permite intensidade/velocidade/nota-alvo diferentes por trecho.
    """
    n = len(hz)
    out = np.zeros_like(hz)
    voiced = hz > 0
    target = np.zeros_like(hz)
    if not voiced.any():
        return out, target
    if ctl is None:
        ctl = FrameControls(
            strength=np.full(n, max(0.0, min(1.0, p.strength))),
            alpha=np.full(n, _alpha(p.retune_ms, hop_sec)),
            target=np.full(n, np.nan),
            humanize=np.ones(n, dtype=bool),
        )
    midi = np.zeros_like(hz)
    midi[voiced] = 69.0 + 12.0 * np.log2(hz[voiced] / 440.0)
    target[voiced] = snap_to_scale(midi[voiced], key, scale)
    forced = voiced & ~np.isnan(ctl.target)
    if forced.any():
        # Nota conhecida: mesma classe de altura, na oitava mais próxima do cantado.
        t = ctl.target[forced]
        target[forced] = t + 12.0 * np.round((midi[forced] - t) / 12.0)
    # Histerese: dentro de um trecho, só troca de nota-alvo quando a voz passa
    # claramente da metade (evita "pular" entre duas notas quando se canta no meio).
    prev: float | None = None
    for i in range(n):
        if not voiced[i]:
            prev = None
            continue
        if not forced[i] and prev is not None and abs(midi[i] - prev) < HYSTERESIS_SEMITONES:
            target[i] = prev
        prev = float(target[i])
    dev = np.where(voiced, target - midi, 0.0)
    if p.humanize_cents > 0:
        # Mantém nuances pequenas (vibrato leve, expressão) fora dos trechos com erro.
        small = (np.abs(dev) * 100.0 <= p.humanize_cents) & ctl.humanize
        dev = np.where(small, 0.0, dev)
    dev *= np.clip(ctl.strength, 0.0, 1.0)

    i = 0
    while i < n:
        if not voiced[i]:
            i += 1
            continue
        j = i
        while j < n and voiced[j]:
            j += 1
        if j - i >= 3:  # trechos muito curtos (consoantes) ficam como estão
            acc = dev[i]
            for k in range(i, j):
                acc += ctl.alpha[k] * (dev[k] - acc)
                out[k] = acc
        i = j
    return out, target


def _alpha(retune_ms: float, hop_sec: float) -> float:
    tau = max(0.0, retune_ms) / 1000.0
    return 1.0 if tau <= 0 else 1.0 - math.exp(-hop_sec / tau)


def _frame_controls(
    centers: np.ndarray, sr: int, hop_sec: float, p: AutotuneParams, segments: list[Segment]
) -> FrameControls:
    n = centers.size
    ctl = FrameControls(
        strength=np.full(n, max(0.0, min(1.0, p.strength))),
        alpha=np.full(n, _alpha(p.retune_ms, hop_sec)),
        target=np.full(n, np.nan),
        humanize=np.ones(n, dtype=bool),
    )
    t = centers / float(sr)
    for seg in segments:
        mask = (t >= seg.start - 0.03) & (t <= seg.end + 0.03)
        if not mask.any():
            continue
        ctl.strength[mask] = max(0.0, min(1.0, seg.strength))
        ctl.alpha[mask] = _alpha(seg.retune_ms, hop_sec)
        ctl.humanize[mask] = False
        if seg.target_midi is not None:
            ctl.target[mask] = seg.target_midi
    return ctl


def _pitch_marks(
    x: np.ndarray,
    sr: int,
    frame_of: Callable[[int], int],
    voiced_f: np.ndarray,
    period_f: np.ndarray,
) -> np.ndarray:
    """Marcas de período: picos da onda nos trechos com voz; passo fixo no resto."""
    n = len(x)
    marks: list[int] = []
    unv_step = max(32, int(0.005 * sr))
    t = 0
    while t < n:
        fi = frame_of(t)
        if voiced_f[fi]:
            per = int(period_f[fi])
            lo = max(0, t - per // 3)
            hi = min(n, t + per // 3 + 1)
            if marks:
                lo = max(lo, marks[-1] + per // 2)
            if lo < hi:
                t = lo + int(np.argmax(x[lo:hi]))
            marks.append(t)
            t += max(1, per)
        else:
            marks.append(t)
            t += unv_step
    return np.array(marks, dtype=np.int64)


def autotune_samples(x: np.ndarray, sr: int, p: AutotuneParams) -> tuple[np.ndarray, dict]:
    out, stats, _ = autotune_detailed(x, sr, p)
    return out, stats


def segment_tuning(detail: AutotuneDetail, start: float, end: float) -> dict:
    """Desvio médio (cents) até a nota-alvo num trecho, antes e depois."""
    sr = float(detail.sample_rate)
    t_in = detail.centers / sr
    m_in = (t_in >= start) & (t_in <= end) & (detail.hz_in > 0)
    before = None
    if m_in.any():
        midi = 69.0 + 12.0 * np.log2(detail.hz_in[m_in] / 440.0)
        before = float(np.mean(np.abs(midi - detail.target_midi[m_in])) * 100.0)
    after = None
    t_out = detail.centers_out / sr
    m_out = (t_out >= start) & (t_out <= end) & (detail.hz_out > 0)
    if m_out.any() and detail.centers.size:
        midi_o = 69.0 + 12.0 * np.log2(detail.hz_out[m_out] / 440.0)
        idx = np.clip(np.searchsorted(detail.centers, detail.centers_out[m_out]), 0, detail.centers.size - 1)
        tgt = detail.target_midi[idx]
        ok = tgt > 0
        if ok.any():
            after = float(np.mean(np.abs(midi_o[ok] - tgt[ok])) * 100.0)
    return {
        "before_cents": None if before is None else round(before, 1),
        "after_cents": None if after is None else round(after, 1),
    }


def autotune_detailed(
    x: np.ndarray,
    sr: int,
    p: AutotuneParams,
    segments: list[Segment] | None = None,
) -> tuple[np.ndarray, dict, AutotuneDetail]:
    if sr <= 0 or x.size == 0:
        raise ValueError("Áudio vazio")
    duration = x.size / float(sr)
    if duration > MAX_SECONDS:
        raise ValueError("Áudio longo demais para afinar (máx. 15 min)")

    x = x.astype(np.float32)
    n = x.size
    # ~10 ms; em gravações longas, 20 ms para caber em ~1 min de CPU
    hop = max(64, int(round((0.01 if duration <= 180 else 0.02) * sr)))
    centers, hz = _f0_track(x, sr, hop)
    if centers.size == 0:
        raise ValueError("Áudio curto demais para afinar")
    voiced = hz > 0
    midi_in = 69.0 + 12.0 * np.log2(hz[voiced] / 440.0) if voiced.any() else np.array([])
    if midi_in.size < 10:
        raise ValueError("Não encontramos voz cantada suficiente para afinar")

    dk, ds, conf = detect_key(midi_in)
    key = dk if p.key is None else int(p.key) % 12
    scale: str = ds if p.scale == "auto" else p.scale

    ctl = _frame_controls(centers, sr, hop / sr, p, segments or []) if segments else None
    curve, target_midi = _correction_curve(hz, hop / sr, key, scale, p, ctl)
    period_f = np.where(voiced, sr / np.maximum(hz, 1.0), 0.0)
    ratio_f = np.power(2.0, curve / 12.0)
    c0 = float(centers[0])
    last = centers.size - 1

    def frame_of(t: int) -> int:
        fi = int(round((t - c0) / hop))
        return 0 if fi < 0 else (last if fi > last else fi)

    marks = _pitch_marks(x, sr, frame_of, voiced, period_f)
    if marks.size < 2:
        raise ValueError("Áudio curto demais para afinar")

    out = np.zeros(n, dtype=np.float32)
    wsum = np.zeros(n, dtype=np.float32)
    unv_step = max(32, int(0.005 * sr))
    gaps = np.diff(marks)
    local_p = np.empty(marks.size, dtype=np.int64)
    local_p[:-1] = gaps
    local_p[-1] = gaps[-1]
    local_p = np.clip(local_p, 16, int(sr / 50))

    windows: dict[int, np.ndarray] = {}
    k = 0
    s = float(marks[0])
    while s < n:
        si = int(s)
        while k + 1 < marks.size and abs(int(marks[k + 1]) - si) < abs(int(marks[k]) - si):
            k += 1
        m = int(marks[k])
        per = int(local_p[k])
        fi = frame_of(m)
        is_voiced = bool(voiced[fi])
        win = windows.get(per)
        if win is None:
            win = np.hanning(2 * per + 1).astype(np.float32)
            windows[per] = win
        a0 = m - per
        o0 = si - per
        size = 2 * per + 1
        lo = max(0, -a0, -o0)
        hi = size - max(0, a0 + size - n, o0 + size - n)
        if hi > lo:
            w = win[lo:hi]
            out[o0 + lo : o0 + hi] += x[a0 + lo : a0 + hi] * w
            wsum[o0 + lo : o0 + hi] += w
        step = per / float(ratio_f[fi]) if is_voiced else float(unv_step)
        s += max(1.0, step)

    good = wsum > 1e-3
    out[good] /= wsum[good]
    out[~good] = x[~good]

    # Medição antes/depois com o mesmo método (desvio até a nota da escala).
    centers_out, hz_out = _f0_track(out, sr, hop * (2 if duration <= 180 else 3))
    v_out = hz_out > 0
    midi_out = 69.0 + 12.0 * np.log2(hz_out[v_out] / 440.0) if v_out.any() else np.array([])
    corrected = np.abs(curve[voiced]) * 100.0 >= 5.0

    stats = {
        "key": key,
        "scale": scale,
        "key_label": key_label(key, scale),
        "detected_key": dk,
        "detected_scale": ds,
        "detected_key_label": key_label(dk, ds),
        "key_confidence": round(float(conf), 3),
        "strength": round(p.strength, 3),
        "retune_ms": round(p.retune_ms, 1),
        "humanize_cents": round(p.humanize_cents, 1),
        "duration_seconds": round(duration, 3),
        "corrected_percent": round(float(np.mean(corrected) * 100.0), 1) if corrected.size else 0.0,
        "before": _tuning_stats(midi_in, key, scale),
        "after": _tuning_stats(midi_out, key, scale),
    }
    detail = AutotuneDetail(
        centers=centers,
        hz_in=hz,
        target_midi=target_midi,
        centers_out=centers_out,
        hz_out=hz_out,
        sample_rate=sr,
    )
    return out, stats, detail


def autotune_wav_bytes(data: bytes, p: AutotuneParams) -> AutotuneResult:
    from app.services.voicecheck_pitch import load_wav_bytes

    samples, sr = load_wav_bytes(data)
    out, stats = autotune_samples(samples, sr, p)
    peak = float(np.max(np.abs(out))) if out.size else 0.0
    if peak > 0.999:
        out = out * (0.999 / peak)
    return AutotuneResult(wav_bytes=_write_wav(out, sr), stats=stats)
