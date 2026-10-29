"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  activeLineIndex,
  bodyToLines,
  linesToBody,
  loadLyrics,
  lyricsToTxt,
  saveLyrics,
  type LyricsDoc,
} from "@/lib/lyrics-local";
import { loadSongSections, type SongSection } from "@/lib/song-sections";
import { formatClock } from "@/lib/stem-theme";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  currentTimeSec: number;
  onSeek?: (sec: number) => void;
};

export function LyricsPanel({ projectId, currentTimeSec, onSeek }: Props) {
  const [doc, setDoc] = useState<LyricsDoc | null>(null);
  const [sections, setSections] = useState<SongSection[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void (async () => {
      const [ly, sec] = await Promise.all([loadLyrics(projectId), loadSongSections(projectId)]);
      setDoc(ly);
      setSections(sec);
    })();
  }, [projectId]);

  const timeMs = Math.round(currentTimeSec * 1000);
  const activeIdx = useMemo(
    () => (doc ? activeLineIndex(doc.lines, timeMs) : -1),
    [doc, timeMs],
  );

  const persist = useCallback(
    async (next: LyricsDoc) => {
      setDoc(next);
      await saveLyrics(next);
      setDirty(false);
      setMsg("Letras salvas localmente");
    },
    [],
  );

  function updateBody(body: string) {
    if (!doc) return;
    const lines = bodyToLines(body, doc.lines);
    setDoc({ ...doc, body, lines });
    setDirty(true);
  }

  function stampLine(index: number) {
    if (!doc) return;
    const lines = doc.lines.map((l, i) =>
      i === index ? { ...l, startMs: timeMs } : l,
    );
    setDoc({ ...doc, lines, body: linesToBody(lines) });
    setDirty(true);
  }

  function stampActiveOrNext() {
    if (!doc || !doc.lines.length) return;
    const idx = activeIdx >= 0 ? Math.min(activeIdx + 1, doc.lines.length - 1) : 0;
    stampLine(idx);
  }

  function attachSectionToLine(lineIndex: number, sectionId: string) {
    if (!doc) return;
    const sec = sections.find((s) => s.id === sectionId);
    const lines = doc.lines.map((l, i) => {
      if (i !== lineIndex) return l;
      return {
        ...l,
        sectionId: sectionId || null,
        startMs: sec ? sec.startMs : l.startMs,
      };
    });
    setDoc({ ...doc, lines, body: linesToBody(lines) });
    setDirty(true);
  }

  function exportTxt() {
    if (!doc) return;
    const blob = new Blob([lyricsToTxt(doc)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(doc.title || "letras").replace(/\s+/g, "_").slice(0, 40)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!doc) {
    return <p className="text-sm text-ink-muted">Carregando letras…</p>;
  }

  return (
    <section
      className="space-y-3 rounded-2xl border border-line bg-canvas-raised/80 p-4 shadow-panel"
      aria-label="Letras"
      id="letras"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">Letras</h3>
          <p className="text-xs text-ink-faint">
            Manual · IndexedDB · sem ASR · sincronize linhas com o playhead
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={stampActiveOrNext}>
            Marcar tempo
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!dirty}
            onClick={() => void persist(doc)}
          >
            Salvar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={exportTxt}>
            Exportar TXT
          </Button>
        </div>
      </div>

      <div>
        <Label htmlFor="ly-title">Título</Label>
        <Input
          id="ly-title"
          className="mt-1"
          value={doc.title}
          onChange={(e) => {
            setDoc({ ...doc, title: e.target.value });
            setDirty(true);
          }}
        />
      </div>

      <div>
        <Label htmlFor="ly-body">Texto (uma linha por verso)</Label>
        <textarea
          id="ly-body"
          className="mt-1 min-h-[140px] w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink"
          value={doc.body}
          onChange={(e) => updateBody(e.target.value)}
          spellCheck
        />
      </div>

      {doc.lines.some((l) => l.text.trim()) ? (
        <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line bg-canvas/40 p-2">
          {doc.lines.map((line, i) => {
            if (!line.text.trim() && line.startMs == null) return null;
            const active = i === activeIdx;
            return (
              <li
                key={line.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-xs",
                  active ? "bg-accent/15 text-accent" : "text-ink-muted",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left font-medium"
                  onClick={() => {
                    if (line.startMs != null) onSeek?.(line.startMs / 1000);
                  }}
                >
                  {line.text || "—"}
                </button>
                <span className="font-mono text-xs text-ink-faint">
                  {line.startMs != null ? formatClock(line.startMs / 1000) : "—"}
                </span>
                <button
                  type="button"
                  className="text-xs text-violet hover:underline"
                  onClick={() => stampLine(i)}
                >
                  agora
                </button>
                {sections.length > 0 ? (
                  <select
                    className="h-7 max-w-[7rem] rounded-lg border border-line bg-canvas px-1 text-xs"
                    value={line.sectionId ?? ""}
                    aria-label={`Seção da linha ${i + 1}`}
                    onChange={(e) => attachSectionToLine(i, e.target.value)}
                  >
                    <option value="">Seção…</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {msg ? <p className="text-xs text-accent">{msg}</p> : null}
    </section>
  );
}
