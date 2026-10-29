"""
VoiceCheck — comparação objetiva execução × referência (afinação + ritmo básico).
"""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from typing import Any

import numpy as np

from app.services.voicecheck_alignment import AlignmentResult, NoteMatch
from app.services.voicecheck_pitch import PitchFrame, midi_to_note_name


@dataclass
class ComparisonEvent:
    id: str
    category: str
    start_seconds: float
    end_seconds: float
    expected_note: str | None
    observed_note: str | None
    deviation: float | None
    unit: str | None
    tolerance: float | None
    confidence: float | None
    severity: str  # info | attention | high
    description: str
    recommendation_key: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "category": self.category,
            "start_seconds": round(self.start_seconds, 3),
            "end_seconds": round(self.end_seconds, 3),
            "expected_note": self.expected_note,
            "observed_note": self.observed_note,
            "deviation": None if self.deviation is None else round(self.deviation, 2),
            "unit": self.unit,
            "tolerance": self.tolerance,
            "confidence": self.confidence,
            "severity": self.severity,
            "description": self.description,
            "recommendation_key": self.recommendation_key,
        }


def cents_deviation(sung_hz: float, ref_hz: float) -> float:
    return 1200.0 * math.log2(sung_hz / ref_hz)


def _frames_in_window(
    frames: list[PitchFrame],
    start: float,
    end: float,
    *,
    attack_skip: float = 0.04,
    release_skip: float = 0.04,
) -> list[PitchFrame]:
    a = start + attack_skip
    b = max(a + 0.02, end - release_skip)
    return [
        f
        for f in frames
        if f.is_valid
        and f.frequency_hz is not None
        and a <= f.time_seconds <= b
    ]


def compare_alignment(
    frames: list[PitchFrame],
    alignment: AlignmentResult,
    *,
    pitch_tolerance_cents: float = 50.0,
    onset_tolerance_ms: float = 120.0,
    duration_tolerance_ratio: float = 0.35,
    accept_transposition: bool = False,
) -> dict[str, Any]:
    events: list[ComparisonEvent] = []
    pitch_devs: list[float] = []
    in_tol = 0
    compared = 0

    transp = alignment.transposition_semitones if accept_transposition else 0
    if alignment.transposition_semitones != 0 and not accept_transposition:
        events.append(
            ComparisonEvent(
                id=str(uuid.uuid4()),
                category="possible_transposition",
                start_seconds=0.0,
                end_seconds=0.0,
                expected_note=None,
                observed_note=None,
                deviation=float(alignment.transposition_semitones),
                unit="semitones",
                tolerance=None,
                confidence=alignment.confidence,
                severity="info",
                description=(
                    f"Deslocamento consistente de cerca de {alignment.transposition_semitones:+d} semitom(ns) "
                    "em relação à referência. Aceite a transposição para recalcular, se for intencional."
                ),
                recommendation_key="transposition",
            )
        )

    for m in alignment.matches:
        ref = m.ref
        expected_midi = ref.pitch_midi + transp
        expected_hz = 440.0 * (2.0 ** ((expected_midi - 69) / 12.0))
        expected_name = midi_to_note_name(float(expected_midi))

        if m.sung is None:
            if alignment.status == "completed":
                events.append(
                    ComparisonEvent(
                        id=str(uuid.uuid4()),
                        category="possible_missing_note",
                        start_seconds=ref.start_seconds + m.time_offset_applied,
                        end_seconds=ref.end_seconds + m.time_offset_applied,
                        expected_note=expected_name,
                        observed_note=None,
                        deviation=None,
                        unit=None,
                        tolerance=None,
                        confidence=alignment.confidence,
                        severity="attention",
                        description=(
                            f"Não foi encontrada correspondência confiável para {expected_name} "
                            f"perto de {ref.start_seconds + m.time_offset_applied:.2f}s."
                        ),
                        recommendation_key="missing_note",
                    )
                )
            continue

        sung = m.sung
        # Janela no domínio do áudio cantado
        win_frames = _frames_in_window(frames, sung.start_seconds, sung.end_seconds)
        if len(win_frames) < 3:
            events.append(
                ComparisonEvent(
                    id=str(uuid.uuid4()),
                    category="insufficient_confidence",
                    start_seconds=sung.start_seconds,
                    end_seconds=sung.end_seconds,
                    expected_note=expected_name,
                    observed_note=midi_to_note_name(sung.median_midi),
                    deviation=None,
                    unit=None,
                    tolerance=pitch_tolerance_cents,
                    confidence=None,
                    severity="info",
                    description="Não foi possível avaliar este trecho com segurança (poucos frames F0 válidos).",
                    recommendation_key="insufficient",
                )
            )
            continue

        cents_list = [
            cents_deviation(f.frequency_hz, expected_hz)  # type: ignore[arg-type]
            for f in win_frames
        ]
        med_cents = float(np.median(cents_list))
        frac_in = sum(1 for c in cents_list if abs(c) <= pitch_tolerance_cents) / len(cents_list)
        compared += 1
        pitch_devs.append(med_cents)
        if abs(med_cents) <= pitch_tolerance_cents:
            in_tol += 1

        observed_name = midi_to_note_name(sung.median_midi)
        # Confiança: fração de frames + qualidade do alinhamento local
        conf = round(min(0.95, 0.35 + 0.4 * frac_in + 0.2 * min(1.0, len(win_frames) / 10)), 3)

        # Desvio persistente de afinação
        if abs(med_cents) > pitch_tolerance_cents and frac_in < 0.55:
            cat = "pitch_below_reference" if med_cents < 0 else "pitch_above_reference"
            events.append(
                ComparisonEvent(
                    id=str(uuid.uuid4()),
                    category=cat,
                    start_seconds=sung.start_seconds,
                    end_seconds=sung.end_seconds,
                    expected_note=expected_name,
                    observed_note=observed_name,
                    deviation=med_cents,
                    unit="cents",
                    tolerance=pitch_tolerance_cents,
                    confidence=conf,
                    severity="attention" if abs(med_cents) < 100 else "high",
                    description=(
                        f"Neste trecho, a F0 mediana ficou {med_cents:+.0f} cents em relação a "
                        f"{expected_name} (tolerância ±{pitch_tolerance_cents:.0f}¢). "
                        f"{frac_in * 100:.0f}% dos frames dentro da tolerância."
                    ),
                    recommendation_key="pitch_low" if med_cents < 0 else "pitch_high",
                )
            )

        # Instabilidade (variação alta com mediana ok) — não rotular vibrato como erro de afinação
        pp = float(np.max(np.abs(cents_list)))
        if abs(med_cents) <= pitch_tolerance_cents and pp > pitch_tolerance_cents * 1.8:
            events.append(
                ComparisonEvent(
                    id=str(uuid.uuid4()),
                    category="unstable_sustained_pitch",
                    start_seconds=sung.start_seconds,
                    end_seconds=sung.end_seconds,
                    expected_note=expected_name,
                    observed_note=observed_name,
                    deviation=pp,
                    unit="cents_peak",
                    tolerance=pitch_tolerance_cents,
                    confidence=conf,
                    severity="info",
                    description=(
                        f"Variação de altura até ±{pp:.0f}¢ em torno da mediana (ainda dentro da "
                        "tolerância mediana). Pode incluir vibrato/expressão — não classificado como desafinação."
                    ),
                    recommendation_key="stability",
                )
            )

        # Ritmo / duração — só se alinhamento confiável
        if alignment.status == "completed" and alignment.confidence is not None and alignment.confidence >= 0.35:
            expected_onset = ref.start_seconds + m.time_offset_applied
            onset_ms = (sung.start_seconds - expected_onset) * 1000.0
            if onset_ms < -onset_tolerance_ms:
                events.append(
                    _rhythm_event(
                        "early_onset",
                        sung,
                        expected_name,
                        observed_name,
                        onset_ms,
                        onset_tolerance_ms,
                        conf,
                        "Entrada antecipada",
                        "early",
                    )
                )
            elif onset_ms > onset_tolerance_ms:
                events.append(
                    _rhythm_event(
                        "late_onset",
                        sung,
                        expected_name,
                        observed_name,
                        onset_ms,
                        onset_tolerance_ms,
                        conf,
                        "Entrada atrasada",
                        "late",
                    )
                )

            sung_dur = sung.end_seconds - sung.start_seconds
            ref_dur = ref.duration_seconds
            if ref_dur > 0.05:
                ratio = (ref_dur - sung_dur) / ref_dur
                if ratio > duration_tolerance_ratio:
                    events.append(
                        ComparisonEvent(
                            id=str(uuid.uuid4()),
                            category="shortened_note",
                            start_seconds=sung.start_seconds,
                            end_seconds=sung.end_seconds,
                            expected_note=expected_name,
                            observed_note=observed_name,
                            deviation=round((sung_dur - ref_dur) * 1000, 1),
                            unit="ms",
                            tolerance=duration_tolerance_ratio,
                            confidence=conf,
                            severity="attention",
                            description=(
                                f"Duração cantada ({sung_dur:.2f}s) menor que a referência ({ref_dur:.2f}s)."
                            ),
                            recommendation_key="shortened",
                        )
                    )
                elif ratio < -duration_tolerance_ratio:
                    events.append(
                        ComparisonEvent(
                            id=str(uuid.uuid4()),
                            category="prolonged_note",
                            start_seconds=sung.start_seconds,
                            end_seconds=sung.end_seconds,
                            expected_note=expected_name,
                            observed_note=observed_name,
                            deviation=round((sung_dur - ref_dur) * 1000, 1),
                            unit="ms",
                            tolerance=duration_tolerance_ratio,
                            confidence=conf,
                            severity="info",
                            description=(
                                f"Duração cantada ({sung_dur:.2f}s) maior que a referência ({ref_dur:.2f}s)."
                            ),
                            recommendation_key="prolonged",
                        )
                    )

    pitch_summary = {
        "notes_compared": compared,
        "notes_within_tolerance": in_tol,
        "within_tolerance_percent": round(100.0 * in_tol / compared, 1) if compared else None,
        "median_cents_deviation": round(float(np.median(pitch_devs)), 2) if pitch_devs else None,
        "tolerance_cents": pitch_tolerance_cents,
    }
    rhythm_summary = {
        "onset_events": sum(1 for e in events if e.category in ("early_onset", "late_onset")),
        "duration_events": sum(1 for e in events if e.category in ("shortened_note", "prolonged_note")),
        "onset_tolerance_ms": onset_tolerance_ms,
        "alignment_gate": alignment.status == "completed",
    }

    return {
        "pitch": pitch_summary,
        "rhythm": rhythm_summary,
        "duration": {
            "tolerance_ratio": duration_tolerance_ratio,
        },
        "events": [e.to_dict() for e in events],
    }


def _rhythm_event(
    category: str,
    sung,
    expected_name: str,
    observed_name: str,
    onset_ms: float,
    tol: float,
    conf: float,
    label: str,
    rec_key: str,
) -> ComparisonEvent:
    return ComparisonEvent(
        id=str(uuid.uuid4()),
        category=category,
        start_seconds=sung.start_seconds,
        end_seconds=sung.end_seconds,
        expected_note=expected_name,
        observed_note=observed_name,
        deviation=round(onset_ms, 1),
        unit="ms",
        tolerance=tol,
        confidence=conf,
        severity="attention",
        description=f"{label}: {onset_ms:+.0f} ms (tolerância ±{tol:.0f} ms).",
        recommendation_key=rec_key,
    )
