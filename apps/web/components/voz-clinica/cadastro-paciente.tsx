"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { obterCadastro, resumoCadastro, salvarCadastro, type CadastroPaciente, type Sexo } from "@/lib/voz-clinica-api";

const SELECT =
  "h-10 w-full rounded-lg border border-line bg-canvas-raised px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

type Form = { data_nascimento: string; sexo: Sexo | ""; telefone: string; email: string; profissao: string; voz: "" | "sim" | "nao"; observacoes: string };
const VAZIO: Form = { data_nascimento: "", sexo: "", telefone: "", email: "", profissao: "", voz: "", observacoes: "" };

function paraForm(c: CadastroPaciente | null): Form {
  if (!c) return VAZIO;
  return {
    data_nascimento: c.data_nascimento ?? "",
    sexo: c.sexo ?? "",
    telefone: c.telefone ?? "",
    email: c.email ?? "",
    profissao: c.profissao ?? "",
    voz: c.profissional_da_voz === null ? "" : c.profissional_da_voz ? "sim" : "nao",
    observacoes: c.observacoes ?? "",
  };
}

/** Cadastro do paciente (data de nascimento, sexo, contato, profissão), ligado pelo nome/código. */
export function CadastroPacienteForm({ paciente, aoSalvar }: { paciente: string; aoSalvar?: (c: CadastroPaciente) => void }) {
  const [cadastro, setCadastro] = useState<CadastroPaciente | null>(null);
  const [form, setForm] = useState<Form>(VAZIO);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const id = useId();
  const pedido = useRef(0);

  useEffect(() => {
    setCadastro(null);
    setForm(VAZIO);
    setMsg(null);
    setErro(null);
    if (!paciente) return;
    const meu = ++pedido.current;
    const t = window.setTimeout(() => {
      obterCadastro(paciente)
        .then((c) => {
          if (meu !== pedido.current) return;
          setCadastro(c);
          setForm(paraForm(c));
        })
        .catch(() => undefined); // sem cadastro carregado a tela segue funcionando
    }, 300);
    return () => window.clearTimeout(t);
  }, [paciente]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    setMsg(null);
    try {
      const c = await salvarCadastro({
        paciente,
        data_nascimento: form.data_nascimento || null,
        sexo: form.sexo || null,
        telefone: form.telefone.trim() || null,
        email: form.email.trim() || null,
        profissao: form.profissao.trim() || null,
        profissional_da_voz: form.voz === "" ? null : form.voz === "sim",
        observacoes: form.observacoes.trim() || null,
      });
      setCadastro(c);
      setForm(paraForm(c));
      setMsg("Cadastro salvo.");
      aoSalvar?.(c);
    } catch (e2) {
      setErro(friendlyError(e2, "Não foi possível salvar o cadastro. Confira e-mail, telefone e data de nascimento."));
    } finally {
      setSalvando(false);
    }
  }

  if (!paciente) return null;
  const resumo = resumoCadastro(cadastro);
  const campo = (k: keyof Form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  return (
    <div className="mt-3" data-testid="vc2-cadastro">
      <button type="button" aria-expanded={aberto} aria-controls={`${id}-form`} onClick={() => setAberto((a) => !a)}
        className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg text-sm text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        data-testid="vc2-cadastro-abrir">
        <ChevronDown className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} aria-hidden />
        {cadastro ? "Cadastro" : "Cadastrar dados do paciente"}
        {resumo ? <span className="text-data text-xs text-ink" data-testid="vc2-cadastro-resumo">· {resumo}</span> : null}
      </button>
      {aberto ? (
        <form id={`${id}-form`} className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => void salvar(e)} noValidate>
          <div>
            <Label htmlFor={`${id}-nasc`}>Data de nascimento</Label>
            <Input id={`${id}-nasc`} type="date" className="mt-1" max={new Date().toISOString().slice(0, 10)} {...campo("data_nascimento")} data-testid="vc2-cadastro-nascimento" />
          </div>
          <div>
            <Label htmlFor={`${id}-sexo`}>Sexo</Label>
            <select id={`${id}-sexo`} className={cn(SELECT, "mt-1")} {...campo("sexo")} data-testid="vc2-cadastro-sexo">
              <option value="">Não informado</option>
              <option value="feminino">Feminino</option>
              <option value="masculino">Masculino</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div>
            <Label htmlFor={`${id}-tel`}>Telefone</Label>
            <Input id={`${id}-tel`} type="tel" inputMode="tel" autoComplete="off" className="mt-1" maxLength={30} {...campo("telefone")} />
          </div>
          <div>
            <Label htmlFor={`${id}-email`}>E-mail</Label>
            <Input id={`${id}-email`} type="email" autoComplete="off" className="mt-1" maxLength={255} {...campo("email")} />
          </div>
          <div>
            <Label htmlFor={`${id}-prof`}>Profissão</Label>
            <Input id={`${id}-prof`} className="mt-1" maxLength={120} {...campo("profissao")} data-testid="vc2-cadastro-profissao" />
          </div>
          <div>
            <Label htmlFor={`${id}-voz`}>Usa a voz profissionalmente?</Label>
            <select id={`${id}-voz`} className={cn(SELECT, "mt-1")} {...campo("voz")} data-testid="vc2-cadastro-voz">
              <option value="">Não informado</option>
              <option value="sim">Sim (professor, cantor, ator, teleatendimento…)</option>
              <option value="nao">Não</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`${id}-obs`}>Observações</Label>
            <textarea id={`${id}-obs`} rows={2} maxLength={2000} {...campo("observacoes")}
              className="mt-1 block w-full rounded-lg border border-line bg-canvas-raised px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60" />
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={salvando} data-testid="vc2-cadastro-salvar">{salvando ? "Salvando…" : "Salvar cadastro"}</Button>
            <span className="text-xs text-ink-faint">Todos os campos são opcionais: guarde só o necessário. Idade, sexo e profissão aparecem no relatório; contatos não.</span>
          </div>
          {msg ? <p className="sm:col-span-2 text-xs text-ink-muted" role="status">{msg}</p> : null}
          {erro ? <p className="sm:col-span-2 text-sm text-signal-err" role="alert">{erro}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
