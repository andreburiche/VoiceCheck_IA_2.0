"use client";

import { Mic, Square } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { fixoBR, salvarJogo } from "@/lib/voz-clinica-api";
import { medianaDe3, nivelDbfs, pitchYin, SILENCIO_DBFS, type Faixa } from "@/lib/voz-clinica-biofeedback";
import { abrirMicrofoneAoVivo, gravadorSuportado } from "@/lib/voz-clinica-gravador";
import {
  JOGOS,
  alvoEm,
  classificarSom,
  estadoDesafiosInicial,
  estadoPercursoInicial,
  estadoSoproInicial,
  gerarDesafios,
  gerarPercurso,
  normalizar,
  passoDesafios,
  passoPercurso,
  passoSopro,
  pontuacaoDesafios,
  pontuacaoPercurso,
  type ClasseSom,
  type Desafio,
  type EstadoDesafios,
  type EstadoPercurso,
  type EstadoSopro,
  type JogoId,
  type ResultadoJogo,
  type Segmento,
} from "@/lib/voz-clinica-jogos";

const DIFICULDADES = { facil: { rotulo: "Fácil", tol: 0.18 }, medio: { rotulo: "Médio", tol: 0.12 }, dificil: { rotulo: "Difícil", tol: 0.07 } } as const;
type Dificuldade = keyof typeof DIFICULDADES;
const COR = { alvo: "rgba(32,217,210,0.16)", alvoBorda: "rgba(32,217,210,0.55)", ponto: "#F8FAFC", pontoNoAlvo: "#20D9D2", rastro: "rgba(248,250,252,0.35)", texto: "#94A3B8" };
const ROTULO_CLASSE: Record<ClasseSom, string> = { sonoro: "sonoro (com vibração)", surdo: "surdo (sem vibração)", silencio: "silêncio" };

type Config = {
  faixaVolume: Faixa;
  faixaPitch: Faixa;
  duracao_s: number;
  dificuldade: Dificuldade;
  meta_s: number;
  desafios: number;
};

type Partida = {
  jogo: JogoId;
  inicio: number;
  percurso: Segmento[];
  desafios: Desafio[];
  percursoE: EstadoPercurso;
  soproE: EstadoSopro;
  desafiosE: EstadoDesafios;
  rastro: { t: number; y: number | null }[];
  y: number | null;
  classe: ClasseSom;
};

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------

function prepararCanvas(c: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const g = c.getContext("2d");
  if (!g) return null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

/** Altitude e Trilha: o percurso corre da direita para a esquerda; o ponto fica a 30% da largura. */
function desenharPercurso(c: HTMLCanvasElement, p: Partida, t: number, tol: number) {
  const ctx = prepararCanvas(c);
  if (!ctx) return;
  const { g, w, h } = ctx;
  const JANELA = 7; // s visíveis
  const x0 = w * 0.3;
  const x = (tt: number) => x0 + ((tt - t) / JANELA) * w;
  const y = (v: number) => h - 12 - v * (h - 24);

  // faixa-alvo (alvo ± tolerância), amostrada ao longo do tempo
  g.fillStyle = COR.alvo;
  g.strokeStyle = COR.alvoBorda;
  g.lineWidth = 1;
  for (const s of p.percurso) {
    if (s.fim < t - JANELA * 0.3 || s.inicio > t + JANELA) continue;
    g.beginPath();
    const passos = 12;
    for (let k = 0; k <= passos; k++) {
      const tt = s.inicio + ((s.fim - s.inicio) * k) / passos;
      const v = alvoEm([s], tt) ?? 0;
      if (k === 0) g.moveTo(x(tt), y(Math.min(1, v + tol))); else g.lineTo(x(tt), y(Math.min(1, v + tol)));
    }
    for (let k = passos; k >= 0; k--) {
      const tt = s.inicio + ((s.fim - s.inicio) * k) / passos;
      const v = alvoEm([s], tt) ?? 0;
      g.lineTo(x(tt), y(Math.max(0, v - tol)));
    }
    g.closePath();
    g.fill();
    g.stroke();
  }
  // linha do "agora"
  g.strokeStyle = "rgba(148,163,184,0.25)";
  g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0, h); g.stroke();

  // rastro da voz
  g.strokeStyle = COR.rastro;
  g.lineWidth = 2;
  g.beginPath();
  let aberto = false;
  for (const r of p.rastro) {
    if (r.t < t - JANELA * 0.3) continue;
    if (r.y === null) { aberto = false; continue; }
    if (aberto) g.lineTo(x(r.t), y(r.y)); else { g.moveTo(x(r.t), y(r.y)); aberto = true; }
  }
  g.stroke();

  // ponto
  if (p.y !== null) {
    const alvo = alvoEm(p.percurso, t);
    const noAlvo = alvo !== null && Math.abs(p.y - alvo) <= tol;
    g.fillStyle = noAlvo ? COR.pontoNoAlvo : COR.ponto;
    g.beginPath(); g.arc(x0, y(p.y), noAlvo ? 10 : 8, 0, Math.PI * 2); g.fill();
  }
  if (t < (p.percurso[0]?.inicio ?? 0)) {
    g.fillStyle = COR.texto;
    g.font = "14px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText("Prepare-se…", w / 2, 24);
  }
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function JogosTerapia({ paciente, aoSalvar }: { paciente: string; aoSalvar: () => void }) {
  const id = useId();
  const [jogo, setJogo] = useState<JogoId>("altitude");
  const [config, setConfig] = useState<Config>({
    faixaVolume: { min: -45, max: -10 },
    faixaPitch: { min: 150, max: 300 },
    duracao_s: 30,
    dificuldade: "medio",
    meta_s: 10,
    desafios: 8,
  });
  const [jogando, setJogando] = useState(false);
  const [placar, setPlacar] = useState<{ pct: number; texto: string; classe?: ClasseSom; desafio?: Desafio; indice?: number; historico?: boolean[]; sopro?: EstadoSopro }>({ pct: 0, texto: "" });
  const [resultado, setResultado] = useState<ResultadoJogo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [suportado, setSuportado] = useState(true);
  useEffect(() => setSuportado(gravadorSuportado()), []);

  const canvas = useRef<HTMLCanvasElement>(null);
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
  const partida = useRef<Partida | null>(null);
  const cfg = useRef(config);
  cfg.current = config;

  const fecharAudio = useCallback(() => {
    if (quadro.current !== null) cancelAnimationFrame(quadro.current);
    quadro.current = null;
    const a = audio.current;
    audio.current = null;
    a?.stream.getTracks().forEach((t) => t.stop());
    void a?.ctx.close().catch(() => undefined);
  }, []);
  useEffect(() => fecharAudio, [fecharAudio]);

  const terminar = useCallback(() => {
    const p = partida.current;
    const a = audio.current;
    fecharAudio();
    setJogando(false);
    if (!p) return;
    const t = a ? a.ctx.currentTime : p.inicio;
    const c = cfg.current;
    const duracao = Math.round((t - p.inicio) * 10) / 10;
    let r: ResultadoJogo;
    if (p.jogo === "altitude" || p.jogo === "trilha") {
      r = {
        jogo: p.jogo, duracao_s: duracao, pontuacao_pct: pontuacaoPercurso(p.percursoE),
        detalhes: { no_alvo_s: Math.round(p.percursoE.noAlvo_s * 10) / 10, com_alvo_s: Math.round(p.percursoE.comAlvo_s * 10) / 10, tolerancia: DIFICULDADES[c.dificuldade].tol },
      };
    } else if (p.jogo === "sopro") {
      const melhor = Math.round(p.soproE.melhor_s * 10) / 10;
      r = { jogo: "sopro", duracao_s: duracao, pontuacao_pct: Math.min(100, Math.round((1000 * melhor) / c.meta_s) / 10), detalhes: { meta_s: c.meta_s, melhor_s: melhor } };
    } else {
      r = {
        jogo: "surdo-sonoro", duracao_s: duracao, pontuacao_pct: pontuacaoDesafios(p.desafiosE),
        detalhes: { desafios: p.desafiosE.acertos + p.desafiosE.erros, acertos: p.desafiosE.acertos, erros: p.desafiosE.erros },
      };
    }
    setResultado(r);
  }, [fecharAudio]);

  async function comecar() {
    setErro(null);
    setResultado(null);
    setSalvo(false);
    if (abrindo.current || audio.current) return; // dois toques não abrem dois microfones
    abrindo.current = true;
    try {
      if (!window.isSecureContext) throw new Error("O microfone só funciona em https:// ou em http://localhost.");
      const mic = await abrirMicrofoneAoVivo(() => montado.current);
      if (!mic) return; // a tela saiu enquanto o navegador pedia o microfone
      audio.current = mic;
    } catch (e) {
      fecharAudio();
      setErro(e instanceof DOMException && e.name === "NotAllowedError" ? "Permita o uso do microfone no navegador." : friendlyError(e, "Não foi possível abrir o microfone."));
      return;
    } finally {
      abrindo.current = false;
    }
    const c = cfg.current;
    const semente = Math.floor(Math.random() * 1e9);
    const inicio = audio.current!.ctx.currentTime;
    partida.current = {
      jogo,
      inicio,
      percurso: jogo === "altitude" || jogo === "trilha" ? gerarPercurso(jogo, c.duracao_s, semente) : [],
      desafios: jogo === "surdo-sonoro" ? gerarDesafios(c.desafios, semente) : [],
      percursoE: estadoPercursoInicial(),
      soproE: estadoSoproInicial(),
      desafiosE: { ...estadoDesafiosInicial(), inicioDesafio: inicio + 1.5 },
      rastro: [],
      y: null,
      classe: "silencio",
    };
    setJogando(true);

    const buffer = new Float32Array(2048);
    const brutos: (number | null)[] = [];
    let ultimaTela = 0;
    const passo = () => {
      const a = audio.current;
      const p = partida.current;
      if (!a || !p) return;
      a.analisador.getFloatTimeDomainData(buffer);
      const t = a.ctx.currentTime - p.inicio;
      const conf = cfg.current;
      const tol = DIFICULDADES[conf.dificuldade].tol;

      if (p.jogo === "altitude") {
        const db = nivelDbfs(buffer);
        p.y = db < SILENCIO_DBFS ? null : normalizar(db, conf.faixaVolume);
      } else if (p.jogo === "trilha") {
        const r = pitchYin(buffer, a.ctx.sampleRate, Math.max(40, conf.faixaPitch.min / 2), Math.min(1600, conf.faixaPitch.max * 2));
        brutos.push(r?.hz ?? null);
        if (brutos.length > 3) brutos.shift();
        const hz = medianaDe3(brutos);
        p.y = hz === null ? null : normalizar(hz, conf.faixaPitch, "log");
      } else if (p.jogo === "sopro") {
        const r = pitchYin(buffer, a.ctx.sampleRate, 60, 1000);
        p.soproE = passoSopro(p.soproE, t, r !== null);
      } else {
        p.classe = classificarSom(buffer, a.ctx.sampleRate);
        p.desafiosE = passoDesafios(p.desafiosE, t + p.inicio, p.classe, p.desafios);
      }

      if (p.jogo === "altitude" || p.jogo === "trilha") {
        p.percursoE = passoPercurso(p.percursoE, t, p.y, p.percurso, tol);
        p.rastro.push({ t, y: p.y });
        if (p.rastro.length > 900) p.rastro.splice(0, p.rastro.length - 900);
        if (canvas.current) desenharPercurso(canvas.current, p, t, tol);
      }

      if (t - ultimaTela > 0.1) {
        ultimaTela = t;
        if (p.jogo === "altitude" || p.jogo === "trilha") {
          setPlacar({ pct: pontuacaoPercurso(p.percursoE), texto: `${fixoBR(Math.max(0, conf.duracao_s - t), 0)} s restantes` });
        } else if (p.jogo === "sopro") {
          setPlacar({ pct: Math.min(100, (100 * p.soproE.atual_s) / conf.meta_s), texto: "", sopro: { ...p.soproE } });
        } else {
          const e = p.desafiosE;
          setPlacar({
            pct: pontuacaoDesafios(e), texto: `${Math.min(e.indice + 1, p.desafios.length)} de ${p.desafios.length}`,
            classe: p.classe, desafio: p.desafios[e.indice], indice: e.indice, historico: e.historico,
          });
        }
      }

      const acabou =
        ((p.jogo === "altitude" || p.jogo === "trilha") && t >= conf.duracao_s) ||
        (p.jogo === "sopro" && p.soproE.atual_s >= conf.meta_s) ||
        (p.jogo === "surdo-sonoro" && p.desafiosE.indice >= p.desafios.length) ||
        t >= 600;
      if (acabou) { terminar(); return; }
      quadro.current = requestAnimationFrame(passo);
    };
    quadro.current = requestAnimationFrame(passo);
  }

  async function salvar() {
    if (!resultado || !paciente) return;
    setSalvando(true);
    setErro(null);
    try {
      await salvarJogo(paciente, resultado);
      setSalvo(true);
      aoSalvar();
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível salvar a partida."));
    } finally {
      setSalvando(false);
    }
  }

  const def = JOGOS[jogo];
  const set = (parcial: Partial<Config>) => setConfig((c) => ({ ...c, ...parcial }));
  const num = (v: string) => Number(v);
  const configValida =
    config.faixaVolume.min < config.faixaVolume.max && config.faixaVolume.max <= 0 &&
    config.faixaPitch.min >= 40 && config.faixaPitch.min < config.faixaPitch.max &&
    config.duracao_s >= 10 && config.duracao_s <= 300 && config.meta_s >= 2 && config.meta_s <= 60 &&
    config.desafios >= 2 && config.desafios <= 30;

  return (
    <section className="panel-glass rounded-2xl p-4 md:p-5" aria-labelledby={`${id}-t`} data-testid="vc2-jogos">
      <h2 id={`${id}-t`} className="font-display text-lg font-semibold text-ink">Jogos de terapia</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-muted">Exercícios com retorno visual imediato. O áudio fica neste aparelho; só o resultado da partida é salvo.</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Escolha o jogo">
        {(Object.keys(JOGOS) as JogoId[]).map((j) => (
          <button
            key={j} type="button" role="radio" aria-checked={jogo === j} disabled={jogando}
            onClick={() => { setJogo(j); setResultado(null); }}
            className={cn(
              "rounded-xl p-3 text-left ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50",
              jogo === j ? "bg-accent/10 ring-accent/60" : "ring-ink/10 hover:bg-canvas-overlay/60",
            )}
            data-testid={`vc2-jogo-${j}`}
          >
            <span className="block text-sm font-semibold text-ink">{JOGOS[j].titulo}</span>
            <span className="mt-0.5 block text-xs text-ink-muted">{JOGOS[j].treina}</span>
          </button>
        ))}
      </div>

      <p className="mt-4 max-w-[70ch] text-sm text-ink">{def.instrucao}</p>

      <fieldset className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3" disabled={jogando}>
        <legend className="sr-only">Configuração do jogo</legend>
        {jogo === "altitude" ? (
          <>
            <Campo id={`${id}-vmin`} rotulo="Volume do chão (dBFS)" valor={config.faixaVolume.min} onChange={(v) => set({ faixaVolume: { ...config.faixaVolume, min: num(v) } })} />
            <Campo id={`${id}-vmax`} rotulo="Volume do teto (dBFS)" valor={config.faixaVolume.max} onChange={(v) => set({ faixaVolume: { ...config.faixaVolume, max: num(v) } })} />
          </>
        ) : null}
        {jogo === "trilha" ? (
          <>
            <Campo id={`${id}-pmin`} rotulo="Pitch do chão (Hz)" valor={config.faixaPitch.min} onChange={(v) => set({ faixaPitch: { ...config.faixaPitch, min: num(v) } })} />
            <Campo id={`${id}-pmax`} rotulo="Pitch do teto (Hz)" valor={config.faixaPitch.max} onChange={(v) => set({ faixaPitch: { ...config.faixaPitch, max: num(v) } })} />
          </>
        ) : null}
        {jogo === "altitude" || jogo === "trilha" ? (
          <>
            <Campo id={`${id}-dur`} rotulo="Duração (s)" valor={config.duracao_s} onChange={(v) => set({ duracao_s: num(v) })} />
            <div>
              <Label htmlFor={`${id}-dif`} className="text-xs">Dificuldade</Label>
              <select id={`${id}-dif`} value={config.dificuldade} onChange={(e) => set({ dificuldade: e.target.value as Dificuldade })}
                className="mt-1 block h-9 rounded-lg border border-line bg-canvas-raised px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
                {Object.entries(DIFICULDADES).map(([k, d]) => <option key={k} value={k}>{d.rotulo}</option>)}
              </select>
            </div>
          </>
        ) : null}
        {jogo === "sopro" ? <Campo id={`${id}-meta`} rotulo="Meta (s)" valor={config.meta_s} onChange={(v) => set({ meta_s: num(v) })} /> : null}
        {jogo === "surdo-sonoro" ? <Campo id={`${id}-n`} rotulo="Desafios" valor={config.desafios} onChange={(v) => set({ desafios: num(v) })} /> : null}
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {jogando ? (
          <Button type="button" variant="danger" onClick={terminar} data-testid="vc2-jogo-parar"><Square className="h-4 w-4" aria-hidden /> Encerrar partida</Button>
        ) : (
          <Button type="button" onClick={() => void comecar()} disabled={!suportado || !configValida} data-testid="vc2-jogo-comecar">
            <Mic className="h-4 w-4" aria-hidden /> {resultado ? "Jogar de novo" : "Começar"}
          </Button>
        )}
        {!configValida ? <span className="text-xs text-signal-warn">Confira a configuração: mínimo menor que o máximo, duração de 10 a 300 s.</span> : null}
      </div>

      {jogando ? (
        <div className="mt-4" data-testid="vc2-jogo-area">
          {jogo === "altitude" || jogo === "trilha" ? (
            <>
              <div className="flex justify-between text-sm"><span className="text-ink">No alvo: <span className="text-data">{fixoBR(placar.pct, 0)}%</span></span><span className="text-ink-muted">{placar.texto}</span></div>
              <canvas ref={canvas} className="mt-2 block h-64 w-full rounded-xl bg-canvas-raised/60 ring-1 ring-inset ring-ink/10" role="img"
                aria-label={jogo === "altitude" ? "Percurso de volume: mantenha o ponto dentro das faixas" : "Trilha de pitch: acompanhe a faixa com a voz"} />
            </>
          ) : null}

          {jogo === "sopro" && placar.sopro ? (
            <div className="rounded-xl bg-canvas-raised/60 p-4 ring-1 ring-inset ring-ink/10">
              <p className="text-data text-3xl font-semibold text-ink" data-testid="vc2-sopro-tempo">{fixoBR(placar.sopro.atual_s, 1)} s</p>
              <p className="text-sm text-ink-muted">meta {fixoBR(config.meta_s, 0)} s · melhor {fixoBR(placar.sopro.melhor_s, 1)} s</p>
              <div className="relative mt-3 h-5 overflow-hidden rounded-full bg-canvas-overlay ring-1 ring-inset ring-line"
                role="progressbar" aria-valuemin={0} aria-valuemax={config.meta_s} aria-valuenow={Math.round(placar.sopro.atual_s)} aria-label="Tempo de fonação">
                <div className="h-full bg-accent transition-[width] duration-100" style={{ width: `${placar.pct}%` }} />
                <div className="absolute inset-y-0 w-0.5 bg-ink/70" style={{ left: `${Math.min(100, (100 * placar.sopro.melhor_s) / config.meta_s)}%` }} aria-hidden />
              </div>
            </div>
          ) : null}

          {jogo === "surdo-sonoro" && placar.desafio ? (
            <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
              <div className="flex h-36 w-36 items-center justify-center rounded-2xl bg-canvas-raised/60 ring-1 ring-inset ring-ink/10">
                <span className="font-display text-6xl font-semibold text-ink" data-testid="vc2-desafio-som">{placar.desafio.som}</span>
              </div>
              <div>
                <p className="text-sm text-ink">Faça: <strong>{placar.desafio.exemplo}</strong></p>
                <p className="mt-1 text-sm text-ink-muted">É um som <strong className="text-ink">{placar.desafio.esperado}</strong>{placar.desafio.esperado === "sonoro" ? ": a garganta vibra" : ": só o ar passa"}.</p>
                <p className="mt-3 text-sm" data-testid="vc2-desafio-ouvindo">
                  Ouvindo: <span className={cn("font-medium", placar.classe === placar.desafio.esperado ? "text-accent" : "text-ink")}>{ROTULO_CLASSE[placar.classe ?? "silencio"]}</span>
                </p>
                <p className="mt-2 text-xs text-ink-muted">Desafio {placar.texto} · acertos {placar.historico?.filter(Boolean).length ?? 0}</p>
                <p className="sr-only" role="status" aria-live="polite">Desafio {placar.texto}: {placar.desafio.som}</p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {resultado ? (
        <div className="mt-4 rounded-xl p-3 ring-1 ring-inset ring-ink/10" data-testid="vc2-jogo-resultado">
          <h3 className="text-sm font-semibold text-ink">Resultado — {JOGOS[resultado.jogo].titulo}</h3>
          <p className="text-data mt-1 text-2xl font-semibold text-ink">{fixoBR(resultado.pontuacao_pct, 1)}%</p>
          <p className="text-sm text-ink-muted">
            {resultado.jogo === "sopro"
              ? `Melhor emissão contínua: ${fixoBR(resultado.detalhes.melhor_s, 1)} s de ${fixoBR(resultado.detalhes.meta_s, 0)} s.`
              : resultado.jogo === "surdo-sonoro"
                ? `${fixoBR(resultado.detalhes.acertos, 0)} ${resultado.detalhes.acertos === 1 ? "acerto" : "acertos"} em ${fixoBR(resultado.detalhes.desafios, 0)} desafios.`
                : `${fixoBR(resultado.detalhes.no_alvo_s, 1)} s no alvo de ${fixoBR(resultado.detalhes.com_alvo_s, 1)} s com alvo.`}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" variant="secondary" onClick={() => void salvar()} disabled={!paciente || salvando || salvo} data-testid="vc2-jogo-salvar">
              {salvo ? "Salvo no histórico" : salvando ? "Salvando…" : "Salvar no histórico"}
            </Button>
            {!paciente ? <span className="text-xs text-ink-faint">Preencha o paciente no topo para salvar.</span> : null}
          </div>
        </div>
      ) : null}

      {erro ? <p className="mt-3 text-sm text-signal-err" role="alert">{erro}</p> : null}
    </section>
  );
}

function Campo({ id, rotulo, valor, onChange }: { id: string; rotulo: string; valor: number; onChange: (v: string) => void }) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">{rotulo}</Label>
      <Input id={id} type="number" inputMode="decimal" className="mt-1 h-9 w-28" value={Number.isFinite(valor) ? valor : ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
