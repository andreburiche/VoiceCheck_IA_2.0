"""
VoiceCheck — alinhamento temporal execução × referência.

v4: offset global por varredura + correspondência sequencial de notas.
Não aplica warping que apague atrasos medíveis.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from app.services.voicecheck_pitch import PitchFrame
from app.services.voicecheck_reference import ReferenceNote


@dataclass
class SungNote:
    start_seconds: float
    end_seconds: float
    median_hz: float
    median_midi: float
    valid_frames: int


@dataclass
class NoteMatch:
    ref: ReferenceNote
    sung: SungNote | None
    time_offset_applied: float


@dataclass
class AlignmentResult:
    status: str  # completed | insufficient | failed
    time_offset_seconds: float
    transposition_semitones: int
    matches: list[NoteMatch]
    confidence: float | None
    warnings: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "time_offset_seconds": round(self.time_offset_seconds, 4),
            "transposition_semitones_suggested": self.transposition_semitones,
            "confidence": self.confidence,
            "matched_notes": sum(1 for m in self.matches if m.sung is not None),
            "reference_notes": len(self.matches),
            "warnings": self.warnings,
        }


def segment_sung_notes(
    frames: list[PitchFrame],
    *,
    merge_semitone: float = 0.75,
    min_duration: float = 0.08,
) -> list[SungNote]:
    """Agrupa frames F0 válidos em notas aproximadas (monofonia)."""
    notes: list[SungNote] = []
    cur_hz: list[float] = []
    cur_midi: list[float] = []
    start: float | None = None
    last_t = 0.0

    def flush():
        nonlocal cur_hz, cur_midi, start
        if start is None or not cur_hz:
            cur_hz, cur_midi, start = [], [], None
            return
        dur = last_t - start
        if dur >= min_duration and len(cur_hz) >= 2:
            med_hz = float(np.median(cur_hz))
            med_midi = float(np.median(cur_midi))
            notes.append(
                SungNote(
                    start_seconds=start,
                    end_seconds=last_t + 0.01,
                    median_hz=med_hz,
                    median_midi=med_midi,
                    valid_frames=len(cur_hz),
                )
            )
        cur_hz, cur_midi, start = [], [], None

    for f in frames:
        last_t = f.time_seconds
        if not f.is_valid or f.frequency_hz is None or f.midi_note is None:
            flush()
            continue
        if start is None:
            start = f.time_seconds
            cur_hz = [f.frequency_hz]
            cur_midi = [f.midi_note]
            continue
        prev = cur_midi[-1]
        if abs(f.midi_note - prev) <= merge_semitone:
            cur_hz.append(f.frequency_hz)
            cur_midi.append(f.midi_note)
        else:
            flush()
            start = f.time_seconds
            cur_hz = [f.frequency_hz]
            cur_midi = [f.midi_note]
    flush()
    return notes


def estimate_time_offset(
    sung: list[SungNote],
    ref: list[ReferenceNote],
    *,
    search_seconds: float = 2.5,
    step: float = 0.05,
) -> tuple[float, float | None]:
    """
    Varre offset t_sung ≈ t_ref + offset.
    Score: quantas notas ref têm vizinha sung (onset) dentro de 0.35s após offset,
    com pitch a ≤ 2 semitons (antes da transposição).
    Retorna (offset, score_normalizado|None).
    """
    if not sung or not ref:
        return 0.0, None

    best_off = 0.0
    best_score = -1.0
    offsets = np.arange(-search_seconds, search_seconds + 1e-9, step)
    for off in offsets:
        score = 0.0
        used = set()
        for r in ref:
            target = r.start_seconds + off
            best_j = -1
            best_dt = 0.35
            for j, s in enumerate(sung):
                if j in used:
                    continue
                dt = abs(s.start_seconds - target)
                if dt < best_dt:
                    pitch_ok = abs(s.median_midi - r.pitch_midi) <= 2.0
                    if pitch_ok or dt < 0.12:
                        best_dt = dt
                        best_j = j
            if best_j >= 0:
                used.add(best_j)
                score += 1.0 - best_dt / 0.35
        if score > best_score:
            best_score = score
            best_off = float(off)

    conf = None
    if len(ref) > 0 and best_score > 0:
        conf = round(min(0.95, best_score / len(ref)), 3)
    return best_off, conf


def detect_transposition(
    sung: list[SungNote],
    ref: list[ReferenceNote],
    time_offset: float,
) -> int:
    """Mediana dos deltas de pitch (semitom) em pares onset-próximos."""
    deltas: list[int] = []
    for r in ref:
        target = r.start_seconds + time_offset
        best = None
        best_dt = 0.4
        for s in sung:
            dt = abs(s.start_seconds - target)
            if dt < best_dt:
                best_dt = dt
                best = s
        if best is not None:
            deltas.append(int(round(best.median_midi - r.pitch_midi)))
    if not deltas:
        return 0
    # Exigir pelo menos 1 par; com poucas notas, exigir concordância total no mediano
    min_pairs = 1 if len(ref) <= 2 else max(2, len(ref) // 3)
    if len(deltas) < min_pairs:
        return 0
    med = int(np.median(deltas))
    agree = sum(1 for d in deltas if d == med) / len(deltas)
    need = 0.99 if len(deltas) == 1 else 0.6
    if abs(med) >= 1 and agree >= need:
        return med
    return 0


def align_notes(
    frames: list[PitchFrame],
    ref_notes: list[ReferenceNote],
    *,
    accept_transposition: bool = False,
    forced_transposition: int = 0,
) -> AlignmentResult:
    warnings: list[str] = []
    sung = segment_sung_notes(frames)
    if not sung:
        return AlignmentResult(
            status="insufficient",
            time_offset_seconds=0.0,
            transposition_semitones=0,
            matches=[NoteMatch(ref=r, sung=None, time_offset_applied=0.0) for r in ref_notes],
            confidence=None,
            warnings=["Sem notas cantadas segmentáveis a partir do F0."],
        )
    if not ref_notes:
        return AlignmentResult(
            status="failed",
            time_offset_seconds=0.0,
            transposition_semitones=0,
            matches=[],
            confidence=None,
            warnings=["Referência sem notas."],
        )

    offset, conf = estimate_time_offset(sung, ref_notes)
    transp = forced_transposition if accept_transposition else detect_transposition(sung, ref_notes, offset)
    if transp != 0 and not accept_transposition:
        warnings.append(
            f"Possível transposição global de {transp:+d} semitom(ns). "
            "Aceite explicitamente para recalcular; não aplicada automaticamente."
        )

    # Match sequencial greedy
    matches: list[NoteMatch] = []
    used: set[int] = set()
    for r in ref_notes:
        r_midi = r.pitch_midi + (transp if accept_transposition else 0)
        target = r.start_seconds + offset
        best_j = -1
        best_score = -1e9
        for j, s in enumerate(sung):
            if j in used:
                continue
            dt = abs(s.start_seconds - target)
            if dt > 0.6:
                continue
            pitch_pen = abs(s.median_midi - r_midi)
            score = -dt - 0.05 * pitch_pen
            if score > best_score:
                best_score = score
                best_j = j
        if best_j >= 0:
            used.add(best_j)
            matches.append(NoteMatch(ref=r, sung=sung[best_j], time_offset_applied=offset))
        else:
            matches.append(NoteMatch(ref=r, sung=None, time_offset_applied=offset))

    matched = sum(1 for m in matches if m.sung is not None)
    status = "completed" if matched >= max(1, int(0.4 * len(ref_notes))) else "insufficient"
    if status == "insufficient":
        warnings.append("Correspondência temporal insuficiente — erros rítmicos não serão enfatizados.")
        conf = None if conf is not None and conf < 0.35 else conf

    return AlignmentResult(
        status=status,
        time_offset_seconds=offset,
        transposition_semitones=transp,
        matches=matches,
        confidence=conf,
        warnings=warnings,
    )
