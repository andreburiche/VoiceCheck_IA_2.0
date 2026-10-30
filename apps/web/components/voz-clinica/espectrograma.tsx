"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { pitchYin } from "@/lib/voz-clinica-biofeedback";
import {
  BANDA_ESTREITA,
  BANDA_LARGA,
  calcularEspectrograma,
  corSequencial,
  lerWavPcm16,
  type Espectrograma as Dados,
} from "@/lib/voz-clinica-espectrograma";

const FAIXA_PADRAO_DB = 70;
const FMAX = 5000;

type Modo = "larga" | "estreita";

function desenhar(c: HTMLCanvasElement, e: Dados, duracao: number, f0: { t: number; hz: number | null }[] | null, faixaDb = FAIXA_PADRAO_DB, ganhoDb = 0) {
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const PE = 40, PB = 22, PT = 6, PD = 8;
  const aw = w - PE - PD;
  const ah = h - PT - PB;

  // imagem em resolução nativa (quadros × faixas) e depois escalada
  const img = new ImageData(e.quadros, e.faixas);
  for (let q = 0; q < e.quadros; q++) {
    for (let k = 0; k < e.faixas; k++) {
      const v = Math.max(0, Math.min(1, (e.db[q * e.faixas + k]! + ganhoDb + faixaDb) / faixaDb));
      const [r, gr, b] = corSequencial(v);
      const i = ((e.faixas - 1 - k) * e.quadros + q) * 4; // grave embaixo
      img.data[i] = r; img.data[i + 1] = gr; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  const off = document.createElement("canvas");
  off.width = e.quadros;
  off.height = e.faixas;
  off.getContext("2d")?.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  const fTopo = e.faixas * e.df;
  g.drawImage(off, PE, PT, aw, ah);

  const x = (t: number) => PE + (t / duracao) * aw;
  const y = (hz: number) => PT + (1 - hz / fTopo) * ah;
  g.font = "11px ui-monospace, Consolas, monospace";
  g.fillStyle = "#94A3B8";
  g.textAlign = "right"; g.textBaseline = "middle";
  for (let khz = 0; khz <= Math.floor(fTopo / 1000); khz++) g.fillText(`${khz}k`, PE - 6, y(khz * 1000));
  g.textAlign = "center"; g.textBaseline = "alphabetic";
  const passo = duracao > 6 ? 2 : duracao > 2.5 ? 1 : 0.5;
  for (let t = 0; t <= duracao + 1e-9; t += passo) g.fillText(`${t.toLocaleString("pt-BR")} s`, Math.min(w - 20, Math.max(PE + 12, x(t))), h - 6);

  if (f0) {
    // contorno de F0: linha clara com borda escura, interrompida sem voz
    for (const [cor, larg] of [["#070B14", 4], ["#F8FAFC", 2]] as const) {
      g.strokeStyle = cor; g.lineWidth = larg; g.lineJoin = "round"; g.beginPath();
      let aberto = false;
      for (const p of f0) {
        if (p.hz === null || p.hz > fTopo) { aberto = false; continue; }
        if (aberto) g.lineTo(x(p.t), y(p.hz)); else { g.moveTo(x(p.t), y(p.hz)); aberto = true; }
      }
      g.stroke();
    }
  }
}

/** Contorno de F0 a cada 10 ms (o mesmo YIN do biofeedback). */
function contornoF0(amostras: Float32Array, taxa: number): { t: number; hz: number | null }[] {
  const janela = 2048;
  const passo = Math.round(taxa * 0.01);
  const saida: { t: number; hz: number | null }[] = [];
  for (let ini = 0; ini + janela <= amostras.length; ini += passo) {
    const r = pitchYin(amostras.subarray(ini, ini + janela), taxa, 60, 800);
    saida.push({ t: (ini + janela / 2) / taxa, hz: r?.hz ?? null });
  }
  return saida;
}

export function Espectrograma({ wav }: { wav: Blob }) {
  const id = useId();
  const [modo, setModo] = useState<Modo>("estreita");
  const [comF0, setComF0] = useState(true);
  const [ganho, setGanho] = useState(0);
  const [faixa, setFaixa] = useState(FAIXA_PADRAO_DB);
  const [estado, setEstado] = useState<"calculando" | "pronto" | "erro">("calculando");
  const canvas = useRef<HTMLCanvasElement>(null);
  const audio = useRef<{ amostras: Float32Array; taxa: number } | null>(null);
  const f0 = useRef<{ t: number; hz: number | null }[] | null>(null);

  useEffect(() => {
    let vivo = true;
    audio.current = null;
    f0.current = null;
    setEstado("calculando");
    void wav.arrayBuffer().then((buf) => {
      if (!vivo) return;
      try {
        audio.current = lerWavPcm16(buf);
        setEstado("pronto");
      } catch {
        setEstado("erro");
      }
    });
    return () => { vivo = false; };
  }, [wav]);

  useEffect(() => {
    const a = audio.current;
    const c = canvas.current;
    if (estado !== "pronto" || !a || !c) return;
    // deixa a tela atualizar antes do cálculo (~0,1–0,2 s para 5 s de áudio)
    const t = window.setTimeout(() => {
      const e = calcularEspectrograma(a.amostras, a.taxa, { ...(modo === "larga" ? BANDA_LARGA : BANDA_ESTREITA), fmax: FMAX });
      if (comF0 && !f0.current) f0.current = contornoF0(a.amostras, a.taxa);
      desenhar(c, e, a.amostras.length / a.taxa, comF0 ? f0.current : null, faixa, ganho);
    }, 0);
    return () => window.clearTimeout(t);
  }, [estado, modo, comF0, ganho, faixa]);

  return (
    <figure className="mt-4" aria-labelledby={`${id}-t`} data-testid="vc2-espectro">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span id={`${id}-t`} className="text-sm font-medium text-ink">Espectrograma</span>
        <span className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex overflow-hidden rounded-lg ring-1 ring-inset ring-line" role="radiogroup" aria-label="Tipo de espectrograma">
            {([["estreita", "Banda estreita"], ["larga", "Banda larga"]] as const).map(([m, rotulo]) => (
              <button key={m} type="button" role="radio" aria-checked={modo === m} onClick={() => setModo(m)}
                className={cn("px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent", modo === m ? "bg-accent/15 text-ink" : "text-ink-muted hover:text-ink")}
                data-testid={`vc2-espectro-${m}`}>
                {rotulo}
              </button>
            ))}
          </span>
          <label className="inline-flex items-center gap-1.5 text-ink-muted">
            <input type="checkbox" checked={comF0} onChange={(e) => setComF0(e.target.checked)} className="accent-[var(--accent)]" />
            Curva de F0
          </label>
          <label className="inline-flex items-center gap-1.5 text-ink-muted">
            Ganho
            <input type="range" min={-20} max={30} step={2} value={ganho} onChange={(e) => setGanho(Number(e.target.value))}
              className="w-20 accent-[var(--accent)]" aria-valuetext={`${ganho} dB`} data-testid="vc2-espectro-ganho" />
          </label>
          <label className="inline-flex items-center gap-1.5 text-ink-muted">
            Contraste
            <input type="range" min={40} max={100} step={5} value={140 - faixa} onChange={(e) => setFaixa(140 - Number(e.target.value))}
              className="w-20 accent-[var(--accent)]" aria-valuetext={`faixa de ${faixa} dB`} />
          </label>
        </span>
      </figcaption>
      <canvas ref={canvas} className="mt-2 block h-56 w-full rounded-xl bg-canvas-raised ring-1 ring-inset ring-ink/10" role="img"
        aria-label={modo === "estreita" ? "Espectrograma de banda estreita: harmônicos da voz ao longo do tempo, de 0 a 5 kHz" : "Espectrograma de banda larga: formantes da voz ao longo do tempo, de 0 a 5 kHz"} />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
        <span>{modo === "estreita" ? "Janela de 30 ms: harmônicos (linhas horizontais) e quebras de voz." : "Janela de 5 ms: formantes (faixas claras e largas) e pulsos glóticos (riscos verticais)."}</span>
        <span className="inline-flex items-center gap-1.5" aria-hidden>
          mais fraco
          <span className="h-2 w-20 rounded-full" style={{ background: `linear-gradient(90deg, ${[0, 0.45, 0.8, 1].map((v) => `rgb(${corSequencial(v).join(",")})`).join(",")})` }} />
          mais forte
        </span>
      </div>
      {estado === "erro" ? <p className="mt-2 text-sm text-signal-err">Não foi possível ler a gravação para o espectrograma.</p> : null}
    </figure>
  );
}
