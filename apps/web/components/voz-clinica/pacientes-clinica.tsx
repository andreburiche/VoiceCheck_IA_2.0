"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, ClipboardList, Download, Search, Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CartaoConsulta } from "@/components/voz-clinica/agenda-clinica";
import { CadastroPacienteForm } from "@/components/voz-clinica/cadastro-paciente";
import { FormularioConsulta } from "@/components/voz-clinica/formulario-consulta";
import { NavegacaoClinica } from "@/components/voz-clinica/navegacao-clinica";
import {
  CHAVE_ABRIR_PACIENTE,
  ROTULO_SITUACAO,
  ROTULO_TIPO_CONSULTA,
  assiduidade,
  dataHoraBR,
  diaCurtoBR,
  filtrarPacientes,
  historicoPorAtendimento,
  horaBR,
  iniciaisPaciente,
  proximas,
  type FiltroPacientes,
  type OrdemPacientes,
} from "@/lib/voz-clinica-agenda";
import {
  ROTULO_TIPO,
  atualizarConsulta,
  consultasDoPaciente,
  dataBR,
  excluirConsulta,
  exportarPacienteZip,
  listarAvaliacoes,
  listarPacientes,
  resumoAvaliacao,
  type Avaliacao,
  type Consulta,
  type PacienteResumo,
  type SituacaoConsulta,
} from "@/lib/voz-clinica-api";
import { cn } from "@/lib/utils";

const PAINEL = "panel-glass rounded-2xl p-4 md:p-5";
const CAMPO =
  "h-10 rounded-lg border border-line bg-canvas-overlay/60 px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function resumoSeguro(a: Avaliacao): string {
  try {
    return resumoAvaliacao(a);
  } catch {
    return "";
  }
}

/** Ficha do paciente: cadastro e foto, próximas consultas e o histórico agrupado por atendimento. */
function FichaPaciente({ nome, pacientes, aoMudar }: { nome: string; pacientes: PacienteResumo[]; aoMudar: () => void }) {
  const router = useRouter();
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<{ consulta?: Consulta } | null>(null);
  const [apagar, setApagar] = useState<Consulta | null>(null);
  const [exportando, setExportando] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    Promise.all([listarAvaliacoes(nome), consultasDoPaciente(nome)])
      .then(([a, c]) => { setAvaliacoes(a.items); setConsultas(c.items); setErro(null); })
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [nome]);
  useEffect(carregar, [carregar]);
  useEffect(() => { titulo.current?.focus({ preventScroll: false }); }, [nome]);

  const historico = useMemo(() => historicoPorAtendimento(avaliacoes, consultas), [avaliacoes, consultas]);
  const futuras = useMemo(() => proximas(consultas), [consultas]);
  const frequencia = useMemo(() => assiduidade(consultas), [consultas]);

  function abrirNaAvaliacao() {
    try { sessionStorage.setItem(CHAVE_ABRIR_PACIENTE, nome); } catch { /* segue sem pré-preencher */ }
    router.push("/voz-clinica");
  }

  async function mudarSituacao(c: Consulta, s: SituacaoConsulta) {
    try {
      const novo = await atualizarConsulta(c.id, { paciente: c.paciente, inicio: c.inicio, duracao_min: c.duracao_min, tipo: c.tipo,
        modalidade: c.modalidade, situacao: s, observacoes: c.observacoes, permitir_conflito: true });
      setConsultas((l) => l.map((x) => (x.id === novo.id ? novo : x)));
      aoMudar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function exportar() {
    setExportando(true);
    try {
      const { arquivo, conteudo } = await exportarPacienteZip(nome);
      const url = URL.createObjectURL(conteudo);
      const a = document.createElement("a");
      a.href = url;
      a.download = arquivo;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setExportando(false);
    }
  }

  return (
    <article className="space-y-5" aria-labelledby="vc2-ficha-titulo" data-testid="vc2-ficha">
      <section className={PAINEL}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="vc2-ficha-titulo" ref={titulo} tabIndex={-1} className="truncate font-display text-2xl font-bold tracking-[-0.02em] text-ink focus:outline-none">
              {nome}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {avaliacoes.length} {avaliacoes.length === 1 ? "registro" : "registros"} · {consultas.length} {consultas.length === 1 ? "consulta" : "consultas"} na agenda
              {frequencia !== null ? ` · frequência ${frequencia}%` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={abrirNaAvaliacao} data-testid="vc2-ficha-avaliar"><Stethoscope className="h-4 w-4" aria-hidden /> Nova avaliação</Button>
            <Button size="sm" variant="secondary" onClick={() => setForm({})} data-testid="vc2-ficha-agendar"><CalendarPlus className="h-4 w-4" aria-hidden /> Agendar</Button>
            <Button size="sm" variant="ghost" onClick={exportar} disabled={exportando} title="Cópia de tudo o que está guardado (LGPD, art. 18)">
              <Download className="h-4 w-4" aria-hidden /> {exportando ? "Gerando…" : "Exportar dados"}
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <CadastroPacienteForm paciente={nome} aoSalvar={aoMudar} />
        </div>
        {erro ? <p role="alert" className="mt-3 text-sm text-signal-err">{erro}</p> : null}
      </section>

      <section className={PAINEL} aria-labelledby="vc2-ficha-proximas">
        <h3 id="vc2-ficha-proximas" className="font-display text-lg font-semibold text-ink">Próximas consultas</h3>
        {futuras.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {futuras.map((c) => (
              <CartaoConsulta key={c.id} c={c} compacto rotuloDia={diaCurtoBR(new Date(c.inicio))} onEditar={() => setForm({ consulta: c })}
                onSituacao={(s) => mudarSituacao(c, s)} onExcluir={() => setApagar(c)} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">Nenhuma consulta marcada. Use “Agendar” para marcar o retorno.</p>
        )}
      </section>

      <section className={PAINEL} aria-labelledby="vc2-ficha-historico" aria-busy={carregando}>
        <h3 id="vc2-ficha-historico" className="font-display text-lg font-semibold text-ink">Histórico de atendimentos</h3>
        <p className="mt-1 text-sm text-ink-muted">Cada dia reúne a consulta e tudo o que foi registrado nela: medidas, protocolos, documentos, mídias e sessões.</p>
        {carregando && !historico.length ? <p className="mt-3 text-sm text-ink-faint">Carregando…</p> : null}
        {!carregando && !historico.length ? <p className="mt-3 text-sm text-ink-muted">Ainda não há atendimentos registrados.</p> : null}
        <ol className="mt-4 space-y-4 border-l border-line pl-4">
          {historico.map((at) => (
            <li key={at.dia} className="relative" data-testid="vc2-atendimento">
              <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-canvas" aria-hidden />
              <h4 className="text-sm font-semibold text-ink">{dataBR(at.dia)} · {diaCurtoBR(new Date(`${at.dia}T12:00:00`)).split(",")[0]}</h4>
              {at.consultas.map((c) => (
                <p key={c.id} className="mt-1 text-sm text-ink-muted">
                  Consulta {horaBR(c.inicio)} · {ROTULO_TIPO_CONSULTA[c.tipo]} · <span className="font-medium text-ink">{ROTULO_SITUACAO[c.situacao]}</span>
                  {c.observacoes ? ` — ${c.observacoes}` : ""}
                </p>
              ))}
              {at.avaliacoes.length ? (
                <ul className="mt-2 space-y-1.5">
                  {at.avaliacoes.map((a) => {
                    const resumo = resumoSeguro(a);
                    return (
                      <li key={a.id} className="rounded-lg bg-canvas-raised/60 px-3 py-2 text-sm ring-1 ring-inset ring-ink/10">
                        <span className="font-medium text-ink">{ROTULO_TIPO[a.tipo] ?? a.tipo}</span>
                        <span className="text-ink-faint"> · {horaBR(a.criado_em)}</span>
                        {resumo ? <span className="text-ink-muted"> — {resumo}</span> : null}
                        {a.anotacao ? <p className="mt-1 text-xs text-ink-muted">Anotação: {a.anotacao}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : at.consultas.length ? (
                <p className="mt-1 text-xs text-ink-faint">Sem registros neste dia.</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {form ? (
        <FormularioConsulta paciente={nome} consulta={form.consulta} pacientes={pacientes} onClose={() => setForm(null)}
          onSalvo={() => { setForm(null); carregar(); aoMudar(); }} />
      ) : null}
      <ConfirmDialog open={!!apagar} danger title="Excluir consulta"
        description={apagar ? `Excluir a consulta de ${dataHoraBR(apagar.inicio)}? Para registrar que não aconteceu, prefira "Cancelar".` : ""}
        confirmLabel="Excluir" onCancel={() => setApagar(null)}
        onConfirm={async () => {
          if (!apagar) return;
          try { await excluirConsulta(apagar.id); carregar(); aoMudar(); } catch (e) { setErro((e as Error).message); }
          setApagar(null);
        }} />
    </article>
  );
}

/** Lista de pacientes da avaliação clínica, com busca, filtros e a ficha completa de cada um. */
export function PacientesClinica() {
  const id = useId();
  const [lista, setLista] = useState<PacienteResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [termo, setTermo] = useState("");
  const [filtro, setFiltro] = useState<FiltroPacientes>("todos");
  const [ordem, setOrdem] = useState<OrdemPacientes>("recentes");
  const [atual, setAtual] = useState<string | null>(null);
  const ficha = useRef<HTMLDivElement>(null);

  const carregar = useCallback(() => {
    listarPacientes()
      .then((r) => { setLista(r.items); setErro(null); })
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);
  useEffect(carregar, [carregar]);
  useEffect(() => {
    // vindo da agenda (“Ficha”): abre o paciente pedido; o nome não passa pela URL (LGPD)
    try {
      const pedido = sessionStorage.getItem(CHAVE_ABRIR_PACIENTE);
      if (pedido) { sessionStorage.removeItem(CHAVE_ABRIR_PACIENTE); setAtual(pedido); }
    } catch { /* sem storage */ }
  }, []);

  const visiveis = useMemo(() => filtrarPacientes(lista, termo, filtro, ordem), [lista, termo, filtro, ordem]);

  function escolher(nome: string) {
    setAtual(nome);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => ficha.current?.scrollIntoView({ block: "start" }));
    }
  }

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <NavegacaoClinica />
        <div>
          <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">Pacientes</h1>
          <p className="mt-1 max-w-[70ch] text-base text-ink-muted">
            Todos os seus pacientes, com o cadastro, as próximas consultas e o histórico de cada atendimento.
          </p>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section className={cn(PAINEL, "lg:sticky lg:top-24")} aria-label="Lista de pacientes">
          <Label htmlFor={`${id}-busca`}>Buscar</Label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
            <Input id={`${id}-busca`} className="pl-9" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Nome ou código"
              autoComplete="off" data-testid="vc2-pacientes-busca" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${id}-filtro`} className="text-xs">Mostrar</Label>
              <select id={`${id}-filtro`} className={cn(CAMPO, "mt-1 w-full")} value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroPacientes)}>
                <option value="todos">Todos</option>
                <option value="com_consulta">Com consulta marcada</option>
                <option value="sem_retorno">Sem retorno (+30 dias)</option>
              </select>
            </div>
            <div>
              <Label htmlFor={`${id}-ordem`} className="text-xs">Ordenar</Label>
              <select id={`${id}-ordem`} className={cn(CAMPO, "mt-1 w-full")} value={ordem} onChange={(e) => setOrdem(e.target.value as OrdemPacientes)}>
                <option value="recentes">Mais recentes</option>
                <option value="nome">Nome</option>
                <option value="proxima">Próxima consulta</option>
              </select>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-faint" aria-live="polite">
            {carregando ? "Carregando…" : `${visiveis.length} de ${lista.length} ${lista.length === 1 ? "paciente" : "pacientes"}`}
          </p>
          {erro ? <p role="alert" className="mt-2 text-sm text-signal-err">{erro}</p> : null}
          <ul className="mt-2 max-h-[60vh] space-y-1 overflow-y-auto pr-1" data-testid="vc2-pacientes-lista">
            {visiveis.map((p) => (
              <li key={p.paciente}>
                <button type="button" onClick={() => escolher(p.paciente)} aria-current={atual === p.paciente ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    atual === p.paciente ? "bg-accent/15 ring-1 ring-inset ring-accent/40" : "hover:bg-ink/[0.04]",
                  )}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/[0.07] text-xs font-semibold text-ink" aria-hidden>
                    {iniciaisPaciente(p.paciente)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{p.paciente}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {p.proxima_consulta ? `Próxima: ${dataHoraBR(p.proxima_consulta)}` : `Último registro: ${dataBR(p.ultima)}`}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-ink-faint" title="Registros">{p.avaliacoes}</span>
                </button>
              </li>
            ))}
          </ul>
          {!carregando && !lista.length ? (
            <p className="mt-2 text-sm text-ink-muted">Nenhum paciente ainda. Comece uma avaliação ou agende uma consulta.</p>
          ) : null}
        </section>

        <div ref={ficha} className="min-w-0 scroll-mt-24">
          {atual ? (
            <FichaPaciente key={atual} nome={atual} pacientes={lista} aoMudar={carregar} />
          ) : (
            <section className={cn(PAINEL, "flex flex-col items-center py-14 text-center")}>
              <ClipboardList className="h-8 w-8 text-ink-faint" aria-hidden />
              <p className="mt-3 text-base font-medium text-ink">Escolha um paciente</p>
              <p className="mt-1 max-w-sm text-sm text-ink-muted">A ficha mostra o cadastro, a foto, as próximas consultas e o histórico de cada atendimento.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
