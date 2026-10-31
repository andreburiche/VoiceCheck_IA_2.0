"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, CalendarDays, CalendarPlus, CalendarX2, CheckCheck, ChevronLeft, ChevronRight, MapPin, Monitor, Home, Trash2 } from "lucide-react";

import { KpisTopo } from "@/components/dashboard/kpis-topo";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormularioConsulta } from "@/components/voz-clinica/formulario-consulta";
import { NavegacaoClinica } from "@/components/voz-clinica/navegacao-clinica";
import {
  CHAVE_ABRIR_PACIENTE,
  ROTULO_MODALIDADE,
  ROTULO_SITUACAO,
  ROTULO_TIPO_CONSULTA,
  ativa,
  chaveDia,
  diaCurtoBR,
  diasDaSemana,
  horaBR,
  inicioDaSemana,
  porDia,
  rotuloSemana,
  somarDias,
} from "@/lib/voz-clinica-agenda";
import {
  atualizarConsulta,
  excluirConsulta,
  listarAgenda,
  listarPacientes,
  type Consulta,
  type PacienteResumo,
  type SituacaoConsulta,
} from "@/lib/voz-clinica-api";
import { cn } from "@/lib/utils";

const PAINEL = "panel-glass rounded-2xl p-4 md:p-5";

export const COR_SITUACAO: Record<SituacaoConsulta, string> = {
  agendada: "bg-ink/[0.07] text-ink-muted",
  confirmada: "bg-accent/15 text-accent",
  realizada: "bg-brand-blue/15 text-brand-blue",
  faltou: "bg-flare/15 text-flare",
  cancelada: "bg-ink/[0.04] text-ink-faint line-through",
};

type FiltroSemana = "todas" | SituacaoConsulta;
const FILTROS_SEMANA: Array<{ valor: FiltroSemana; rotulo: string }> = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "agendada", rotulo: "Agendadas" },
  { valor: "confirmada", rotulo: "Confirmadas" },
  { valor: "realizada", rotulo: "Realizadas" },
  { valor: "faltou", rotulo: "Faltas" },
];

/** Botões de ação do cartão: compactos no mouse, 44 px no toque. */
const ACAO = "rounded-full px-2.5 py-1 text-xs toque:min-h-11 toque:px-3.5";

const ICONE_MODALIDADE = { presencial: MapPin, online: Monitor, domiciliar: Home } as const;

function entradaDe(c: Consulta, situacao: SituacaoConsulta) {
  // mudar só a situação não deve esbarrar no aviso de horário ocupado
  return { paciente: c.paciente, inicio: c.inicio, duracao_min: c.duracao_min, tipo: c.tipo, modalidade: c.modalidade,
           situacao, observacoes: c.observacoes, permitir_conflito: true };
}

export function CartaoConsulta({ c, onEditar, onSituacao, onExcluir, onAbrir, compacto, rotuloDia }: {
  c: Consulta;
  /** Mostra o dia no cartão (fora da grade da semana). */
  rotuloDia?: string;
  onEditar: () => void;
  onSituacao: (s: SituacaoConsulta) => void;
  onExcluir: () => void;
  onAbrir?: () => void;
  compacto?: boolean;
}) {
  const passou = new Date(c.inicio) <= new Date();
  const aberta = c.situacao === "agendada" || c.situacao === "confirmada";
  const Icone = ICONE_MODALIDADE[c.modalidade];
  return (
    <li className={cn("rounded-2xl bg-canvas-raised/70 p-3 ring-1 ring-inset ring-ink/10", c.situacao === "cancelada" && "opacity-70")}
      data-testid="vc2-consulta">
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <button type="button" onClick={onEditar} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          aria-label={`Editar consulta de ${c.paciente} às ${horaBR(c.inicio)}`}>
          {rotuloDia ? <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{rotuloDia}</p> : null}
          <p className="font-mono text-sm font-semibold text-ink">{horaBR(c.inicio)}<span className="font-normal text-ink-faint">–{horaBR(c.fim)}</span></p>
          {compacto ? null : <p className="truncate text-sm font-medium text-ink">{c.paciente}</p>}
          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
            <Icone className="h-3 w-3 shrink-0" aria-hidden />
            {ROTULO_TIPO_CONSULTA[c.tipo]} · {ROTULO_MODALIDADE[c.modalidade]}
          </p>
        </button>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", COR_SITUACAO[c.situacao])}>
          {ROTULO_SITUACAO[c.situacao]}
        </span>
      </div>
      {c.observacoes ? <p className="mt-1.5 line-clamp-2 text-xs text-ink-muted">{c.observacoes}</p> : null}
      <div className="mt-2 flex flex-wrap gap-1">
        {aberta && !passou && c.situacao === "agendada" ? (
          <button type="button" className={cn(ACAO, "text-accent hover:bg-accent/10")} onClick={() => onSituacao("confirmada")}>Confirmar</button>
        ) : null}
        {aberta && passou ? (
          <>
            <button type="button" className={cn(ACAO, "text-accent hover:bg-accent/10")} onClick={() => onSituacao("realizada")}>Realizada</button>
            <button type="button" className={cn(ACAO, "text-flare hover:bg-flare/10")} onClick={() => onSituacao("faltou")}>Faltou</button>
          </>
        ) : null}
        {aberta ? (
          <button type="button" className={cn(ACAO, "text-ink-muted hover:bg-ink/[0.05]")} onClick={() => onSituacao("cancelada")}>Cancelar</button>
        ) : null}
        {onAbrir ? (
          <button type="button" className={cn(ACAO, "text-ink-muted hover:bg-ink/[0.05]")} onClick={onAbrir}>Ficha</button>
        ) : null}
        <button type="button" className="ml-auto rounded-full p-1.5 text-ink-faint hover:bg-signal-err/10 hover:text-signal-err toque:p-3.5" onClick={onExcluir}
          aria-label={`Excluir consulta de ${c.paciente}`}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </li>
  );
}

/** Agenda semanal de consultas (segunda a domingo), com marcação, remarcação e situação. */
export function AgendaClinica() {
  const router = useRouter();
  const [semana, setSemana] = useState(() => inicioDaSemana(new Date()));
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<{ consulta?: Consulta; sugestao?: { data: string; hora: string } } | null>(null);
  const [apagar, setApagar] = useState<Consulta | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroSemana>("todas");

  const carregar = useCallback(() => {
    setCarregando(true);
    listarAgenda(semana, somarDias(semana, 7))
      .then((r) => { setConsultas(r.items); setErro(null); })
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [semana]);
  useEffect(carregar, [carregar]);
  useEffect(() => { listarPacientes().then((r) => setPacientes(r.items)).catch(() => undefined); }, []);

  const dias = useMemo(() => diasDaSemana(semana), [semana]);
  const grupos = useMemo(() => porDia(filtro === "todas" ? consultas : consultas.filter((c) => c.situacao === filtro)), [consultas, filtro]);
  const hoje = chaveDia(new Date());
  const resumo = useMemo(() => {
    const ativas = consultas.filter(ativa);
    return {
      total: ativas.length,
      confirmadas: ativas.filter((c) => c.situacao === "confirmada").length,
      realizadas: ativas.filter((c) => c.situacao === "realizada").length,
      faltas: ativas.filter((c) => c.situacao === "faltou").length,
    };
  }, [consultas]);

  async function mudarSituacao(c: Consulta, s: SituacaoConsulta) {
    try {
      const novo = await atualizarConsulta(c.id, entradaDe(c, s));
      setConsultas((l) => l.map((x) => (x.id === novo.id ? novo : x)));
      setAviso(`Consulta de ${c.paciente} marcada como ${ROTULO_SITUACAO[s].toLowerCase()}.`);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function abrirFicha(nome: string) {
    try { sessionStorage.setItem(CHAVE_ABRIR_PACIENTE, nome); } catch { /* sem storage: abre a lista */ }
    router.push("/voz-clinica/pacientes");
  }

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <NavegacaoClinica />
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">Agenda</h1>
            <p className="mt-1 max-w-md text-base text-ink-muted">Consultas da semana. Toque num horário para editar ou num dia vazio para agendar.</p>
            <Button className="mt-4 rounded-full" onClick={() => setForm({})} data-testid="vc2-agendar">
              <CalendarPlus className="h-4 w-4" aria-hidden /> Agendar consulta
            </Button>
          </div>
          <KpisTopo
            carregando={carregando}
            itens={[
              { icone: CalendarDays, valor: String(resumo.total), rotulo: "Consultas na semana" },
              { icone: CalendarCheck2, valor: String(resumo.confirmadas), rotulo: "Confirmadas" },
              { icone: CheckCheck, valor: String(resumo.realizadas), rotulo: "Realizadas" },
              { icone: CalendarX2, valor: String(resumo.faltas), rotulo: "Faltas", etiqueta: resumo.faltas ? "rever" : undefined, alerta: true },
            ]}
          />
        </div>
      </header>

      <section className={PAINEL} aria-label="Semana">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-full bg-ink/[0.05] p-1">
              <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setSemana((s) => somarDias(s, -7))} aria-label="Semana anterior">
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setSemana(inicioDaSemana(new Date()))}>Hoje</Button>
              <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setSemana((s) => somarDias(s, 7))} aria-label="Próxima semana">
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <h2 className="font-display text-lg font-semibold text-ink" aria-live="polite">{rotuloSemana(semana)}</h2>
          </div>
          <div role="group" aria-label="Mostrar consultas" className="flex max-w-full gap-1 overflow-x-auto overscroll-x-contain rounded-full bg-ink/[0.05] p-1 [scrollbar-width:none]">
            {FILTROS_SEMANA.map((f) => (
              <button
                key={f.valor}
                type="button"
                aria-pressed={filtro === f.valor}
                onClick={() => setFiltro(f.valor)}
                className={cn(
                  "inline-flex min-h-8 toque:min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  filtro === f.valor ? "bg-canvas-raised text-ink shadow-sm ring-1 ring-inset ring-ink/10" : "text-ink-muted hover:text-ink",
                )}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
        </div>

        {erro ? <p role="alert" className="mt-3 text-sm text-signal-err">{erro}</p> : null}
        {aviso ? <p role="status" className="mt-3 text-sm text-ink-muted">{aviso}</p> : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7" aria-busy={carregando}>
          {dias.map((d) => {
            const k = chaveDia(d);
            const lista = grupos.get(k) ?? [];
            return (
              <section key={k} aria-label={diaCurtoBR(d)}
                className={cn("flex min-h-[7rem] flex-col rounded-2xl p-2 ring-1 ring-inset", k === hoje ? "bg-accent/[0.06] ring-accent/40" : "ring-ink/10")}>
                <h3 className={cn("px-1 pb-2 text-xs font-semibold uppercase tracking-wide", k === hoje ? "text-accent" : "text-ink-muted")}>
                  {diaCurtoBR(d)}{k === hoje ? " · hoje" : ""}
                </h3>
                {lista.length ? (
                  <ul className="space-y-2">
                    {lista.map((c) => (
                      <CartaoConsulta key={c.id} c={c} onEditar={() => setForm({ consulta: c })} onSituacao={(s) => mudarSituacao(c, s)}
                        onExcluir={() => setApagar(c)} onAbrir={() => abrirFicha(c.paciente)} />
                    ))}
                  </ul>
                ) : null}
                <button type="button" onClick={() => setForm({ sugestao: { data: k, hora: "09:00" } })}
                  className="mt-auto rounded-lg px-2 py-2 text-left text-xs text-ink-faint hover:bg-ink/[0.04] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label={`Agendar em ${diaCurtoBR(d)}`}>
                  + agendar
                </button>
              </section>
            );
          })}
        </div>
      </section>

      {form ? (
        <FormularioConsulta consulta={form.consulta} sugestao={form.sugestao} pacientes={pacientes}
          onClose={() => setForm(null)}
          onSalvo={(c) => {
            setForm(null);
            setAviso(form.consulta ? `Consulta de ${c.paciente} atualizada.` : `Consulta de ${c.paciente} agendada.`);
            carregar();
          }} />
      ) : null}
      <ConfirmDialog open={!!apagar} danger busy={ocupado} title="Excluir consulta"
        description={apagar ? `Excluir a consulta de ${apagar.paciente} (${diaCurtoBR(new Date(apagar.inicio))}, ${horaBR(apagar.inicio)})? Para manter o registro de que ela não aconteceu, prefira "Cancelar".` : ""}
        confirmLabel="Excluir" onCancel={() => setApagar(null)}
        onConfirm={async () => {
          if (!apagar) return;
          setOcupado(true);
          try {
            await excluirConsulta(apagar.id);
            setConsultas((l) => l.filter((x) => x.id !== apagar.id));
            setAviso("Consulta excluída.");
          } catch (e) {
            setErro((e as Error).message);
          } finally {
            setOcupado(false);
            setApagar(null);
          }
        }} />
    </div>
  );
}
