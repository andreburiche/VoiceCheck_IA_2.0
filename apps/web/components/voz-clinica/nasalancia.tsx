"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/errors";
import { fixoBR, salvarNasalancia } from "@/lib/voz-clinica-api";
import { TAREFAS_NASALANCIA, analisarNasalancia, type ResultadoNasalancia, type TarefaNasalancia } from "@/lib/voz-clinica-nasalancia";

const SELECT =
  "mt-1 block h-9 rounded-lg border border-line bg-canvas-raised px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";
const LIMITE_S = 60;

/** Worklet que entrega os dois primeiros canais da entrada (oral e nasal). */
const WORKLET = `
class Captura2 extends AudioWorkletProcessor {
  process(inputs) {
    const e = inputs[0];
    if (e && e.length) this.port.postMessage({ c0: e[0].slice(), c1: (e[1] || e[0]).slice(), canais: e.length });
    return true;
  }
}
registerProcessor("captura-2-canais", Captura2);
`;

function juntar(blocos: Float32Array[]): Float32Array {
  const s = new Float32Array(blocos.reduce((n, b) => n + b.length, 0));
  let o = 0;
  for (const b of blocos) { s.set(b, o); o += b.length; }
  return s;
}

/** Curva da nasalância ao longo do tempo (SVG simples). */
function Curva({ r }: { r: ResultadoNasalancia }) {
  const w = 560, h = 120;
  const tMax = Math.max(r.curva[r.curva.length - 1]?.t ?? 1, 0.1);
  const d = r.curva.map((p, i) => `${i ? "L" : "M"}${((p.t / tMax) * (w - 44) + 44).toFixed(1)},${(h - 18 - (p.pct / 100) * (h - 28)).toFixed(1)}`).join(" ");
  const y = (v: number) => h - 18 - (v / 100) * (h - 28);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full max-w-xl" role="img" aria-label={`Nasalância ao longo da leitura: média ${fixoBR(r.media_pct, 1)}%`}>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={44} x2={w} y1={y(v)} y2={y(v)} stroke="rgba(148,163,184,0.25)" />
          <text x={38} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#94A3B8">{v}%</text>
        </g>
      ))}
      <line x1={44} x2={w} y1={y(r.media_pct)} y2={y(r.media_pct)} stroke="#E8B84A" strokeDasharray="4 3" />
      <path d={d} fill="none" stroke="#20D9D2" strokeWidth={1.5} />
      <text x={w - 4} y={h - 4} textAnchor="end" fontSize="10" fill="#94A3B8">{fixoBR(tMax, 1)} s</text>
    </svg>
  );
}

/**
 * Nasalância (Nasometer / lingWAVES): dois microfones separados por placa — canal 1 oral,
 * canal 2 nasal — numa interface estéreo, ou um WAV estéreo gravado em outro programa.
 */
export function Nasalancia({ paciente, aoSalvar }: { paciente: string; aoSalvar: () => void }) {
  const id = useId();
  const [tarefa, setTarefa] = useState<TarefaNasalancia>("oral");
  const [inverter, setInverter] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [aoVivo, setAoVivo] = useState<number | null>(null);
  const [resultado, setResultado] = useState<{ r: ResultadoNasalancia; fonte: "gravacao" | "arquivo" } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const cap = useRef<{ ctx: AudioContext; stream: MediaStream; c0: Float32Array[]; c1: Float32Array[]; canais: number; timer: number } | null>(null);

  function parar(analisar = true) {
    const c = cap.current;
    if (!c) return;
    cap.current = null;
    window.clearInterval(c.timer);
    c.stream.getTracks().forEach((t) => t.stop());
    void c.ctx.close().catch(() => undefined);
    setGravando(false);
    setAoVivo(null);
    if (!analisar) return;
    if (c.canais < 2) {
      setErro("A entrada tem só 1 canal: a nasalância precisa de dois microfones (oral e nasal) numa interface estéreo.");
      return;
    }
    const [o, z] = inverter ? [juntar(c.c1), juntar(c.c0)] : [juntar(c.c0), juntar(c.c1)];
    const r = analisarNasalancia(o, z, c.ctx.sampleRate);
    if (!r) { setErro("Pouco som na gravação. Leia o texto inteiro, perto dos microfones."); return; }
    setResultado({ r, fonte: "gravacao" });
  }
  useEffect(() => () => parar(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function gravar() {
    setErro(null); setAviso(null); setResultado(null); setSalvo(false);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: { ideal: 2 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      setErro(e instanceof DOMException && e.name === "NotAllowedError" ? "Permita o uso do microfone no navegador." : friendlyError(e, "Não foi possível abrir a entrada de áudio."));
      return;
    }
    const canais = stream.getAudioTracks()[0]?.getSettings().channelCount ?? 1;
    if (canais < 2) setAviso("O navegador informa 1 canal nesta entrada. Escolha a interface estéreo nas configurações do sistema; com 1 canal não dá para medir.");
    const ctx = new AudioContext();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const fonte = ctx.createMediaStreamSource(stream);
    const no = new AudioWorkletNode(ctx, "captura-2-canais", { channelCount: 2, channelCountMode: "explicit", channelInterpretation: "discrete" });
    const c = { ctx, stream, c0: [] as Float32Array[], c1: [] as Float32Array[], canais, timer: 0 };
    no.port.onmessage = (ev: MessageEvent<{ c0: Float32Array; c1: Float32Array; canais: number }>) => {
      c.c0.push(ev.data.c0); c.c1.push(ev.data.c1); c.canais = Math.min(c.canais, ev.data.canais) || ev.data.canais;
    };
    const mudo = ctx.createGain();
    mudo.gain.value = 0;
    fonte.connect(no).connect(mudo).connect(ctx.destination);
    // ao vivo: nasalância do último 1 s, a cada 250 ms; para sozinho no limite
    c.timer = window.setInterval(() => {
      const amostras = c.c0.reduce((n, b) => n + b.length, 0);
      if (amostras / ctx.sampleRate >= LIMITE_S) { parar(); return; }
      const ult = Math.ceil(ctx.sampleRate / 128);
      const o = juntar(c.c0.slice(-ult)), z = juntar(c.c1.slice(-ult));
      const r = analisarNasalancia(inverter ? z : o, inverter ? o : z, ctx.sampleRate);
      setAoVivo(r ? r.media_pct : null);
    }, 250);
    cap.current = c;
    setGravando(true);
  }

  async function importar(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null); setAviso(null); setResultado(null); setSalvo(false);
    try {
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(await arquivo.arrayBuffer());
      void ctx.close();
      if (buf.numberOfChannels < 2) { setErro("O arquivo é mono. A nasalância precisa de um WAV estéreo (canal 1 oral, canal 2 nasal)."); return; }
      if (buf.duration > LIMITE_S) { setErro(`Arquivo maior que ${LIMITE_S} s: recorte antes.`); return; }
      const [o, z] = inverter ? [buf.getChannelData(1), buf.getChannelData(0)] : [buf.getChannelData(0), buf.getChannelData(1)];
      const r = analisarNasalancia(o, z, buf.sampleRate);
      if (!r) { setErro("Pouco som no arquivo."); return; }
      setResultado({ r, fonte: "arquivo" });
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível abrir o arquivo. Use WAV estéreo."));
    }
  }

  async function salvar() {
    if (!resultado || !paciente) return;
    setSalvando(true);
    setErro(null);
    try {
      const { r, fonte } = resultado;
      await salvarNasalancia(paciente, { tarefa, media_pct: r.media_pct, dp_pct: r.dp_pct, mediana_pct: r.mediana_pct, quadros: r.quadros, duracao_s: r.duracao_s, fonte, canais_invertidos: inverter });
      setSalvo(true);
      aoSalvar();
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="rounded-2xl bg-canvas-card p-5 ring-1 ring-inset ring-ink/10" aria-labelledby={`${id}-t`} data-testid="vc2-nasalancia">
      <h2 id={`${id}-t`} className="font-display text-lg font-semibold text-ink">Nasalância</h2>
      <p className="mt-1 max-w-[72ch] text-sm text-ink-muted">
        Como o Nasometer e o lingWAVES: dois microfones separados por uma placa, um na frente da boca (canal 1) e outro do nariz (canal 2),
        numa interface de áudio estéreo. Nasalância = energia nasal ÷ (nasal + oral), em torno de 500 Hz. Também aceita um WAV estéreo gravado em outro programa.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor={`${id}-tarefa`}>Tarefa</Label>
          <select id={`${id}-tarefa`} className={SELECT} value={tarefa} onChange={(e) => setTarefa(e.target.value as TarefaNasalancia)} disabled={gravando} data-testid="vc2-nasal-tarefa">
            {Object.entries(TAREFAS_NASALANCIA).map(([k, t]) => <option key={k} value={k}>{t.rotulo}</option>)}
          </select>
        </div>
        <label className="flex min-h-[36px] items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={inverter} onChange={(e) => setInverter(e.target.checked)} disabled={gravando} />
          Inverter canais (nasal no 1)
        </label>
      </div>
      {TAREFAS_NASALANCIA[tarefa].exemplo ? <p className="mt-2 text-sm text-ink">Peça: “{TAREFAS_NASALANCIA[tarefa].exemplo}”</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {gravando ? (
          <Button type="button" variant="danger" onClick={() => parar()} data-testid="vc2-nasal-parar">Parar</Button>
        ) : (
          <Button type="button" onClick={() => void gravar()} data-testid="vc2-nasal-gravar">Gravar (2 canais)</Button>
        )}
        <label className="inline-flex min-h-[36px] cursor-pointer items-center rounded-lg px-3 text-sm text-ink-muted ring-1 ring-inset ring-line hover:text-ink focus-within:ring-2 focus-within:ring-accent">
          Importar WAV estéreo
          <input type="file" accept=".wav,audio/wav" className="sr-only" disabled={gravando}
            onChange={(e) => { void importar(e.target.files?.[0]); e.target.value = ""; }} data-testid="vc2-nasal-importar" />
        </label>
        {gravando ? <span className="text-data text-2xl text-ink" aria-live="polite" data-testid="vc2-nasal-ao-vivo">{aoVivo === null ? "—" : `${fixoBR(aoVivo, 0)}%`}</span> : null}
      </div>
      {aviso ? <p className="mt-2 text-sm text-signal-warn" role="status">{aviso}</p> : null}
      {erro ? <p className="mt-2 text-sm text-signal-err" role="alert">{erro}</p> : null}
      {resultado ? (
        <div className="mt-4 rounded-xl p-4 ring-1 ring-inset ring-ink/10" data-testid="vc2-nasal-resultado">
          <p className="text-data text-3xl font-semibold text-ink">{fixoBR(resultado.r.media_pct, 1)}%</p>
          <p className="text-sm text-ink-muted">
            Nasalância média · DP {fixoBR(resultado.r.dp_pct, 1)} · mediana {fixoBR(resultado.r.mediana_pct, 1)}% · {resultado.r.quadros} quadros com som em {fixoBR(resultado.r.duracao_s, 1)} s
          </p>
          <Curva r={resultado.r} />
          <p className="mt-2 text-xs text-ink-faint">
            Compare com as normas do seu serviço para o mesmo texto e o mesmo equipamento; os valores mudam com a placa, os microfones e o ganho de cada canal (deixe os dois iguais).
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={() => void salvar()} disabled={!paciente || salvando || salvo} data-testid="vc2-nasal-salvar">
              {salvo ? "Salvo no histórico" : salvando ? "Salvando…" : "Salvar no histórico"}
            </Button>
            {!paciente ? <span className="text-xs text-ink-muted">Preencha o paciente para salvar.</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
