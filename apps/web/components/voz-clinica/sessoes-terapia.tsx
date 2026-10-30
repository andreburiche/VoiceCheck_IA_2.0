"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/errors";
import { dataBR, listarAvaliacoes, registrarSessao, type ResultadoSessao } from "@/lib/voz-clinica-api";

const AREA =
  "mt-1 block w-full rounded-lg border border-line bg-canvas-raised px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

type Campos = { objetivos: string; exercicios: string; resposta: string; orientacoes: string; observacoes: string };
const VAZIO: Campos = { objetivos: "", exercicios: "", resposta: "", orientacoes: "", observacoes: "" };
const ROTULOS: [keyof Campos, string, string, number][] = [
  ["objetivos", "Objetivos da sessão", "ex.: reduzir a tensão laríngea; coordenar respiração e fala", 1000],
  ["exercicios", "Exercícios e procedimentos (um por linha)", "ex.: sopro sonorizado no canudo, 3 × 1 min", 2000],
  ["resposta", "Resposta do paciente", "como o paciente respondeu aos exercícios", 1000],
  ["orientacoes", "Orientações e tarefas para casa", "o que fazer até a próxima sessão", 1000],
  ["observacoes", "Observações", "", 2000],
];

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Registro das sessões de terapia vocal (evolução clínica), como o histórico de terapia do iVox:
 * data, objetivos, exercícios, resposta do paciente e orientações. Cada sessão entra no histórico
 * do paciente (e no relatório, na exportação LGPD e na planilha).
 */
export function SessoesTerapia({ paciente, versao, aoSalvar }: { paciente: string; versao: number; aoSalvar: () => void }) {
  const id = useId();
  const [data, setData] = useState(hojeLocal);
  const [campos, setCampos] = useState<Campos>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sessoes, setSessoes] = useState<(ResultadoSessao & { id: string })[] | null>(null);
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    if (!paciente) return;
    const meu = ++pedido.current;
    try {
      const itens = (await listarAvaliacoes(paciente)).items.filter((a) => a.tipo === "sessao");
      if (meu !== pedido.current) return;
      setSessoes(itens.map((a) => ({ ...(a.resultado as ResultadoSessao), id: a.id })).sort((a, b) => b.numero - a.numero));
    } catch {
      if (meu === pedido.current) setSessoes([]);
    }
  }, [paciente]);
  useEffect(() => { void carregar(); }, [carregar, versao]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!Object.values(campos).some((v) => v.trim())) {
      setErro("Preencha ao menos um campo da sessão.");
      return;
    }
    setSalvando(true);
    setErro(null);
    setMsg(null);
    try {
      const corpo = Object.fromEntries(Object.entries(campos).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
      const r = await registrarSessao({ paciente, data, ...corpo });
      setMsg(`Sessão ${r.resultado.numero} registrada (${dataBR(r.resultado.data)}).`);
      setCampos(VAZIO);
      aoSalvar();
      void carregar();
    } catch (err) {
      setErro(friendlyError(err, "Não foi possível registrar a sessão. Confira a data."));
    } finally {
      setSalvando(false);
    }
  }

  if (!paciente) {
    return (
      <section className="rounded-2xl bg-canvas-card p-5 ring-1 ring-inset ring-ink/10">
        <p className="text-sm text-ink-muted">Preencha o nome do paciente para registrar as sessões de terapia.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-canvas-card p-5 ring-1 ring-inset ring-ink/10" aria-labelledby={`${id}-t`} data-testid="vc2-sessoes">
      <h2 id={`${id}-t`} className="font-display text-lg font-semibold text-ink">Sessões de terapia — {paciente}</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-muted">
        Registro da evolução, sessão a sessão. O número da sessão é contado automaticamente.
      </p>
      <form className="mt-4 grid gap-3" onSubmit={(e) => void salvar(e)} noValidate>
        <div className="max-w-[12rem]">
          <Label htmlFor={`${id}-data`}>Data da sessão</Label>
          <Input id={`${id}-data`} type="date" className="mt-1" max={hojeLocal()} value={data} onChange={(e) => setData(e.target.value)} data-testid="vc2-sessao-data" />
        </div>
        {ROTULOS.map(([k, rotulo, dica, max]) => (
          <div key={k}>
            <Label htmlFor={`${id}-${k}`}>{rotulo}</Label>
            <textarea id={`${id}-${k}`} rows={k === "exercicios" ? 4 : 2} maxLength={max} placeholder={dica} className={AREA}
              value={campos[k]} onChange={(e) => setCampos((c) => ({ ...c, [k]: e.target.value }))} data-testid={`vc2-sessao-${k}`} />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={salvando} data-testid="vc2-sessao-salvar">{salvando ? "Registrando…" : "Registrar sessão"}</Button>
          {msg ? <p className="text-sm text-ink" role="status" data-testid="vc2-sessao-msg">{msg}</p> : null}
        </div>
        {erro ? <p className="text-sm text-signal-err" role="alert">{erro}</p> : null}
      </form>

      <h3 className="mt-6 font-display text-base font-semibold text-ink">Sessões registradas</h3>
      {sessoes === null ? <p className="mt-2 text-sm text-ink-muted">Carregando…</p> : null}
      {sessoes?.length === 0 ? <p className="mt-2 text-sm text-ink-muted">Nenhuma sessão registrada ainda.</p> : null}
      {sessoes?.length ? (
        <ol className="mt-2 space-y-3" data-testid="vc2-sessoes-lista">
          {sessoes.map((s) => (
            <li key={s.id} className="rounded-xl p-3 ring-1 ring-inset ring-ink/10">
              <p className="text-sm font-semibold text-ink">Sessão {s.numero} · {dataBR(s.data)}</p>
              <dl className="mt-1 grid gap-1 text-sm">
                {s.objetivos ? <div><dt className="inline text-ink-muted">Objetivos: </dt><dd className="inline text-ink">{s.objetivos}</dd></div> : null}
                {s.exercicios_lista?.length ? (
                  <div><dt className="text-ink-muted">Exercícios:</dt>
                    <dd><ul className="ml-5 list-disc text-ink">{s.exercicios_lista.map((x, i) => <li key={i}>{x}</li>)}</ul></dd></div>
                ) : null}
                {s.resposta ? <div><dt className="inline text-ink-muted">Resposta: </dt><dd className="inline text-ink">{s.resposta}</dd></div> : null}
                {s.orientacoes ? <div><dt className="inline text-ink-muted">Orientações: </dt><dd className="inline text-ink">{s.orientacoes}</dd></div> : null}
                {s.observacoes ? <div><dt className="inline text-ink-muted">Observações: </dt><dd className="inline whitespace-pre-line text-ink">{s.observacoes}</dd></div> : null}
              </dl>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
