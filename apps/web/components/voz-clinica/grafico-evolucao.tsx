"use client";

import { useEffect, useId, useRef, useState } from "react";

import { numeroBR } from "@/lib/voz-clinica-api";
import { dataCurta, escalaY, variacaoTexto, type SerieEvolucao } from "@/lib/voz-clinica-evolucao";

/** Largura usada antes da primeira medição (e nos testes sem layout). */
const W_INICIAL = 320;
const H = 160;
const PE = 40; // espaço à esquerda (rótulos do eixo Y)
const PD = 12;
const PT = 12;
const PB = 24; // espaço embaixo (datas)

function dataHora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Evolução de UMA medida: linha + pontos, linha de corte opcional, detalhe ao passar o mouse ou focar. */
export function GraficoEvolucao({ serie }: { serie: SerieEvolucao }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const id = useId();
  // 1 unidade do SVG = 1 px: o texto fica sempre com 11 px, no celular e no monitor largo
  const caixa = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(W_INICIAL);
  useEffect(() => {
    const el = caixa.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      const largura = Math.round(el.getBoundingClientRect().width);
      if (largura > 0) setW(largura);
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const { min, max, marcas } = escalaY(serie);
  const n = serie.pontos.length;
  const x = (i: number) => (n > 1 ? PE + (i / (n - 1)) * (W - PE - PD) : PE + (W - PE - PD) / 2);
  const y = (v: number) => PT + (1 - (Math.min(max, Math.max(min, v)) - min) / (max - min || 1)) * (H - PT - PB);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const linha = serie.pontos.map((p, i) => `${r1(x(i))},${r1(y(p.valor))}`).join(" ");
  // casas fixas: "3,90 %" ao lado de "−4,00 %", nunca "3,9 %"
  const formatar = (v: number) =>
    `${v.toLocaleString("pt-BR", { minimumFractionDigits: serie.casas, maximumFractionDigits: serie.casas })}${serie.unidade ? ` ${serie.unidade}` : ""}`;
  // cabe uma data a cada ~56 px ("27/10" tem ~32 px em 11 px)
  const passoData = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - PE - PD) / 56))));
  const ultimo = serie.pontos[n - 1];
  const pontoAtivo = ativo !== null ? serie.pontos[ativo] : undefined;
  const largCol = n > 1 ? (W - PE - PD) / (n - 1) : W - PE - PD;

  return (
    <figure className="rounded-xl bg-canvas-raised/60 p-3 ring-1 ring-inset ring-ink/10" aria-labelledby={`${id}-t`}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span id={`${id}-t`} className="text-sm font-medium text-ink">
          {serie.titulo}
        </span>
        <span className="text-data text-xs text-ink-muted">
          {ultimo ? formatar(ultimo.valor) : "—"} · {variacaoTexto(serie)}
        </span>
      </figcaption>

      <div ref={caixa} className="relative mt-2" onMouseLeave={() => setAtivo(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full" role="group" aria-label={`${serie.titulo} ao longo das sessões`}>
          {marcas.map((m) => (
            <g key={m} aria-hidden>
              <line x1={PE} x2={W - PD} y1={r1(y(m))} y2={r1(y(m))} stroke="rgb(var(--c-ink-muted) / 0.12)" />
              <text x={PE - 6} y={r1(y(m)) + 4} textAnchor="end" fontSize={11} className="fill-ink-faint" fontFamily="var(--font-mono)">
                {numeroBR(m, 2)}
              </text>
            </g>
          ))}

          {serie.corte ? (
            <g aria-hidden>
              <line
                x1={PE} x2={W - PD} y1={r1(y(serie.corte.valor))} y2={r1(y(serie.corte.valor))}
                stroke="rgb(var(--c-ink-muted))" strokeWidth={1} strokeDasharray="4 4"
              />
              <text x={PE + 4} y={r1(y(serie.corte.valor)) + (y(serie.corte.valor) - PT < 16 ? 13 : -4)} textAnchor="start" fontSize={11} className="fill-ink-muted">
                {serie.corte.rotulo}
              </text>
            </g>
          ) : null}

          {pontoAtivo && ativo !== null ? (
            <line aria-hidden x1={r1(x(ativo))} x2={r1(x(ativo))} y1={PT} y2={H - PB} stroke="rgb(var(--c-ink-muted) / 0.35)" />
          ) : null}

          <polyline aria-hidden points={linha} fill="none" stroke="rgb(var(--c-accent))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {serie.pontos.map((p, i) => (
            <g key={p.data + i}>
              {/* área de acerto maior que o ponto */}
              <rect
                x={r1(x(i) - largCol / 2)} y={PT} width={r1(largCol)} height={H - PT - PB}
                fill="transparent"
                onMouseEnter={() => setAtivo(i)}
                aria-hidden
              />
              <circle
                cx={r1(x(i))} cy={r1(y(p.valor))} r={ativo === i ? 5.5 : 4}
                fill="rgb(var(--c-accent))" stroke="rgb(var(--c-canvas))" strokeWidth={2}
                tabIndex={0}
                role="img"
                aria-label={`${dataHora(p.data)}: ${formatar(p.valor)}`}
                onFocus={() => setAtivo(i)}
                onBlur={() => setAtivo(null)}
                onMouseEnter={() => setAtivo(i)}
                className="cursor-default"
              />
            </g>
          ))}

          {serie.pontos.map((p, i) =>
            i % passoData === 0 || i === n - 1 ? (
              <text key={`d${i}`} aria-hidden x={r1(x(i))} y={H - 6} textAnchor={n > 1 && i === n - 1 ? "end" : n > 1 && i === 0 ? "start" : "middle"} fontSize={11} className="fill-ink-faint" fontFamily="var(--font-mono)">
                {dataCurta(p.data)}
              </text>
            ) : null,
          )}
        </svg>

        {pontoAtivo && ativo !== null ? (
          <div
            role="status"
            className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-canvas-overlay px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-line"
            style={{
              left: `${(x(ativo) / W) * 100}%`,
              top: `${(y(pontoAtivo.valor) / H) * 100}%`,
              // perto das bordas o balão se alinha para dentro (sem rolagem lateral no celular)
              transform: `translate(${ativo === 0 && n > 1 ? "-12px" : ativo === n - 1 && n > 1 ? "calc(-100% + 12px)" : "-50%"}, calc(-100% - 10px))`,
            }}
          >
            <span className="text-ink-muted">{dataHora(pontoAtivo.data)}</span>
            <span className="text-data ml-2 font-medium text-ink">{formatar(pontoAtivo.valor)}</span>
          </div>
        ) : null}
      </div>

      <p className="mt-1 text-xs text-ink-faint">{serie.leitura}</p>
    </figure>
  );
}
