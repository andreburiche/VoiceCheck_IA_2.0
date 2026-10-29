"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  ALCOOL,
  EVOLUCAO,
  INICIO,
  PERGUNTAS_SIM_NAO,
  SINTOMAS,
  TABAGISMO,
  USO_PROFISSIONAL,
  limparAnamnese,
  type Anamnese,
  type Sintoma,
} from "@/lib/voz-clinica-anamnese";
import { listarAvaliacoes, salvarAnamnese } from "@/lib/voz-clinica-api";

const PAINEL = "panel-glass rounded-2xl p-4 md:p-5";
const SELECT =
  "mt-1 h-10 w-full rounded-lg border border-line bg-canvas-raised px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";
const AREA =
  "mt-1 w-full rounded-lg border border-line bg-canvas-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";
// o divisor fica num div em volta: borda no próprio fieldset prende a legenda na linha
const SECAO = "border-t border-ink/[0.07] pt-5 first:border-t-0 first:pt-0";
const GRUPO = "min-w-0 space-y-4";
const LEGENDA = "mb-4 font-display text-base font-semibold text-ink";

type Formulario = {
  [K in keyof Anamnese]-?: K extends "sintomas" ? Sintoma[] : string;
};

const VAZIO: Formulario = {
  queixa: "", inicio: "", evolucao: "", sintomas: [], profissao: "", uso_profissional: "", horas_voz_dia: "",
  canto_estilo: "", aulas_canto: "", tabagismo: "", alcool: "", agua_copos_dia: "", refluxo: "",
  alergia_respiratoria: "", perda_auditiva: "", fono_anterior: "", cirurgias: "", medicamentos: "", observacoes: "",
};

/** Formulário (tudo texto) → corpo da API (números, booleanos, campos vazios fora). */
function paraEnvio(f: Formulario): Anamnese {
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const simNao = (v: string) => (v === "sim" ? true : v === "nao" ? false : null);
  return limparAnamnese({
    ...f,
    horas_voz_dia: num(f.horas_voz_dia),
    agua_copos_dia: num(f.agua_copos_dia),
    ...Object.fromEntries(PERGUNTAS_SIM_NAO.map(([c]) => [c, simNao(f[c])])),
  });
}

/** Anamnese salva → formulário (para reaproveitar a última). */
function paraFormulario(a: Anamnese): Formulario {
  const f: Formulario = { ...VAZIO };
  for (const [k, v] of Object.entries(a) as [keyof Anamnese, unknown][]) {
    if (k === "sintomas") f.sintomas = (v as Sintoma[]).filter((s) => s in SINTOMAS);
    else if (typeof v === "boolean") (f as Record<string, unknown>)[k] = v ? "sim" : "nao";
    else if (typeof v === "number") (f as Record<string, unknown>)[k] = String(v).replace(".", ",");
    else if (typeof v === "string" && k in VAZIO) (f as Record<string, unknown>)[k] = v;
  }
  return f;
}

function Escolha<T extends Record<string, string>>({
  id, rotulo, valor, opcoes, onChange,
}: { id: string; rotulo: string; valor: string; opcoes: T; onChange: (v: string) => void }) {
  return (
    <div>
      <Label htmlFor={id}>{rotulo}</Label>
      <select id={id} className={SELECT} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Não informado</option>
        {Object.entries(opcoes).map(([v, r]) => (
          <option key={v} value={v}>{r}</option>
        ))}
      </select>
    </div>
  );
}

export function AnamneseVocal({ paciente, aoSalvar }: { paciente: string; aoSalvar: () => void }) {
  const id = useId();
  const [f, setF] = useState<Formulario>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const campo = <K extends keyof Formulario>(k: K, v: Formulario[K]) => {
    setF((atual) => ({ ...atual, [k]: v }));
    setMensagem(null);
  };
  const preenchidos = Object.keys(paraEnvio(f)).length;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!paciente) return setErro("Preencha o nome do paciente, no topo da página, para salvar a anamnese.");
    if (!preenchidos) return setErro("Preencha ao menos um campo antes de salvar.");
    // confere o texto digitado (um valor ilegível não pode sumir em silêncio)
    const lido = (v: string) => Number(v.trim().replace(",", "."));
    if (f.horas_voz_dia.trim() && !(lido(f.horas_voz_dia) >= 0 && lido(f.horas_voz_dia) <= 24))
      return setErro("Horas de uso da voz por dia: informe um número de 0 a 24.");
    if (f.agua_copos_dia.trim() && !(Number.isInteger(lido(f.agua_copos_dia)) && lido(f.agua_copos_dia) >= 0 && lido(f.agua_copos_dia) <= 40))
      return setErro("Copos de água por dia: informe um número inteiro de 0 a 40.");
    setSalvando(true);
    try {
      await salvarAnamnese(paciente, paraEnvio(f));
      setMensagem(`Anamnese salva no histórico de ${paciente}.`);
      aoSalvar();
    } catch (err) {
      setErro(friendlyError(err, "Não foi possível salvar a anamnese."));
    } finally {
      setSalvando(false);
    }
  }

  async function usarUltima() {
    if (!paciente) return setErro("Preencha o nome do paciente para buscar a última anamnese.");
    setCarregando(true);
    setErro(null);
    try {
      const ultima = (await listarAvaliacoes(paciente)).items
        .filter((a) => a.tipo === "anamnese")
        .sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0];
      if (!ultima) {
        setMensagem(`${paciente} ainda não tem anamnese salva.`);
      } else {
        setF(paraFormulario(ultima.resultado as Anamnese));
        setMensagem(`Campos preenchidos com a anamnese de ${new Date(ultima.criado_em).toLocaleDateString("pt-BR")}. Ao salvar, uma nova versão entra no histórico.`);
      }
    } catch (err) {
      setErro(friendlyError(err, "Não foi possível buscar a última anamnese."));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <section className={PAINEL} aria-labelledby={`${id}-t`} data-testid="vc2-anamnese">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-t`} className="font-display text-lg font-semibold text-ink">Anamnese vocal</h2>
          <p className="mt-1 max-w-[70ch] text-sm text-ink-muted">
            Todos os campos são opcionais. Só o que for preenchido vai para o histórico e para o relatório.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => void usarUltima()} disabled={carregando} data-testid="vc2-anamnese-ultima">
          {carregando ? "Buscando…" : "Usar a última anamnese"}
        </Button>
      </div>

      <form onSubmit={(e) => void salvar(e)} className="mt-5 space-y-5" noValidate>
        <div className={SECAO}><fieldset className={GRUPO}>
          <legend className={LEGENDA}>Queixa</legend>
          <div>
            <Label htmlFor={`${id}-queixa`}>Queixa principal</Label>
            <textarea id={`${id}-queixa`} className={cn(AREA, "min-h-[4.5rem]")} maxLength={1000} value={f.queixa}
              onChange={(e) => campo("queixa", e.target.value)} placeholder="Nas palavras do paciente" data-testid="vc2-anamnese-queixa" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Escolha id={`${id}-inicio`} rotulo="Há quanto tempo" valor={f.inicio} opcoes={INICIO} onChange={(v) => campo("inicio", v)} />
            <Escolha id={`${id}-evolucao`} rotulo="Evolução" valor={f.evolucao} opcoes={EVOLUCAO} onChange={(v) => campo("evolucao", v)} />
          </div>
          <div role="group" aria-labelledby={`${id}-sint`}>
            <p id={`${id}-sint`} className="text-sm font-medium text-ink">Sintomas</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.entries(SINTOMAS) as [Sintoma, string][]).map(([s, rotulo]) => {
                const marcado = f.sintomas.includes(s);
                return (
                  <label key={s}
                    className={cn("inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg px-3 text-sm ring-1 ring-inset transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                      marcado ? "bg-accent/15 text-ink ring-accent/50" : "text-ink-muted ring-line hover:text-ink")}>
                    <input type="checkbox" className="accent-[var(--accent)]" checked={marcado}
                      onChange={() => campo("sintomas", marcado ? f.sintomas.filter((x) => x !== s) : [...f.sintomas, s])} />
                    {rotulo}
                  </label>
                );
              })}
            </div>
          </div>
        </fieldset></div>

        <div className={SECAO}><fieldset className={GRUPO}>
          <legend className={LEGENDA}>Uso da voz</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${id}-prof`}>Profissão</Label>
              <Input id={`${id}-prof`} className="mt-1" maxLength={120} value={f.profissao} onChange={(e) => campo("profissao", e.target.value)} />
            </div>
            <Escolha id={`${id}-uso`} rotulo="Usa a voz profissionalmente" valor={f.uso_profissional} opcoes={USO_PROFISSIONAL} onChange={(v) => campo("uso_profissional", v)} />
            <div>
              <Label htmlFor={`${id}-horas`}>Horas de uso da voz por dia</Label>
              <Input id={`${id}-horas`} className="mt-1" inputMode="decimal" value={f.horas_voz_dia} onChange={(e) => campo("horas_voz_dia", e.target.value)} placeholder="Ex.: 6" />
            </div>
            <div>
              <Label htmlFor={`${id}-canto`}>Estilo de canto</Label>
              <Input id={`${id}-canto`} className="mt-1" maxLength={120} value={f.canto_estilo} onChange={(e) => campo("canto_estilo", e.target.value)} placeholder="Se canta. Ex.: coral, sertanejo" />
            </div>
          </div>
        </fieldset></div>

        <div className={SECAO}><fieldset className={GRUPO}>
          <legend className={LEGENDA}>Hábitos e saúde</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Escolha id={`${id}-fumo`} rotulo="Tabagismo" valor={f.tabagismo} opcoes={TABAGISMO} onChange={(v) => campo("tabagismo", v)} />
            <Escolha id={`${id}-alcool`} rotulo="Álcool" valor={f.alcool} opcoes={ALCOOL} onChange={(v) => campo("alcool", v)} />
            <div>
              <Label htmlFor={`${id}-agua`}>Copos de água por dia</Label>
              <Input id={`${id}-agua`} className="mt-1" inputMode="numeric" value={f.agua_copos_dia} onChange={(e) => campo("agua_copos_dia", e.target.value)} placeholder="Ex.: 8" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {PERGUNTAS_SIM_NAO.map(([c, rotulo]) => (
              <Escolha key={c} id={`${id}-${c}`} rotulo={rotulo} valor={f[c]} opcoes={{ sim: "Sim", nao: "Não" }} onChange={(v) => campo(c, v)} />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${id}-cir`}>Cirurgias ou intubações</Label>
              <textarea id={`${id}-cir`} className={cn(AREA, "min-h-[3.5rem]")} maxLength={500} value={f.cirurgias} onChange={(e) => campo("cirurgias", e.target.value)} />
            </div>
            <div>
              <Label htmlFor={`${id}-med`}>Medicamentos em uso</Label>
              <textarea id={`${id}-med`} className={cn(AREA, "min-h-[3.5rem]")} maxLength={500} value={f.medicamentos} onChange={(e) => campo("medicamentos", e.target.value)} />
            </div>
          </div>
        </fieldset></div>

        <div className={SECAO}><fieldset className={GRUPO}>
          <legend className={LEGENDA}>Observações</legend>
          <div>
            <Label htmlFor={`${id}-obs`} className="sr-only">Observações</Label>
            <textarea id={`${id}-obs`} className={cn(AREA, "min-h-[5rem]")} maxLength={4000} value={f.observacoes} onChange={(e) => campo("observacoes", e.target.value)} placeholder="Outras informações relevantes" />
          </div>
        </fieldset></div>

        <div className="flex flex-wrap items-center gap-3 border-t border-ink/[0.07] pt-4">
          <Button type="submit" disabled={salvando} data-testid="vc2-anamnese-salvar">
            {salvando ? "Salvando…" : "Salvar anamnese"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setF(VAZIO); setMensagem(null); setErro(null); }}>
            Limpar campos
          </Button>
          <span className="text-xs text-ink-faint">{preenchidos} {preenchidos === 1 ? "campo preenchido" : "campos preenchidos"}</span>
        </div>
        {mensagem ? <p className="text-sm text-ink" role="status" data-testid="vc2-anamnese-msg">{mensagem}</p> : null}
        {erro ? <p className="text-sm text-signal-err" role="alert">{erro}</p> : null}
      </form>
    </section>
  );
}
