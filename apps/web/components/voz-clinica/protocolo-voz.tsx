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
  ROTULO_TAREFA,
  analisarFala,
  calcularDsi,
  fixoBR,
  listarAvaliacoes,
  type AnaliseFala,
  type Avaliacao,
  type ResultadoDsi,
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
// F0 da fala
// ---------------------------------------------------------------------------

function PainelFala({ paciente, aoSalvar }: { paciente: string; aoSalvar: () => void }) {
  const [tarefa, setTarefa] = useState<TarefaFala>("leitura");
  const [tipoVoz, setTipoVoz] = useState<keyof typeof FAIXAS_F0>("feminina");
  const [gravando, setGravando] = useState(false);
  const [tempo, setTempo] = useState(0);
  const [nivel, setNivel] = useState(0);
  const [gravacao, setGravacao] = useState<GravacaoClinica | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [resultado, setResultado] = useState<AnaliseFala | null>(null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [guardar, setGuardar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [suportado, setSuportado] = useState(true);
  const gravador = useRef<GravadorClinico | null>(null);
  const relogio = useRef<number | null>(null);
  const idTarefa = useId();
  const idTipo = useId();
  const idGuardar = useId();

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

  async function iniciar() {
    setErro(null);
    setResultado(null);
    setSituacao(null);
    setGravacao(null);
    setUrl(null);
    const g = new GravadorClinico({ aoNivel: setNivel, aoLimite: () => void parar(), limiteSegundos: 60 });
    try {
      await g.iniciar();
    } catch (e) {
      setErro(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Permita o uso do microfone no navegador para gravar."
          : friendlyError(e, "Não foi possível abrir o microfone."),
      );
      return;
    }
    gravador.current = g;
    setGravando(true);
    const inicio = performance.now();
    setTempo(0);
    relogio.current = window.setInterval(() => setTempo((performance.now() - inicio) / 1000), 100);
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
  const pct = Math.min(100, Math.round(nivel * 100));

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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {gravando ? (
          <Button type="button" variant="danger" onClick={() => void parar()} data-testid="vc2-fala-parar">
            <Square className="h-4 w-4" aria-hidden /> Parar gravação
          </Button>
        ) : (
          <Button type="button" onClick={() => void iniciar()} disabled={!suportado} data-testid="vc2-fala-gravar">
            <Mic className="h-4 w-4" aria-hidden /> {gravacao ? "Gravar de novo" : "Gravar"}
          </Button>
        )}
        <span className="text-data w-14 text-sm text-ink">{tempo.toFixed(1).replace(".", ",")} s</span>
        <div className="h-2.5 min-w-[8rem] flex-1 overflow-hidden rounded-full bg-canvas-overlay ring-1 ring-inset ring-line"
          role="meter" aria-label="Nível do microfone" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className={cn("h-full transition-[width] duration-75", nivel >= 0.95 ? "bg-signal-err" : "bg-accent")} style={{ width: `${pct}%` }} />
        </div>
      </div>
      {!suportado ? <Erro texto="Este navegador não grava áudio. Use Chrome, Edge, Firefox ou Safari atualizados." /> : null}
      {url ? <audio className="mt-4 w-full" src={url} controls aria-label="Ouvir a gravação da fala" /> : null}

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
      <Erro texto={erro} />
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
// DSI
// ---------------------------------------------------------------------------

type CampoDsi = "tmf_s" | "f0_alta_hz" | "i_baixa_db_spl" | "jitter_pct";
const CAMPOS_DSI: { chave: CampoDsi; rotulo: string; unidade: string; dica: string; max: number }[] = [
  { chave: "tmf_s", rotulo: "Tempo máximo de fonação (TMF)", unidade: "s", max: 120,
    dica: "Melhor de três tentativas de /a/ sustentado o máximo possível (grave na aba Avaliação)." },
  { chave: "f0_alta_hz", rotulo: "F0 mais aguda (F0-alta)", unidade: "Hz", max: 3000,
    dica: "Nota mais aguda alcançada, em qualquer intensidade (fonetograma)." },
  { chave: "i_baixa_db_spl", rotulo: "Intensidade mais fraca (I-baixa)", unidade: "dB SPL", max: 140,
    dica: "Som mais fraco que a pessoa sustenta, medido com decibelímetro a 30 cm da boca. O microfone do computador não mede dB SPL." },
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
      for (const c of ["tmf_s", "f0_alta_hz", "jitter_pct"] as const) {
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
          const s = c.chave === "i_baixa_db_spl" ? undefined : sugestoes[c.chave];
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

/** Protocolo de voz: quadro com a medida mais recente de cada parte, F0 da fala e DSI. */
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
        <FormDsi paciente={paciente} sugestoes={sugestoes} aoSalvar={aoSalvar} />
      </div>
    </div>
  );
}
