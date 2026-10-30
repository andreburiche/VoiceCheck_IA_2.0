"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/errors";
import { fixoBR, salvarEgg, type EggSalvo } from "@/lib/voz-clinica-api";
import { LIMIARES_EGG, analisarEgg, type ResultadoEgg } from "@/lib/voz-clinica-egg";

const SELECT =
  "mt-1 block h-9 rounded-lg border border-line bg-canvas-raised px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";
const TAREFAS: Record<EggSalvo["tarefa"], string> = { vogal: "Vogal sustentada", fala: "Fala", canto: "Canto", glissando: "Glissando", outro: "Outro" };

function CurvaCq({ r }: { r: ResultadoEgg }) {
  const w = 560, h = 120, e = 44;
  const tMax = Math.max(r.curva[r.curva.length - 1]?.t ?? 1, 0.1);
  const y = (v: number) => h - 18 - (v / 100) * (h - 28);
  const d = r.curva.map((p, i) => `${i ? "L" : "M"}${((p.t / tMax) * (w - e) + e).toFixed(1)},${y(p.cq).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full max-w-xl" role="img" aria-label={`Quociente de contato por ciclo: média ${fixoBR(r.cq_media_pct, 1)}%`}>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={e} x2={w} y1={y(v)} y2={y(v)} stroke="rgba(148,163,184,0.25)" />
          <text x={e - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#94A3B8">{v}%</text>
        </g>
      ))}
      <path d={d} fill="none" stroke="#20D9D2" strokeWidth={1.2} />
      <text x={w - 4} y={h - 4} textAnchor="end" fontSize="10" fill="#94A3B8">{fixoBR(tMax, 1)} s</text>
    </svg>
  );
}

/**
 * Eletroglotografia (lingWAVES): quociente de contato por ciclo a partir do sinal do EGG,
 * gravado num WAV estéreo (voz num canal, EGG no outro). O cálculo é feito aqui no navegador.
 */
export function Eletroglotografia({ paciente, aoSalvar }: { paciente: string; aoSalvar: () => void }) {
  const id = useId();
  const [canal, setCanal] = useState<1 | 2>(2);
  const [limiar, setLimiar] = useState<(typeof LIMIARES_EGG)[number]>(0.35);
  const [inverter, setInverter] = useState(false);
  const [tarefa, setTarefa] = useState<EggSalvo["tarefa"]>("vogal");
  const [audio, setAudio] = useState<{ canais: Float32Array[]; taxa: number; nome: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const resultado = audio ? analisarEgg(audio.canais[canal - 1] ?? audio.canais[0]!, audio.taxa, { limiar, inverter }) : null;

  async function importar(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null); setSalvo(false); setAudio(null);
    try {
      const dados = await arquivo.arrayBuffer();
      const ctx = new AudioContext();
      let buf: AudioBuffer;
      try {
        buf = await ctx.decodeAudioData(dados);
      } finally {
        void ctx.close().catch(() => undefined); // fecha mesmo se o arquivo estiver corrompido
      }
      if (buf.duration > 60) { setErro("Arquivo maior que 60 s: recorte antes."); return; }
      const canais = Array.from({ length: Math.min(2, buf.numberOfChannels) }, (_, i) => buf.getChannelData(i).slice());
      if (canais.length < 2) setCanal(1);
      setAudio({ canais, taxa: buf.sampleRate, nome: arquivo.name });
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível abrir o arquivo. Use WAV."));
    }
  }

  async function salvar() {
    if (!resultado || !paciente) return;
    setSalvando(true);
    setErro(null);
    try {
      await salvarEgg(paciente, {
        tarefa, cq_media_pct: resultado.cq_media_pct, cq_dp_pct: resultado.cq_dp_pct, cq_mediana_pct: resultado.cq_mediana_pct,
        f0_media_hz: resultado.f0_media_hz, ciclos: resultado.ciclos, duracao_s: resultado.duracao_s,
        limiar_pct: Math.round(limiar * 100) as 25 | 35 | 50, canal_egg: canal, polaridade_invertida: inverter,
      });
      setSalvo(true);
      aoSalvar();
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  }

  const mudou = () => setSalvo(false);
  return (
    <section className="rounded-2xl bg-canvas-card p-5 ring-1 ring-inset ring-ink/10" aria-labelledby={`${id}-t`} data-testid="vc2-egg">
      <h2 id={`${id}-t`} className="font-display text-lg font-semibold text-ink">Eletroglotografia (EGG)</h2>
      <p className="mt-1 max-w-[72ch] text-sm text-ink-muted">
        Como o módulo de EGG do lingWAVES: importe o WAV estéreo gravado com o eletroglotógrafo (voz num canal, EGG no outro).
        O quociente de contato de cada ciclo é a fração do período com o sinal acima do nível escolhido (método do nível-critério).
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="inline-flex min-h-[36px] cursor-pointer items-center rounded-lg px-3 text-sm text-ink-muted ring-1 ring-inset ring-line hover:text-ink focus-within:ring-2 focus-within:ring-accent">
          Importar WAV do EGG
          <input type="file" accept=".wav,audio/wav" className="sr-only" onChange={(e) => { void importar(e.target.files?.[0]); e.target.value = ""; }} data-testid="vc2-egg-importar" />
        </label>
        <div>
          <Label htmlFor={`${id}-canal`}>Canal do EGG</Label>
          <select id={`${id}-canal`} className={SELECT} value={canal} onChange={(e) => { setCanal(Number(e.target.value) as 1 | 2); mudou(); }} disabled={!audio || audio.canais.length < 2}>
            <option value={1}>Canal 1 (esquerdo)</option>
            <option value={2}>Canal 2 (direito)</option>
          </select>
        </div>
        <div>
          <Label htmlFor={`${id}-lim`}>Nível-critério</Label>
          <select id={`${id}-lim`} className={SELECT} value={limiar} onChange={(e) => { setLimiar(Number(e.target.value) as typeof limiar); mudou(); }} data-testid="vc2-egg-limiar">
            {LIMIARES_EGG.map((l) => <option key={l} value={l}>{Math.round(l * 100)}% da amplitude</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor={`${id}-tarefa`}>Tarefa</Label>
          <select id={`${id}-tarefa`} className={SELECT} value={tarefa} onChange={(e) => { setTarefa(e.target.value as EggSalvo["tarefa"]); mudou(); }}>
            {Object.entries(TAREFAS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
          </select>
        </div>
        <label className="flex min-h-[36px] items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={inverter} onChange={(e) => { setInverter(e.target.checked); mudou(); }} />
          Inverter polaridade
        </label>
      </div>
      {erro ? <p className="mt-2 text-sm text-signal-err" role="alert">{erro}</p> : null}
      {audio && !resultado ? (
        <p className="mt-3 text-sm text-signal-warn" role="status">
          Não achei ciclos de vibração neste canal. Confira o canal do EGG e a polaridade, e se o arquivo tem fonação.
        </p>
      ) : null}
      {resultado ? (
        <div className="mt-4 rounded-xl p-4 ring-1 ring-inset ring-ink/10" data-testid="vc2-egg-resultado">
          <p className="text-data text-3xl font-semibold text-ink">{fixoBR(resultado.cq_media_pct, 1)}%</p>
          <p className="text-sm text-ink-muted">
            Quociente de contato médio · DP {fixoBR(resultado.cq_dp_pct, 1)} · mediana {fixoBR(resultado.cq_mediana_pct, 1)}% ·
            F0 {fixoBR(resultado.f0_media_hz, 1)} Hz · {resultado.ciclos} ciclos em {fixoBR(resultado.duracao_s, 1)} s
          </p>
          <CurvaCq r={resultado} />
          <p className="mt-2 text-xs text-ink-faint">
            O valor depende do nível-critério: compare sessões sempre com o mesmo nível, aparelho e tarefa.
            Mais contato tende a indicar fonação mais pressionada; menos, mais soprosa.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={() => void salvar()} disabled={!paciente || salvando || salvo} data-testid="vc2-egg-salvar">
              {salvo ? "Salvo no histórico" : salvando ? "Salvando…" : "Salvar no histórico"}
            </Button>
            {!paciente ? <span className="text-xs text-ink-muted">Preencha o paciente para salvar.</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
