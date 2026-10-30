"use client";

import { ArrowLeft, CloudOff, Mic, RefreshCw, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api";
import { cn } from "@/lib/utils";
import { medianaDe3, nivelDbfs, pitchYin, posicaoNaFaixa, rotuloNota } from "@/lib/voz-clinica-biofeedback";
import { abrirMicrofoneAoVivo } from "@/lib/voz-clinica-gravador";
import {
  aplicarEnvio,
  aplicarEnvioAnterior,
  apagarEstado,
  descartarAnterior,
  diasSeguidos,
  estadoParaToken,
  estadoRepeticaoInicial,
  feitasHoje,
  lerEstado,
  passoRepeticao,
  registrarSessao,
  resultadoRepeticao,
  salvarEstado,
  segundos,
  tokenDoEndereco,
  tokenDoTexto,
  totalPendente,
  type EstadoCelular,
  type EstadoRepeticao,
  type ExercicioPratica,
  type PlanoPublico,
  type RepeticaoMedida,
} from "@/lib/voz-clinica-pratica";

// ---------------------------------------------------------------------------
// Conversa com a API (sem cookie: só o segredo do link)
// ---------------------------------------------------------------------------

type Falha = "sem-rede" | "inativo" | "nao-encontrado" | "erro";

class ErroPratica extends Error {
  constructor(readonly falha: Falha) {
    super(falha);
  }
}

const falhaDe = (e: unknown): Falha => (e instanceof ErroPratica ? e.falha : "erro");

async function chamar<T>(caminho: string, token: string, corpo?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${API_URL}/api/v1/pratica-casa${caminho}`, {
      method: corpo ? "POST" : "GET",
      headers: { "X-Pratica-Token": token, ...(corpo ? { "Content-Type": "application/json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ErroPratica("sem-rede");
  }
  if (r.status === 410) throw new ErroPratica("inativo");
  if (r.status === 404 || r.status === 401) throw new ErroPratica("nao-encontrado");
  if (!r.ok) throw new ErroPratica("erro");
  return (await r.json()) as T;
}

type RespostaEnvio = { recebidas: string[]; recusadas: { id: string }[] };

const novoId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));

const armazem = () => (typeof window !== "undefined" ? window.localStorage : null);

function registrarServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  const modo = process.env.NODE_ENV === "development" ? "dev" : "prod";
  navigator.serviceWorker
    .register(`/pratica-sw.js?modo=${modo}`, { scope: "/pratica" })
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      // na primeira visita a página carregou antes do SW: manda a lista do que guardar
      const urls = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => u.startsWith(window.location.origin));
      reg.active?.postMessage({ tipo: "guardar", urls: [window.location.pathname, ...urls] });
    })
    .catch(() => undefined); // sem SW a página funciona, só não abre offline
}

// ---------------------------------------------------------------------------
// Peças da tela
// ---------------------------------------------------------------------------

const CARTAO = "rounded-2xl bg-canvas-raised p-4 ring-1 ring-inset ring-ink/10";

function Aviso({ titulo, texto, children }: { titulo: string; texto: string; children?: React.ReactNode }) {
  return (
    <div className={cn(CARTAO, "mt-6 text-center")} role="status">
      <p className="font-display text-lg font-semibold text-ink">{titulo}</p>
      <p className="mt-2 text-sm text-ink-muted">{texto}</p>
      {children}
    </div>
  );
}

/** Barra horizontal com a faixa-alvo em destaque e um marcador do valor atual. */
function Medidor({ valor, faixa, escala, rotulo }: { valor: number | null; faixa: { min: number; max: number }; escala: [number, number]; rotulo: string }) {
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - escala[0]) / (escala[1] - escala[0])) * 100));
  return (
    <div className="relative mt-4 h-10 rounded-full bg-canvas ring-1 ring-inset ring-ink/10" role="img" aria-label={rotulo}>
      <div className="absolute inset-y-1 rounded-full bg-accent/25 ring-1 ring-inset ring-accent/60"
        style={{ left: `${pos(faixa.min)}%`, width: `${pos(faixa.max) - pos(faixa.min)}%` }} />
      {valor !== null ? (
        <div className="absolute inset-y-0 w-1.5 -translate-x-1/2 rounded-full bg-ink shadow-[0_0_0_3px_rgba(7,11,20,0.9)]" style={{ left: `${pos(valor)}%` }} />
      ) : null}
    </div>
  );
}

const TEXTO_POSICAO = {
  pitch: { abaixo: "Mais grave que a faixa", dentro: "Dentro da faixa", acima: "Mais agudo que a faixa" },
  volume: { abaixo: "Mais baixo que a faixa", dentro: "Dentro da faixa", acima: "Mais alto que a faixa" },
} as const;

function fx(v: number, casas = 1) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function textoRepeticao(r: RepeticaoMedida, ex: ExercicioPratica): string {
  if (ex.tipo === "sustentar") return r.fonacao_s > 0 ? `${fx(r.fonacao_s)} s` : "sem voz detectada";
  return r.dentro_pct === null ? "sem voz detectada" : `${fx(r.dentro_pct, 0)}% na faixa`;
}

// ---------------------------------------------------------------------------
// Execução de um exercício
// ---------------------------------------------------------------------------

type Leitura = { hz: number | null; db: number; estado: EstadoRepeticao };

function Exercicio({
  ex, aoConcluir, aoSair,
}: { ex: ExercicioPratica; aoConcluir: (reps: RepeticaoMedida[]) => void; aoSair: () => void }) {
  const [reps, setReps] = useState<RepeticaoMedida[]>([]);
  const [gravando, setGravando] = useState(false);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [erro, setErro] = useState<string | null>(null);
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
  const terminou = reps.length >= ex.repeticoes;

  const fecharAudio = useCallback(() => {
    if (quadro.current !== null) cancelAnimationFrame(quadro.current);
    quadro.current = null;
    const a = audio.current;
    audio.current = null;
    a?.stream.getTracks().forEach((t) => t.stop());
    void a?.ctx.close().catch(() => undefined);
  }, []);
  useEffect(() => fecharAudio, [fecharAudio]);

  const finalizar = useCallback((estado: EstadoRepeticao) => {
    fecharAudio();
    setGravando(false);
    setReps((r) => [...r, resultadoRepeticao(estado, ex)]);
  }, [ex, fecharAudio]);

  async function comecar() {
    setErro(null);
    if (abrindo.current || audio.current) return; // dois toques não abrem dois microfones
    abrindo.current = true;
    try {
      if (!window.isSecureContext) throw new Error("seguro");
      const mic = await abrirMicrofoneAoVivo(() => montado.current);
      if (!mic) return; // a tela saiu enquanto o navegador pedia o microfone
      audio.current = mic;
    } catch (e) {
      fecharAudio();
      setErro(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "O microfone foi bloqueado. Toque no cadeado ao lado do endereço e permita o microfone."
          : e instanceof Error && e.message === "seguro"
            ? "O microfone só funciona quando a página abre com https://. Peça um novo link ao seu fonoaudiólogo."
            : "Não foi possível abrir o microfone deste celular.",
      );
      return;
    } finally {
      abrindo.current = false;
    }
    setGravando(true);
    const buffer = new Float32Array(2048);
    const recentes: (number | null)[] = [];
    const [fmin, fmax] = ex.faixa_hz ? [Math.max(40, ex.faixa_hz.min / 2), Math.min(1600, ex.faixa_hz.max * 2)] : [60, 1000];
    let estado = estadoRepeticaoInicial();
    let ultimaTela = -1;
    const passo = () => {
      const a = audio.current;
      if (!a) return;
      a.analisador.getFloatTimeDomainData(buffer);
      const t = a.ctx.currentTime;
      const r = pitchYin(buffer, a.ctx.sampleRate, fmin, fmax);
      recentes.push(r?.hz ?? null);
      if (recentes.length > 3) recentes.shift();
      const hz = medianaDe3(recentes);
      const db = nivelDbfs(buffer);
      estado = passoRepeticao(estado, ex, t, hz, db);
      if (estado.fim) return finalizar(estado);
      if (t - ultimaTela > 0.08) {
        ultimaTela = t;
        setLeitura({ hz, db, estado });
      }
      quadro.current = requestAnimationFrame(passo);
    };
    quadro.current = requestAnimationFrame(passo);
  }

  function parar() {
    // "Parar" encerra a repetição com o que foi medido até aqui
    const e = leitura?.estado;
    if (e) finalizar({ ...e, fim: true });
    else {
      fecharAudio();
      setGravando(false);
    }
  }

  const e = leitura?.estado;
  const ultima = reps[reps.length - 1];
  const melhor = reps.reduce((m, x) => Math.max(m, x.fonacao_s), 0);
  // sustentar: ao vivo mostra o trecho atual; parado, a última repetição (ou o melhor, no fim)
  const tempoTela = gravando ? e?.atual_s ?? 0 : terminou ? melhor : ultima?.fonacao_s ?? 0;
  const legendaSustentar = gravando
    ? e?.comecou ? "Sustente… a repetição termina quando a voz parar." : "Pode começar quando quiser."
    : terminou
      ? `Seu melhor tempo${ex.meta_s ? (melhor >= ex.meta_s ? ": meta atingida!" : `. Meta: ${segundos(ex.meta_s)} s.`) : "."}`
      : ultima ? "Última repetição. Descanse um pouco e continue." : "Toque em Começar e sustente a vogal.";
  const posicao =
    gravando && leitura && ex.tipo === "pitch" && ex.faixa_hz && leitura.hz !== null ? posicaoNaFaixa(leitura.hz, ex.faixa_hz)
    : gravando && leitura && ex.tipo === "volume" && ex.faixa_db && leitura.db > -60 ? posicaoNaFaixa(leitura.db, ex.faixa_db)
    : null;

  return (
    <div data-testid="pc-exercicio">
      <button type="button" onClick={() => { fecharAudio(); aoSair(); }} disabled={gravando}
        className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-ink-muted hover:text-ink disabled:opacity-40">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar
      </button>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink">{ex.titulo}</h1>
      {ex.instrucao ? <p className="mt-2 text-base text-ink-muted">{ex.instrucao}</p> : null}
      <p className="mt-3 text-sm text-ink-faint" aria-live="polite">
        {terminou ? "Todas as repetições feitas." : `Repetição ${reps.length + 1} de ${ex.repeticoes}`}
        {ex.tipo === "sustentar" && ex.meta_s ? ` · meta ${segundos(ex.meta_s)} s` : ""}
        {ex.tipo !== "sustentar" ? ` · ${segundos(ex.duracao_s ?? 10)} s cada` : ""}
      </p>

      <div className={cn(CARTAO, "mt-4")}>
        {ex.tipo === "sustentar" ? (
          <div className="text-center">
            <p className="text-data font-display text-6xl font-semibold tabular-nums text-ink" data-testid="pc-tempo">
              {fx(tempoTela)}<span className="ml-1 text-2xl text-ink-muted">s</span>
            </p>
            <p className="mt-1 text-sm text-ink-muted" data-testid="pc-legenda">{legendaSustentar}</p>
            {ex.meta_s ? (
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-canvas" aria-hidden>
                <div className="h-full rounded-full bg-accent transition-[width] duration-100" style={{ width: `${Math.min(100, (tempoTela / ex.meta_s) * 100)}%` }} />
              </div>
            ) : null}
          </div>
        ) : (
          <div>
            <p className="text-center text-lg font-medium text-ink" data-testid="pc-posicao">
              {gravando ? (posicao ? TEXTO_POSICAO[ex.tipo][posicao] : "Sem voz")
                : terminou ? "Todas as repetições feitas." : ultima ? `Última: ${textoRepeticao(ultima, ex)}` : "Toque em Começar."}
            </p>
            <p className="text-data mt-1 text-center text-sm text-ink-muted">
              {gravando && leitura
                ? ex.tipo === "pitch"
                  ? leitura.hz !== null ? `${rotuloNota(leitura.hz)} · ${fx(leitura.hz, 0)} Hz` : "—"
                  : `${fx(Math.max(-60, leitura.db), 0)} dBFS`
                : ex.tipo === "pitch" && ex.faixa_hz
                  ? `Faixa: ${fx(ex.faixa_hz.min, 0)}–${fx(ex.faixa_hz.max, 0)} Hz`
                  : ex.faixa_db ? `Faixa: ${fx(ex.faixa_db.min, 0)} a ${fx(ex.faixa_db.max, 0)} dBFS` : ""}
            </p>
            {ex.tipo === "pitch" && ex.faixa_hz ? (
              <Medidor valor={gravando && leitura?.hz ? Math.log2(leitura.hz) : null}
                faixa={{ min: Math.log2(ex.faixa_hz.min), max: Math.log2(ex.faixa_hz.max) }}
                escala={[Math.log2(ex.faixa_hz.min) - 0.6, Math.log2(ex.faixa_hz.max) + 0.6]}
                rotulo="Altura da voz em relação à faixa" />
            ) : ex.faixa_db ? (
              <Medidor valor={gravando && leitura ? Math.max(-60, leitura.db) : null} faixa={ex.faixa_db} escala={[-60, 0]} rotulo="Volume em relação à faixa" />
            ) : null}
            {gravando ? (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas" aria-hidden>
                <div className="h-full bg-ink-muted" style={{ width: `${Math.min(100, ((e?.duracao_s ?? 0) / (ex.duracao_s ?? 10)) * 100)}%` }} />
              </div>
            ) : null}
          </div>
        )}
      </div>

      {reps.length ? (
        <ol className="mt-4 space-y-1 text-sm text-ink-muted" data-testid="pc-reps">
          {reps.map((r, i) => (
            <li key={i}>Repetição {i + 1}: <span className="text-data text-ink">{textoRepeticao(r, ex)}</span></li>
          ))}
        </ol>
      ) : null}
      {erro ? <p className="mt-4 text-sm text-signal-err" role="alert">{erro}</p> : null}

      <div className="mt-6 grid gap-3">
        {gravando ? (
          <Button type="button" size="lg" variant="secondary" onClick={parar} className="h-14 text-base" data-testid="pc-parar">
            <Square className="h-5 w-5" aria-hidden /> Parar
          </Button>
        ) : !terminou ? (
          <Button type="button" size="lg" onClick={() => void comecar()} className="h-14 text-base" data-testid="pc-comecar">
            <Mic className="h-5 w-5" aria-hidden /> {reps.length ? "Próxima repetição" : "Começar"}
          </Button>
        ) : null}
        {!gravando && reps.length ? (
          <Button type="button" size="lg" variant={terminou ? "default" : "ghost"} onClick={() => aoConcluir(reps)} className="h-12" data-testid="pc-concluir">
            {terminou ? "Concluir e salvar" : `Salvar ${reps.length} ${reps.length === 1 ? "repetição" : "repetições"} e sair`}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

type Fase = "carregando" | "sem-link" | "pronto" | "inativo" | "nao-encontrado";

export function PraticaCelular() {
  const [fase, setFase] = useState<Fase>("carregando");
  const [estado, setEstado] = useState<EstadoCelular | null>(null);
  const [online, setOnline] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aberto, setAberto] = useState<number | null>(null);
  const [semEspaco, setSemEspaco] = useState(false);
  const [colado, setColado] = useState("");
  const estadoRef = useRef<EstadoCelular | null>(null);
  const execucao = useRef<Promise<void> | null>(null);
  const deNovo = useRef(false);

  const gravar = useCallback((novo: EstadoCelular) => {
    estadoRef.current = novo;
    setEstado(novo);
    const a = armazem();
    if (a) setSemEspaco(!salvarEstado(a, novo));
  }, []);

  /**
   * Envia tudo o que está na fila. Sempre lê o estado mais recente (estadoRef): uma sessão
   * concluída durante um envio não é sobrescrita e entra na próxima volta do laço.
   * Chamadas durante um envio esperam o mesmo envio terminar.
   */
  const enviar = useCallback((): Promise<void> => {
    if (execucao.current) {
      deNovo.current = true;
      return execucao.current;
    }
    const rodar = async () => {
      setEnviando(true);
      try {
        do {
          deNovo.current = false;
          // 1) filas de links anteriores, cada uma com o próprio token
          for (const grupo of [...(estadoRef.current?.anteriores ?? [])]) {
            try {
              for (let i = 0; i < grupo.fila.length; i += 50) {
                const r = await chamar<RespostaEnvio>("/sessoes", grupo.token, { sessoes: grupo.fila.slice(i, i + 50) });
                gravar(aplicarEnvioAnterior(estadoRef.current!, grupo.token, r.recebidas, r.recusadas.map((x) => x.id)));
              }
            } catch (erro) {
              const falha = falhaDe(erro);
              if (falha === "inativo" || falha === "nao-encontrado") gravar(descartarAnterior(estadoRef.current!, grupo.token));
              else throw erro;
            }
          }
          // 2) fila do link atual, em lotes, até esvaziar
          for (;;) {
            const atual = estadoRef.current;
            if (!atual?.fila.length) break;
            const lote = atual.fila.slice(0, 50);
            const r = await chamar<RespostaEnvio>("/sessoes", atual.token, { sessoes: lote });
            gravar(aplicarEnvio(estadoRef.current!, r.recebidas, r.recusadas.map((x) => x.id)));
            if (!r.recebidas.length && !r.recusadas.length) break; // resposta vazia: não fica em laço
          }
        } while (deNovo.current);
        setOnline(true);
      } catch (erro) {
        const falha = falhaDe(erro);
        if (falha === "sem-rede") setOnline(false);
        else if (falha === "inativo") setFase("inativo");
        else if (falha === "nao-encontrado") setFase("nao-encontrado");
      } finally {
        setEnviando(false);
      }
    };
    // rodar() pode terminar sem nenhum await (fila vazia): a marca de "enviando" só é
    // limpa depois de gravada, senão ficaria presa e nenhum envio aconteceria mais
    const envio: Promise<void> = rodar().finally(() => {
      if (execucao.current === envio) execucao.current = null;
    });
    execucao.current = envio;
    return envio;
  }, [gravar]);

  /** Abre um link (do endereço, guardado ou colado): guarda o segredo e busca o plano. */
  const abrir = useCallback(async (token: string) => {
    const a = armazem();
    let e = estadoParaToken(a ? lerEstado(a) : estadoRef.current, token);
    gravar(e);
    setAviso(null);
    try {
      const plano = await chamar<PlanoPublico>("/plano", token);
      e = { ...estadoRef.current!, plano };
      gravar(e);
      setOnline(true);
      setFase("pronto");
    } catch (erro) {
      const falha = falhaDe(erro);
      if (falha === "inativo") {
        setFase("inativo"); // ainda tenta enviar o que ficou: o servidor aceita por 7 dias depois do fim
      } else if (falha === "nao-encontrado") {
        setFase("nao-encontrado");
      } else {
        setOnline(false);
        setFase(e.plano ? "pronto" : "sem-link");
        if (!e.plano) setAviso("Sem internet. Abra o link uma vez com internet para baixar os exercícios.");
        return;
      }
    }
    await enviar();
  }, [enviar, gravar]);

  // abertura: o segredo vem do endereço (#t=...) ou do que ficou guardado neste celular
  useEffect(() => {
    const doLink = tokenDoEndereco(window.location.hash);
    if (doLink) history.replaceState(null, "", window.location.pathname); // tira o segredo da barra de endereço
    const a = armazem();
    const token = doLink ?? (a ? lerEstado(a)?.token : undefined);
    registrarServiceWorker();
    if (!token) {
      setFase("sem-link");
      return;
    }
    void abrir(token);
  }, [abrir]);

  // link novo aberto com a página já aberta: só o "#" muda e a página não recarrega
  useEffect(() => {
    const mudou = () => {
      const token = tokenDoEndereco(window.location.hash);
      if (!token) return;
      history.replaceState(null, "", window.location.pathname);
      setAberto(null);
      setFase("carregando");
      void abrir(token);
    };
    window.addEventListener("hashchange", mudou);
    return () => window.removeEventListener("hashchange", mudou);
  }, [abrir]);

  // voltou a internet: envia a fila
  useEffect(() => {
    const voltou = () => {
      setOnline(true);
      void enviar();
    };
    const caiu = () => setOnline(false);
    window.addEventListener("online", voltou);
    window.addEventListener("offline", caiu);
    return () => {
      window.removeEventListener("online", voltou);
      window.removeEventListener("offline", caiu);
    };
  }, [enviar]);

  async function concluir(indice: number, reps: RepeticaoMedida[]) {
    const atual = estadoRef.current;
    if (!atual) return;
    const sessao = { id: novoId(), exercicio: indice, feito_em: new Date().toISOString(), repeticoes: reps };
    gravar(registrarSessao(atual, sessao));
    setAberto(null);
    await enviar();
    const foi = !estadoRef.current?.fila.some((x) => x.id === sessao.id);
    setAviso(foi ? "Sessão salva e enviada ao seu fonoaudiólogo." : "Sessão salva neste celular. Ela será enviada quando houver internet.");
  }

  function abrirColado(ev: React.FormEvent) {
    ev.preventDefault();
    const token = tokenDoTexto(colado);
    if (!token) return setAviso("Não encontrei o link na mensagem. Copie a mensagem inteira do seu fonoaudiólogo e cole aqui.");
    setColado("");
    setFase("carregando");
    void abrir(token);
  }

  const plano = estado?.plano;
  const agora = new Date();
  const hoje = estado ? feitasHoje(estado.feitas, agora) : new Map<number, number>();
  const seguidos = estado ? diasSeguidos(estado.feitas, agora) : 0;
  const pendentes = totalPendente(estado);

  return (
    <main id="conteudo-principal" className="mx-auto min-h-[100dvh] w-full max-w-md px-4 pb-10 pt-6" data-testid="pc-pagina">
      {fase === "carregando" ? <p className="mt-10 text-center text-ink-muted" role="status">Carregando seus exercícios…</p> : null}

      {fase === "sem-link" ? (
        <Aviso titulo="Prática em casa" texto="Abra o link que o seu fonoaudiólogo enviou ou cole a mensagem dele aqui.">
          {/* no iPhone, o app da tela inicial não enxerga o que o Safari guardou: colar o link resolve */}
          <form onSubmit={abrirColado} className="mt-4 space-y-3 text-left">
            <label htmlFor="pc-colar" className="block text-sm font-medium text-ink">Link ou mensagem recebida</label>
            <textarea id="pc-colar" value={colado} onChange={(e) => setColado(e.target.value)} rows={3}
              className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              data-testid="pc-colar" />
            <Button type="submit" className="h-12 w-full" disabled={!colado.trim()}>Abrir exercícios</Button>
          </form>
          {aviso ? <p className="mt-3 text-sm text-signal-warn" role="alert">{aviso}</p> : null}
        </Aviso>
      ) : null}
      {fase === "inativo" ? (
        <Aviso titulo="Este link não está mais ativo" texto="O prazo terminou ou o link foi trocado. Peça um novo link ao seu fonoaudiólogo.">
          {pendentes ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-signal-warn" data-testid="pc-pendentes-inativo">
                {pendentes} {pendentes === 1 ? "sessão feita aqui ainda não foi enviada" : "sessões feitas aqui ainda não foram enviadas"}. Elas podem ser enviadas até 7 dias depois do fim do link.
              </p>
              <Button type="button" variant="secondary" className="h-11 w-full" disabled={enviando} onClick={() => void enviar()}>
                {enviando ? "Enviando…" : "Tentar enviar agora"}
              </Button>
            </div>
          ) : estado?.feitas.length ? (
            <p className="mt-3 text-sm text-ink-muted">Todas as sessões feitas neste celular foram enviadas.</p>
          ) : null}
        </Aviso>
      ) : null}
      {fase === "nao-encontrado" ? (
        <Aviso titulo="Link não encontrado" texto="Confira se o link foi copiado inteiro ou peça um novo ao seu fonoaudiólogo." />
      ) : null}

      {fase === "pronto" && plano && aberto !== null && plano.exercicios[aberto] ? (
        <Exercicio ex={plano.exercicios[aberto]} aoSair={() => setAberto(null)} aoConcluir={(reps) => void concluir(aberto, reps)} />
      ) : null}

      {fase === "pronto" && plano && aberto === null ? (
        <>
          <header>
            <p className="text-sm text-ink-muted">Prática em casa</p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-[-0.03em] text-ink">{plano.saudacao ? `Olá, ${plano.saudacao}!` : "Olá!"}</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {seguidos > 1 ? `${seguidos} dias seguidos praticando. ` : ""}Faça os exercícios num lugar silencioso, com o celular a um palmo da boca.
            </p>
          </header>

          {plano.exercicios.length > 0 ? (() => {
            const feitos = plano.exercicios.filter((_, i) => (hoje.get(i) ?? 0) > 0).length;
            const total = plano.exercicios.length;
            return (
              <div className="mt-5" data-testid="pc-progresso">
                <p className="flex items-baseline justify-between text-sm text-ink-muted">
                  <span>Hoje</span>
                  <span><span className="text-data text-base font-semibold text-ink">{feitos}</span> de <span className="text-data">{total}</span> {total === 1 ? "exercício" : "exercícios"}</span>
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas-raised ring-1 ring-inset ring-ink/10"
                  role="progressbar" aria-label="Exercícios feitos hoje" aria-valuemin={0} aria-valuemax={total} aria-valuenow={feitos}>
                  <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${(feitos / total) * 100}%` }} />
                </div>
              </div>
            );
          })() : null}

          <div className={cn("mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ring-1 ring-inset", online ? "ring-ink/10 text-ink-muted" : "ring-signal-warn/40 text-signal-warn")}
            role="status" data-testid="pc-status">
            {!online ? <CloudOff className="h-4 w-4 shrink-0" aria-hidden /> : null}
            <span className="flex-1">
              {!online ? "Sem internet. Pode praticar normalmente; " : ""}
              {pendentes === 0 ? (online ? "Tudo enviado ao seu fonoaudiólogo." : "nada aguardando envio.")
                : `${pendentes} ${pendentes === 1 ? "sessão aguardando" : "sessões aguardando"} envio.`}
            </span>
            {pendentes > 0 ? (
              <Button type="button" variant="ghost" className="h-10 w-10 px-0" disabled={enviando} onClick={() => void enviar()} aria-label="Enviar agora">
                <RefreshCw className={cn("h-4 w-4", enviando && "animate-spin motion-reduce:animate-none")} aria-hidden />
              </Button>
            ) : null}
          </div>
          {aviso ? <p className="mt-3 rounded-xl bg-accent/10 px-3 py-2.5 text-sm text-ink" role="status" data-testid="pc-aviso">{aviso}</p> : null}
          {semEspaco ? <p className="mt-3 text-sm text-signal-err" role="alert">O celular não deixou guardar os resultados. Libere espaço ou saia da navegação anônima.</p> : null}

          <ul className="mt-5 space-y-3">
            {plano.exercicios.map((ex, i) => {
              const vezes = hoje.get(i) ?? 0;
              return (
                <li key={i} className="motion-safe:animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                  <button type="button" onClick={() => { setAviso(null); setAberto(i); }}
                    className="w-full rounded-2xl bg-canvas-raised p-4 text-left ring-1 ring-inset ring-ink/10 transition-colors hover:ring-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    data-testid="pc-cartao">
                    <span className="flex items-start justify-between gap-3">
                      <span className="flex items-baseline gap-3">
                        <span className="text-data text-sm text-accent" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                        <span className="font-display text-lg font-semibold text-ink">{ex.titulo}</span>
                      </span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", vezes ? "bg-accent/15 text-ink" : "text-ink-faint ring-1 ring-inset ring-ink/10")}>
                        {vezes ? `Feito hoje${vezes > 1 ? ` · ${vezes}×` : ""}` : "Hoje: ainda não"}
                      </span>
                    </span>
                    {ex.instrucao ? <span className="mt-1 block text-sm text-ink-muted">{ex.instrucao}</span> : null}
                    <span className="mt-2 block text-xs text-ink-faint">
                      {ex.repeticoes} {ex.repeticoes === 1 ? "repetição" : "repetições"}
                      {ex.tipo !== "sustentar" ? ` de ${segundos(ex.duracao_s ?? 10)} s` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <footer className="mt-8 space-y-3 text-xs text-ink-faint">
            <p>O áudio não sai do celular: só os resultados (tempos e porcentagens) são enviados. Link válido até {new Date(plano.expira_em).toLocaleDateString("pt-BR")}.</p>
            <p>Para abrir sem internet, use “Adicionar à tela inicial” no menu do navegador.</p>
            {pendentes ? (
              <p>Há sessões ainda não enviadas: conecte-se à internet antes de remover os exercícios deste celular.</p>
            ) : (
              <button type="button" className="min-h-[44px] underline underline-offset-2 hover:text-ink-muted"
                onClick={() => {
                  const a = armazem();
                  if (a) apagarEstado(a);
                  estadoRef.current = null;
                  setAviso(null);
                  setEstado(null);
                  setFase("sem-link");
                }}>
                Remover estes exercícios deste celular
              </button>
            )}
          </footer>
        </>
      ) : null}
    </main>
  );
}
