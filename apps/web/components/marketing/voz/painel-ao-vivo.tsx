"use client";

import { useEffect, useRef, useState } from "react";

import { medirExemplo, notaDe, vozDeExemplo, type LeituraExemplo } from "@/lib/landing-voz";
import { BANDA_ESTREITA, calcularEspectrograma, corSequencial } from "@/lib/voz-clinica-espectrograma";

const FMAX = 4000;
const PAUSA_FINAL_MS = 1600;
const F0_MIN = 170;
const F0_MAX = 320;

type Dados = { img: HTMLCanvasElement; leituras: LeituraExemplo[]; duracao: number };

/** Mede a voz de exemplo (uma vez) e prepara a imagem do espectrograma em resolução nativa. */
function preparar(): Dados {
  const voz = vozDeExemplo();
  const leituras = medirExemplo(voz);
  const e = calcularEspectrograma(voz.amostras, voz.taxa, { ...BANDA_ESTREITA, fmax: FMAX });
  const img = document.createElement("canvas");
  img.width = e.quadros;
  img.height = e.faixas;
  const g = img.getContext("2d");
  if (g) {
    const px = g.createImageData(e.quadros, e.faixas);
    for (let q = 0; q < e.quadros; q++) {
      for (let k = 0; k < e.faixas; k++) {
        // 50 dB de faixa e contraste em curva: harmônicos fortes e formantes do /a/ destacados
        const v = Math.max(0, Math.min(1, (e.db[q * e.faixas + k]! + 50) / 50)) ** 1.5;
        const [r, gr, b] = corSequencial(v);
        const i = ((e.faixas - 1 - k) * e.quadros + q) * 4;
        px.data[i] = r; px.data[i + 1] = gr; px.data[i + 2] = b; px.data[i + 3] = 255;
      }
    }
    g.putImageData(px, 0, 0);
  }
  return { img, leituras, duracao: voz.duracao };
}

function desenhar(c: HTMLCanvasElement, d: Dados, p: number) {
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const g = c.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const PE = 40, PD = 8, PT = 6;
  const faixaF0 = Math.max(56, Math.round(h * 0.26));
  const hEsp = h - faixaF0 - 26;
  const aw = w - PE - PD;
  const x = (t: number) => PE + (t / d.duracao) * aw;

  // espectrograma, revelado até o cursor
  g.fillStyle = "#0b1120";
  g.fillRect(PE, PT, aw, hEsp);
  g.imageSmoothingEnabled = true;
  const sw = Math.max(1, Math.round(d.img.width * p));
  g.drawImage(d.img, 0, 0, sw, d.img.height, PE, PT, aw * (sw / d.img.width), hEsp);
  g.font = "11px ui-monospace, Consolas, monospace";
  g.fillStyle = "#94A3B8";
  g.textAlign = "right"; g.textBaseline = "middle";
  for (let khz = 1; khz <= FMAX / 1000; khz++) g.fillText(`${khz}k`, PE - 6, PT + (1 - (khz * 1000) / FMAX) * hEsp);

  // faixa da F0 (Hz), com as notas da frase como guias
  const y0 = PT + hEsp + 10;
  const yF0 = (hz: number) => y0 + (1 - (hz - F0_MIN) / (F0_MAX - F0_MIN)) * faixaF0;
  g.strokeStyle = "rgba(148,163,184,0.14)"; g.lineWidth = 1;
  for (const hz of [196, 247, 294]) {
    g.beginPath(); g.moveTo(PE, yF0(hz)); g.lineTo(w - PD, yF0(hz)); g.stroke();
    g.fillText(notaDe(hz), PE - 6, yF0(hz));
  }
  const ate = p * d.duracao;
  g.strokeStyle = "#268BFF"; g.lineWidth = 2; g.lineJoin = "round"; g.beginPath();
  let aberto = false;
  for (const l of d.leituras) {
    if (l.t > ate) break;
    if (l.hz === null || l.hz < F0_MIN || l.hz > F0_MAX) { aberto = false; continue; }
    if (aberto) g.lineTo(x(l.t), yF0(l.hz)); else { g.moveTo(x(l.t), yF0(l.hz)); aberto = true; }
  }
  g.stroke();

  // eixo de tempo e cursor de leitura
  g.textAlign = "center"; g.textBaseline = "alphabetic"; g.fillStyle = "#94A3B8";
  for (let s = 0; s <= Math.floor(d.duracao); s++) g.fillText(`${s} s`, Math.min(w - 16, Math.max(PE + 10, x(s))), h - 4);
  if (p < 1) {
    g.strokeStyle = "rgba(248,250,252,0.85)"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x(ate), PT); g.lineTo(x(ate), y0 + faixaF0); g.stroke();
  }
}

function leituraEm(leituras: LeituraExemplo[], t: number): LeituraExemplo | null {
  let melhor: LeituraExemplo | null = null;
  for (const l of leituras) { if (l.t > t) break; melhor = l; }
  return melhor;
}

/**
 * Painel "ao vivo" da página inicial: uma frase cantada de exemplo, medida no navegador com as
 * mesmas funções da avaliação clínica, desenhada da esquerda para a direita em loop.
 */
export function PainelAoVivo() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const dados = useRef<Dados | null>(null);
  const [leitura, setLeitura] = useState<{ hz: number | null; db: number; t: number } | null>(null);
  const [estado, setEstado] = useState<"preparando" | "medindo" | "pronto">("preparando");

  useEffect(() => {
    const c = canvas.current;
    const el = caixa.current;
    if (!c || !el) return;
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let quadro = 0;
    let visivel = false;
    let inicio = 0;
    let ultimaTela = 0;
    let vivo = true;

    const resumoFinal = (d: Dados) => {
      const hz = d.leituras.filter((l) => l.hz !== null).map((l) => l.hz!).sort((a, b) => a - b);
      setLeitura({ hz: hz[Math.floor(hz.length / 2)] ?? null, db: Math.max(...d.leituras.map((l) => l.db)), t: d.duracao });
    };

    const passo = (agora: number) => {
      const d = dados.current;
      if (!vivo || !d || !visivel) return;
      if (!inicio) inicio = agora;
      const ms = agora - inicio;
      const p = Math.min(1, ms / (d.duracao * 1000));
      desenhar(c, d, p);
      if (agora - ultimaTela > 90) {
        ultimaTela = agora;
        if (p < 1) {
          const l = leituraEm(d.leituras, p * d.duracao);
          setLeitura(l ? { hz: l.hz, db: l.db, t: l.t } : null);
          setEstado("medindo");
        } else {
          resumoFinal(d); // frase terminada: mostra o resumo, não o silêncio do fim
          setEstado("pronto");
        }
      }
      if (ms > d.duracao * 1000 + PAUSA_FINAL_MS) inicio = agora; // recomeça a frase
      quadro = requestAnimationFrame(passo);
    };

    const iniciar = () => {
      if (!dados.current) {
        dados.current = preparar();
        if (reduzir) {
          desenhar(c, dados.current, 1);
          resumoFinal(dados.current);
          setEstado("pronto");
          return;
        }
      }
      if (reduzir) return;
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(passo);
    };

    // só mede e anima com o painel na tela (não pesa na rolagem nem gasta bateria fora dela)
    const io = new IntersectionObserver((entradas) => {
      visivel = entradas.some((e) => e.isIntersecting);
      if (!visivel) { cancelAnimationFrame(quadro); return; }
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
      if (!dados.current && ric) ric(() => vivo && iniciar()); else iniciar();
    }, { rootMargin: "100px" });
    io.observe(el);
    const ro = new ResizeObserver(() => { if (dados.current && (reduzir || !visivel)) desenhar(c, dados.current, 1); });
    ro.observe(c);
    return () => { vivo = false; io.disconnect(); ro.disconnect(); cancelAnimationFrame(quadro); };
  }, []);

  const f0 = leitura?.hz ?? null;
  const rotuloF0 = estado === "pronto" ? "F0 mediana" : "F0";
  return (
    <div ref={caixa} className="panel-glass overflow-hidden rounded-2xl" data-testid="landing-painel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 py-3">
        <p className="text-sm font-semibold text-ink">
          Vogal /a/ cantada <span className="font-normal text-ink-muted">· voz de exemplo, medida agora no seu navegador</span>
        </p>
        <span className="inline-flex items-center gap-2 rounded-full bg-canvas-overlay px-3 py-1 text-xs text-ink">
          <span className={estado === "medindo" ? "h-2 w-2 rounded-full bg-flare motion-safe:animate-pulse" : "h-2 w-2 rounded-full bg-accent"} aria-hidden />
          {estado === "medindo" ? "Medindo" : estado === "pronto" ? "Medido" : "Preparando"}
        </span>
      </div>
      <canvas
        ref={canvas}
        className="block h-[300px] w-full sm:h-[360px]"
        role="img"
        aria-label="Espectrograma e curva de F0 de uma frase cantada de exemplo: sobe de sol 3 a ré 4, sustenta com vibrato e desce."
      />
      <dl className="grid grid-cols-2 border-t border-line/70 sm:grid-cols-4">
        {[
          [rotuloF0, f0 !== null ? `${Math.round(f0)}` : "—", "Hz"],
          ["Nota", f0 !== null ? notaDe(f0) : "—", ""],
          [estado === "pronto" ? "Nível máximo" : "Nível", leitura && leitura.db > -60 ? `${Math.round(leitura.db)}` : "—", "dBFS"],
          ["Tempo", leitura ? leitura.t.toFixed(1).replace(".", ",") : "—", "s"],
        ].map(([rotulo, valor, unidade], i) => (
          <div key={i} className={`px-5 py-3 ${i > 0 ? "sm:border-l sm:border-line/70" : ""} ${i % 2 === 1 ? "border-l border-line/70" : ""} ${i >= 2 ? "border-t border-line/70 sm:border-t-0" : ""}`}>
            <dt className="hud-label">{rotulo}</dt>
            <dd className="mt-0.5">
              <span className="text-data text-xl font-semibold text-accent">{valor}</span>
              {unidade ? <span className="text-data ml-1 text-xs text-ink-muted">{unidade}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
