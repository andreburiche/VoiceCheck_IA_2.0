"use client";

import { useEffect, useRef, useState } from "react";

import { DiagramaDesvioFonatorio } from "@/components/voz-clinica/diagrama-desvio-fonatorio";
import { cn } from "@/lib/utils";
import { fixoBR, type AnaliseAcustica, type GraficosAnalise as Dados } from "@/lib/voz-clinica-api";
import { pontoDdf } from "@/lib/voz-clinica-ddf";
import { caminhoSvg, dominioArredondado, histogramaF0 } from "@/lib/voz-clinica-graficos";

const VISTAS = [
  { id: "ddf", rotulo: "Desvio fonatório" },
  { id: "sinal", rotulo: "Sinal" },
  { id: "contorno", rotulo: "F0 e intensidade" },
  { id: "histograma", rotulo: "Histograma da F0" },
  { id: "espectro", rotulo: "Espectro (FFT + LPC)" },
  { id: "vogal", rotulo: "Vogal (F1 × F2)" },
] as const;
type Vista = (typeof VISTAS)[number]["id"];

const PE = 44; // margem esquerda (rótulos do eixo Y)
const PD = 8;
const PT = 8;
const PB = 22; // margem de baixo (rótulos do eixo X)

/** Largura real do contêiner: 1 unidade do SVG = 1 px, texto sempre com 11 px. */
function useLargura() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(560);
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

function Texto({ x, y, children, ancora = "start" }: { x: number; y: number; children: React.ReactNode; ancora?: "start" | "middle" | "end" }) {
  return <text x={x} y={y} textAnchor={ancora} fontSize={11} fill="currentColor" className="text-ink-faint">{children}</text>;
}

function EixoTempo({ w, h, duracao }: { w: number; h: number; duracao: number }) {
  const passo = duracao > 20 ? 5 : duracao > 8 ? 2 : duracao > 3 ? 1 : 0.5;
  const marcas = [];
  for (let t = 0; t <= duracao + 1e-9; t += passo) marcas.push(t);
  const x = (t: number) => PE + (t / duracao) * (w - PE - PD);
  return (
    <g>
      {marcas.map((t) => (
        <Texto key={t} x={x(t)} y={h - 6} ancora={x(t) > w - 30 ? "end" : t === 0 ? "start" : "middle"}>{fixoBR(t, passo < 1 ? 1 : 0)} s</Texto>
      ))}
    </g>
  );
}

function Sinal({ d, w }: { d: Dados; w: number }) {
  const h = 150;
  const ih = h - PT - PB;
  const n = d.onda.min.length;
  const larg = (w - PE - PD) / Math.max(1, n);
  const pico = Math.max(1e-6, ...d.onda.max.map(Math.abs), ...d.onda.min.map(Math.abs));
  const y = (v: number) => PT + ih / 2 - (v / pico) * (ih / 2);
  return (
    <svg width={w} height={h} role="img" aria-label="Forma de onda: trechos com voz destacados em cor">
      {d.onda.min.map((mn, i) => (
        <rect key={i} x={PE + i * larg} width={Math.max(1, larg)} y={y(d.onda.max[i] ?? 0)} height={Math.max(1, y(mn) - y(d.onda.max[i] ?? 0))}
          fill={d.onda.voz[i] ? "var(--accent)" : "currentColor"} className={d.onda.voz[i] ? "" : "text-ink-faint/50"} />
      ))}
      <Texto x={PE - 6} y={PT + 10} ancora="end">+</Texto>
      <Texto x={PE - 6} y={PT + ih} ancora="end">−</Texto>
      <EixoTempo w={w} h={h} duracao={d.onda.duracao_s} />
    </svg>
  );
}

function Contorno({ d, w }: { d: Dados; w: number }) {
  const h = 120;
  const ih = h - PT - PB;
  const iw = w - PE - PD;
  const f0 = d.contorno.f0_hz;
  const domF0 = dominioArredondado(f0, 10, 40);
  const domDb = dominioArredondado(d.contorno.db.map((v) => (v < -90 ? null : v)), 10, 30);
  const duracao = d.contorno.passo_s * d.contorno.db.length;
  return (
    <div className="space-y-1">
      <svg width={w} height={h} role="img" aria-label={`Contorno da F0 de ${domF0[0]} a ${domF0[1]} Hz ao longo do tempo`}>
        <g transform={`translate(${PE} ${PT})`}>
          <line x1={0} x2={iw} y1={ih} y2={ih} stroke="currentColor" className="text-ink/10" />
          <path d={caminhoSvg(f0, iw, ih, domF0)} fill="none" stroke="var(--accent)" strokeWidth={2} />
        </g>
        <Texto x={PE - 6} y={PT + 10} ancora="end">{domF0[1]}</Texto>
        <Texto x={PE - 6} y={PT + ih} ancora="end">{domF0[0]}</Texto>
        <Texto x={PE + 4} y={PT + 10}>F0 (Hz)</Texto>
        <EixoTempo w={w} h={h} duracao={duracao} />
      </svg>
      <svg width={w} height={h} role="img" aria-label={`Intensidade de ${domDb[0]} a ${domDb[1]} dBFS ao longo do tempo`}>
        <g transform={`translate(${PE} ${PT})`}>
          <line x1={0} x2={iw} y1={ih} y2={ih} stroke="currentColor" className="text-ink/10" />
          <path d={caminhoSvg(d.contorno.db, iw, ih, domDb)} fill="none" stroke="currentColor" className="text-signal-warn" strokeWidth={1.5} />
        </g>
        <Texto x={PE - 6} y={PT + 10} ancora="end">{domDb[1]}</Texto>
        <Texto x={PE - 6} y={PT + ih} ancora="end">{domDb[0]}</Texto>
        <Texto x={PE + 4} y={PT + 10}>Intensidade (dBFS)</Texto>
        <EixoTempo w={w} h={h} duracao={duracao} />
      </svg>
    </div>
  );
}

function Histograma({ d, w }: { d: Dados; w: number }) {
  const hist = histogramaF0(d.contorno.f0_hz);
  const h = 170;
  const ih = h - PT - PB;
  const iw = w - PE - PD;
  if (!hist.barras.length) return <p className="text-sm text-ink-muted">Sem voz para o histograma.</p>;
  const maxPct = Math.max(...hist.barras.map((b) => b.pct));
  const larg = iw / hist.barras.length;
  const rotular = Math.max(1, Math.ceil(hist.barras.length / Math.max(2, Math.floor(iw / 60))));
  return (
    <div>
      <p className="mb-1 text-xs text-ink-muted" data-testid="vc2-graf-moda">
        Moda {fixoBR(hist.moda_hz, 0)} Hz · média {fixoBR(hist.media_hz, 1)} Hz · {hist.quadros} quadros com voz
      </p>
      <svg width={w} height={h} role="img" aria-label={`Histograma da F0: moda em ${fixoBR(hist.moda_hz, 0)} Hz`}>
        <g transform={`translate(${PE} ${PT})`}>
          {hist.barras.map((b, i) => {
            const bh = (b.pct / maxPct) * ih;
            return (
              <rect key={b.de} x={i * larg + 1} width={Math.max(1, larg - 2)} y={ih - bh} height={bh} rx={2}
                fill="var(--accent)" opacity={b.n === Math.max(...hist.barras.map((x) => x.n)) ? 1 : 0.55}>
                <title>{`${fixoBR(b.de, 0)}–${fixoBR(b.ate, 0)} Hz: ${fixoBR(b.pct, 1)}%`}</title>
              </rect>
            );
          })}
        </g>
        <Texto x={PE - 6} y={PT + 10} ancora="end">{fixoBR(maxPct, 0)}%</Texto>
        <Texto x={PE - 6} y={PT + ih} ancora="end">0</Texto>
        {hist.barras.map((b, i) => (i % rotular === 0 ? <Texto key={b.de} x={PE + i * larg} y={h - 6}>{fixoBR(b.de, 0)}</Texto> : null))}
        <Texto x={w - PD} y={h - 6} ancora="end">Hz</Texto>
      </svg>
    </div>
  );
}

function Espectro({ d, w }: { d: Dados; w: number }) {
  const e = d.espectro;
  if (!e) return <p className="text-sm text-ink-muted">Sem voz suficiente para o espectro.</p>;
  const h = 190;
  const ih = h - PT - PB;
  const iw = w - PE - PD;
  const dom: [number, number] = [-70, 0];
  const fmax = e.freq_hz[e.freq_hz.length - 1] ?? 5000;
  const x = (i: number) => ((e.freq_hz[i] ?? 0) / fmax) * iw;
  return (
    <div>
      <p className="mb-1 text-xs text-ink-muted">
        <span className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-ink-faint" aria-hidden /> FFT (harmônicos, média dos trechos com voz)</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-accent" aria-hidden /> Envelope LPC (formantes)</span>
      </p>
      <svg width={w} height={h} role="img" aria-label={`Espectro de longo termo com envelope LPC; picos do envelope em ${e.picos_lpc_hz.join(", ")} Hz`}>
        <g transform={`translate(${PE} ${PT})`}>
          {[-20, -40, -60].map((v) => <line key={v} x1={0} x2={iw} y1={ih * (-v / 70)} y2={ih * (-v / 70)} stroke="currentColor" className="text-ink/10" />)}
          <path d={caminhoSvg(e.fft_db, iw, ih, dom, x)} fill="none" stroke="currentColor" className="text-ink-faint" strokeWidth={1} />
          <path d={caminhoSvg(e.lpc_db, iw, ih, dom, x)} fill="none" stroke="var(--accent)" strokeWidth={2} />
          {e.picos_lpc_hz.slice(0, 4).map((p, i) => {
            const px = (p / fmax) * iw;
            return (
              <g key={p}>
                <line x1={px} x2={px} y1={0} y2={ih} stroke="var(--accent)" strokeDasharray="2 3" opacity={0.6} />
                <Texto x={px + 3} y={12}>{`F${i + 1} ${fixoBR(p, 0)}`}</Texto>
              </g>
            );
          })}
        </g>
        {[0, -20, -40, -60].map((v) => <Texto key={v} x={PE - 6} y={PT + ih * (-v / 70) + 4} ancora="end">{v} dB</Texto>)}
        {[0, 1000, 2000, 3000, 4000, 5000].map((f) => <Texto key={f} x={PE + (f / fmax) * iw} y={h - 6} ancora="middle">{f === 0 ? "0" : `${f / 1000} kHz`}</Texto>)}
      </svg>
      <p className="mt-1 text-xs text-ink-faint">Os picos do envelope LPC são formantes estimados; em vozes agudas, podem coincidir com harmônicos.</p>
    </div>
  );
}

type Formantes = { f1_hz: number | null; f2_hz: number | null } | undefined;

/** Plano F1 × F2 (como a tela "Vogais" do VoxMetria): F2 decresce para a direita, F1 cresce para baixo. */
function PlanoVogal({ formantes, w }: { formantes: Formantes; w: number }) {
  const f1 = formantes?.f1_hz;
  const f2 = formantes?.f2_hz;
  if (!f1 || !f2) return <p className="text-sm text-ink-muted">F1 e F2 não foram medidos nesta gravação.</p>;
  const h = 240;
  const iw = w - PE - PD;
  const ih = h - PT - PB;
  const F2 = [3000, 500] as const; // esquerda → direita
  const F1 = [200, 1100] as const; // topo → base
  const x = (v: number) => ((F2[0] - Math.max(F2[1], Math.min(F2[0], v))) / (F2[0] - F2[1])) * iw;
  const y = (v: number) => ((Math.max(F1[0], Math.min(F1[1], v)) - F1[0]) / (F1[1] - F1[0])) * ih;
  return (
    <div>
      <svg width={w} height={h} role="img" aria-label={`Vogal no plano F1 × F2: F1 ${fixoBR(f1, 0)} Hz, F2 ${fixoBR(f2, 0)} Hz`}>
        <g transform={`translate(${PE} ${PT})`}>
          {[500, 1000, 1500, 2000, 2500, 3000].map((v) => <line key={v} x1={x(v)} x2={x(v)} y1={0} y2={ih} stroke="currentColor" className="text-ink/10" />)}
          {[200, 400, 600, 800, 1000].map((v) => <line key={v} x1={0} x2={iw} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-ink/10" />)}
          <circle cx={x(f2)} cy={y(f1)} r={7} fill="var(--accent)" stroke="currentColor" className="text-canvas" strokeWidth={2} />
          <Texto x={x(f2) + 10} y={y(f1) + 4}>{`F1 ${fixoBR(f1, 0)} · F2 ${fixoBR(f2, 0)} Hz`}</Texto>
          <Texto x={4} y={12}>anterior (/i/, /e/)</Texto>
          <Texto x={iw - 4} y={12} ancora="end">posterior (/u/, /o/)</Texto>
          <Texto x={iw / 2} y={ih - 4} ancora="middle">aberta (/a/)</Texto>
        </g>
        {[200, 400, 600, 800, 1000].map((v) => <Texto key={v} x={PE - 6} y={PT + y(v) + 4} ancora="end">{v}</Texto>)}
        {[3000, 2000, 1000, 500].map((v) => <Texto key={v} x={PE + x(v)} y={h - 6} ancora={v === 500 ? "end" : v === 3000 ? "start" : "middle"}>{v}</Texto>)}
      </svg>
      <p className="mt-1 text-xs text-ink-faint">Eixo horizontal: F2 (Hz, de 3000 a 500). Vertical: F1 (Hz, de 200 a 1100). Compare a mesma vogal entre sessões.</p>
    </div>
  );
}

/**
 * Gráficos da análise acústica (como as telas do VoxMetria): Diagrama de Desvio Fonatório
 * (abre primeiro quando há jitter, shimmer e GNE), sinal, F0 e intensidade, histograma da F0,
 * espectro e vogal.
 */
export function GraficosAnalise({ dados, formantes, resultado }: { dados: Dados; formantes?: Formantes; resultado?: AnaliseAcustica }) {
  const temDdf = !!resultado && pontoDdf(resultado) !== null;
  const [vista, setVista] = useState<Vista>(temDdf ? "ddf" : "sinal");
  const [ref, w] = useLargura();
  return (
    <div className="mt-5" data-testid="vc2-graficos">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Gráfico">
        {VISTAS.filter((v) => v.id !== "ddf" || temDdf).map((v) => (
          <button key={v.id} type="button" aria-pressed={vista === v.id} onClick={() => setVista(v.id)}
            className={cn("min-h-[36px] rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              vista === v.id ? "bg-canvas-card text-ink ring-1 ring-inset ring-ink/15" : "text-ink-muted hover:text-ink")}
            data-testid={`vc2-graf-${v.id}`}>
            {v.rotulo}
          </button>
        ))}
      </div>
      <div ref={ref} className="mt-2 w-full overflow-hidden text-ink">
        {vista === "ddf" && resultado ? <DiagramaDesvioFonatorio resultado={resultado} graficos={dados} /> : null}
        {vista === "sinal" ? <Sinal d={dados} w={w} /> : null}
        {vista === "contorno" ? <Contorno d={dados} w={w} /> : null}
        {vista === "histograma" ? <Histograma d={dados} w={w} /> : null}
        {vista === "espectro" ? <Espectro d={dados} w={w} /> : null}
        {vista === "vogal" ? <PlanoVogal formantes={formantes} w={w} /> : null}
      </div>
      {vista === "sinal" ? (
        <p className="mt-1 text-xs text-ink-faint">
          <span className="font-medium text-accent">Em cor</span>: trechos com voz (sonorizados). Em cinza: sem voz ou silêncio.
        </p>
      ) : null}
    </div>
  );
}
