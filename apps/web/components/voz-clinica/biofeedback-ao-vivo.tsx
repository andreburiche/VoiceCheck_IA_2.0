"use client";

import { ArrowDown, ArrowUp, Check, Mic, Square } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { UnidadeIntensidade, useCalibracao } from "@/components/voz-clinica/calibracao-spl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { fixoBR, salvarBiofeedback } from "@/lib/voz-clinica-api";
import {
  medianaDe3,
  nivelDbfs,
  pitchYin,
  posicaoNaFaixa,
  resumirSessao,
  rotuloNota,
  suavizar,
  type AmostraSessao,
  type Faixa,
  type Posicao,
  type ResumoBiofeedback,
} from "@/lib/voz-clinica-biofeedback";
import { abrirMicrofoneAoVivo, gravadorSuportado } from "@/lib/voz-clinica-gravador";

const JANELA_S = 8; // segundos visíveis na curva
const LIMITE_SESSAO_S = 600;
const COR = { linha: "#20D9D2", faixa: "rgba(32,217,210,0.13)", borda: "rgba(32,217,210,0.45)", grade: "rgba(148,163,184,0.12)", texto: "#94A3B8" };

const TEXTO_POSICAO: Record<Posicao, string> = { abaixo: "Abaixo da faixa", dentro: "Dentro da faixa", acima: "Acima da faixa" };

function IconePosicao({ p }: { p: Posicao }) {
  const Icone = p === "abaixo" ? ArrowUp : p === "acima" ? ArrowDown : Check;
  // seta indica para onde ir: abaixo → subir; acima → descer
  return <Icone className="h-4 w-4" aria-hidden />;
}

function CampoNumero({ id, rotulo, valor, onChange, min, max, passo = 1, desativado }: {
  id: string; rotulo: string; valor: number; onChange: (v: number) => void; min: number; max: number; passo?: number; desativado?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">{rotulo}</Label>
      <Input
        id={id} type="number" inputMode="decimal" className="mt-1 h-9 w-24" min={min} max={max} step={passo}
        value={Number.isFinite(valor) ? valor : ""} disabled={desativado}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/** Curva de pitch em canvas (escala em semitons, como o ouvido percebe). */
function desenhar(canvas: HTMLCanvasElement, amostras: AmostraSessao[], agora: number, alvo: Faixa) {
  const dpr = window.devicePixelRatio || 1;
  const largura = canvas.clientWidth;
  const altura = canvas.clientHeight;
  if (canvas.width !== Math.round(largura * dpr) || canvas.height !== Math.round(altura * dpr)) {
    canvas.width = Math.round(largura * dpr);
    canvas.height = Math.round(altura * dpr);
  }
  const g = canvas.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, largura, altura);

  // eixo vertical: da faixa-alvo −7 a +7 semitons (log), para a faixa ficar sempre no meio
  const st = (hz: number) => 12 * Math.log2(hz);
  const topo = st(alvo.max) + 7;
  const base = st(alvo.min) - 7;
  const PE = 52;
  const y = (hz: number) => ((topo - st(hz)) / (topo - base)) * altura;
  const x = (t: number) => PE + ((t - (agora - JANELA_S)) / JANELA_S) * (largura - PE - 8);

  g.font = "11px ui-monospace, Consolas, monospace";
  g.textAlign = "right";
  g.textBaseline = "middle";
  // faixa-alvo
  g.fillStyle = COR.faixa;
  g.fillRect(PE, y(alvo.max), largura - PE - 8, y(alvo.min) - y(alvo.max));
  g.strokeStyle = COR.borda;
  g.lineWidth = 1;
  for (const hz of [alvo.min, alvo.max]) {
    g.beginPath(); g.moveTo(PE, y(hz)); g.lineTo(largura - 8, y(hz)); g.stroke();
    g.fillStyle = COR.texto;
    g.fillText(`${Math.round(hz)} Hz`, PE - 6, y(hz));
  }

  // curva: interrompida onde não há voz
  g.strokeStyle = COR.linha;
  g.lineWidth = 2;
  g.lineJoin = "round";
  g.beginPath();
  let aberto = false;
  for (const a of amostras) {
    if (a.t < agora - JANELA_S) continue;
    if (a.hz === null) { aberto = false; continue; }
    const px = x(a.t);
    const py = Math.max(0, Math.min(altura, y(a.hz)));
    if (aberto) g.lineTo(px, py); else { g.moveTo(px, py); aberto = true; }
  }
  g.stroke();
}

export function BiofeedbackAoVivo({ paciente, aoSalvar }: { paciente: string; aoSalvar: () => void }) {
  const id = useId();
  const [alvoPitch, setAlvoPitch] = useState<Faixa>({ min: 180, max: 220 });
  const [alvoVolume, setAlvoVolume] = useState<Faixa>({ min: -30, max: -12 });
  // a faixa fica guardada em dBFS; com calibração, é mostrada e digitada em dB SPL
  const { calibracao, usarSpl, setUsarSpl, desloc, unidade } = useCalibracao();
  const emU = (dbfs: number) => Math.round((dbfs + desloc) * 10) / 10;
  const deU = (v: number) => Math.round((v - desloc) * 10) / 10;
  const [ativo, setAtivo] = useState(false);
  const [leitura, setLeitura] = useState<{ hz: number | null; db: number; dentroPct: number | null }>({ hz: null, db: -120, dentroPct: null });
  const [anuncio, setAnuncio] = useState("");
  const [resumo, setResumo] = useState<ResumoBiofeedback | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [suportado, setSuportado] = useState(true);

  const canvas = useRef<HTMLCanvasElement>(null);
  const amostras = useRef<AmostraSessao[]>([]);
  const audio = useRef<{ ctx: AudioContext; stream: MediaStream; analisador: AnalyserNode } | null>(null);
  const abrindo = useRef(false);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  const quadro = useRef<number | null>(null);
  const hzSuave = useRef<number | null>(null);
  const alvos = useRef({ alvoPitch, alvoVolume });
  alvos.current = { alvoPitch, alvoVolume };

  const faixaValida = alvoPitch.min > 0 && alvoPitch.max > alvoPitch.min && alvoVolume.max > alvoVolume.min && alvoVolume.max <= 0;

  useEffect(() => setSuportado(gravadorSuportado()), []);

  const encerrarAudio = useCallback(() => {
    if (quadro.current !== null) cancelAnimationFrame(quadro.current);
    quadro.current = null;
    const a = audio.current;
    audio.current = null;
    a?.stream.getTracks().forEach((t) => t.stop());
    void a?.ctx.close().catch(() => undefined);
  }, []);

  useEffect(() => encerrarAudio, [encerrarAudio]);

  const parar = useCallback(() => {
    encerrarAudio();
    setAtivo(false);
    const { alvoPitch: p, alvoVolume: v } = alvos.current;
    setResumo(resumirSessao(amostras.current, p, v));
  }, [encerrarAudio]);

  async function iniciar() {
    setErro(null);
    setResumo(null);
    setSalvo(false);
    if (abrindo.current || audio.current) return; // dois toques não abrem dois microfones
    abrindo.current = true;
    try {
      if (!window.isSecureContext) throw new Error("O microfone só funciona em https:// ou em http://localhost.");
      const mic = await abrirMicrofoneAoVivo(() => montado.current);
      if (!mic) return; // a tela saiu enquanto o navegador pedia o microfone
      audio.current = mic;
    } catch (e) {
      encerrarAudio();
      setErro(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Permita o uso do microfone no navegador."
          : friendlyError(e, "Não foi possível abrir o microfone."),
      );
      return;
    } finally {
      abrindo.current = false;
    }
    amostras.current = [];
    hzSuave.current = null;
    setAtivo(true);

    const buffer = new Float32Array(2048);
    const brutos: (number | null)[] = [];
    let ultimoTexto = 0;
    let ultimaTela = 0;
    const passo = () => {
      const a = audio.current;
      if (!a) return;
      a.analisador.getFloatTimeDomainData(buffer);
      const t = a.ctx.currentTime;
      const { alvoPitch: p } = alvos.current;
      const r = pitchYin(buffer, a.ctx.sampleRate, Math.max(40, p.min / 2), Math.min(1600, p.max * 2));
      const db = nivelDbfs(buffer);
      brutos.push(r?.hz ?? null);
      if (brutos.length > 3) brutos.shift();
      const hz = medianaDe3(brutos);
      amostras.current.push({ t, hz, db });
      hzSuave.current = hz !== null ? suavizar(hzSuave.current, hz) : null;

      if (canvas.current) desenhar(canvas.current, amostras.current, t, p);
      const inicio = amostras.current[0]?.t ?? t;
      if (t - ultimaTela > 0.1) {
        ultimaTela = t;
        // último minuto, recortado pelo tempo (o navegador entrega ~60 leituras/s, mas não exatas)
        const lista = amostras.current;
        let i = lista.length - 1;
        while (i > 0 && (lista[i - 1]?.t ?? 0) >= t - 60) i--;
        const parcial = resumirSessao(lista.slice(i), p, alvos.current.alvoVolume);
        setLeitura({ hz: hzSuave.current, db, dentroPct: parcial.dentro_pitch_pct });
        if (t - ultimoTexto > 2) {
          ultimoTexto = t;
          setAnuncio(hzSuave.current ? `${rotuloNota(hzSuave.current)}, ${TEXTO_POSICAO[posicaoNaFaixa(hzSuave.current, p)].toLowerCase()}` : "Sem voz");
        }
      }
      if (t - inicio >= LIMITE_SESSAO_S) { parar(); return; }
      quadro.current = requestAnimationFrame(passo);
    };
    quadro.current = requestAnimationFrame(passo);
  }

  async function salvar() {
    if (!resumo || !paciente) return;
    setSalvando(true);
    setErro(null);
    try {
      await salvarBiofeedback(paciente, resumo, desloc ? calibracao : null);
      setSalvo(true);
      aoSalvar();
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível salvar a sessão."));
    } finally {
      setSalvando(false);
    }
  }

  const posPitch = leitura.hz !== null ? posicaoNaFaixa(leitura.hz, alvoPitch) : null;
  const posVolume = leitura.db > -120 ? posicaoNaFaixa(leitura.db, alvoVolume) : null;
  // medidor de volume de −60 a 0 dBFS
  const pctDb = (db: number) => Math.max(0, Math.min(100, ((db + 60) / 60) * 100));

  return (
    <section className="panel-glass rounded-2xl p-4 md:p-5" aria-labelledby={`${id}-t`} data-testid="vc2-bio">
      <h2 id={`${id}-t`} className="font-display text-lg font-semibold text-ink">Biofeedback ao vivo</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-muted">
        O paciente vê o pitch e o volume enquanto fala ou canta, com a faixa-alvo definida por você. O áudio fica neste aparelho; só o resumo da sessão é salvo.
      </p>

      <fieldset className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3" disabled={ativo}>
        <legend className="sr-only">Faixas-alvo</legend>
        <div className="flex items-end gap-2">
          <CampoNumero id={`${id}-pmin`} rotulo="Pitch mínimo (Hz)" valor={alvoPitch.min} min={40} max={1600} onChange={(v) => setAlvoPitch((f) => ({ ...f, min: v }))} />
          <CampoNumero id={`${id}-pmax`} rotulo="Pitch máximo (Hz)" valor={alvoPitch.max} min={40} max={1600} onChange={(v) => setAlvoPitch((f) => ({ ...f, max: v }))} />
        </div>
        <div className="flex items-end gap-2">
          <CampoNumero id={`${id}-vmin`} rotulo={`Volume mínimo (${unidade})`} valor={emU(alvoVolume.min)} min={emU(-90)} max={emU(0)} onChange={(v) => setAlvoVolume((f) => ({ ...f, min: deU(v) }))} />
          <CampoNumero id={`${id}-vmax`} rotulo={`Volume máximo (${unidade})`} valor={emU(alvoVolume.max)} min={emU(-90)} max={emU(0)} onChange={(v) => setAlvoVolume((f) => ({ ...f, max: deU(v) }))} />
        </div>
        <p className="text-xs text-ink-faint">
          {faixaValida && alvoPitch.min >= 40 ? `${rotuloNota(alvoPitch.min)} a ${rotuloNota(alvoPitch.max)}` : "Confira as faixas: o mínimo precisa ser menor que o máximo."}
        </p>
      </fieldset>
      <UnidadeIntensidade calibracao={calibracao} usarSpl={usarSpl} aoMudar={setUsarSpl} desativado={ativo} testid="vc2-bio-unidade" />

      <div className="mt-4">
        {ativo ? (
          <Button type="button" variant="danger" onClick={parar} data-testid="vc2-bio-parar">
            <Square className="h-4 w-4" aria-hidden /> Parar
          </Button>
        ) : (
          <Button type="button" onClick={() => void iniciar()} disabled={!suportado || !faixaValida} data-testid="vc2-bio-iniciar">
            <Mic className="h-4 w-4" aria-hidden /> Iniciar biofeedback
          </Button>
        )}
      </div>

      {ativo ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-canvas-raised/60 p-3 ring-1 ring-inset ring-ink/10">
              <p className="text-xs text-ink-muted">Pitch agora</p>
              <p className="text-data mt-1 text-2xl font-semibold text-ink" data-testid="vc2-bio-hz">
                {leitura.hz !== null ? rotuloNota(leitura.hz) : "—"}
              </p>
              <p className={cn("mt-1 flex items-center gap-1.5 text-sm", posPitch === "dentro" ? "text-accent" : "text-ink-muted")} data-testid="vc2-bio-pos">
                {posPitch ? <><IconePosicao p={posPitch} /> {TEXTO_POSICAO[posPitch]}</> : "Sem voz"}
              </p>
            </div>
            <div className="rounded-xl bg-canvas-raised/60 p-3 ring-1 ring-inset ring-ink/10">
              <p className="text-xs text-ink-muted">Volume agora</p>
              <p className="text-data mt-1 text-2xl font-semibold text-ink">{leitura.db > -120 ? `${fixoBR(emU(leitura.db), 0)} ${unidade}` : "—"}</p>
              <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-canvas-overlay ring-1 ring-inset ring-line" aria-hidden>
                <div className="absolute inset-y-0 bg-ink/[0.06]" style={{ left: `${pctDb(alvoVolume.min)}%`, width: `${pctDb(alvoVolume.max) - pctDb(alvoVolume.min)}%` }} />
                <div className="absolute inset-y-0 left-0 bg-accent/80 transition-[width] duration-75" style={{ width: `${pctDb(leitura.db)}%` }} />
                {/* faixa-alvo por cima da barra: duas marcas verticais */}
                <div className="absolute inset-y-0 border-x-2 border-ink/80" style={{ left: `${pctDb(alvoVolume.min)}%`, width: `${pctDb(alvoVolume.max) - pctDb(alvoVolume.min)}%` }} />
              </div>
              <p className="mt-1 text-xs text-ink-muted">{posVolume ? TEXTO_POSICAO[posVolume] : " "}</p>
            </div>
          </div>
          <canvas ref={canvas} className="block h-48 w-full rounded-xl bg-canvas-raised/60 ring-1 ring-inset ring-ink/10" aria-label="Curva de pitch dos últimos 8 segundos, com a faixa-alvo sombreada" role="img" />
          <p className="text-xs text-ink-muted">
            Na faixa de pitch (último minuto): <span className="text-data text-ink">{leitura.dentroPct !== null ? `${fixoBR(leitura.dentroPct, 0)}%` : "—"}</span>
          </p>
          <p className="sr-only" role="status" aria-live="polite">{anuncio}</p>
        </div>
      ) : null}

      {resumo ? (
        <div className="mt-4 rounded-xl p-3 ring-1 ring-inset ring-ink/10" data-testid="vc2-bio-resumo">
          <h3 className="text-sm font-semibold text-ink">Resumo da sessão</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            {([
              ["Duração", `${fixoBR(resumo.duracao_s, 1)} s`],
              ["Tempo com voz", `${fixoBR(resumo.fonacao_s, 1)} s`],
              ["Pitch na faixa", resumo.dentro_pitch_pct !== null ? `${fixoBR(resumo.dentro_pitch_pct, 1)} %` : "—"],
              ["Volume na faixa", resumo.dentro_volume_pct !== null ? `${fixoBR(resumo.dentro_volume_pct, 1)} %` : "—"],
              ["Pitch mediano", resumo.f0_mediana_hz !== null ? `${fixoBR(resumo.f0_mediana_hz, 1)} Hz` : "—"],
              ["Pitch (10%–90%)", resumo.f0_p10_hz !== null && resumo.f0_p90_hz !== null ? `${fixoBR(resumo.f0_p10_hz, 0)}–${fixoBR(resumo.f0_p90_hz, 0)} Hz` : "—"],
            ] as const).map(([rotulo, valor]) => (
              <div key={rotulo} className="flex flex-col">
                <dt className="text-xs text-ink-muted">{rotulo}</dt>
                <dd className="text-data text-ink">{valor}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" variant="secondary" onClick={() => void salvar()} disabled={!paciente || salvando || salvo || resumo.fonacao_s === 0} data-testid="vc2-bio-salvar">
              {salvo ? "Salvo no histórico" : salvando ? "Salvando…" : "Salvar no histórico"}
            </Button>
            {!paciente ? <span className="text-xs text-ink-faint">Preencha o paciente no topo para salvar.</span> : null}
            {resumo.fonacao_s === 0 ? <span className="text-xs text-ink-faint">Nenhuma voz detectada nesta sessão.</span> : null}
          </div>
        </div>
      ) : null}

      {!suportado ? <p className="mt-3 text-sm text-signal-err">Este navegador não acessa o microfone.</p> : null}
      {erro ? <p className="mt-3 text-sm text-signal-err" role="alert">{erro}</p> : null}
    </section>
  );
}
