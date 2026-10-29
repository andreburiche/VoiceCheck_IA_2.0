"""
VoiceCheck — leitura MusicXML partwise → NormalizedReference.

Parser leve (stdlib XML). Suporta partes, compassos, andamento, pausas e notas.
Repetições complexas / endings não são expandidas nesta versão.
"""

from __future__ import annotations

import uuid
import xml.etree.ElementTree as ET
from typing import Any

from app.services.voicecheck_reference import (
    NormalizedReference,
    ReferenceNote,
    midi_to_hz,
)

def _local(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def _find_text(el: ET.Element | None, name: str, default: str | None = None) -> str | None:
    if el is None:
        return default
    for child in el:
        if _local(child.tag) == name:
            return (child.text or "").strip() or default
    return default


def _pitch_to_midi(note_el: ET.Element) -> int | None:
    pitch = None
    for child in note_el:
        if _local(child.tag) == "pitch":
            pitch = child
            break
    if pitch is None:
        return None
    step = _find_text(pitch, "step")
    octave = _find_text(pitch, "octave")
    alter_s = _find_text(pitch, "alter", "0")
    if not step or octave is None:
        return None
    steps = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
    if step not in steps:
        return None
    try:
        alter = int(float(alter_s or "0"))
        oct_i = int(octave)
    except ValueError:
        return None
    return (oct_i + 1) * 12 + steps[step] + alter


def list_musicxml_parts(data: bytes) -> list[dict[str, Any]]:
    root = ET.fromstring(data)
    parts_meta: list[dict[str, Any]] = []
    # score-part list
    id_to_name: dict[str, str] = {}
    for el in root.iter():
        if _local(el.tag) == "score-part":
            pid = el.attrib.get("id", "")
            name = _find_text(el, "part-name", pid) or pid
            id_to_name[pid] = name

    idx = 0
    for el in root.iter():
        if _local(el.tag) != "part":
            continue
        pid = el.attrib.get("id", f"P{idx + 1}")
        note_count = 0
        for n in el.iter():
            if _local(n.tag) == "note" and _pitch_to_midi(n) is not None:
                # skip chord continuation for count? count all pitched notes
                if not any(_local(c.tag) == "rest" for c in n):
                    note_count += 1
        parts_meta.append(
            {
                "index": idx,
                "id": pid,
                "name": id_to_name.get(pid, pid),
                "note_count": note_count,
            }
        )
        idx += 1
    return parts_meta


def parse_musicxml_bytes(
    data: bytes,
    *,
    part_index: int | None = None,
    part_id: str | None = None,
) -> NormalizedReference:
    warnings: list[str] = [
        "MusicXML: repetições/voltas não são expandidas automaticamente nesta versão.",
    ]
    root = ET.fromstring(data)
    parts = [el for el in root.iter() if _local(el.tag) == "part"]
    if not parts:
        raise ValueError("MusicXML sem <part>")

    tracks = list_musicxml_parts(data)
    chosen_i = part_index
    if chosen_i is None and part_id:
        for t in tracks:
            if t["id"] == part_id or str(t["name"]).lower() == part_id.lower():
                chosen_i = int(t["index"])
                break
    if chosen_i is None:
        voiced = [t for t in tracks if t["note_count"] > 0]
        if not voiced:
            raise ValueError("MusicXML sem notas com pitch")
        chosen_i = int(max(voiced, key=lambda t: t["note_count"])["index"])
        if len(voiced) > 1:
            warnings.append(
                f"Várias partes com notas — usando {tracks[chosen_i]['name']}. "
                "Selecione soprano/outra parte se necessário."
            )

    if chosen_i < 0 or chosen_i >= len(parts):
        raise ValueError(f"Parte MusicXML inválida: {chosen_i}")

    part = parts[chosen_i]
    part_meta = tracks[chosen_i]
    divisions = 1
    bpm = 120.0
    tempo_bpm: float | None = 120.0
    cursor = 0.0  # seconds
    notes: list[ReferenceNote] = []

    def dur_to_sec(dur_div: int) -> float:
        # duration in divisions → quarters → seconds
        quarters = dur_div / max(1, divisions)
        return quarters * (60.0 / max(20.0, bpm))

    for measure in part:
        if _local(measure.tag) != "measure":
            continue
        # attributes / tempo in measure
        for child in measure:
            tag = _local(child.tag)
            if tag == "attributes":
                div_t = _find_text(child, "divisions")
                if div_t:
                    try:
                        divisions = max(1, int(div_t))
                    except ValueError:
                        pass
            if tag == "direction":
                for d in child.iter():
                    if _local(d.tag) == "sound" and "tempo" in d.attrib:
                        try:
                            bpm = float(d.attrib["tempo"])
                            tempo_bpm = bpm
                        except ValueError:
                            pass
                    if _local(d.tag) == "per-minute":
                        try:
                            bpm = float((d.text or "120").strip())
                            tempo_bpm = bpm
                        except ValueError:
                            pass

        # notes: advance cursor; <chord/> shares onset with previous note
        last_note_start = cursor
        for child in measure:
            tag = _local(child.tag)
            if tag == "backup":
                dur_s = _find_text(child, "duration", "0") or "0"
                try:
                    cursor = max(0.0, cursor - dur_to_sec(int(dur_s)))
                except ValueError:
                    pass
                continue
            if tag == "forward":
                dur_s = _find_text(child, "duration", "0") or "0"
                try:
                    cursor += dur_to_sec(int(dur_s))
                except ValueError:
                    pass
                continue
            if tag != "note":
                continue

            is_chord = any(_local(c.tag) == "chord" for c in child)
            is_rest = any(_local(c.tag) == "rest" for c in child)
            dur_s = _find_text(child, "duration", "0") or "0"
            try:
                dur_div = int(dur_s)
            except ValueError:
                dur_div = 0
            sec = max(0.0, dur_to_sec(dur_div))

            if is_rest:
                if not is_chord:
                    cursor += sec
                continue

            midi = _pitch_to_midi(child)
            if midi is None:
                if not is_chord:
                    cursor += sec
                continue

            if is_chord:
                start = last_note_start
            else:
                start = cursor
                last_note_start = start
                cursor += sec

            end = start + sec
            if end <= start:
                end = start + 0.05
            notes.append(
                ReferenceNote(
                    id=str(uuid.uuid4()),
                    pitch_midi=int(midi),
                    frequency_hz=round(midi_to_hz(int(midi)), 4),
                    start_seconds=round(start, 4),
                    end_seconds=round(end, 4),
                    duration_seconds=round(end - start, 4),
                    part_id=str(part_meta["id"]),
                    source="musicxml",
                    confidence=1.0,
                )
            )

    notes.sort(key=lambda n: (n.start_seconds, n.pitch_midi))
    notes = [n for n in notes if n.duration_seconds > 0.02]
    # Monofonia vocal: em acordes, fica a nota mais aguda (melodia típica)
    mono: list[ReferenceNote] = []
    chord_stripped = 0
    i = 0
    while i < len(notes):
        j = i + 1
        while j < len(notes) and abs(notes[j].start_seconds - notes[i].start_seconds) < 1e-4:
            j += 1
        group = notes[i:j]
        pick = max(group, key=lambda n: n.pitch_midi)
        mono.append(pick)
        chord_stripped += len(group) - 1
        i = j
    notes = mono
    if chord_stripped:
        warnings.append(
            f"{chord_stripped} nota(s) de acorde omitidas — mantida a mais aguda em cada ataque."
        )
    if not notes:
        raise ValueError("Nenhuma nota utilizável na parte selecionada")

    return NormalizedReference(
        source_type="musicxml",
        selected_part=str(part_meta["name"]),
        tempo_bpm=tempo_bpm,
        notes=notes,
        tracks=[
            {
                "index": t["index"],
                "name": t["name"],
                "note_count": t["note_count"],
                "id": t.get("id"),
            }
            for t in tracks
        ],
        warnings=warnings,
    )
