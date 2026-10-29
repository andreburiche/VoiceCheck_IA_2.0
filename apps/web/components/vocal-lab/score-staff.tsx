"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StaffNote = {
  id?: string;
  midi: number;
  startSec: number;
  durationSec: number;
};

type ScoreStaffProps = {
  notes: StaffNote[];
  activeIndex?: number;
  /** Sílabas de solfejo sob cada nota (opcional). */
  syllables?: string[];
  className?: string;
  onSelect?: (index: number) => void;
};

const NOTE_GAP = 36;
const LEFT_PAD = 58;
const RIGHT_PAD = 24;
const SYSTEM_H = 128;
const STAFF_TOP = 26;
const LINE_GAP = 11;

/** Pauta SVG com quebra de sistema (várias linhas). */
export function ScoreStaff({
  notes,
  activeIndex = -1,
  syllables,
  className,
  onSelect,
}: ScoreStaffProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [hostW, setHostW] = useState(640);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setHostW(Math.max(280, Math.floor(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const usable = Math.max(120, hostW - LEFT_PAD - RIGHT_PAD - 8);
  const perSystem = Math.max(6, Math.floor(usable / NOTE_GAP));

  const systems = useMemo(() => {
    if (!notes.length) return [] as { gi: number; note: StaffNote }[][];
    const rows: { gi: number; note: StaffNote }[][] = [];
    for (let i = 0; i < notes.length; i += perSystem) {
      rows.push(
        notes.slice(i, i + perSystem).map((note, j) => ({
          gi: i + j,
          note,
        })),
      );
    }
    return rows;
  }, [notes, perSystem]);

  const svgW = hostW;
  const svgH = Math.max(SYSTEM_H, systems.length * SYSTEM_H || SYSTEM_H);

  function midiToY(midi: number, systemTop: number): number {
    const semitonesFromC4 = midi - 60;
    return systemTop + STAFF_TOP + 4 * LINE_GAP - semitonesFromC4 * (LINE_GAP / 2);
  }

  function ledgerLines(midi: number, x: number, systemTop: number, active: boolean) {
    const y = midiToY(midi, systemTop);
    const topLine = systemTop + STAFF_TOP;
    const botLine = systemTop + STAFF_TOP + 4 * LINE_GAP;
    const stroke = active ? "#17BDB8" : "#1a1a1a";
    const lines: ReactNode[] = [];
    // acima da pauta
    if (y < topLine - 1) {
      for (let ly = topLine - LINE_GAP; ly >= y - 1; ly -= LINE_GAP) {
        lines.push(
          <line
            key={`up-${ly}`}
            x1={x - 11}
            x2={x + 11}
            y1={ly}
            y2={ly}
            stroke={stroke}
            strokeWidth={1.1}
          />,
        );
      }
    }
    // abaixo
    if (y > botLine + 1) {
      for (let ly = botLine + LINE_GAP; ly <= y + 1; ly += LINE_GAP) {
        lines.push(
          <line
            key={`dn-${ly}`}
            x1={x - 11}
            x2={x + 11}
            y1={ly}
            y2={ly}
            stroke={stroke}
            strokeWidth={1.1}
          />,
        );
      }
    }
    return lines;
  }

  return (
    <div
      ref={hostRef}
      className={cn(
        "overflow-hidden rounded-2xl border border-line/60 bg-[#f4efe3] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-black/5 px-4 py-2">
        <p className="font-display text-xs font-semibold tracking-wide text-[#3d3428]">
          Partitura
        </p>
        <p className="font-mono text-xs text-[#7a6f60]">
          {notes.length
            ? `${notes.length} notas · ${systems.length} sistema${systems.length === 1 ? "" : "s"}`
            : "sem notas"}
        </p>
      </div>

      {!notes.length ? (
        <div className="flex h-36 items-center justify-center px-4 text-sm text-[#8a7f70]">
          Transcreva uma voz para ver a pauta aqui.
        </div>
      ) : (
        <div className="overflow-x-hidden p-2 sm:p-3">
          <svg
            width="100%"
            height={svgH}
            viewBox={`0 0 ${svgW} ${svgH}`}
            preserveAspectRatio="xMinYMin meet"
            role="img"
            aria-label={`Partitura com ${systems.length} sistemas`}
          >
            {systems.map((row, si) => {
              const top = si * SYSTEM_H;
              const staffEnd = svgW - RIGHT_PAD;
              return (
                <g key={si}>
                  {[0, 1, 2, 3, 4].map((li) => (
                    <line
                      key={li}
                      x1={16}
                      x2={staffEnd}
                      y1={top + STAFF_TOP + li * LINE_GAP}
                      y2={top + STAFF_TOP + li * LINE_GAP}
                      stroke="#1c1914"
                      strokeWidth={1.15}
                    />
                  ))}
                  <text
                    x={18}
                    y={top + STAFF_TOP + 3.15 * LINE_GAP}
                    fontSize={40}
                    fill="#1c1914"
                    fontFamily="Georgia, 'Times New Roman', serif"
                  >
                    𝄞
                  </text>
                  {/* separador entre sistemas */}
                  {si > 0 ? (
                    <line
                      x1={16}
                      x2={staffEnd}
                      y1={top + 4}
                      y2={top + 4}
                      stroke="#cfc4b0"
                      strokeWidth={1}
                      strokeDasharray="3 5"
                    />
                  ) : null}

                  {row.map(({ gi, note }, ni) => {
                    const x = LEFT_PAD + ni * NOTE_GAP;
                    const y = midiToY(note.midi, top);
                    const active = gi === activeIndex;
                    const stemUp = note.midi < 71;
                    return (
                      <g
                        key={note.id ?? gi}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelect?.(gi)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelect?.(gi);
                          }
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        {ledgerLines(note.midi, x, top, active)}
                        <ellipse
                          cx={x}
                          cy={y}
                          rx={7}
                          ry={5}
                          fill={active ? "#20D9D2" : "#111"}
                          transform={`rotate(-18 ${x} ${y})`}
                        />
                        <line
                          x1={stemUp ? x + 6.2 : x - 6.2}
                          y1={y}
                          x2={stemUp ? x + 6.2 : x - 6.2}
                          y2={stemUp ? y - 34 : y + 34}
                          stroke={active ? "#17BDB8" : "#111"}
                          strokeWidth={1.45}
                        />
                        {syllables?.[gi] ? (
                          <text
                            x={x}
                            y={top + SYSTEM_H - 14}
                            textAnchor="middle"
                            fontSize={10.5}
                            fontFamily="var(--font-sans), Inter, system-ui, sans-serif"
                            fill={active ? "#0f766e" : "#4a4338"}
                            fontWeight={active ? 700 : 500}
                          >
                            {syllables[gi]}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
