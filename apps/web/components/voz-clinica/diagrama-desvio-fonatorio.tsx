"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { fixoBR, type AnaliseAcustica, type GraficosAnalise } from "@/lib/voz-clinica-api";
import { LIMITES_DDF, MAX_EIXO, ROTULO_QUADRANTE, dispersao, pontoDdf, pontosTrechos } from "@/lib/voz-clinica-ddf";

const ME = 46; // margem esquerda (rótulo e números do eixo Y)
const MD = 12;
const MT = 12;
const MB = 44; // números e rótulo do eixo X

function useLargura() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      const l = Math.round(el.getBoundingClientRect().width);
      if (l > 0) setW(l);
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * Diagrama de Desvio Fonatório da análise atual, no formato do VoxMetria: área de
 * normalidade, um ponto por trecho de 0,5 s (a nuvem) e o ponto da gravação inteira com o
 * valor ao lado. Embaixo, a forma de onda com os trechos: passar o mouse (ou o foco) num
 * ponto acende o trecho correspondente.
 *
 * Escala própria (ver lib/voz-clinica-ddf.ts): 1 = limite de normalidade em cada eixo.
 */
export function DiagramaDesvioFonatorio({ resultado, graficos }: { resultado: AnaliseAcustica; graficos?: GraficosAnalise }) {
  const [ref, w] = useLargura();
  const [ativo, setAtivo] = useState<number | null>(null);
  const ponto = useMemo(() => pontoDdf(resultado), [resultado]);
  const trechos = useMemo(() => pontosTrechos(resultado), [resultado]);
  const disp = useMemo(() => dispersao(trechos), [trechos]);
  if (!ponto) {
    return <p className="text-sm text-ink-muted">Sem jitter, shimmer e GNE nesta gravação: o diagrama precisa de uma vogal sustentada de 3 s ou mais.</p>;
  }

  const iw = Math.max(200, w - ME - MD);
  const ih = Math.round(Math.min(380, Math.max(220, iw * 0.5)));
  const h = ih + MT + MB;
  const X = (v: number) => ME + (Math.min(Math.max(v, 0), MAX_EIXO) / MAX_EIXO) * iw;
  const Y = (v: number) => MT + ih - (Math.min(Math.max(v, 0), MAX_EIXO) / MAX_EIXO) * ih;
  const raio = Math.min(X(1) - X(0), Y(0) - Y(1)) * 0.38; // canto arredondado da área normal, como no VoxMetria
  const areaNormal = `M${X(0)},${Y(0)} L${X(0)},${Y(1)} L${X(1) - raio},${Y(1)} Q${X(1)},${Y(1)} ${X(1)},${Y(1) + raio} L${X(1)},${Y(0)} Z`;
  const marcas = Array.from({ length: MAX_EIXO * 2 + 1 }, (_, i) => i / 2);
  const preso = ponto.x > MAX_EIXO || ponto.y > MAX_EIXO;

  const rotulo = `Ruído ${fixoBR(ponto.y, 2)} · Irr. ${fixoBR(ponto.x, 2)}`;
  const larguraRotulo = rotulo.length * 6.6 + 16;
  const rx = X(ponto.x) + larguraRotulo + 14 > ME + iw ? X(ponto.x) - larguraRotulo - 12 : X(ponto.x) + 12;
  const ry = Math.max(MT + 2, Y(ponto.y) - 30);

  const descricao = `Diagrama de Desvio Fonatório: a gravação está ${ROTULO_QUADRANTE[ponto.quadrante]} (irregularidade ${fixoBR(ponto.x, 2)}, ruído ${fixoBR(ponto.y, 2)}, onde 1 é o limite)${
    trechos.length ? `; ${trechos.length} trechos de meio segundo, ${trechos.filter((t) => t.quadrante === "normal").length} dentro dos limites` : ""}.`;

  return (
    <div data-testid="vc2-ddf-atual">
      <div ref={ref} className="w-full overflow-hidden text-ink">
        <svg width={w} height={h} role="img" aria-label={descricao} className="block">
          <rect x={X(0)} y={Y(MAX_EIXO)} width={iw} height={ih} className="fill-canvas-overlay/70" />
          <path d={areaNormal} className="fill-ink/[0.07]" />
          <text x={(X(0) + X(1)) / 2} y={(Y(0) + Y(1)) / 2 + 10} textAnchor="middle" fontSize={Math.min(34, ih / 9)} fontWeight={700}
            className="fill-ink/[0.10] font-display" aria-hidden>Normal</text>

          {marcas.map((m) => (
            <g key={m} aria-hidden>
              <line x1={X(m)} x2={X(m)} y1={Y(0)} y2={Y(MAX_EIXO)} stroke="currentColor" className={m === 1 ? "text-ink/[0.35]" : "text-ink/[0.12]"} strokeDasharray={m === 1 ? undefined : "3 4"} />
              <line x1={X(0)} x2={X(MAX_EIXO)} y1={Y(m)} y2={Y(m)} stroke="currentColor" className={m === 1 ? "text-ink/[0.35]" : "text-ink/[0.12]"} strokeDasharray={m === 1 ? undefined : "3 4"} />
              <text x={X(m)} y={Y(0) + 16} textAnchor="middle" fontSize={11} className="fill-ink-muted">{fixoBR(m, m % 1 ? 1 : 0)}</text>
              <text x={ME - 8} y={Y(m) + 4} textAnchor="end" fontSize={11} className="fill-ink-muted">{fixoBR(m, m % 1 ? 1 : 0)}</text>
            </g>
          ))}
          <rect x={X(0)} y={Y(MAX_EIXO)} width={iw} height={ih} fill="none" stroke="currentColor" className="text-ink/25" />

          <g fontSize={11} className="fill-ink-faint" aria-hidden>
            <text x={X(MAX_EIXO) - 8} y={Y(0) - 8} textAnchor="end">Irregularidade</text>
            <text x={X(0) + 8} y={Y(MAX_EIXO) + 16}>Ruído</text>
            <text x={X(MAX_EIXO) - 8} y={Y(MAX_EIXO) + 16} textAnchor="end">Irregularidade e ruído</text>
          </g>
          <text x={ME + iw / 2} y={h - 8} textAnchor="middle" fontSize={12} fontWeight={600} className="fill-ink">Irregularidade (jitter, shimmer)</text>
          <text x={13} y={MT + ih / 2} textAnchor="middle" fontSize={12} fontWeight={600} className="fill-ink" transform={`rotate(-90 13 ${MT + ih / 2})`}>Ruído (GNE)</text>

          {/* nuvem: um ponto por trecho de 0,5 s */}
          {trechos.map((t, i) => (
            <circle key={i} cx={X(t.x)} cy={Y(t.y)} r={ativo === i ? 7 : 5}
              className={ativo === i ? "fill-accent" : "fill-accent/[0.55]"} stroke="currentColor" strokeWidth={ativo === i ? 2 : 0}
              tabIndex={0} role="img"
              aria-label={`Trecho de ${fixoBR(t.inicio_s, 1)} a ${fixoBR(t.fim_s, 1)} s: irregularidade ${fixoBR(t.x, 2)}, ruído ${fixoBR(t.y, 2)}`}
              onMouseEnter={() => setAtivo(i)} onMouseLeave={() => setAtivo(null)} onFocus={() => setAtivo(i)} onBlur={() => setAtivo(null)}
              style={{ outline: "none", cursor: "default", transition: "r 120ms ease-out" }}>
              <title>{`${fixoBR(t.inicio_s, 1)}–${fixoBR(t.fim_s, 1)} s · jitter ${fixoBR(t.jitter, 2)}% · shimmer ${fixoBR(t.shimmer, 2)}% · GNE ${fixoBR(t.gne, 2)}`}</title>
            </circle>
          ))}

          {/* gravação inteira */}
          <circle cx={X(ponto.x)} cy={Y(ponto.y)} r={9} className="fill-ink" stroke="var(--accent)" strokeWidth={3} data-testid="vc2-ddf-ponto" />
          <g aria-hidden>
            <rect x={rx} y={ry} width={larguraRotulo} height={24} rx={6} className="fill-canvas" stroke="currentColor" strokeOpacity={0.3} />
            <text x={rx + 8} y={ry + 16} fontSize={12} className="fill-ink text-data">{rotulo}{preso ? " →" : ""}</text>
          </g>
        </svg>

        {graficos?.onda ? <OndaComTrechos onda={graficos.onda} trechos={trechos} ativo={ativo} w={w} /> : null}
      </div>

      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <p className="hud-label">Gravação inteira</p>
          <p className="mt-1 font-medium text-ink" data-testid="vc2-ddf-atual-quadrante">{ROTULO_QUADRANTE[ponto.quadrante]}</p>
        </div>
        <div>
          <p className="hud-label">Medidas</p>
          <p className="mt-1 text-ink">
            <span className="text-data">{fixoBR(ponto.jitter, 2)}%</span> jitter · <span className="text-data">{fixoBR(ponto.shimmer, 2)}%</span> shimmer · GNE <span className="text-data">{fixoBR(ponto.gne, 2)}</span>
          </p>
        </div>
        <div>
          <p className="hud-label">Estabilidade</p>
          <p className="mt-1 text-ink">
            {trechos.length === 0 ? "Grave de novo para ver os trechos (análise feita antes desta versão)." : disp
              ? <>{trechos.length} trechos · espalhamento <span className="text-data">±{fixoBR(disp.x, 2)}</span> irr. e <span className="text-data">±{fixoBR(disp.y, 2)}</span> ruído</>
              : `${trechos.length} ${trechos.length === 1 ? "trecho" : "trechos"} (grave 3 s ou mais para ver o espalhamento)`}
          </p>
        </div>
      </div>

      {trechos.length ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-ink-muted hover:text-ink">Valores por trecho</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-xs">
              <thead className="text-ink-muted">
                <tr className="border-b border-ink/10">
                  <th className="py-1.5 font-medium">Trecho (s)</th>
                  <th className="py-1.5 text-right font-medium">Jitter (%)</th>
                  <th className="py-1.5 text-right font-medium">Shimmer (%)</th>
                  <th className="py-1.5 text-right font-medium">GNE</th>
                  <th className="py-1.5 pl-3 font-medium">Posição</th>
                </tr>
              </thead>
              <tbody>
                {trechos.map((t, i) => (
                  <tr key={i} className="border-b border-ink/[0.06]">
                    <td className="text-data py-1.5">{fixoBR(t.inicio_s, 1)}–{fixoBR(t.fim_s, 1)}</td>
                    <td className="text-data py-1.5 text-right">{fixoBR(t.jitter, 2)}</td>
                    <td className="text-data py-1.5 text-right">{fixoBR(t.shimmer, 2)}</td>
                    <td className="text-data py-1.5 text-right">{fixoBR(t.gne, 2)}</td>
                    <td className="py-1.5 pl-3 text-ink-muted">{t.quadrante === "normal" ? "dentro dos limites" : ROTULO_QUADRANTE[t.quadrante].split(" (")[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <p className="mt-3 text-xs text-ink-faint">
        Cada eixo vale 1 no limite de normalidade do VoxMetria (jitter {fixoBR(LIMITES_DDF.jitter_pct, 1)}%, shimmer {fixoBR(LIMITES_DDF.shimmer_pct, 1)}%,
        GNE {fixoBR(LIMITES_DDF.gne, 1)}); na irregularidade conta a medida mais alterada. Inspirado no Diagrama de Desvio Fonatório do VoxMetria,
        mas não é o oficial: as constantes dele não foram publicadas. Valores acima de {MAX_EIXO} ficam na borda.
      </p>
    </div>
  );
}

/** Forma de onda com as faixas dos trechos (como a tira de sinal sob o diagrama do VoxMetria). */
function OndaComTrechos({ onda, trechos, ativo, w }: {
  onda: GraficosAnalise["onda"]; trechos: { inicio_s: number; fim_s: number }[]; ativo: number | null; w: number;
}) {
  const h = 64;
  const iw = Math.max(200, w - ME - MD);
  const n = onda.min.length;
  const larg = iw / Math.max(1, n);
  const pico = Math.max(1e-6, ...onda.max.map(Math.abs), ...onda.min.map(Math.abs));
  const y = (v: number) => h / 2 - (v / pico) * (h / 2 - 4);
  const xt = (t: number) => ME + (t / Math.max(1e-6, onda.duracao_s)) * iw;
  return (
    <svg width={w} height={h} className="mt-3 block" aria-hidden>
      <rect x={ME} y={0} width={iw} height={h} className="fill-canvas-overlay/60" />
      {trechos.map((t, i) => (
        <rect key={i} x={xt(t.inicio_s)} y={0} width={Math.max(1, xt(t.fim_s) - xt(t.inicio_s))} height={h}
          className={ativo === i ? "fill-accent/25" : "fill-transparent"} stroke="currentColor" strokeOpacity={0.12} />
      ))}
      {onda.min.map((mn, i) => (
        <rect key={`o${i}`} x={ME + i * larg} width={Math.max(1, larg)} y={y(onda.max[i] ?? 0)} height={Math.max(1, y(mn) - y(onda.max[i] ?? 0))}
          className={onda.voz[i] ? "fill-ink/80" : "fill-ink/25"} />
      ))}
    </svg>
  );
}
