"use client";

import { LoaderCircle, Mic, Square } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  FAIXAS_F0,
  ROTULO_DDK,
  ROTULO_TAREFA,
  analisarCepstral,
  analisarDdk,
  analisarFala,
  calcularDsi,
  fixoBR,
  listarAvaliacoes,
  type AnaliseFala,
  type Avaliacao,
  type ResultadoCepstral,
  type ResultadoDdk,
  type ResultadoDsi,
  type TarefaDdk,
  type TarefaFala,
} from "@/lib/voz-clinica-api";
import { GravadorClinico, gravadorSuportado, type GravacaoClinica } from "@/lib/voz-clinica-gravador";
import { TEXTO_LEITURA, linhasProtocolo, posicaoDsi, sugestoesDsi, type SugestoesDsi } from "@/lib/voz-clinica-protocolo";

const PAINEL = "panel-glass rounded-2xl p-4 md:p-5";
const TITULO = "font-display text-lg font-semibold text-ink";
const NOTA = "text-sm text-ink-muted";
const SELECT =
  "h-10 w-full rounded-lg border border-line bg-canvas-raised px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

const INSTRUCAO: Record<TarefaFala, string> = {
  leitura: "Peça a leitura do texto abaixo em voz habitual, sem pressa, como se contasse a alguém.",
  contagem: "Peça a contagem de 1 a 20 em voz habitual, no ritmo de uma conversa.",
  espontanea: "Peça que fale por 20 a 30 segundos sobre a rotina (o que fez ontem, por exemplo).",
};

function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return <p className="mt-3 text-sm text-signal-err" role="alert">{texto}</p>;
}

// ---------------------------------------------------------------------------
// Gravação (comum à fala e à diadococinesia)
// ---------------------------------------------------------------------------

type Gravacao = ReturnType<typeof useGravacao>;

function useGravacao(limiteSegundos: number) {
  const [gravando, setGravando] = useState(false);
  const [tempo, setTempo] = useState(0);
  const [nivel, setNivel] = useState(0);
  const [gravacao, setGravacao] = useState<GravacaoClinica | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [suportado, setSuportado] = useState(true);
  const gravador = useRef<GravadorClinico | null>(null);
  const abrindo = useRef(false);
  const relogio = useRef<number | null>(null);

  useEffect(() => setSuportado(gravadorSuportado()), []);
  useEffect(() => () => {
    if (relogio.current) window.clearInterval(relogio.current);
    void gravador.current?.descartar();
  }, []);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const parar = useCallback(async () => {
    const g = gravador.current;
    if (!g?.gravando) return;
    if (relogio.current) window.clearInterval(relogio.current);
    setGravando(false);
    setNivel(0);
    try {
      const r = await g.parar();
      setGravacao(r);
      setTempo(r.duracao);
      setUrl(URL.createObjectURL(r.wav));
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível finalizar a gravação."));
    }
  }, []);

  const iniciar = useCallback(async () => {
    if (gravador.current?.gravando || abrindo.current) return; // clique duplo não abre dois microfones
    setErro(null);
    setGravacao(null);
    setUrl(null);
    const g = new GravadorClinico({ aoNivel: setNivel, aoLimite: () => void parar(), limiteSegundos });
    gravador.current = g; // a limpeza descarta mesmo durante o pedido de permissão
    abrindo.current = true;
    try {
      await g.iniciar();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setErro(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Permita o uso do microfone no navegador para gravar."
          : friendlyError(e, "Não foi possível abrir o microfone."),
      );
      return;
    } finally {
      abrindo.current = false;
    }
    setGravando(true);
    const inicio = performance.now();
    setTempo(0);
    relogio.current = window.setInterval(() => setTempo((performance.now() - inicio) / 1000), 100);
  }, [limiteSegundos, parar]);

  return { gravando, tempo, nivel, gravacao, url, erro, suportado, iniciar, parar };
}

function ControlesGravacao({ g, onIniciar, prefixo, rotuloAudio }: { g: Gravacao; onIniciar: () => void; prefixo: string; rotuloAudio: string }) {
  const pct = Math.min(100, Math.round(g.nivel * 100));
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {g.gravando ? (
          <Button type="button" variant="danger" onClick={() => void g.parar()} data-testid={`${prefixo}-parar`}>
            <Square className="h-4 w-4" aria-hidden /> Parar gravação
          </Button>
        ) : (
          <Button type="button" onClick={onIniciar} disabled={!g.suportado} data-testid={`${prefixo}-gravar`}>
            <Mic className="h-4 w-4" aria-hidden /> {g.gravacao ? "Gravar de novo" : "Gravar"}
          </Button>
        )}
        <span className="text-data w-14 text-sm text-ink">{g.tempo.toFixed(1).replace(".", ",")} s</span>
        <div className="h-2.5 min-w-[8rem] flex-1 overflow-hidden rounded-full bg-canvas-overlay ring-1 ring-inset ring-line"
          role="meter" aria-label="Nível do microfone" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className={cn("h-full transition-[width] duration-75", g.nivel >= 0.95 ? "bg-signal-err" : "bg-accent")} style={{ width: `${pct}%` }} />
        </div>
      </div>
      {!g.suportado ? <Erro texto="Este navegador não grava áudio. Use Chrome, Edge, Firefox ou Safari atualizados." /> : null}
      {g.url ? <audio className="mt-4 w-full" src={g.url} controls aria-label={rotuloAudio} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// F0 da fala
// ---------------------------------------------------------------------------

function PainelFala({ paciente, aoSalvar }: { paciente: string; aoSalvar: () => void }) {
  const [tarefa, setTarefa] = useState<TarefaFala>("leitura");
  const [tipoVoz, setTipoVoz] = useState<keyof typeof FAIXAS_F0>("feminina");
  const g = useGravacao(60);
  const [analisando, setAnalisando] = useState(false);
  const [resultado, setResultado] = useState<AnaliseFala | null>(null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [guardar, setGuardar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const idTarefa = useId();
  const idTipo = useId();
  const idGuardar = useId();
  const { gravando, gravacao } = g;

  function iniciar() {
    setErro(null);
    setResultado(null);
    setSituacao(null);
    void g.iniciar();
  }

  async function analisar() {
    if (!gravacao) return;
    setAnalisando(true);
    setErro(null);
    setSituacao(null);
    try {
      const faixa = FAIXAS_F0[tipoVoz];
      // na fala a voz sobe menos que no canto: teto de 500 Hz reduz erros de oitava
      const r = await analisarFala(gravacao.wav, { f0Min: faixa.f0Min, f0Max: Math.min(faixa.f0Max, 500), tarefa, paciente, guardarAudio: guardar });
      setResultado(r.resultado);
      setSituacao(r.aviso_audio ?? (r.audio_guardado ? "Gravação guardada no histórico." : null));
      if (r.avaliacao_id) aoSalvar();
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível analisar a gravação."));
    } finally {
      setAnalisando(false);
    }
  }

  const f = resultado?.f0;
  const linhas: [string, string][] = f && resultado?.fala
    ? [
        ["F0 mediana (habitual)", `${fixoBR(f.mediana_hz, 1)} Hz · ${f.nota_mediana}`],
        ["F0 média", `${fixoBR(f.media_hz, 1)} Hz`],
        ["Variação (desvio-padrão)", `${fixoBR(f.dp_hz, 1)} Hz · ${fixoBR(f.dp_semitons, 2)} st`],
        ["Faixa usada (p5–p95)", `${fixoBR(f.p5_hz, 0)}–${fixoBR(f.p95_hz, 0)} Hz · ${fixoBR(f.faixa_semitons, 1)} st`],
        ["Tempo com voz", `${fixoBR(resultado.fala.tempo_vozeado_s, 1)} s (${fixoBR(resultado.fala.fracao_vozeada_pct, 0)}% da gravação)`],
        ["Pausas (≥ 250 ms)", fixoBR(resultado.fala.pausas, 0)],
        ["Intensidade média", `${fixoBR(resultado.fala.intensidade_media_dbfs, 1)} dBFS`],
      ]
    : [];
  return (
    <section className={PAINEL} aria-labelledby="vc2-fala">
      <h2 id="vc2-fala" className={TITULO}>F0 da fala</h2>
      <p className={cn(NOTA, "mt-1")}>
        Altura habitual da voz e quanto ela varia na fala encadeada. Grave 15 a 30 segundos, com o mesmo microfone e distância da vogal sustentada.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={idTarefa}>Tarefa</Label>
          <select id={idTarefa} className={cn(SELECT, "mt-1")} value={tarefa} disabled={gravando}
            onChange={(e) => setTarefa(e.target.value as TarefaFala)} data-testid="vc2-fala-tarefa">
            {(Object.keys(ROTULO_TAREFA) as TarefaFala[]).map((t) => <option key={t} value={t}>{ROTULO_TAREFA[t]}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor={idTipo}>Tipo de voz</Label>
          <select id={idTipo} className={cn(SELECT, "mt-1")} value={tipoVoz} disabled={gravando}
            onChange={(e) => setTipoVoz(e.target.value as keyof typeof FAIXAS_F0)}>
            {Object.entries(FAIXAS_F0).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </select>
        </div>
      </div>
      <p className="mt-3 text-sm text-ink">{INSTRUCAO[tarefa]}</p>
      {tarefa === "leitura" ? (
        <blockquote className="mt-2 max-w-[70ch] rounded-xl bg-canvas-raised/60 px-4 py-3 text-base leading-relaxed text-ink ring-1 ring-inset ring-ink/10" data-testid="vc2-fala-texto">
          {TEXTO_LEITURA}
        </blockquote>
      ) : null}

      <ControlesGravacao g={g} onIniciar={iniciar} prefixo="vc2-fala" rotuloAudio="Ouvir a gravação da fala" />

      <div className="mt-4">
        <Button type="button" onClick={() => void analisar()} disabled={!gravacao || gravacao.duracao < 1 || analisando || gravando} data-testid="vc2-fala-analisar">
          {analisando ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {analisando ? "Analisando…" : "Analisar a fala"}
        </Button>
        {paciente ? (
          <label htmlFor={idGuardar} className="mt-3 flex items-start gap-2 text-sm text-ink-muted">
            <input id={idGuardar} type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} />
            <span>Guardar a gravação no histórico (conta no espaço de armazenamento do plano)</span>
          </label>
        ) : (
          <p className="mt-2 text-xs text-ink-faint">Sem nome de paciente, o resultado aparece aqui mas não fica salvo.</p>
        )}
      </div>
      {situacao ? <p className="mt-2 text-xs text-ink-muted" role="status">{situacao}</p> : null}
      <Erro texto={g.erro ?? erro} />
      {resultado && !f ? <Erro texto={resultado.avisos[0] ?? "Não foi encontrada voz suficiente."} /> : null}
      {linhas.length ? (
        <div className="mt-4" aria-live="polite">
          <table className="w-full text-sm" data-testid="vc2-fala-tabela">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-faint">
                <th className="py-2 font-medium">Medida</th>
                <th className="py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(([m, v]) => (
                <tr key={m} className="border-b border-ink/[0.06]">
                  <td className="py-2 text-ink-muted">{m}</td>
                  <td className="text-data py-2 text-right text-ink">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-3 space-y-1" role="status">
            {resultado?.avisos.map((a) => <li key={a} className="text-xs text-signal-warn">{a}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Diadococinesia (DDK)
// ---------------------------------------------------------------------------

const INSTRUCAO_DDK: Record<TarefaDdk, string> = {
  pa: "Respire e repita /pa/ o mais rápido e claro que conseguir, sem parar, por 5 a 10 segundos.",
  ta: "Respire e repita /ta/ o mais rápido e claro que conseguir, sem parar, por 5 a 10 segundos.",
  ka: "Respire e repita /ka/ o mais rápido e claro que conseguir, sem parar, por 5 a 10 segundos.",
  pataka: "Respire e repita /pataka/ o mais rápido e claro que conseguir, sem parar, por 5 a 10 segundos.",
};

/** Cada sílaba vira um traço: espaçamento mostra o ritmo, altura mostra a intensidade relativa. */
function RitmoSilabas({ picos, niveis }: { picos: number[]; niveis: number[] }) {
  if (picos.length < 2) return null;
  const t0 = picos[0]!;
  const dur = Math.max(picos[picos.length - 1]! - t0, 1e-3);
  return (
    <figure className="mt-4">
      <svg viewBox="0 0 600 64" preserveAspectRatio="none" className="h-16 w-full rounded-lg bg-canvas-raised/60 ring-1 ring-inset ring-ink/10"
        role="img" aria-label={`${picos.length} sílabas em ${fixoBR(dur, 1)} segundos; cada traço é uma sílaba`}>
        {picos.map((p, i) => {
          const x = 10 + ((p - t0) / dur) * 580;
          const h = Math.max(6, 54 * (1 + Math.max(-20, niveis[i] ?? 0) / 20));
          return <line key={i} x1={x} x2={x} y1={60} y2={60 - h} stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      <figcaption className="mt-1 text-xs text-ink-faint">Cada traço é uma sílaba: espaços iguais = ritmo regular; alturas iguais = intensidade estável.</figcaption>
    </figure>
  );
}

function PainelDdk({ paciente, aoSalvar }: { paciente: string; aoSalvar: () => void }) {
  const [tarefa, setTarefa] = useState<TarefaDdk>("pa");
  const g = useGravacao(20);
  const [analisando, setAnalisando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDdk | null>(null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [guardar, setGuardar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const idTarefa = useId();
  const idGuardar = useId();

  function iniciar() {
    setErro(null);
    setResultado(null);
    setSituacao(null);
    void g.iniciar();
  }

  async function analisar() {
    if (!g.gravacao) return;
    setAnalisando(true);
    setErro(null);
    setSituacao(null);
    try {
      const r = await analisarDdk(g.gravacao.wav, { tarefa, paciente, guardarAudio: guardar });
      setResultado(r.resultado);
      setSituacao(r.aviso_audio ?? (r.audio_guardado ? "Gravação guardada no histórico." : null));
      if (r.avaliacao_id) aoSalvar();
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível analisar a gravação."));
    } finally {
      setAnalisando(false);
    }
  }

  const d = resultado;
  const linhas: [string, string][] = d?.silabas != null
    ? [
        ["Taxa", `${fixoBR(d.taxa_silabas_s, 1)} sílabas/s`],
        ["Sílabas", `${d.silabas} em ${fixoBR(d.tempo_repeticao_s, 1)} s`],
        ["Intervalo entre sílabas", `${fixoBR(d.intervalo_medio_ms, 0)} ms (DP ${fixoBR(d.intervalo_dp_ms, 0)} ms)`],
        ["Irregularidade do ritmo (CV)", `${fixoBR(d.intervalo_cv_pct, 1)} %`],
        ["Variação da intensidade (DP)", `${fixoBR(d.intensidade_dp_db, 1)} dB`],
        ["Taxa no início → no fim", `${fixoBR(d.taxa_inicio_silabas_s, 1)} → ${fixoBR(d.taxa_fim_silabas_s, 1)} sílabas/s`],
      ]
    : [];

  return (
    <section className={PAINEL} aria-labelledby="vc2-ddk">
      <h2 id="vc2-ddk" className={TITULO}>Diadococinesia (DDK)</h2>
      <p className={cn(NOTA, "mt-1")}>
        Velocidade e regularidade da articulação: /pa/, /ta/ e /ka/ isolados (ritmo alternado) e /pataka/ (sequência).
      </p>
      <div className="mt-4 max-w-xs">
        <Label htmlFor={idTarefa}>Tarefa</Label>
        <select id={idTarefa} className={cn(SELECT, "mt-1")} value={tarefa} disabled={g.gravando}
          onChange={(e) => setTarefa(e.target.value as TarefaDdk)} data-testid="vc2-ddk-tarefa">
          {(Object.keys(ROTULO_DDK) as TarefaDdk[]).map((k) => <option key={k} value={k}>{ROTULO_DDK[k]}</option>)}
        </select>
      </div>
      <p className="mt-3 text-sm text-ink">{INSTRUCAO_DDK[tarefa]}</p>
      <ControlesGravacao g={g} onIniciar={iniciar} prefixo="vc2-ddk" rotuloAudio="Ouvir a gravação da diadococinesia" />
      <div className="mt-4">
        <Button type="button" onClick={() => void analisar()} disabled={!g.gravacao || g.gravacao.duracao < 1 || analisando || g.gravando} data-testid="vc2-ddk-analisar">
          {analisando ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {analisando ? "Analisando…" : "Analisar sílabas"}
        </Button>
        {paciente ? (
          <label htmlFor={idGuardar} className="mt-3 flex items-start gap-2 text-sm text-ink-muted">
            <input id={idGuardar} type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} />
            <span>Guardar a gravação no histórico (conta no espaço de armazenamento do plano)</span>
          </label>
        ) : (
          <p className="mt-2 text-xs text-ink-faint">Sem nome de paciente, o resultado aparece aqui mas não fica salvo.</p>
        )}
      </div>
      {situacao ? <p className="mt-2 text-xs text-ink-muted" role="status">{situacao}</p> : null}
      <Erro texto={g.erro ?? erro} />
      {d && d.silabas == null ? <Erro texto={d.avisos[0] ?? "Não foram encontradas sílabas."} /> : null}
      {linhas.length ? (
        <div className="mt-4" aria-live="polite">
          <table className="w-full text-sm" data-testid="vc2-ddk-tabela">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-faint">
                <th className="py-2 font-medium">Medida</th>
                <th className="py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(([m, v]) => (
                <tr key={m} className="border-b border-ink/[0.06]">
                  <td className="py-2 text-ink-muted">{m}</td>
                  <td className="text-data py-2 text-right text-ink">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <RitmoSilabas picos={d?.picos_s ?? []} niveis={d?.picos_db ?? []} />
          <ul className="mt-3 space-y-1" role="status">
            {d?.avisos.map((a) => <li key={a} className="text-xs text-signal-warn">{a}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Análise cepstral (VoxMetria 5) e AVQI
// ---------------------------------------------------------------------------

const FRASE_CEPSTRAL = "Olha lá o avião azul.";

function PainelCepstral({ paciente, aoSalvar }: { paciente: string; aoSalvar: () => void }) {
  const gv = useGravacao(15);
  const gf = useGravacao(15);
  const [analisando, setAnalisando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCepstral | null>(null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [guardar, setGuardar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const idGuardar = useId();
  const ocupado = gv.gravando || gf.gravando;

  async function analisar() {
    if (!gv.gravacao || !gf.gravacao) return;
    setAnalisando(true);
    setErro(null);
    setSituacao(null);
    try {
      const r = await analisarCepstral(gv.gravacao.wav, gf.gravacao.wav, { paciente, guardarAudio: guardar });
      setResultado(r.resultado);
      setSituacao(r.aviso_audio ?? (r.audio_guardado ? "Gravações guardadas no histórico (vogal e frase num só arquivo)." : null));
      if (r.avaliacao_id) aoSalvar();
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível analisar as gravações."));
    } finally {
      setAnalisando(false);
    }
  }

  const r = resultado;
  const avqi = r?.avqi;
  return (
    <section className={PAINEL} aria-labelledby="vc2-cepstral">
      <h2 id="vc2-cepstral" className={TITULO}>Análise cepstral</h2>
      <p className={cn(NOTA, "mt-1")}>
        CPP e CPPS da vogal e da frase, como no VoxMetria, e o AVQI (índice acústico de qualidade vocal), que junta as duas.
      </p>
      <ol className="mt-4 space-y-5">
        <li>
          <p className="text-sm font-medium text-ink">1. Vogal /ɛ/ (&ldquo;é&rdquo;) sustentada, 3 a 5 s, em altura e intensidade habituais</p>
          <ControlesGravacao g={gv} onIniciar={() => { setResultado(null); void gv.iniciar(); }} prefixo="vc2-cep-vogal" rotuloAudio="Ouvir a vogal" />
        </li>
        <li>
          <p className="text-sm font-medium text-ink">2. Frase, em voz habitual:</p>
          <blockquote className="mt-1 rounded-xl bg-canvas-raised/60 px-4 py-2 text-base text-ink ring-1 ring-inset ring-ink/10">{FRASE_CEPSTRAL}</blockquote>
          <ControlesGravacao g={gf} onIniciar={() => { setResultado(null); void gf.iniciar(); }} prefixo="vc2-cep-frase" rotuloAudio="Ouvir a frase" />
        </li>
      </ol>
      <div className="mt-4">
        <Button type="button" onClick={() => void analisar()} disabled={!gv.gravacao || !gf.gravacao || analisando || ocupado} data-testid="vc2-cep-analisar">
          {analisando ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {analisando ? "Analisando…" : "Analisar vogal e frase"}
        </Button>
        {paciente ? (
          <label htmlFor={idGuardar} className="mt-3 flex items-start gap-2 text-sm text-ink-muted">
            <input id={idGuardar} type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} />
            <span>Guardar as gravações no histórico (conta no espaço de armazenamento do plano)</span>
          </label>
        ) : (
          <p className="mt-2 text-xs text-ink-faint">Sem nome de paciente, o resultado aparece aqui mas não fica salvo.</p>
        )}
      </div>
      {situacao ? <p className="mt-2 text-xs text-ink-muted" role="status">{situacao}</p> : null}
      <Erro texto={gv.erro ?? gf.erro ?? erro} />
      {r ? (
        <div className="mt-4" aria-live="polite">
          <table className="w-full text-sm" data-testid="vc2-cep-tabela">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-faint">
                <th className="py-2 font-medium">Medida</th>
                <th className="py-2 text-right font-medium">Vogal</th>
                <th className="py-2 text-right font-medium">Frase</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-ink/[0.06]">
                <td className="py-2 text-ink-muted">CPP</td>
                <td className="text-data py-2 text-right text-ink">{fixoBR(r.vogal.cpp_db, 1)} dB</td>
                <td className="text-data py-2 text-right text-ink">{fixoBR(r.frase.cpp_db, 1)} dB</td>
              </tr>
              <tr className="border-b border-ink/[0.06]">
                <td className="py-2 text-ink-muted">CPPS</td>
                <td className="text-data py-2 text-right text-ink">{fixoBR(r.vogal.cpps_db, 1)} dB</td>
                <td className="text-data py-2 text-right text-ink">{fixoBR(r.frase.cpps_db, 1)} dB</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-faint">Valores maiores indicam voz mais periódica. Na frase o CPPS é naturalmente menor: compare vogal com vogal e frase com frase, entre sessões.</p>
          {avqi ? (
            <div className="mt-4" data-testid="vc2-avqi">
              <p className="text-sm text-ink">
                AVQI <strong className="text-data text-lg">{fixoBR(avqi.valor, 2)}</strong>
                <span className="ml-2 text-xs text-ink-muted">versão {avqi.versao}</span>
              </p>
              <div className="relative mt-3 h-2.5 rounded-full bg-gradient-to-r from-signal-ok/70 via-signal-warn/70 to-signal-err/70" aria-hidden>
                <span className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-canvas"
                  style={{ left: `${Math.max(0, Math.min(100, avqi.valor * 10))}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-ink-faint">
                <span>0 menos desvio</span>
                <span>10 mais desvio</span>
              </div>
              <details className="mt-2 text-xs text-ink-muted">
                <summary className="cursor-pointer">Medidas usadas no AVQI</summary>
                <p className="text-data mt-1">
                  CPPS {fixoBR(avqi.componentes.cpps_db, 2)} dB · HNR {fixoBR(avqi.componentes.hnr_db, 2)} dB · shimmer {fixoBR(avqi.componentes.shimmer_pct, 2)}% / {fixoBR(avqi.componentes.shimmer_db, 3)} dB · slope {fixoBR(avqi.componentes.slope_db, 2)} dB · tilt {fixoBR(avqi.componentes.tilt_db, 2)} dB · {fixoBR(avqi.duracao_analisada_s, 1)} s analisados
                </p>
              </details>
              <p className="mt-2 text-xs text-ink-faint">
                O ponto de corte do AVQI depende da língua e do protocolo de gravação; use-o para acompanhar o mesmo paciente. Não é o DAI do VoxMetria, cuja fórmula não é publicada. Não é diagnóstico médico.
              </p>
            </div>
          ) : null}
          <ul className="mt-3 space-y-1" role="status">
            {r.avisos.map((a) => <li key={a} className="text-xs text-signal-warn">{a}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// DSI
// ---------------------------------------------------------------------------

type CampoDsi = "tmf_s" | "f0_alta_hz" | "i_baixa_db_spl" | "jitter_pct";
const CAMPOS_DSI: { chave: CampoDsi; rotulo: string; unidade: string; dica: string; max: number }[] = [
  { chave: "tmf_s", rotulo: "Tempo máximo de fonação (TMF)", unidade: "s", max: 120,
    dica: "Melhor de três tentativas de /a/ sustentado o máximo possível (grave na aba Avaliação)." },
  { chave: "f0_alta_hz", rotulo: "F0 mais aguda (F0-alta)", unidade: "Hz", max: 3000,
    dica: "Nota mais aguda alcançada, em qualquer intensidade (fonetograma)." },
  { chave: "i_baixa_db_spl", rotulo: "Intensidade mais fraca (I-baixa)", unidade: "dB SPL", max: 140,
    dica: "Som mais fraco que a pessoa sustenta, a 30 cm da boca, em dB SPL: decibelímetro ou fonetograma com o microfone calibrado (aba Fonetograma)." },
  { chave: "jitter_pct", rotulo: "Jitter local", unidade: "%", max: 100,
    dica: "Da vogal /a/ sustentada em altura e intensidade confortáveis." },
];

function numero(texto: string): number | null {
  const v = Number(texto.trim().replace(",", "."));
  return texto.trim() !== "" && Number.isFinite(v) ? v : null;
}

function FormDsi({ paciente, sugestoes, aoSalvar }: { paciente: string; sugestoes: SugestoesDsi; aoSalvar: () => void }) {
  const [valores, setValores] = useState<Record<CampoDsi, string>>({ tmf_s: "", f0_alta_hz: "", i_baixa_db_spl: "", jitter_pct: "" });
  const [mexidos, setMexidos] = useState<Set<CampoDsi>>(new Set());
  const [resultado, setResultado] = useState<ResultadoDsi | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const base = useId();

  // preenche com o histórico só os campos que o profissional ainda não editou
  useEffect(() => {
    setValores((atual) => {
      const novo = { ...atual };
      for (const c of ["tmf_s", "f0_alta_hz", "i_baixa_db_spl", "jitter_pct"] as const) {
        const s = sugestoes[c];
        if (s && !mexidos.has(c)) novo[c] = String(s.valor).replace(".", ",");
      }
      return novo;
    });
  }, [sugestoes, mexidos]);

  const faltando = CAMPOS_DSI.filter((c) => numero(valores[c.chave]) === null);

  async function calcular(e: React.FormEvent) {
    e.preventDefault();
    if (faltando.length) {
      setErro(`Preencha: ${faltando.map((c) => c.rotulo).join(", ")}.`);
      return;
    }
    setCalculando(true);
    setErro(null);
    try {
      const entrada = Object.fromEntries(CAMPOS_DSI.map((c) => [c.chave, numero(valores[c.chave]) as number])) as ResultadoDsi["entradas"];
      const r = await calcularDsi(entrada, paciente);
      setResultado(r.resultado);
      setSalvo(!!r.avaliacao_id);
      if (r.avaliacao_id) aoSalvar();
    } catch (e2) {
      setErro(friendlyError(e2, "Não foi possível calcular o DSI."));
    } finally {
      setCalculando(false);
    }
  }

  return (
    <section className={PAINEL} aria-labelledby="vc2-dsi">
      <h2 id="vc2-dsi" className={TITULO}>DSI — índice de gravidade da disfonia</h2>
      <p className={cn(NOTA, "mt-1")}>
        DSI = 0,13 × TMF + 0,0053 × F0-alta − 0,26 × I-baixa − 1,18 × jitter + 12,4 (Wuyts et al., 2000). Os campos vêm do histórico quando há medida; confira antes de calcular.
      </p>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(e) => void calcular(e)} data-testid="vc2-form-dsi" noValidate>
        {CAMPOS_DSI.map((c) => {
          const id = `${base}-${c.chave}`;
          const s = sugestoes[c.chave];
          return (
            <div key={c.chave}>
              <Label htmlFor={id}>{c.rotulo} ({c.unidade})</Label>
              <Input
                id={id}
                className="mt-1"
                inputMode="decimal"
                autoComplete="off"
                value={valores[c.chave]}
                aria-describedby={`${id}-dica`}
                onChange={(e) => {
                  const v = e.target.value;
                  setValores((a) => ({ ...a, [c.chave]: v }));
                  setMexidos((m) => new Set(m).add(c.chave));
                }}
                data-testid={`vc2-dsi-${c.chave}`}
              />
              <p id={`${id}-dica`} className="mt-1 text-xs text-ink-faint">
                {s ? <span className="text-ink-muted">Do histórico: {s.origem}. </span> : null}
                {c.dica}
              </p>
            </div>
          );
        })}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={calculando} data-testid="vc2-dsi-calcular">
            {calculando ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Calcular DSI
          </Button>
        </div>
      </form>
      <Erro texto={erro} />
      {resultado ? (
        <div className="mt-4" aria-live="polite" data-testid="vc2-dsi-resultado">
          <p className="text-sm text-ink">
            DSI <strong className="text-data text-lg">{fixoBR(resultado.dsi, 2)}</strong>
            {salvo ? <span className="ml-2 text-xs text-ink-muted">salvo no histórico</span> : null}
          </p>
          <div className="relative mt-3 h-2.5 rounded-full bg-gradient-to-r from-signal-err/70 via-signal-warn/70 to-signal-ok/70" aria-hidden>
            <span className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-canvas" style={{ left: `${posicaoDsi(resultado.dsi)}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-ink-faint">
            <span>−5 disfonia grave</span>
            <span>+5 voz normal</span>
          </div>
          <p className="mt-2 text-xs text-ink-faint">Interprete junto com a avaliação perceptiva e a laringológica. Não é diagnóstico médico.</p>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Aba
// ---------------------------------------------------------------------------

/** Protocolo de voz: quadro com a medida mais recente de cada parte, F0 da fala, DSI e diadococinesia. */
export function ProtocoloVoz({ paciente, versao, aoSalvar }: { paciente: string; versao: number; aoSalvar: () => void }) {
  const [itens, setItens] = useState<Avaliacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const pedido = useRef(0);

  useEffect(() => {
    setItens([]);
    if (!paciente) return;
    const meu = ++pedido.current;
    const t = window.setTimeout(() => {
      listarAvaliacoes(paciente)
        .then((r) => meu === pedido.current && (setItens(r.items), setErro(null)))
        .catch((e) => meu === pedido.current && setErro(friendlyError(e, "Não foi possível carregar o histórico.")));
    }, 300);
    return () => window.clearTimeout(t);
  }, [paciente, versao]);

  const [sugestoes, setSugestoes] = useState<SugestoesDsi>({});
  useEffect(() => setSugestoes(sugestoesDsi(itens)), [itens]);
  const linhas = linhasProtocolo(itens);
  const grupos = [...new Set(linhas.map((l) => l.grupo))];

  return (
    <div className="space-y-5">
      <section className={PAINEL} aria-labelledby="vc2-protocolo">
        <h2 id="vc2-protocolo" className={TITULO}>Protocolo de voz{paciente ? ` — ${paciente}` : ""}</h2>
        <p className={cn(NOTA, "mt-1")}>A medida mais recente de cada parte da avaliação. O que ainda não foi feito aparece com —.</p>
        {!paciente ? (
          <p className="mt-4 text-sm text-ink-muted">Preencha o nome do paciente para montar o protocolo.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <Erro texto={erro} />
            <table className="w-full min-w-[28rem] text-sm" data-testid="vc2-protocolo-quadro">
              <tbody>
                {grupos.map((g) => (
                  linhas.filter((l) => l.grupo === g).map((l, i) => (
                    <tr key={`${g}-${l.medida}`} className="border-b border-ink/[0.06]">
                      <th scope="row" className="w-40 py-2 pr-3 text-left align-top text-xs font-medium uppercase tracking-wide text-ink-faint">{i === 0 ? g : ""}</th>
                      <td className="py-2 text-ink-muted">{l.medida}</td>
                      <td className={cn("text-data py-2 text-right", l.data ? "text-ink" : "text-ink-faint")}>{l.valor}</td>
                      <td className="text-data hidden py-2 pl-4 text-right text-xs text-ink-faint sm:table-cell">{l.data ?? ""}</td>
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <PainelFala paciente={paciente} aoSalvar={aoSalvar} />
        <FormDsi key={paciente} paciente={paciente} sugestoes={sugestoes} aoSalvar={aoSalvar} />
        <PainelDdk paciente={paciente} aoSalvar={aoSalvar} />
        <PainelCepstral paciente={paciente} aoSalvar={aoSalvar} />
      </div>
    </div>
  );
}
