"use client";

import { useId, useState } from "react";
import { Download, KeyRound, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_URL, authApi } from "@/lib/api";

const PAINEL = "rounded-2xl bg-canvas-raised/60 p-5 ring-1 ring-inset ring-ink/10";

/** Segurança da conta: trocar a senha, sair de todos os aparelhos e baixar os dados da conta (LGPD art. 18). */
export function SegurancaConta() {
  const id = useId();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [sairTodos, setSairTodos] = useState(false);

  async function trocar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErro(null);
    if (nova.length < 8) return setErro("A nova senha precisa de pelo menos 8 caracteres.");
    if (nova !== confirma) return setErro("A confirmação não é igual à nova senha.");
    setOcupado(true);
    try {
      await authApi.changePassword(atual, nova);
      setAtual(""); setNova(""); setConfirma("");
      setMsg("Senha trocada. Os outros aparelhos precisam entrar de novo.");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function baixar() {
    setErro(null);
    try {
      const r = await fetch(`${API_URL}/api/v1/users/me/exportar`, { credentials: "include" });
      if (!r.ok) throw new Error("Não foi possível gerar o arquivo. Tente de novo em instantes.");
      const nome = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "minha-conta.json";
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  return (
    <section className={`${PAINEL} mt-6`} aria-labelledby={`${id}-titulo`} data-testid="perfil-seguranca">
      <h2 id={`${id}-titulo`} className="font-display text-lg font-semibold text-ink">Segurança e dados da conta</h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <form onSubmit={trocar} className="grid gap-3 sm:grid-cols-3" noValidate>
          <div>
            <Label htmlFor={`${id}-atual`}>Senha atual</Label>
            <Input id={`${id}-atual`} type="password" autoComplete="current-password" className="mt-1" value={atual} onChange={(e) => setAtual(e.target.value)} />
          </div>
          <div>
            <Label htmlFor={`${id}-nova`}>Nova senha</Label>
            <Input id={`${id}-nova`} type="password" autoComplete="new-password" className="mt-1" value={nova} onChange={(e) => setNova(e.target.value)} />
          </div>
          <div>
            <Label htmlFor={`${id}-conf`}>Repita a nova senha</Label>
            <Input id={`${id}-conf`} type="password" autoComplete="new-password" className="mt-1" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" size="sm" disabled={ocupado || !atual || !nova}><KeyRound className="h-4 w-4" aria-hidden /> Trocar senha</Button>
          </div>
        </form>
        <div className="space-y-2">
          <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => setSairTodos(true)}>
            <LogOut className="h-4 w-4" aria-hidden /> Sair de todos os aparelhos
          </Button>
          <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => void baixar()}>
            <Download className="h-4 w-4" aria-hidden /> Baixar os dados da minha conta
          </Button>
          <p className="text-xs text-ink-faint">Os dados de cada paciente saem pela exportação do paciente, em Pacientes.</p>
        </div>
      </div>
      {msg ? <p role="status" className="mt-3 text-sm text-ink-muted">{msg}</p> : null}
      {erro ? <p role="alert" className="mt-3 text-sm text-signal-err">{erro}</p> : null}
      <ConfirmDialog open={sairTodos} title="Sair de todos os aparelhos"
        description="Todas as sessões abertas (este computador, celular, outros navegadores) serão encerradas. Você vai precisar entrar de novo."
        confirmLabel="Sair de todos" onCancel={() => setSairTodos(false)}
        onConfirm={async () => {
          try { await authApi.logoutAll(); } finally { window.location.assign("/login"); }
        }} />
    </section>
  );
}
