"""
VoiceCheck — importação e normalização de referências musicais.

Etapa 4.1: MIDI (mido). MusicXML: ver voicecheck_musicxml. Áudio-ref depois.
"""

from __future__ import annotations

import io
import math
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import mido


@dataclass
class ReferenceNote:
    id: str
    pitch_midi: int
    frequency_hz: float
    start_seconds: float
    end_seconds: float
    duration_seconds: float
    part_id: str
    source: str  # midi | musicxml | audio
    confidence: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class NormalizedReference:
    source_type: str
    selected_part: str
    tempo_bpm: float | None
    notes: list[ReferenceNote]
    tracks: list[dict[str, Any]]
    warnings: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.source_type,
            "selected_part": self.selected_part,
            "tempo_bpm": self.tempo_bpm,
            "note_count": len(self.notes),
            "tracks": self.tracks,
            "notes": [n.to_dict() for n in self.notes],
            "warnings": self.warnings,
        }


def midi_to_hz(midi: int) -> float:
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def list_midi_tracks(data: bytes) -> list[dict[str, Any]]:
    mid = mido.MidiFile(file=io.BytesIO(data))
    tracks: list[dict[str, Any]] = []
    for i, track in enumerate(mid.tracks):
        name = None
        note_count = 0
        for msg in track:
            if msg.type == "track_name":
                name = msg.name
            if msg.type == "note_on" and msg.velocity > 0:
                note_count += 1
        tracks.append(
            {
                "index": i,
                "name": name or f"track_{i}",
                "note_count": note_count,
            }
        )
    return tracks


def parse_midi_bytes(
    data: bytes,
    *,
    track_index: int | None = None,
    track_name: str | None = None,
) -> NormalizedReference:
    """Extrai notas monofônicas (ou trilha escolhida) com tempos absolutos em segundos."""
    warnings: list[str] = []
    mid = mido.MidiFile(file=io.BytesIO(data))
    tracks_meta = list_midi_tracks(data)

    # Escolha de trilha
    chosen = track_index
    if chosen is None and track_name:
        for t in tracks_meta:
            if t["name"].lower() == track_name.lower():
                chosen = int(t["index"])
                break
    if chosen is None:
        # Preferir trilha com mais notas
        voiced = [t for t in tracks_meta if t["note_count"] > 0]
        if not voiced:
            raise ValueError("MIDI sem notas note_on")
        chosen = int(max(voiced, key=lambda t: t["note_count"])["index"])
        if len(voiced) > 1:
            warnings.append(
                f"Várias trilhas com notas — usando índice {chosen} ({tracks_meta[chosen]['name']}). "
                "Selecione a trilha vocal se necessário."
            )

    if chosen < 0 or chosen >= len(mid.tracks):
        raise ValueError(f"Trilha MIDI inválida: {chosen}")

    # Tempo: ticks → segundos (suporta set_tempo)
    ticks_per_beat = mid.ticks_per_beat or 480
    tempo_us = 500_000  # 120 BPM default
    tempo_bpm: float | None = 120.0

    # Merge all tracks for tempo messages, but notes only from chosen track
    # Absolute time for chosen track only, applying tempo map from whole file
    tempo_map: list[tuple[int, int]] = [(0, tempo_us)]  # tick, tempo_us

    abs_tick = 0
    for track in mid.tracks:
        t = 0
        for msg in track:
            t += msg.time
            if msg.type == "set_tempo":
                tempo_map.append((t, msg.tempo))
                tempo_bpm = 60_000_000 / msg.tempo

    tempo_map.sort(key=lambda x: x[0])

    def tick_to_seconds(tick: int) -> float:
        sec = 0.0
        prev_tick = 0
        cur_tempo = tempo_map[0][1]
        for i, (tt, tempo) in enumerate(tempo_map):
            if tt >= tick:
                break
            # advance from prev_tick to tt
            if tt > prev_tick:
                sec += mido.tick2second(tt - prev_tick, ticks_per_beat, cur_tempo)
                prev_tick = tt
            cur_tempo = tempo
        if tick > prev_tick:
            sec += mido.tick2second(tick - prev_tick, ticks_per_beat, cur_tempo)
        return sec

    # Collect note events on chosen track
    active: dict[int, tuple[int, int]] = {}  # pitch -> (start_tick, velocity)
    notes: list[ReferenceNote] = []
    tick = 0
    for msg in mid.tracks[chosen]:
        tick += msg.time
        if msg.type == "note_on" and msg.velocity > 0:
            if msg.note in active:
                # re-attack: close previous
                st, _vel = active.pop(msg.note)
                notes.append(_make_note(msg.note, st, tick, tick_to_seconds, str(chosen)))
            active[msg.note] = (tick, msg.velocity)
        elif msg.type in ("note_off",) or (msg.type == "note_on" and msg.velocity == 0):
            if msg.note in active:
                st, _vel = active.pop(msg.note)
                notes.append(_make_note(msg.note, st, tick, tick_to_seconds, str(chosen)))

    # Close hanging notes at end
    end_tick = tick
    for pitch, (st, _vel) in list(active.items()):
        notes.append(_make_note(pitch, st, max(end_tick, st + ticks_per_beat), tick_to_seconds, str(chosen)))

    notes.sort(key=lambda n: n.start_seconds)
    # Filter zero/negative duration
    notes = [n for n in notes if n.duration_seconds > 0.02]
    if not notes:
        raise ValueError("Nenhuma nota utilizável na trilha selecionada")

    part_name = tracks_meta[chosen]["name"]
    return NormalizedReference(
        source_type="midi",
        selected_part=part_name,
        tempo_bpm=tempo_bpm,
        notes=notes,
        tracks=tracks_meta,
        warnings=warnings,
    )


def _make_note(
    pitch: int,
    start_tick: int,
    end_tick: int,
    tick_to_seconds,
    part_id: str,
) -> ReferenceNote:
    start = tick_to_seconds(start_tick)
    end = tick_to_seconds(end_tick)
    if end <= start:
        end = start + 0.05
    return ReferenceNote(
        id=str(uuid.uuid4()),
        pitch_midi=int(pitch),
        frequency_hz=round(midi_to_hz(int(pitch)), 4),
        start_seconds=round(start, 4),
        end_seconds=round(end, 4),
        duration_seconds=round(end - start, 4),
        part_id=part_id,
        source="midi",
        confidence=1.0,
    )


def parse_midi_path(path: Path, **kwargs) -> NormalizedReference:
    return parse_midi_bytes(path.read_bytes(), **kwargs)
