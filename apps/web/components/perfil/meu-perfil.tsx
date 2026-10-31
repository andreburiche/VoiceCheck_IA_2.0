"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Music2, Save, Stethoscope, GraduationCap } from "lucide-react";

import { FotoEditavel } from "@/components/perfil/foto-editavel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROTULO_PERFIL, authApi, perfilApi, type PerfilDados, type PerfilProfissional, type User } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";

const PAINEL = "rounded-2xl bg-canvas-raised/60 p-5 ring-1 ring-inset ring-ink/10 sm:p-6";

const OPCOES: { id: PerfilProfissional; icone: typeof Stethoscope; texto: string }[] = [
  { id: "fonoaudiologo", icone: Stethoscope, texto: "Avaliação clínica da voz, prontuário, terapia e documentos para o paciente." },
  { id: "professor_musica", icone: GraduationCap, texto: "Treino dos alunos, análise do canto e devolutivas assinadas por você." },
  { id: "musico", icone: Music2, texto: "Seus projetos, estúdio, treino e diagnóstico da própria voz." },
];

type Campos = Required<{ [K in keyof PerfilDados]: string }>;
const VAZIO: Campos = { registro: "", especialidade: "", instituicao: "", telefone: "", endereco: "", cidade: "", apresentacao: "" };

function paraCampos(u: User | undefined): Campos {
  const d = u?.perfil_dados ?? {};
  return Object.fromEntries(Object.keys(VAZIO).map((k) => [k, (d as Record<string, string | undefined>)[k] ?? ""])) as Campos;
}

/** Meu perfil: foto, perfil profissional e dados que entram nos documentos e relatórios. */
export function MeuPerfil() {
  const id = useId();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => authApi.me() });
  const [nome, setNome] = useState("");
  const [perfil, setPerfil] = useState<PerfilProfissional | null>(null);
  const [campos, setCampos] = useState<Campos>(VAZIO);
  const [carregado, setCarregado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!me.data || carregado) return;
    setNome(me.data.name);
    setPerfil(me.data.perfil ?? null);
    setCampos(paraCampos(me.data));
    setCarregado(true);
  }, [me.data, carregado]);

  const fono = perfil === "fonoaudiologo";
  const campo = (k: keyof Campos) => ({
    value: campos[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCampos((c) => ({ ...c, [k]: e.target.value })),
  });

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErro(null);
    if (nome.trim().length < 2) { setErro("Informe seu nome."); return; }
    if (fono && !/\d/.test(campos.registro)) { setErro("Para o perfil de fonoaudiólogo, informe o número do registro no conselho (CRFa)."); return; }
    setSalvando(true);
    try {
      const u = await perfilApi.salvar({ name: nome.trim(), perfil, ...campos });
      qc.setQueryData(["me"], u);
      setMsg("Perfil salvo. Os documentos e relatórios já usam estes dados.");
    } catch (err) {
      setErro(friendlyError(err, "Não foi possível salvar o perfil."));
    } finally {
      setSalvando(false);
    }
  }

  async function trocarFoto(foto: Blob) {
    qc.setQueryData(["me"], await perfilApi.enviarFoto(foto));
  }
  async function removerFoto() {
    qc.setQueryData(["me"], await perfilApi.apagarFoto());
  }

  const assinatura = [nome.trim() || "Seu nome", fono ? campos.registro.trim() : "", campos.especialidade.trim()].filter(Boolean);
  const contato = [campos.instituicao, campos.endereco, campos.telefone].map((v) => v.trim()).filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">Meu perfil</h1>
        <p className="mt-2 max-w-[70ch] text-base text-ink-muted">
          Seus dados profissionais entram no cabeçalho e na assinatura dos documentos clínicos e das devolutivas de música.
        </p>
      </header>

      <form onSubmit={(e) => void salvar(e)} className="grid gap-6 lg:grid-cols-[1fr_20rem]" noValidate>
        <div className="space-y-6">
          <section className={PAINEL} aria-labelledby={`${id}-foto`}>
            <h2 id={`${id}-foto`} className="font-display text-lg font-semibold text-ink">Foto</h2>
            <div className="mt-4">
              <FotoEditavel nome={nome || me.data?.name || ""} rotulo="Foto" versao={me.data?.tem_foto ? 1 : 0}
                carregar={() => perfilApi.foto()} enviar={trocarFoto} apagar={removerFoto} testid="perfil-foto" />
            </div>
          </section>

          <section className={PAINEL} aria-labelledby={`${id}-perfil`}>
            <h2 id={`${id}-perfil`} className="font-display text-lg font-semibold text-ink">Como você usa o VoiceCheck</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Perfil profissional">
              {OPCOES.map(({ id: op, icone: Icone, texto }) => (
                <button key={op} type="button" role="radio" aria-checked={perfil === op} onClick={() => setPerfil(op)}
                  className={cn("rounded-xl px-4 py-3 text-left ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    perfil === op ? "bg-accent/10 ring-accent" : "bg-canvas-raised ring-ink/10 hover:ring-ink/25")}
                  data-testid={`perfil-op-${op}`}>
                  <Icone className="h-5 w-5 text-accent" aria-hidden />
                  <span className="mt-2 block text-sm font-semibold text-ink">{ROTULO_PERFIL[op]}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-ink-muted">{texto}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-faint">
              A avaliação clínica (dados de saúde de pacientes) é só para fonoaudiólogos: escolhido esse perfil, o administrador confere o
              registro no conselho (CRFa) e libera o acesso. Músicos e professores de música não acessam a parte clínica.
            </p>
            {me.data?.perfil === "fonoaudiologo" && me.data.role !== "admin" ? (
              <p role="status" data-testid="perfil-verificacao"
                className={cn("mt-3 rounded-lg px-3 py-2 text-sm ring-1 ring-inset",
                  me.data.verificacao_clinica === "aprovado" ? "bg-signal-ok/10 text-ink ring-signal-ok/30"
                    : me.data.verificacao_clinica === "recusado" ? "bg-flare/10 text-ink ring-flare/30"
                      : "bg-signal-warn/10 text-ink ring-signal-warn/30")}>
                {me.data.verificacao_clinica === "aprovado"
                  ? "Registro aprovado: a avaliação clínica está liberada."
                  : me.data.verificacao_clinica === "recusado"
                    ? `Registro não aprovado${me.data.verificacao_clinica_nota ? `: ${me.data.verificacao_clinica_nota}` : ""}. Corrija o CRFa e salve para pedir nova conferência.`
                    : "Registro em conferência: a avaliação clínica abre assim que o administrador aprovar."}
              </p>
            ) : null}
          </section>

          <section className={PAINEL} aria-labelledby={`${id}-dados`}>
            <h2 id={`${id}-dados`} className="font-display text-lg font-semibold text-ink">Dados profissionais</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor={`${id}-nome`}>Nome como deve aparecer nos documentos</Label>
                <Input id={`${id}-nome`} className="mt-1" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} data-testid="perfil-nome" />
              </div>
              <div>
                <Label htmlFor={`${id}-reg`}>{fono ? "Registro no conselho (CRFa) *" : "Registro ou formação (opcional)"}</Label>
                <Input id={`${id}-reg`} className="mt-1" maxLength={60} placeholder={fono ? "ex.: CRFa 2-12345" : "ex.: Licenciatura em Música"}
                  aria-required={fono} {...campo("registro")} data-testid="perfil-registro" />
              </div>
              <div>
                <Label htmlFor={`${id}-esp`}>Especialidade</Label>
                <Input id={`${id}-esp`} className="mt-1" maxLength={120} placeholder={fono ? "ex.: Especialista em Voz" : "ex.: Canto popular"} {...campo("especialidade")} />
              </div>
              <div>
                <Label htmlFor={`${id}-inst`}>{perfil === "professor_musica" ? "Escola ou estúdio" : "Consultório ou clínica"}</Label>
                <Input id={`${id}-inst`} className="mt-1" maxLength={160} {...campo("instituicao")} data-testid="perfil-instituicao" />
              </div>
              <div>
                <Label htmlFor={`${id}-tel`}>Telefone</Label>
                <Input id={`${id}-tel`} type="tel" inputMode="tel" className="mt-1" maxLength={40} {...campo("telefone")} />
              </div>
              <div>
                <Label htmlFor={`${id}-end`}>Endereço</Label>
                <Input id={`${id}-end`} className="mt-1" maxLength={200} {...campo("endereco")} />
              </div>
              <div>
                <Label htmlFor={`${id}-cid`}>Cidade</Label>
                <Input id={`${id}-cid`} className="mt-1" maxLength={80} {...campo("cidade")} data-testid="perfil-cidade" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor={`${id}-apr`}>Apresentação (opcional)</Label>
                <textarea id={`${id}-apr`} rows={3} maxLength={1000} {...campo("apresentacao")}
                  className="mt-1 block w-full rounded-lg border border-line bg-canvas-raised px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor={`${id}-email`}>E-mail de acesso</Label>
                <Input id={`${id}-email`} className="mt-1" value={me.data?.email ?? ""} readOnly aria-readonly />
              </div>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={salvando || !carregado} data-testid="perfil-salvar">
              <Save className="h-4 w-4" aria-hidden /> {salvando ? "Salvando…" : "Salvar perfil"}
            </Button>
            {msg ? <p className="text-sm text-ink" role="status">{msg}</p> : null}
            {erro ? <p className="text-sm text-signal-err" role="alert">{erro}</p> : null}
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="Como aparece nos documentos">
          <div className={PAINEL}>
            <h2 className="text-sm font-semibold text-ink">Como aparece nos documentos</h2>
            <div className="mt-3 rounded-lg bg-white p-4 text-[#0E1A24]">
              <p className="text-right text-sm font-semibold">{nome.trim() || "Seu nome"}</p>
              <p className="text-right text-xs text-[#4E6170]">{fono ? `Fonoaudiólogo(a)${campos.registro.trim() ? ` · ${campos.registro.trim()}` : ""}` : perfil ? ROTULO_PERFIL[perfil] : ""}</p>
              {contato ? <p className="text-right text-xs text-[#4E6170]">{contato}</p> : null}
              <div className="mt-8 border-t border-[#0E1A24] pt-1 text-center text-xs">
                {assinatura.map((l) => <span key={l} className="block">{l}</span>)}
              </div>
            </div>
            {me.data?.acesso_clinico ? (
              <p className="mt-3 text-xs text-ink-muted">
                Na <Link href="/voz-clinica" className="text-accent hover:underline">avaliação clínica</Link>, a aba Documentos já vem preenchida com estes dados.
              </p>
            ) : null}
          </div>
        </aside>
      </form>
    </div>
  );
}
