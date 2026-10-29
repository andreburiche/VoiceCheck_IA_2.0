"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SECTION_PRESETS,
  createSectionId,
  loadSongSections,
  saveSongSections,
  type SongSection,
} from "@/lib/song-sections";
import { formatClock } from "@/lib/stem-theme";

type Props = {
  projectId: string;
  currentTimeSec: number;
  onSeek: (sec: number) => void;
  onSetLoop?: (startSec: number, endSec: number) => void;
};

export function SongSectionsPanel({ projectId, currentTimeSec, onSeek, onSetLoop }: Props) {
  const [sections, setSections] = useState<SongSection[]>([]);
  const [name, setName] = useState("Verso");
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState(8000);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void loadSongSections(projectId).then(setSections);
  }, [projectId]);

  async function persist(next: SongSection[]) {
    setSections(next);
    await saveSongSections(projectId, next);
  }

  async function addSection() {
    if (endMs <= startMs) {
      setMsg("Fim deve ser maior que início");
      return;
    }
    const sec: SongSection = {
      id: createSectionId(),
      name: name.trim() || "Seção",
      startMs,
      endMs,
      color: "#20D9D2",
    };
    await persist([...sections, sec].sort((a, b) => a.startMs - b.startMs));
    setMsg("Seção salva localmente");
  }

  function markStart() {
    setStartMs(Math.round(currentTimeSec * 1000));
  }
  function markEnd() {
    setEndMs(Math.round(currentTimeSec * 1000));
  }

  return (
    <section
      className="space-y-3 rounded-2xl border border-line bg-canvas-raised/80 p-4"
      aria-label="Seções da música"
    >
      <div>
        <h3 className="text-sm font-semibold text-ink">Seções da música</h3>
        <p className="text-xs text-ink-faint">Manual · IndexedDB · sem ASR automático</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="sec-name">Nome</Label>
          <select
            id="sec-name"
            className="mt-1 h-9 w-full rounded-lg border border-line bg-canvas px-2 text-sm text-ink"
            value={SECTION_PRESETS.includes(name as (typeof SECTION_PRESETS)[number]) ? name : "Verso"}
            onChange={(e) => setName(e.target.value)}
          >
            {SECTION_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <Input
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Nome customizado da seção"
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={markStart}>
            Início = agora
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={markEnd}>
            Fim = agora
          </Button>
        </div>
      </div>
      <p className="font-mono text-xs text-ink-muted">
        {formatClock(startMs / 1000)} → {formatClock(endMs / 1000)}
      </p>
      <Button type="button" size="sm" onClick={() => void addSection()}>
        Adicionar seção
      </Button>

      {msg ? <p className="text-xs text-accent">{msg}</p> : null}

      {sections.length === 0 ? (
        <p className="text-xs text-ink-faint">Nenhuma seção ainda.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {sections.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
              <button
                type="button"
                className="text-left text-ink hover:text-accent"
                onClick={() => onSeek(s.startMs / 1000)}
              >
                <span className="font-medium">{s.name}</span>
                <span className="ml-2 font-mono text-ink-faint">
                  {formatClock(s.startMs / 1000)}–{formatClock(s.endMs / 1000)}
                </span>
              </button>
              <span className="flex gap-2">
                {onSetLoop ? (
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    onClick={() => onSetLoop(s.startMs / 1000, s.endMs / 1000)}
                  >
                    Loop
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-ink-faint hover:text-signal-err"
                  onClick={() => void persist(sections.filter((x) => x.id !== s.id))}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
