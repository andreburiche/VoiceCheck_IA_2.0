"use client";

import { Check, Copy, Link2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  criarPlanoPratica,
  listarPlanosPratica,
  revogarPlanoPratica,
  type PlanoPratica,
} from "@/lib/voz-clinica-api";
import {
  TIPOS_EXERCICIO,
  exercicioDoRascunho,
  exercicioPadrao,
  linkPratica,
  mensagemWhatsApp,
  rascunhoDe,
  type ExercicioPratica,
  type Rascunho,
  type TipoExercicio,
} from "@/lib/voz-clinica-pratica";

const PAINEL = "panel-glass rounded-2xl p-4 md:p-5";
const SELECT =
  "mt-1 h-10 w-full rounded-lg border border-line bg-canvas-raised px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";
const MAX_EXERCICIOS = 6;
const VALIDADES = [7, 15, 30, 60, 90];

function dataBR(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function situacao(p: PlanoPratica): { texto: string; ativo: boolean } {
  if (p.revogado_em) return { texto: `Revogado em ${dataBR(p.revogado_em)}`, ativo: false };
  if (!p.ativo) return { texto: `Expirou em ${dataBR(p.expira_em)}`, ativo: false };
  return { texto: `Ativo até ${dataBR(p.expira_em)}`, ativo: true };
}

function EditorExercicio({
  r, i, total, onChange, onRemover,
}: { r: Rascunho; i: number; total: number; onChange: (r: Rascunho) => void; onRemover: () => void }) {
  const id = useId();
  const campo = (k: keyof Rascunho) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...r, [k]: e.target.value });
  return (
    <li className="rounded-xl p-3 ring-1 ring-inset ring-ink/10" data-testid="vc2-pratica-exercicio">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          {i + 1}. {TIPOS_EXERCICIO[r.tipo].nome}
        </p>
        {total > 1 ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemover} aria-label={`Remover exercício ${i + 1}`} title="Remover exercício">
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        ) : null}
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_7rem]">
        <div>
          <Label htmlFor={`${id}-t`}>Título</Label>
          <Input id={`${id}-t`} className="mt-1" maxLength={60} value={r.titulo} onChange={campo("titulo")} />
        </div>
        <div>
          <Label htmlFor={`${id}-r`}>Repetições</Label>
          <Input id={`${id}-r`} className="mt-1" inputMode="numeric" value={r.repeticoes} onChange={campo("repeticoes")} />
        </div>
      </div>
      <div className="mt-3">
        <Label htmlFor={`${id}-i`}>Instrução para o paciente</Label>
        <textarea id={`${id}-i`} maxLength={300} value={r.instrucao} onChange={campo("instrucao")}
          className="mt-1 min-h-[3.5rem] w-full rounded-lg border border-line bg-canvas-raised px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60" />
      </div>
      {r.tipo === "sustentar" ? (
        <div className="mt-3 max-w-[12rem]">
          <Label htmlFor={`${id}-m`}>Meta (segundos, opcional)</Label>
          <Input id={`${id}-m`} className="mt-1" inputMode="decimal" value={r.meta_s} onChange={campo("meta_s")} />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor={`${id}-d`}>Segundos</Label>
            <Input id={`${id}-d`} className="mt-1" inputMode="decimal" value={r.duracao_s} onChange={campo("duracao_s")} />
          </div>
          <div>
            <Label htmlFor={`${id}-min`}>Mínimo ({r.tipo === "pitch" ? "Hz" : "dBFS"})</Label>
            <Input id={`${id}-min`} className="mt-1" inputMode="decimal" value={r.min} onChange={campo("min")} />
          </div>
          <div>
            <Label htmlFor={`${id}-max`}>Máximo ({r.tipo === "pitch" ? "Hz" : "dBFS"})</Label>
            <Input id={`${id}-max`} className="mt-1" inputMode="decimal" value={r.max} onChange={campo("max")} />
          </div>
          {r.tipo === "volume" ? (
            <p className="col-span-3 text-xs text-ink-faint">O volume do celular não é calibrado: combine a faixa testando no próprio aparelho do paciente.</p>
          ) : null}
        </div>
      )}
    </li>
  );
}

function LinkCriado({ plano, link, aoFechar }: { plano: PlanoPratica; link: string; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const id = useId();
  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
    } catch {
      (document.getElementById(`${id}-l`) as HTMLInputElement | null)?.select();
    }
  }
  return (
    <div className="rounded-xl bg-accent/[0.07] p-4 ring-1 ring-inset ring-accent/40" role="status" data-testid="vc2-pratica-link">
      <p className="font-medium text-ink">Link criado para {plano.paciente}</p>
      <p className="mt-1 text-sm text-ink-muted">
        Envie ao paciente agora: por segurança, o link aparece só desta vez. Se ele se perder, revogue este plano e crie outro.
      </p>
      <Label htmlFor={`${id}-l`} className="sr-only">Link do paciente</Label>
      <Input id={`${id}-l`} readOnly value={link} className="mt-3 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} data-testid="vc2-pratica-url" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void copiar()}>
          {copiado ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copiado ? "Copiado" : "Copiar link"}
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensagemWhatsApp(link, plano.saudacao))}`}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-medium text-ink ring-1 ring-inset ring-line hover:bg-ink/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Enviar pelo WhatsApp
        </a>
        <Button type="button" size="sm" variant="ghost" onClick={aoFechar}>Fechar</Button>
      </div>
    </div>
  );
}

export function PraticaCasa({ paciente, ativo, aoMudar }: { paciente: string; ativo: boolean; aoMudar: () => void }) {
  const id = useId();
  const [saudacao, setSaudacao] = useState("");
  const [validade, setValidade] = useState(30);
  const [rascunhos, setRascunhos] = useState<Rascunho[]>(() => [rascunhoDe(exercicioPadrao("sustentar"))]);
  const [criando, setCriando] = useState(false);
  const [criado, setCriado] = useState<{ plano: PlanoPratica; link: string } | null>(null);
  const [planos, setPlanos] = useState<PlanoPratica[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [revogar, setRevogar] = useState<PlanoPratica | null>(null);
  const [revogando, setRevogando] = useState(false);
  // sessões chegam do celular a qualquer hora: se o total mudou, o histórico recarrega
  const totalSessoes = useRef<number | null>(null);

  const pedido = useRef(0);
  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
    if (!paciente) return setPlanos(null);
    try {
      const itens = (await listarPlanosPratica(paciente)).items;
      if (meu !== pedido.current) return; // resposta de outro paciente, já trocado
      setPlanos(itens);
      const total = itens.reduce((n, p) => n + p.sessoes, 0);
      if (totalSessoes.current !== null && total !== totalSessoes.current) aoMudar();
      totalSessoes.current = total;
    } catch (e) {
      if (meu !== pedido.current) return;
      setErro(friendlyError(e, "Não foi possível carregar os planos."));
    }
  }, [paciente, aoMudar]);

  useEffect(() => {
    totalSessoes.current = null; // outro paciente: começa a contar de novo
    setPlanos(null); // não mostra os links do paciente anterior enquanto carrega
  }, [paciente]);

  useEffect(() => {
    if (!ativo) return;
    setCriado(null);
    const t = window.setTimeout(() => void carregar(), 300);
    return () => window.clearTimeout(t);
  }, [ativo, carregar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!paciente) return setErro("Preencha o nome do paciente, no topo da página.");
    const exercicios: ExercicioPratica[] = [];
    for (const [i, r] of rascunhos.entries()) {
      const ex = exercicioDoRascunho(r, i + 1);
      if (typeof ex === "string") return setErro(ex);
      exercicios.push(ex);
    }
    setCriando(true);
    try {
      const { token, ...plano } = await criarPlanoPratica({ paciente, saudacao, exercicios, validade_dias: validade });
      setCriado({ plano, link: linkPratica(window.location.origin, token) });
      await carregar();
      aoMudar();
    } catch (err) {
      setErro(friendlyError(err, "Não foi possível criar o plano."));
    } finally {
      setCriando(false);
    }
  }

  async function confirmarRevogar() {
    if (!revogar) return;
    setRevogando(true);
    try {
      await revogarPlanoPratica(revogar.id);
      setRevogar(null);
      if (criado?.plano.id === revogar.id) setCriado(null);
      await carregar();
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível revogar o link."));
    } finally {
      setRevogando(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className={PAINEL} aria-labelledby={`${id}-t`} data-testid="vc2-pratica">
        <h2 id={`${id}-t`} className="font-display text-lg font-semibold text-ink">Prática em casa</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-muted">
          Monte os exercícios e envie um link ao paciente. Ele pratica pelo celular, sem conta e até sem internet; o áudio fica no aparelho e só os resultados chegam ao histórico.
        </p>

        <form onSubmit={(e) => void criar(e)} className="mt-5 space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${id}-s`}>Como chamar o paciente no celular</Label>
              <Input id={`${id}-s`} className="mt-1" maxLength={60} value={saudacao} onChange={(e) => setSaudacao(e.target.value)} placeholder="Ex.: Ana (opcional)" />
              <p className="mt-1 text-xs text-ink-faint">O nome completo não vai para o celular.</p>
            </div>
            <div>
              <Label htmlFor={`${id}-v`}>Validade do link</Label>
              <select id={`${id}-v`} className={SELECT} value={validade} onChange={(e) => setValidade(Number(e.target.value))}>
                {VALIDADES.map((d) => (
                  <option key={d} value={d}>{d} dias</option>
                ))}
              </select>
            </div>
          </div>

          <ol className="space-y-3">
            {rascunhos.map((r, i) => (
              <EditorExercicio key={i} r={r} i={i} total={rascunhos.length}
                onChange={(novo) => setRascunhos((lista) => lista.map((x, j) => (j === i ? novo : x)))}
                onRemover={() => setRascunhos((lista) => lista.filter((_, j) => j !== i))} />
            ))}
          </ol>

          {rascunhos.length < MAX_EXERCICIOS ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink-muted">Adicionar:</span>
              {(Object.keys(TIPOS_EXERCICIO) as TipoExercicio[]).map((t) => (
                <Button key={t} type="button" variant="secondary" size="sm" title={TIPOS_EXERCICIO[t].descricao}
                  onClick={() => setRascunhos((lista) => [...lista, rascunhoDe(exercicioPadrao(t))])}>
                  <Plus className="h-4 w-4" aria-hidden /> {TIPOS_EXERCICIO[t].nome}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-faint">Máximo de {MAX_EXERCICIOS} exercícios por plano.</p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-ink/[0.07] pt-4">
            <Button type="submit" disabled={criando} data-testid="vc2-pratica-criar">
              <Link2 className="h-4 w-4" aria-hidden /> {criando ? "Criando…" : "Criar link do paciente"}
            </Button>
            {!paciente ? <span className="text-xs text-ink-faint">Preencha o paciente no topo da página.</span> : null}
          </div>
          {erro ? <p className="text-sm text-signal-err" role="alert">{erro}</p> : null}
          {criado ? <LinkCriado plano={criado.plano} link={criado.link} aoFechar={() => setCriado(null)} /> : null}
        </form>
      </section>

      <section className={PAINEL} aria-labelledby={`${id}-p`}>
        <h2 id={`${id}-p`} className="font-display text-lg font-semibold text-ink">Links {paciente ? `de ${paciente}` : ""}</h2>
        {!paciente ? <p className="mt-2 text-sm text-ink-muted">Preencha o paciente para ver os links já criados.</p> : null}
        {paciente && planos === null && !erro ? <p className="mt-2 text-sm text-ink-muted">Carregando…</p> : null}
        {planos?.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-ink/15 px-4 py-4 text-sm text-ink-muted">
            Nenhum link criado ainda. Monte os exercícios ao lado e toque em “Criar link do paciente”.
          </p>
        ) : null}
        {planos?.length ? (
          <ul className="mt-3 divide-y divide-ink/[0.07] overflow-hidden rounded-xl ring-1 ring-inset ring-ink/10" data-testid="vc2-pratica-planos">
            {planos.map((p) => {
              const s = situacao(p);
              return (
                <li key={p.id} className="flex items-start gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">
                      {p.exercicios.length} {p.exercicios.length === 1 ? "exercício" : "exercícios"}
                      <span className={cn("ml-2 text-xs font-normal", s.ativo ? "text-signal-ok" : "text-ink-faint")}>{s.texto}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">{p.exercicios.map((e) => e.titulo).join(" · ")}</p>
                    <p className="text-data mt-0.5 text-xs text-ink-faint">
                      {p.sessoes === 0 ? "Nenhuma sessão recebida" : `${p.sessoes} ${p.sessoes === 1 ? "sessão recebida" : "sessões recebidas"} · última em ${dataBR(p.ultima_sessao!)}`}
                    </p>
                  </div>
                  {s.ativo ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setRevogar(p)}>Revogar</Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        <p className="mt-3 text-xs text-ink-faint">As sessões recebidas aparecem no histórico do paciente, com curva própria na evolução.</p>
      </section>

      <ConfirmDialog
        open={revogar !== null}
        title="Revogar este link?"
        description="O link para de funcionar na hora no celular do paciente. As sessões já recebidas continuam no histórico."
        confirmLabel="Revogar link"
        danger
        busy={revogando}
        onConfirm={() => void confirmarRevogar()}
        onCancel={() => setRevogar(null)}
      />
    </div>
  );
}
