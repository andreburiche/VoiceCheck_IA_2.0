"""
VoiceCheck — indicadores observáveis + análise técnica (v4.5).

Sem pontuação inventada, sem diagnóstico clínico.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from app.services.voicecheck_feedback import enrich_events_with_feedback, recommendations_from_events
from app.services.voicecheck_melodic_consistency import analyze_melodic_consistency
from app.services.voicecheck_pitch import PitchFrame, YinParams, midi_to_note_name
from app.services.voicecheck_technical import TECH_VERSION, run_technical_analysis

ANALYSIS_VERSION = "voicecheck_f0_v1"
ANALYSIS_VERSION_TECH = "voicecheck_tech_v45"
ANALYSIS_VERSION_REF = "voicecheck_ref_v5"
ALGORITHM = "yin_cmndf_v1"


def build_analysis_report(
    frames: list[PitchFrame],
    *,
    sample_rate: int,
    duration_seconds: float,
    params: YinParams,
    samples: np.ndarray | None = None,
) -> dict[str, Any]:
    warnings: list[str] = []
    valid = [f for f in frames if f.is_valid and f.frequency_hz is not None]
    total = len(frames)
    valid_pct = (100.0 * len(valid) / total) if total else 0.0

    if total == 0:
        warnings.append("Áudio curto demais ou sem frames analisáveis.")
    if valid_pct < 15 and total > 0:
        warnings.append(
            "Poucos frames com F0 confiável — silêncio, ruído ou material fora da faixa configurada."
        )
    if duration_seconds < 0.25:
        warnings.append("Gravação muito curta; estatísticas têm baixa representatividade.")

    hz_vals = np.asarray([f.frequency_hz for f in valid], dtype=np.float64)
    midi_vals = np.asarray([f.midi_note for f in valid if f.midi_note is not None], dtype=np.float64)

    if len(hz_vals) == 0:
        observed_range: dict[str, Any] = {
            "min_hz": None,
            "max_hz": None,
            "median_hz": None,
            "span_semitones": None,
            "note": "Sem F0 válido — não há extensão observada.",
        }
        statistics: dict[str, Any] = {
            "valid_frame_percent": round(valid_pct, 2),
            "valid_frames": 0,
            "total_frames": total,
            "predominant_hz": None,
            "predominant_note_name": None,
            "note_histogram": {},
            "stable_region_variation_cents_median": None,
        }
        warnings.append("Nenhuma frequência fundamental válida detectada.")
    else:
        # Extensão "robusta": ignora os 2% mais extremos de cada lado (erros de
        # oitava, consoantes, ruído) — a extensão bruta fica em *_raw.
        if len(hz_vals) >= 50:
            lo_hz = float(np.percentile(hz_vals, 2))
            hi_hz = float(np.percentile(hz_vals, 98))
        else:
            lo_hz, hi_hz = float(hz_vals.min()), float(hz_vals.max())
        span_st = float(12.0 * np.log2(hi_hz / max(lo_hz, 1e-9)))
        hist: dict[str, int] = {}
        for m in midi_vals:
            name = midi_to_note_name(float(m))
            hist[name] = hist.get(name, 0) + 1
        predominant_name = max(hist.items(), key=lambda kv: kv[1])[0] if hist else None
        pred_hz = None
        if predominant_name:
            matching = [
                f.frequency_hz
                for f in valid
                if f.note_name == predominant_name and f.frequency_hz is not None
            ]
            if matching:
                pred_hz = float(np.median(matching))

        stable_var = _stable_region_variation_cents(valid)
        observed_range = {
            "min_hz": round(lo_hz, 2),
            "max_hz": round(hi_hz, 2),
            "min_hz_raw": round(float(hz_vals.min()), 2),
            "max_hz_raw": round(float(hz_vals.max()), 2),
            "median_hz": round(float(np.median(hz_vals)), 2),
            "span_semitones": round(span_st, 2),
            "disclaimer": (
                "Extensão observada nesta gravação — não é a extensão vocal máxima do cantor."
            ),
        }
        statistics = {
            "valid_frame_percent": round(valid_pct, 2),
            "valid_frames": len(valid),
            "total_frames": total,
            "predominant_hz": None if pred_hz is None else round(pred_hz, 2),
            "predominant_note_name": predominant_name,
            "note_histogram": dict(sorted(hist.items(), key=lambda kv: (-kv[1], kv[0]))),
            "stable_region_variation_cents_median": stable_var,
            "vibrato_note": (
                "Variação em regiões estáveis não é classificada como desafinação; "
                "vibrato/portamento naturais podem aparecer como oscilação em cents."
            ),
        }

    track = [f.to_track_point() for f in frames]
    if len(track) > 800:
        step = max(1, len(track) // 800)
        track = [track[i] for i in range(0, len(track), step)]

    analyzable = _analyzable_regions(frames)
    tech = run_technical_analysis(frames, samples=samples, sample_rate=sample_rate)
    melodic = analyze_melodic_consistency(frames)
    tech_events = list(tech.get("events") or [])
    melodic_events = list(melodic.get("events") or [])
    events = enrich_events_with_feedback(tech_events + melodic_events)
    recs = recommendations_from_events(events)

    if not tech_events and valid_pct >= 15:
        warnings.append(
            "Nenhuma ocorrência técnica com evidência suficiente — isso é esperado em "
            "trechos estáveis ou materiais ambíguos; não inventamos eventos."
        )

    return {
        "analysis_version": ANALYSIS_VERSION_TECH,
        "legacy_f0_version": ANALYSIS_VERSION,
        "technical_version": TECH_VERSION,
        "mode": "without_reference",
        "reference_mode": "authorial",
        "reference_type": None,
        "reference_asset_id": None,
        "reference_quality": None,
        "selected_vocal_part": None,
        "detected_transposition": None,
        "alignment_status": "not_applicable",
        "source": {
            "duration_seconds": round(duration_seconds, 3),
            "sample_rate": sample_rate,
        },
        "duration_seconds": round(duration_seconds, 3),
        "sample_rate": sample_rate,
        "algorithm": ALGORITHM,
        "processing_engine": "python_local",
        "parameters": params.to_dict(),
        "pitch_track": track,
        "pitch": {
            "median_hz": observed_range.get("median_hz"),
            "valid_frames_percentage": statistics.get("valid_frame_percent"),
            "min_hz": observed_range.get("min_hz"),
            "max_hz": observed_range.get("max_hz"),
        },
        "observed_range": observed_range,
        "statistics": statistics,
        "analyzable_regions": analyzable,
        "technical_analysis": tech.get("technical_analysis") or {},
        "technical_events": enrich_events_with_feedback(tech_events),
        "melodic_consistency": melodic,
        "melodic_consistency_events": enrich_events_with_feedback(melodic_events),
        "comparison_events": [],
        "events": events,
        "positive_findings": tech.get("positive_findings") or [],
        "recommendations": recs,
        "warnings": warnings,
        "no_reference": True,
        "disclaimer": (
            "Esta análise descreve características acústicas observadas na gravação. "
            "Ocorrências usam múltiplas evidências (F0, energia, temporalidade). "
            "Não constitui diagnóstico clínico ou fonoaudiológico. "
            "Para erros de afinação absolutos, compare com referência musical."
        ),
    }


def _stable_region_variation_cents(valid: list[PitchFrame], window: int = 9) -> float | None:
    if len(valid) < window:
        return None
    cents_vars: list[float] = []
    half = window // 2
    for i in range(half, len(valid) - half):
        chunk = [
            f.frequency_hz
            for f in valid[i - half : i + half + 1]
            if f.frequency_hz is not None
        ]
        if len(chunk) < window - 2:
            continue
        arr = np.asarray(chunk, dtype=np.float64)
        med = float(np.median(arr))
        if med <= 0:
            continue
        cents = [abs(1200.0 * math_log2_safe(float(h) / med)) for h in arr]
        cents_vars.append(float(np.max(cents)))
    if not cents_vars:
        return None
    return round(float(np.median(cents_vars)), 1)


def math_log2_safe(x: float) -> float:
    import math

    return math.log2(max(x, 1e-12))


def _analyzable_regions(frames: list[PitchFrame], min_sec: float = 0.15) -> list[dict[str, Any]]:
    regions: list[dict[str, Any]] = []
    start: float | None = None
    last_t = 0.0
    for f in frames:
        last_t = f.time_seconds
        if f.is_valid:
            if start is None:
                start = f.time_seconds
        else:
            if start is not None and f.time_seconds - start >= min_sec:
                regions.append(
                    {
                        "start_seconds": round(start, 3),
                        "end_seconds": round(f.time_seconds, 3),
                    }
                )
            start = None
    if start is not None and last_t - start >= min_sec:
        regions.append({"start_seconds": round(start, 3), "end_seconds": round(last_t, 3)})
    return regions[:40]


def build_with_reference_report(
    frames: list[PitchFrame],
    *,
    sample_rate: int,
    duration_seconds: float,
    params: YinParams,
    reference_dict: dict[str, Any],
    alignment_dict: dict[str, Any],
    comparison: dict[str, Any],
    recommendations: list[dict[str, Any]],
    extra_warnings: list[str] | None = None,
    samples: np.ndarray | None = None,
    reference_mode: str = "custom",
    reference_quality: str | None = None,
    selected_vocal_part: str | None = None,
    reference_asset_id: str | None = None,
    artist_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Estende o relatório técnico com bloco de referência."""
    base = build_analysis_report(
        frames,
        sample_rate=sample_rate,
        duration_seconds=duration_seconds,
        params=params,
        samples=samples,
    )
    warnings = list(base.get("warnings") or [])
    if extra_warnings:
        warnings.extend(extra_warnings)

    ref_events = enrich_events_with_feedback(comparison.get("events") or [])
    # merge: técnicos + melódicos (base) + comparação com referência
    base_events = list(base.get("events") or [])
    # Evitar duplicar melodic/tech já presentes em base.events
    merged = base_events + ref_events
    recs = recommendations_from_events(merged)
    if recommendations:
        seen = {r.get("key") for r in recs}
        for r in recommendations:
            if r.get("key") not in seen:
                recs.append(r)

    transp = alignment_dict.get("transposition_semitones_suggested")
    if transp is None:
        transp = alignment_dict.get("transposition_semitones")

    ref_type = reference_dict.get("type") or reference_mode
    base.update(
        {
            "analysis_version": ANALYSIS_VERSION_REF,
            "mode": "with_reference",
            "no_reference": False,
            "reference_mode": reference_mode,
            "reference_type": ref_type,
            "reference_asset_id": reference_asset_id,
            "reference_quality": reference_quality,
            "selected_vocal_part": selected_vocal_part or reference_dict.get("selected_part"),
            "detected_transposition": transp,
            "alignment_status": alignment_dict.get("status"),
            "reference": reference_dict,
            "artist_reference": artist_meta,
            "alignment": alignment_dict,
            "comparison": {
                "pitch": comparison.get("pitch") or {},
                "rhythm": comparison.get("rhythm") or {},
                "duration": comparison.get("duration") or {},
            },
            "comparison_events": ref_events,
            "events": merged,
            "recommendations": recs,
            "warnings": warnings,
            "disclaimer": (
                "Comparação com referência musical — desvios são medições acústicas/temporais. "
                "Não constitui diagnóstico clínico ou fonoaudiológico. "
                + str(base.get("disclaimer") or "")
            ),
        }
    )
    return base
