"use client";

import { Download, FileText, History, LoaderCircle, Mic, NotebookPen, Square, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { AnamneseVocal } from "@/components/voz-clinica/anamnese";
import { BiofeedbackAoVivo } from "@/components/voz-clinica/biofeedback-ao-vivo";
import { Espectrograma } from "@/components/voz-clinica/espectrograma";
import { Fonetograma } from "@/components/voz-clinica/fonetograma";
import { JogosTerapia } from "@/components/voz-clinica/jogos-terapia";
import { PraticaCasa } from "@/components/voz-clinica/pratica-casa";
import { CadastroPacienteForm } from "@/components/voz-clinica/cadastro-paciente";
import { DiagramaDesvio } from "@/components/voz-clinica/diagrama-desvio";
import { FerramentasPraat } from "@/components/voz-clinica/ferramentas-praat";
import { MidiasPaciente } from "@/components/voz-clinica/midias-paciente";
import { Eletroglotografia } from "@/components/voz-clinica/eletroglotografia";
import { Nasalancia } from "@/components/voz-clinica/nasalancia";
import { SessoesTerapia } from "@/components/voz-clinica/sessoes-terapia";
import { montarDocxClinico, nomeArquivoDocx } from "@/lib/voz-clinica-docx";
import { EditorAudio } from "@/components/voz-clinica/editor-audio";
import { CargaVocal } from "@/components/voz-clinica/carga-vocal";
import { ComparacaoAntesDepois } from "@/components/voz-clinica/comparacao";
import { ComparacaoFonetogramas } from "@/components/voz-clinica/comparacao-campo";
import { GraficosAnalise } from "@/components/voz-clinica/graficos-analise";
import { ProtocoloVoz } from "@/components/voz-clinica/protocolo-voz";
import { GraficoEvolucao } from "@/components/voz-clinica/grafico-evolucao";
import { MAX_PONTOS, seriesEvolucao } from "@/lib/voz-clinica-evolucao";
import { imprimirRelatorioClinico } from "@/lib/voz-clinica-relatorio";
import { GravadorClinico, gravadorSuportado, type GravacaoClinica } from "@/lib/voz-clinica-gravador";
import { importarAudio } from "@/lib/voz-clinica-importar";
import { historicoCsv } from "@/lib/voz-clinica-planilha";
import {
  FAIXAS_F0,
  OPCOES_PERCEPTIVA,
  ROTULO_TIPO,
  analisarGravacao,
  anotarAvaliacao,
  calcularProtocolo,
  excluirAvaliacao,
  excluirPaciente,
  exportarPaciente,
  exportarPacienteZip,
  linhasAcusticas,
  listarAvaliacoes,
  listarPacientes,
  obterCadastro,
  resumoCadastro,
  resumoAvaliacao,
  resumoProtocolo,
  type AnaliseAcustica,
  type Avaliacao,
  type PacienteResumo,
  type Protocolo,
} from "@/lib/voz-clinica-api";

const PAINEL = "panel-glass rounded-2xl p-4 md:p-5";
const TITULO = "font-display text-lg font-semibold text-ink";
const NOTA = "text-sm text-ink-muted";
const SELECT =
  "h-10 w-full rounded-lg border border-line bg-canvas-raised px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

function Avisos({ itens }: { itens: string[] }) {
  if (!itens.length) return null;
  return (
    <ul className="mt-3 space-y-1" role="status">
      {itens.map((a) => (
        <li key={a} className="text-xs text-signal-warn">
          {a}
        </li>
      ))}
    </ul>
  );
}

function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p className="mt-3 text-sm text-signal-err" role="alert">
      {texto}
    </p>
  );
}

function formatarData(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Gravação e análise acústica
// ---------------------------------------------------------------------------

function PainelAcustico({ paciente, aoSalvar }: { paciente: string; aoSalvar: () => void }) {
  const [tipoVoz, setTipoVoz] = useState<keyof typeof FAIXAS_F0>("feminina");
  const [gravando, setGravando] = useState(false);
  const [tempo, setTempo] = useState(0);
  const [nivel, setNivel] = useState(0);
  const [gravacao, setGravacao] = useState<GravacaoClinica | null>(null);
  const [urlAudio, setUrlAudio] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [resultado, setResultado] = useState<AnaliseAcustica | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [guardarAudio, setGuardarAudio] = useState(true);
  const [situacaoAudio, setSituacaoAudio] = useState<string | null>(null);
  const [suportado, setSuportado] = useState(true);
  const gravador = useRef<GravadorClinico | null>(null);
  const abrindo = useRef(false);
  const relogio = useRef<number | null>(null);
  const idTipo = useId();
  const idGuardar = useId();
  const idArquivo = useId();

  function usar(g: GravacaoClinica) {
    setGravacao(g);
    setTempo(g.duracao);
    setUrlAudio(URL.createObjectURL(g.wav));
  }

  async function importar(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setResultado(null);
    setSituacaoAudio(null);
    try {
      usar(await importarAudio(arquivo));
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível abrir o arquivo."));
    }
  }


  useEffect(() => setSuportado(gravadorSuportado()), []);
  useEffect(() => () => {
    if (relogio.current) window.clearInterval(relogio.current);
    void gravador.current?.descartar();
  }, []);
  useEffect(() => () => {
    if (urlAudio) URL.revokeObjectURL(urlAudio);
  }, [urlAudio]);

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
      setUrlAudio(URL.createObjectURL(r.wav));
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível finalizar a gravação."));
    }
  }, []);

  async function iniciar() {
    if (gravador.current?.gravando || abrindo.current) return; // clique duplo não abre dois microfones
    setErro(null);
    setResultado(null);
    setGravacao(null);
    setUrlAudio(null);
    const g = new GravadorClinico({
      aoNivel: (p) => setNivel(p),
      aoLimite: () => void parar(),
      limiteSegundos: 30,
    });
    // guardado antes de abrir: se a tela sair durante o pedido de permissão, a limpeza o descarta
    gravador.current = g;
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
  }

  async function analisar() {
    if (!gravacao) return;
    setAnalisando(true);
    setErro(null);
    setSituacaoAudio(null);
    try {
      const faixa = FAIXAS_F0[tipoVoz];
      const r = await analisarGravacao(gravacao.wav, { f0Min: faixa.f0Min, f0Max: faixa.f0Max, paciente, guardarAudio });
      setResultado(r.resultado);
      setSituacaoAudio(
        r.aviso_audio ?? (r.audio_guardado ? "Gravação guardada: dá para ouvir de novo e comparar na aba Comparar." : null),
      );
      if (r.avaliacao_id) aoSalvar();
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível analisar a gravação."));
    } finally {
      setAnalisando(false);
    }
  }

  const linhas = resultado ? linhasAcusticas(resultado) : [];
  const pct = Math.min(100, Math.round(nivel * 100));

  return (
    <section className={PAINEL} aria-labelledby="vc2-acustica">
      <h2 id="vc2-acustica" className={TITULO}>
        Análise acústica
      </h2>
      <p className={cn(NOTA, "mt-1")}>
        Peça um /a/ sustentado, confortável, por 3 a 5 segundos. Use fone com microfone ou microfone USB, sempre à mesma distância.
      </p>

      <div className="mt-4 max-w-xs">
        <Label htmlFor={idTipo}>Tipo de voz</Label>
        <select
          id={idTipo}
          className={cn(SELECT, "mt-1")}
          value={tipoVoz}
          onChange={(e) => setTipoVoz(e.target.value as keyof typeof FAIXAS_F0)}
          disabled={gravando}
        >
          {Object.entries(FAIXAS_F0).map(([chave, f]) => (
            <option key={chave} value={chave}>
              {f.rotulo}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {gravando ? (
          <Button type="button" variant="danger" onClick={() => void parar()} data-testid="vc2-parar">
            <Square className="h-4 w-4" aria-hidden /> Parar gravação
          </Button>
        ) : (
          <Button type="button" onClick={() => void iniciar()} disabled={!suportado} data-testid="vc2-gravar">
            <Mic className="h-4 w-4" aria-hidden /> {gravacao ? "Gravar de novo" : "Gravar"}
          </Button>
        )}
        <span className="text-data w-14 text-sm text-ink" aria-live="off">
          {tempo.toFixed(1).replace(".", ",")} s
        </span>
        <div
          className="h-2.5 min-w-[8rem] flex-1 overflow-hidden rounded-full bg-canvas-overlay ring-1 ring-inset ring-line"
          role="meter"
          aria-label="Nível do microfone"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className={cn("h-full transition-[width] duration-75", nivel >= 0.95 ? "bg-signal-err" : "bg-accent")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {!suportado ? (
        <Erro texto="Este navegador não grava áudio. Use Chrome, Edge, Firefox ou Safari atualizados." />
      ) : null}

      {!gravando ? (
        <div className="mt-3">
          <label htmlFor={idArquivo}
            className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm text-ink-muted ring-1 ring-inset ring-line hover:text-ink focus-within:ring-2 focus-within:ring-accent">
            <Upload className="h-4 w-4" aria-hidden /> Importar arquivo de áudio
          </label>
          <input id={idArquivo} type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg" className="sr-only"
            onChange={(e) => { void importar(e.target.files?.[0]); e.target.value = ""; }} data-testid="vc2-importar" />
          <span className="mt-1 block text-xs text-ink-faint sm:ml-2 sm:mt-0 sm:inline">WAV de preferência; até 60 s.</span>
        </div>
      ) : null}

      {urlAudio ? (
        <audio className="mt-4 w-full" src={urlAudio} controls aria-label="Ouvir a gravação" />
      ) : null}
      {gravacao && !gravando ? (
        <EditorAudio gravacao={gravacao} aoMudar={(g) => { setResultado(null); setSituacaoAudio(null); usar(g); }} />
      ) : null}
      {gravacao && !gravando ? <Espectrograma wav={gravacao.wav} /> : null}
      <Avisos itens={gravacao?.avisos ?? []} />

      <div className="mt-4">
        <Button
          type="button"
          onClick={() => void analisar()}
          disabled={!gravacao || gravacao.duracao < 0.5 || analisando || gravando}
          data-testid="vc2-analisar"
        >
          {analisando ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {analisando ? "Analisando…" : "Analisar gravação"}
        </Button>
        {paciente ? (
          <label htmlFor={idGuardar} className="mt-3 flex items-start gap-2 text-sm text-ink-muted">
            <input
              id={idGuardar}
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
              checked={guardarAudio}
              onChange={(e) => setGuardarAudio(e.target.checked)}
              data-testid="vc2-guardar-audio"
            />
            <span>Guardar a gravação para ouvir de novo e comparar antes/depois (conta no espaço de armazenamento do plano)</span>
          </label>
        ) : (
          <p className="mt-2 text-xs text-ink-faint">Sem nome de paciente, o resultado aparece aqui mas não fica salvo.</p>
        )}
      </div>
      {situacaoAudio ? (
        <p className="mt-2 text-xs text-ink-muted" role="status" data-testid="vc2-situacao-audio">{situacaoAudio}</p>
      ) : null}

      <Erro texto={erro} />

      {resultado && !resultado.f0 ? <Erro texto={resultado.avisos[0] ?? "Não foi encontrada voz suficiente."} /> : null}
      {linhas.length ? (
        <div className="mt-4" aria-live="polite">
          <table className="w-full text-sm" data-testid="vc2-tabela-acustica">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-faint">
                <th className="py-2 font-medium">Medida</th>
                <th className="py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(([medida, valor]) => (
                <tr key={medida} className="border-b border-ink/[0.06]">
                  <td className="py-2 text-ink-muted">{medida}</td>
                  <td className="text-data py-2 text-right text-ink">{valor}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-faint">
            Medido pelo motor {resultado?.motor === "praat" ? `Praat ${resultado.versao_praat ?? ""}` : "interno"}. Não é diagnóstico médico.
          </p>
          <Avisos itens={resultado?.avisos ?? []} />
          {resultado?.graficos ? <GraficosAnalise dados={resultado.graficos} formantes={resultado.formantes} /> : null}
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Protocolos
// ---------------------------------------------------------------------------

type DefProtocolo = {
  nome: Protocolo;
  titulo: string;
  nota: string;
  itens: string[];
  opcoes: number[];
  /** Texto de cada opção (quando não basta o número). */
  rotulos?: string[];
  botao: string;
};

const PROTOCOLOS: DefProtocolo[] = [
  {
    nome: "idv10",
    titulo: "IDV-10 — Índice de Desvantagem Vocal",
    nota: "Leia cada item da versão validada impressa. 0 = nunca … 4 = sempre.",
    itens: Array.from({ length: 10 }, (_, i) => `Item ${i + 1}`),
    opcoes: [0, 1, 2, 3, 4],
    botao: "Calcular IDV-10",
  },
  {
    nome: "qvv",
    titulo: "QVV — Qualidade de Vida em Voz",
    nota: "Leia cada item da versão validada impressa. 1 = não é um problema … 5 = é um problema muito grande.",
    itens: Array.from({ length: 10 }, (_, i) => `Item ${i + 1}`),
    opcoes: [1, 2, 3, 4, 5],
    botao: "Calcular QVV",
  },
  {
    nome: "grbasi",
    titulo: "GRBASI — avaliação perceptivo-auditiva",
    nota: "0 = normal, 1 = leve, 2 = moderado, 3 = intenso.",
    itens: ["G — Grau geral", "R — Rugosidade", "B — Soprosidade", "A — Astenia", "S — Tensão", "I — Instabilidade"],
    opcoes: [0, 1, 2, 3],
    botao: "Registrar GRBASI",
  },
  {
    nome: "easebr",
    titulo: "EASE-BR — facilidade para cantar",
    nota: "Para cantores. Marque a opção escolhida em cada item da versão validada impressa; os itens 6, 12 e 21 são invertidos no cálculo. Total de 0 a 66, sem nota de corte publicada.",
    itens: Array.from({ length: 22 }, (_, i) => `Item ${i + 1}`),
    opcoes: [0, 1, 2, 3],
    rotulos: ["Não", "Um pouco", "Moderadamente", "Muito"],
    botao: "Calcular EASE-BR",
  },
];

/** Perceptiva complementar ao GRBASI (como no iVox): ressonância, pitch, loudness e ataque vocal. */
function FormPerceptiva({ paciente, aoSalvar }: { paciente: string; aoSalvar: () => void }) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resumo, setResumo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const base = useId();

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const falta = OPCOES_PERCEPTIVA.filter((p) => p.obrigatorio && !valores[p.chave]).map((p) => p.rotulo.toLowerCase());
    if (falta.length) {
      setErro(`Marque ${falta.join(", ")}.`);
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const r = await calcularProtocolo("perceptiva", {
        ressonancia: valores.ressonancia!, pitch: valores.pitch!, loudness: valores.loudness!,
        ...(valores.ataque ? { ataque: valores.ataque } : {}),
        ...(obs.trim() ? { observacoes: obs.trim() } : {}),
      }, paciente);
      setResumo(resumoProtocolo(r.resultado));
      if (r.avaliacao_id) aoSalvar();
    } catch (err) {
      setErro(friendlyError(err, "Não foi possível registrar."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={(e) => void enviar(e)} aria-labelledby={`${base}-t`} data-testid="vc2-form-perceptiva">
      <h3 id={`${base}-t`} className="font-display text-base font-semibold text-ink">Perceptiva complementar</h3>
      <p className="mt-1 text-xs text-ink-muted">Complementa o GRBASI: ressonância, pitch, loudness e ataque vocal percebidos na avaliação.</p>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {OPCOES_PERCEPTIVA.map((p) => (
          <div key={p.chave}>
            <Label htmlFor={`${base}-${p.chave}`} className="text-xs">{p.rotulo}{p.obrigatorio ? "" : " (opcional)"}</Label>
            <select id={`${base}-${p.chave}`} className={cn(SELECT, "mt-1 h-9")} value={valores[p.chave] ?? ""}
              onChange={(e) => { setValores((v) => ({ ...v, [p.chave]: e.target.value })); setResumo(null); }}
              data-testid={`vc2-perceptiva-${p.chave}`}>
              <option value="">—</option>
              {p.opcoes.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </div>
        ))}
      </div>
      <Label htmlFor={`${base}-obs`} className="mt-3 block text-xs">Observações (opcional)</Label>
      <Input id={`${base}-obs`} className="mt-1" maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" disabled={enviando} data-testid="vc2-perceptiva-registrar">
          {enviando ? "Registrando…" : "Registrar perceptiva"}
        </Button>
        {resumo ? <p className="text-sm text-ink" role="status" data-testid="vc2-perceptiva-resumo">{resumo}</p> : null}
      </div>
      <Erro texto={erro} />
    </form>
  );
}

function FormProtocolo({ def, paciente, aoSalvar }: { def: DefProtocolo; paciente: string; aoSalvar: () => void }) {
  const [valores, setValores] = useState<(number | null)[]>(() => def.itens.map(() => null));
  const [enviando, setEnviando] = useState(false);
  const [resumo, setResumo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const base = useId();
  const completo = valores.every((v) => v !== null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!completo) {
      setErro("Responda todos os itens antes de calcular.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const respostas =
        def.nome === "grbasi"
          ? Object.fromEntries("GRBASI".split("").map((letra, i) => [letra, valores[i] as number]))
          : (valores as number[]);
      const r = await calcularProtocolo(def.nome, respostas, paciente);
      setResumo(resumoProtocolo(r.resultado));
      if (r.avaliacao_id) aoSalvar();
    } catch (err) {
      setErro(friendlyError(err, "Não foi possível calcular."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={(e) => void enviar(e)} aria-labelledby={`${base}-t`} data-testid={`vc2-form-${def.nome}`}>
      <h3 id={`${base}-t`} className="font-display text-base font-semibold text-ink">
        {def.titulo}
      </h3>
      <p className="mt-1 text-xs text-ink-muted">{def.nota}</p>
      <div className={cn("mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3", def.rotulos ? "lg:grid-cols-3" : "lg:grid-cols-5")}>
        {def.itens.map((rotulo, i) => (
          <div key={rotulo}>
            <Label htmlFor={`${base}-${i}`} className="text-xs">
              {rotulo}
            </Label>
            <select
              id={`${base}-${i}`}
              className={cn(SELECT, "mt-1 h-9")}
              value={valores[i] ?? ""}
              onChange={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                setValores((atual) => atual.map((x, j) => (j === i ? v : x)));
                setResumo(null);
              }}
            >
              <option value="">—</option>
              {def.opcoes.map((o) => (
                <option key={o} value={o}>
                  {def.rotulos?.[o - def.opcoes[0]!] ?? o}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" disabled={enviando}>
          {enviando ? "Calculando…" : def.botao}
        </Button>
        {resumo ? (
          <p className="text-sm text-ink" role="status" data-testid={`vc2-resumo-${def.nome}`}>
            {resumo}
          </p>
        ) : null}
      </div>
      <Erro texto={erro} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Histórico do paciente
// ---------------------------------------------------------------------------

function Evolucao({ itens }: { itens: Avaliacao[] }) {
  const series = useMemo(() => seriesEvolucao(itens), [itens]);
  if (!series.length) {
    return (
      <p className="mt-3 text-xs text-ink-faint">
        A curva de evolução aparece a partir da segunda avaliação do mesmo tipo.
      </p>
    );
  }
  return (
    <div className="mt-4" data-testid="vc2-evolucao">
      <h3 className="font-display text-base font-semibold text-ink">Evolução</h3>
      <p className="mt-0.5 text-xs text-ink-muted">
        Uma medida por gráfico, da sessão mais antiga para a mais recente (até {MAX_PONTOS} sessões). Os valores de cada sessão estão na lista abaixo.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {series.map((s) => (
          <GraficoEvolucao key={s.chave} serie={s} />
        ))}
      </div>
    </div>
  );
}

/** O histórico vem limitado às 500 avaliações mais recentes. */
const LIMITE_HISTORICO = 500;

function Relatorio({ paciente, itens: recentes }: { paciente: string; itens: Avaliacao[] }) {
  const [aberto, setAberto] = useState(false);
  // histórico longo: os fonetogramas antigos (o "primeiro" do campo vocal) podem ter ficado fora
  // da lista; buscados à parte ao abrir (a impressão precisa sair do clique, sem espera)
  const [fonetogramas, setFonetogramas] = useState<Avaliacao[]>([]);
  useEffect(() => {
    if (!aberto || recentes.length < LIMITE_HISTORICO) return;
    let vivo = true;
    listarAvaliacoes(paciente, "fonetograma").then((r) => vivo && setFonetogramas(r.items)).catch(() => undefined);
    return () => { vivo = false; };
  }, [aberto, paciente, recentes.length]);
  const itens = useMemo(() => {
    if (!fonetogramas.length) return recentes;
    const ids = new Set(recentes.map((a) => a.id));
    return [...recentes, ...fonetogramas.filter((a) => !ids.has(a.id))];
  }, [recentes, fonetogramas]);
  const [profissional, setProfissional] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [dadosPaciente, setDadosPaciente] = useState("");
  const id = useId();
  // idade/sexo/profissão do cadastro: buscados ao abrir (a impressão precisa sair do clique, sem espera)
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    obterCadastro(paciente).then((c) => vivo && setDadosPaciente(resumoCadastro(c))).catch(() => undefined);
    return () => { vivo = false; };
  }, [aberto, paciente]);

  function gerar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      imprimirRelatorioClinico(paciente, itens, { profissional, observacoes, dadosPaciente, geradoEm: new Date() });
      setAberto(false);
    } catch (err) {
      setErro(friendlyError(err, "Não foi possível gerar o relatório."));
    }
  }

  /** Mesmo conteúdo em Word (.docx), para editar (como o iVox); os gráficos ficam só no PDF. */
  function gerarDocx() {
    setErro(null);
    try {
      const agora = new Date();
      const dados = montarDocxClinico(paciente, itens, { profissional, observacoes, dadosPaciente, geradoEm: agora });
      const url = URL.createObjectURL(new Blob([dados], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivoDocx(paciente, agora);
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setAberto(false);
    } catch (err) {
      setErro(friendlyError(err, "Não foi possível gerar o relatório em Word."));
    }
  }

  return (
    <div className="mt-3">
      <Button type="button" variant="secondary" size="sm" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} data-testid="vc2-relatorio-abrir">
        <FileText className="h-4 w-4" aria-hidden /> Relatório (PDF ou Word)
      </Button>
      {aberto ? (
        <form onSubmit={gerar} className="mt-3 space-y-3 rounded-xl p-4 ring-1 ring-inset ring-ink/10" data-testid="vc2-relatorio-form">
          <p className="text-xs text-ink-muted">
            Reúne a análise acústica e os protocolos mais recentes, os gráficos de evolução e todas as sessões. Campos vazios ficam fora do relatório. O Word (.docx) traz o mesmo conteúdo para editar, sem os gráficos.
          </p>
          <div className="max-w-sm">
            <Label htmlFor={`${id}-prof`}>Profissional</Label>
            <Input id={`${id}-prof`} className="mt-1" value={profissional} maxLength={120} onChange={(e) => setProfissional(e.target.value)} placeholder="Nome e registro (opcional)" />
          </div>
          <div>
            <Label htmlFor={`${id}-obs`}>Observações</Label>
            <textarea
              id={`${id}-obs`}
              className="mt-1 min-h-[5rem] w-full rounded-lg border border-line bg-canvas-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              value={observacoes}
              maxLength={4000}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Conduta, orientações, próximos passos (opcional)"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm">Gerar PDF</Button>
            <Button type="button" size="sm" variant="secondary" onClick={gerarDocx} data-testid="vc2-relatorio-docx">Word (.docx)</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
          </div>
          <p className="text-xs text-ink-faint">Na janela de impressão, escolha “Salvar como PDF”.</p>
          <Erro texto={erro} />
        </form>
      ) : null}
    </div>
  );
}

/** Direitos do titular (LGPD art. 18): exportar e excluir tudo do paciente. */
function DadosDoPaciente({ paciente, itens, aoExcluir }: { paciente: string; itens: Avaliacao[]; aoExcluir: (resumo: string) => void }) {
  const [exportando, setExportando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function planilha() {
    const base = paciente.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "paciente";
    const arquivo = `voicecheck-${base}-historico.csv`;
    const url = URL.createObjectURL(new Blob([historicoCsv(itens)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = arquivo;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg(`Planilha ${arquivo} gerada (${itens.length} ${itens.length === 1 ? "avaliação" : "avaliações"}). Ela contém dados de saúde: guarde e envie com cuidado.`);
  }

  const comAudio = itens.filter((a) => a.audio).length;

  async function exportar(zip = false) {
    setExportando(true);
    setErro(null);
    try {
      const { arquivo, conteudo } = zip ? await exportarPacienteZip(paciente) : await exportarPaciente(paciente);
      const url = URL.createObjectURL(conteudo);
      const a = document.createElement("a");
      a.href = url;
      a.download = arquivo;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg(`Arquivo ${arquivo} gerado. Ele contém dados de saúde: guarde e envie com cuidado.`);
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível exportar os dados."));
    } finally {
      setExportando(false);
    }
  }

  async function excluir() {
    setExcluindo(true);
    setErro(null);
    try {
      const r = await excluirPaciente(paciente);
      setConfirmar(false);
      // este painel some junto com o histórico: o aviso fica com o histórico
      const g = r.gravacoes_excluidas ?? 0;
      aoExcluir(
        `Dados de ${paciente} excluídos: ${r.avaliacoes_excluidas} ${r.avaliacoes_excluidas === 1 ? "registro" : "registros"}` +
          (g ? `, ${g} ${g === 1 ? "gravação" : "gravações"}` : "") +
          ` e ${r.planos_excluidos} ${r.planos_excluidos === 1 ? "link de prática" : "links de prática"}` +
          (r.cadastro_excluido ? ", além do cadastro." : "."),
      );
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível excluir os dados."));
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div className="mt-5 border-t border-ink/[0.07] pt-4" data-testid="vc2-lgpd">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Dados do paciente (LGPD)</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => void exportar()} disabled={exportando} data-testid="vc2-exportar">
          <Download className="h-4 w-4" aria-hidden /> {exportando ? "Exportando…" : "Exportar todos os dados"}
        </Button>
        {comAudio ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => void exportar(true)} disabled={exportando} data-testid="vc2-exportar-zip">
            <Download className="h-4 w-4" aria-hidden /> Com gravações e mídias (ZIP, {comAudio})
          </Button>
        ) : null}
        <Button type="button" variant="secondary" size="sm" onClick={planilha} data-testid="vc2-planilha">
          <FileText className="h-4 w-4" aria-hidden /> Planilha (CSV)
        </Button>
        <Button type="button" variant="ghost" size="sm" className="text-signal-err hover:text-signal-err" onClick={() => setConfirmar(true)} data-testid="vc2-excluir-paciente">
          <Trash2 className="h-4 w-4" aria-hidden /> Excluir todos os dados
        </Button>
      </div>
      {msg ? <p className="mt-2 text-xs text-ink-muted" role="status" data-testid="vc2-exportar-msg">{msg}</p> : null}
      <Erro texto={erro} />
      <ConfirmDialog
        open={confirmar}
        title={`Excluir todos os dados de ${paciente}?`}
        description="Apaga para sempre o cadastro e todas as avaliações, gravações, protocolos, anamneses, sessões e links de prática deste paciente; os links param de funcionar na hora. Antes, confira se a guarda do prontuário exigida pelo seu conselho profissional permite a exclusão e, se preciso, exporte os dados."
        confirmLabel="Excluir tudo"
        danger
        busy={excluindo}
        onConfirm={() => void excluir()}
        onCancel={() => setConfirmar(false)}
      />
    </div>
  );
}

/** Anotação livre do profissional em cada avaliação (como o editor de anotações do VoxMetria). */
function Anotacao({ avaliacao, aoSalvar }: { avaliacao: Avaliacao; aoSalvar: (a: Avaliacao) => void }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(avaliacao.anotacao ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const id = useId();

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      aoSalvar(await anotarAvaliacao(avaliacao.id, texto));
      setEditando(false);
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível salvar a anotação."));
    } finally {
      setSalvando(false);
    }
  }

  if (!editando) {
    return (
      <div className="mt-1">
        {avaliacao.anotacao ? (
          <p className="whitespace-pre-wrap text-xs text-ink" data-testid="vc2-anotacao-texto">{avaliacao.anotacao}</p>
        ) : null}
        <button type="button" onClick={() => { setTexto(avaliacao.anotacao ?? ""); setEditando(true); }}
          className="mt-0.5 inline-flex min-h-[28px] items-center gap-1 rounded text-xs text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          data-testid="vc2-anotar">
          <NotebookPen className="h-3.5 w-3.5" aria-hidden /> {avaliacao.anotacao ? "Editar anotação" : "Anotar"}
        </button>
      </div>
    );
  }
  return (
    <div className="mt-2">
      <label htmlFor={id} className="text-xs text-ink-muted">Anotação</label>
      <textarea id={id} value={texto} maxLength={4000} rows={3} onChange={(e) => setTexto(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-line bg-canvas-raised px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        data-testid="vc2-anotacao-campo" />
      <div className="mt-1 flex gap-2">
        <Button type="button" size="sm" onClick={() => void salvar()} disabled={salvando} data-testid="vc2-anotacao-salvar">
          {salvando ? "Salvando…" : "Salvar anotação"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>
      </div>
      <Erro texto={erro} />
    </div>
  );
}

function Historico({ paciente, versao, aoExcluirPaciente }: { paciente: string; versao: number; aoExcluirPaciente: () => void }) {
  const [itens, setItens] = useState<Avaliacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [excluir, setExcluir] = useState<Avaliacao | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [avisoExclusao, setAvisoExclusao] = useState<string | null>(null);
  useEffect(() => setAvisoExclusao(null), [paciente]);

  // só a resposta do pedido mais recente vale: trocar de paciente rápido não mistura prontuários
  const pedido = useRef(0);
  const carregar = useCallback(async () => {
    if (!paciente) return;
    const meu = ++pedido.current;
    try {
      const lista = (await listarAvaliacoes(paciente)).items;
      if (meu !== pedido.current) return;
      setItens(lista);
      setErro(null);
    } catch (e) {
      if (meu !== pedido.current) return;
      setErro(friendlyError(e, "Não foi possível carregar o histórico."));
    }
  }, [paciente]);

  const ultimoPaciente = useRef(paciente);
  useEffect(() => {
    // "Carregando…" só ao trocar de paciente; um novo resultado só atualiza a lista
    if (ultimoPaciente.current !== paciente) {
      ultimoPaciente.current = paciente;
      pedido.current++; // resposta ainda pendente do paciente anterior é descartada
      setItens(null);
    }
    const t = window.setTimeout(() => void carregar(), 300); // espera parar de digitar
    return () => window.clearTimeout(t);
  }, [carregar, paciente, versao]);

  async function confirmarExclusao() {
    if (!excluir) return;
    setExcluindo(true);
    try {
      await excluirAvaliacao(excluir.id);
      setExcluir(null);
      await carregar();
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível excluir."));
    } finally {
      setExcluindo(false);
    }
  }

  if (!paciente) return null;
  return (
    <section className={PAINEL} aria-labelledby="vc2-historico">
      <h2 id="vc2-historico" className={cn(TITULO, "scroll-mt-4 focus:outline-none")} tabIndex={-1}>
        Histórico de {paciente}
      </h2>
      <Erro texto={erro} />
      {avisoExclusao ? <p className="mt-3 text-sm text-ink" role="status" data-testid="vc2-lgpd-msg">{avisoExclusao}</p> : null}
      {itens === null && !erro ? <p className={cn(NOTA, "mt-3")}>Carregando…</p> : null}
      {itens?.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-ink/15 px-4 py-4 text-sm text-ink-muted">
          Nenhuma avaliação salva ainda. Grave uma vogal ou aplique um protocolo com este nome preenchido.
        </p>
      ) : null}
      {itens?.length ? <Relatorio paciente={paciente} itens={itens} /> : null}
      {itens?.length ? <Evolucao itens={itens} /> : null}
      {itens?.length ? <DiagramaDesvio itens={itens} /> : null}
      {itens?.length ? (
        <ul className="mt-3 divide-y divide-ink/[0.07] overflow-hidden rounded-xl ring-1 ring-inset ring-ink/10" data-testid="vc2-historico">
          {itens.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {ROTULO_TIPO[a.tipo]} <span className="text-data ml-2 text-xs font-normal text-ink-faint">{formatarData(a.criado_em)}</span>
                </p>
                <p className="text-data mt-0.5 truncate text-xs text-ink-muted">{resumoAvaliacao(a)}</p>
                <Anotacao avaliacao={a} aoSalvar={(nova) => setItens((l) => l?.map((x) => (x.id === nova.id ? nova : x)) ?? l)} />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Excluir ${ROTULO_TIPO[a.tipo]} de ${formatarData(a.criado_em)}`}
                onClick={() => setExcluir(a)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <ConfirmDialog
        open={excluir !== null}
        title="Excluir esta avaliação?"
        description="O resultado será apagado do histórico do paciente. As outras avaliações continuam."
        confirmLabel="Excluir avaliação"
        danger
        busy={excluindo}
        onConfirm={() => void confirmarExclusao()}
        onCancel={() => setExcluir(null)}
      />
      {itens?.length ? (
        <DadosDoPaciente paciente={paciente} itens={itens} aoExcluir={(resumo) => { setAvisoExclusao(resumo); aoExcluirPaciente(); void carregar(); }} />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

const ABAS = [
  { id: "avaliacao", rotulo: "Avaliação" },
  { id: "anamnese", rotulo: "Anamnese" },
  { id: "protocolo", rotulo: "Protocolo de voz" },
  { id: "comparar", rotulo: "Comparar" },
  { id: "fonetograma", rotulo: "Fonetograma" },
  { id: "biofeedback", rotulo: "Biofeedback" },
  { id: "carga", rotulo: "Carga vocal" },
  { id: "equipamentos", rotulo: "Equipamentos" },
  { id: "jogos", rotulo: "Jogos" },
  { id: "sessoes", rotulo: "Sessões" },
  { id: "midias", rotulo: "Mídias" },
  { id: "ferramentas", rotulo: "Ferramentas" },
  { id: "pratica", rotulo: "Prática em casa" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

/** Abas com teclado (setas, Home, End), no padrão WAI-ARIA. */
function Abas({ ativa, onChange, base }: { ativa: Aba; onChange: (a: Aba) => void; base: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function teclar(e: React.KeyboardEvent, i: number) {
    const ultimo = ABAS.length - 1;
    const destino = e.key === "ArrowRight" ? (i === ultimo ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? ultimo : i - 1)
      : e.key === "Home" ? 0 : e.key === "End" ? ultimo : null;
    if (destino === null) return;
    e.preventDefault();
    onChange(ABAS[destino]!.id);
    refs.current[destino]?.focus();
  }
  return (
    // celular: grade 3×3 (todas as abas à vista); telas maiores: uma linha com rolagem
    <div role="tablist" aria-label="Módulos" className="grid grid-cols-3 gap-1 rounded-xl bg-canvas-raised/60 p-1 ring-1 ring-inset ring-ink/10 sm:flex sm:overflow-x-auto">
      {ABAS.map((a, i) => (
        <button
          key={a.id}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="tab"
          id={`${base}-aba-${a.id}`}
          aria-selected={ativa === a.id}
          aria-controls={`${base}-painel-${a.id}`}
          tabIndex={ativa === a.id ? 0 : -1}
          onClick={() => onChange(a.id)}
          onKeyDown={(e) => teclar(e, i)}
          className={cn(
            "min-h-[44px] flex-1 rounded-lg px-2 text-[13px] font-medium leading-tight transition-colors sm:min-h-[40px] sm:whitespace-nowrap sm:px-4 sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            ativa === a.id ? "bg-canvas-card text-ink shadow-sm" : "text-ink-muted hover:text-ink",
            // celular: a última aba ocupa o que sobrar da última linha da grade 3×n
            i === ABAS.length - 1 && ABAS.length % 3 === 1 && "col-span-3 sm:col-span-1",
            i === ABAS.length - 1 && ABAS.length % 3 === 2 && "col-span-2 sm:col-span-1",
          )}
          data-testid={`vc2-aba-${a.id}`}
        >
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}

export function AvaliacaoClinica() {
  const [paciente, setPaciente] = useState("");
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [versao, setVersao] = useState(0);
  const [aba, setAba] = useState<Aba>("avaliacao");
  const idPaciente = useId();
  function irParaHistorico() {
    const titulo = document.getElementById("vc2-historico");
    if (!titulo) return;
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    titulo.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
    titulo.focus({ preventScroll: true }); // leitor de tela continua a partir do histórico
  }
  const nome = useMemo(() => paciente.split(/\s+/).filter(Boolean).join(" "), [paciente]);

  const recarregarPacientes = useCallback(() => {
    listarPacientes()
      .then((r) => setPacientes(r.items))
      .catch(() => undefined); // a lista é só sugestão; a tela funciona sem ela
  }, []);
  useEffect(recarregarPacientes, [recarregarPacientes]);

  const aoSalvar = useCallback(() => {
    setVersao((v) => v + 1);
    recarregarPacientes();
  }, [recarregarPacientes]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">Avaliação clínica</h1>
        <p className="mt-2 max-w-[70ch] text-base text-ink-muted">
          Anamnese, medidas acústicas, protocolos de autoavaliação e escala perceptiva, com o histórico de cada paciente. Não é diagnóstico médico.
        </p>
      </header>

      <section className={PAINEL} aria-label="Paciente">
        <div className="max-w-md">
          <Label htmlFor={idPaciente}>Paciente</Label>
          <Input
            id={idPaciente}
            className="mt-1"
            list={`${idPaciente}-lista`}
            value={paciente}
            maxLength={120}
            autoComplete="off"
            placeholder="Nome ou código"
            onChange={(e) => setPaciente(e.target.value)}
            data-testid="vc2-paciente"
          />
          <datalist id={`${idPaciente}-lista`}>
            {pacientes.map((p) => (
              <option key={p.paciente} value={p.paciente}>{`${p.avaliacoes} ${p.avaliacoes === 1 ? "avaliação" : "avaliações"}${p.cadastro ? " · cadastrado" : ""}`}</option>
            ))}
          </datalist>
          <p className="mt-2 text-xs text-ink-faint">Com o nome preenchido, cada resultado fica salvo no histórico do paciente.</p>
        </div>
        <CadastroPacienteForm paciente={nome} aoSalvar={recarregarPacientes} />
        {nome ? (
          // o histórico fica no fim da página, depois dos formulários (longe no celular): atalho até ele
          <button type="button" onClick={irParaHistorico} data-testid="vc2-ir-historico"
            className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg text-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <History className="h-4 w-4" aria-hidden /> Ver histórico de {nome}
          </button>
        ) : null}
      </section>

      <Abas ativa={aba} onChange={setAba} base={idPaciente} />

      {/* Avaliação fica montada (preserva respostas já marcadas); biofeedback e jogos só quando abertos (liberam o microfone) */}
      <div role="tabpanel" id={`${idPaciente}-painel-avaliacao`} aria-labelledby={`${idPaciente}-aba-avaliacao`} hidden={aba !== "avaliacao"}>
      <div className="grid gap-5 xl:grid-cols-2">
        <PainelAcustico key={nome} paciente={nome} aoSalvar={aoSalvar} />
        <section className={cn(PAINEL, "space-y-6")} aria-labelledby="vc2-protocolos">
          <h2 id="vc2-protocolos" className={TITULO}>
            Protocolos
          </h2>
          {PROTOCOLOS.map((def) => (
            <FormProtocolo key={`${def.nome}|${nome}`} def={def} paciente={nome} aoSalvar={aoSalvar} />
          ))}
          <FormPerceptiva key={`perceptiva|${nome}`} paciente={nome} aoSalvar={aoSalvar} />
        </section>
      </div>
      </div>

      {/* anamnese também fica montada: trocar de aba não apaga o que foi digitado */}
      <div role="tabpanel" id={`${idPaciente}-painel-anamnese`} aria-labelledby={`${idPaciente}-aba-anamnese`} hidden={aba !== "anamnese"}>
        <AnamneseVocal key={nome} paciente={nome} aoSalvar={aoSalvar} />
      </div>
      {/* só montada quando aberta: a gravação da fala libera o microfone ao sair */}
      {aba === "protocolo" ? (
        <div role="tabpanel" id={`${idPaciente}-painel-protocolo`} aria-labelledby={`${idPaciente}-aba-protocolo`}>
          <ProtocoloVoz key={nome} paciente={nome} versao={versao} aoSalvar={aoSalvar} />
        </div>
      ) : null}
      {aba === "comparar" ? (
        <div role="tabpanel" id={`${idPaciente}-painel-comparar`} aria-labelledby={`${idPaciente}-aba-comparar`} className="space-y-5">
          <ComparacaoAntesDepois paciente={nome} versao={versao} />
          <ComparacaoFonetogramas paciente={nome} versao={versao} />
        </div>
      ) : null}
      {aba === "fonetograma" ? (
        <div role="tabpanel" id={`${idPaciente}-painel-fonetograma`} aria-labelledby={`${idPaciente}-aba-fonetograma`}>
          <Fonetograma paciente={nome} aoSalvar={aoSalvar} />
        </div>
      ) : null}
      {aba === "biofeedback" ? (
        <div role="tabpanel" id={`${idPaciente}-painel-biofeedback`} aria-labelledby={`${idPaciente}-aba-biofeedback`}>
          <BiofeedbackAoVivo paciente={nome} aoSalvar={aoSalvar} />
        </div>
      ) : null}
      {aba === "carga" ? (
        <div role="tabpanel" id={`${idPaciente}-painel-carga`} aria-labelledby={`${idPaciente}-aba-carga`}>
          <CargaVocal paciente={nome} aoSalvar={aoSalvar} />
        </div>
      ) : null}
      {aba === "sessoes" ? (
        <div role="tabpanel" id={`${idPaciente}-painel-sessoes`} aria-labelledby={`${idPaciente}-aba-sessoes`}>
          <SessoesTerapia key={nome} paciente={nome} versao={versao} aoSalvar={aoSalvar} />
        </div>
      ) : null}
      {aba === "midias" ? (
        <div role="tabpanel" id={`${idPaciente}-painel-midias`} aria-labelledby={`${idPaciente}-aba-midias`}>
          <MidiasPaciente key={nome} paciente={nome} versao={versao} aoSalvar={aoSalvar} />
        </div>
      ) : null}
      {/* nasalância e EGG: precisam de equipamento (interface estéreo, eletroglotógrafo) */}
      {aba === "equipamentos" ? (
        <div role="tabpanel" id={`${idPaciente}-painel-equipamentos`} aria-labelledby={`${idPaciente}-aba-equipamentos`} className="space-y-5">
          <Nasalancia key={`n-${nome}`} paciente={nome} aoSalvar={aoSalvar} />
          <Eletroglotografia key={`e-${nome}`} paciente={nome} aoSalvar={aoSalvar} />
        </div>
      ) : null}
      {aba === "ferramentas" ? (
        <div role="tabpanel" id={`${idPaciente}-painel-ferramentas`} aria-labelledby={`${idPaciente}-aba-ferramentas`}>
          <FerramentasPraat />
        </div>
      ) : null}
      {aba === "jogos" ? (
        <div role="tabpanel" id={`${idPaciente}-painel-jogos`} aria-labelledby={`${idPaciente}-aba-jogos`}>
          <JogosTerapia paciente={nome} aoSalvar={aoSalvar} />
        </div>
      ) : null}

      {/* montada mesmo escondida: o plano em edição não se perde ao trocar de aba */}
      <div role="tabpanel" id={`${idPaciente}-painel-pratica`} aria-labelledby={`${idPaciente}-aba-pratica`} hidden={aba !== "pratica"}>
        <PraticaCasa paciente={nome} ativo={aba === "pratica"} aoMudar={aoSalvar} />
      </div>

      <Historico paciente={nome} versao={versao} aoExcluirPaciente={aoSalvar} />
    </div>
  );
}
