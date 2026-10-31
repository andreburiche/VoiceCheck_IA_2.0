"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, Shield, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROTULO_PERFIL, authApi, type PerfilProfissional } from "@/lib/api";
import { DEV_TEST_ACCOUNTS, showDevTestAccounts, type DevTestAccount } from "@/lib/dev-test-accounts";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/errors";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeAccount, setActiveAccount] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "login") return;
    let fromQuery: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      fromQuery = params.get("email");
      if (params.get("senha") === "alterada") {
        setNotice("Senha alterada. Entre com a nova senha.");
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch {
      /* ignore */
    }
    if (fromQuery) {
      setEmail(fromQuery);
      return;
    }
    try {
      const saved = localStorage.getItem("va_remember_email");
      if (saved) setEmail(saved);
    } catch {
      /* armazenamento indisponível */
    }
  }, [mode]);

  async function loginAs(account: DevTestAccount) {
    setError(null);
    setLoading(true);
    setActiveAccount(account.id);
    setEmail(account.email);
    setPassword(account.password);
    try {
      await authApi.login({ email: account.email, password: account.password });
      router.push(account.role === "admin" ? "/admin" : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  const [perfil, setPerfil] = useState<PerfilProfissional>("musico");
  const [registro, setRegistro] = useState("");
  const [aceite, setAceite] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }));
  const fieldErrors = {
    name: mode === "register" && name.trim().length < 2 ? "Digite seu nome (pelo menos 2 letras)." : null,
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "Digite um e-mail completo, como voce@exemplo.com." : null,
    password:
      mode === "register" && password.length < 8
        ? `A senha precisa de pelo menos 8 caracteres${password ? ` (faltam ${8 - password.length})` : ""}.`
        : mode === "login" && !password
          ? "Digite sua senha."
          : null,
    registro:
      mode === "register" && perfil === "fonoaudiologo" && !/\d/.test(registro)
        ? "Informe o número do seu registro no conselho (CRFa)."
        : null,
    aceite: mode === "register" && !aceite ? "Para criar a conta, leia e aceite os Termos e a Política de Privacidade." : null,
  };
  const showErr = (k: keyof typeof fieldErrors) => (touched[k] ? fieldErrors[k] : null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true, registro: true, aceite: true });
    if (fieldErrors.name || fieldErrors.email || fieldErrors.password || fieldErrors.registro || fieldErrors.aceite) {
      const first = fieldErrors.name ? "name" : fieldErrors.registro ? "registro" : fieldErrors.email ? "email"
        : fieldErrors.password ? "password" : "aceite";
      document.getElementById(first)?.focus();
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        await authApi.register({ name, email, password, perfil, aceite_privacidade: true, ...(perfil === "fonoaudiologo" ? { registro: registro.trim() } : {}) });
        router.push("/dashboard");
      } else {
        const res = await authApi.login({ email, password });
        // Preferência local apenas — não altera o fluxo JWT/cookies da API
        try {
          localStorage.setItem("va_remember_email", remember ? email : "");
        } catch {
          /* ignore */
        }
        const isAdmin = res.user.role === "admin";
        router.push(isAdmin ? "/admin" : "/dashboard");
      }
      router.refresh();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-[420px] space-y-6"
      noValidate
    >
      <div>
        <h1 className="font-display text-3xl font-bold tracking-[-0.025em] text-ink sm:text-4xl">
          {mode === "login" ? "Entrar" : "Criar conta"}
        </h1>
        <p className="mt-2 text-base text-ink-muted">
          {mode === "login"
            ? "Continue de onde parou: pacientes, alunos e projetos."
            : "Grátis para começar. Leva menos de um minuto."}
        </p>
      </div>

      {notice ? (
        <p role="status" className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-ink">
          {notice}
        </p>
      ) : null}

      {mode === "register" ? (
        <div className="space-y-2">
          <Label htmlFor="name">Nome</Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => touch("name")}
            aria-invalid={showErr("name") ? true : undefined}
            aria-describedby={showErr("name") ? "name-error" : undefined}
            className={cn("h-12 text-base", showErr("name") && "border-signal-err")}
          />
          {showErr("name") ? (
            <p id="name-error" className="text-sm text-signal-err">
              {showErr("name")}
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "register" ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Você é</legend>
          <div className="grid gap-2" role="radiogroup" aria-label="Perfil profissional">
            {(Object.keys(ROTULO_PERFIL) as PerfilProfissional[]).map((p) => (
              <label key={p} className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm ring-1 ring-inset transition-colors",
                perfil === p ? "bg-accent/10 text-ink ring-accent" : "text-ink-muted ring-line hover:ring-ink/30",
              )}>
                <input type="radio" name="perfil" value={p} checked={perfil === p} onChange={() => setPerfil(p)}
                  className="h-4 w-4 accent-[var(--accent)]" data-testid={`register-perfil-${p}`} />
                {ROTULO_PERFIL[p]}
              </label>
            ))}
          </div>
          {perfil === "fonoaudiologo" ? (
            <div className="space-y-2 pt-1">
              <Label htmlFor="registro">Registro no conselho (CRFa)</Label>
              <Input id="registro" name="registro" placeholder="ex.: CRFa 2-12345" maxLength={60} value={registro}
                onChange={(e) => setRegistro(e.target.value)} onBlur={() => touch("registro")}
                aria-invalid={showErr("registro") ? true : undefined}
                aria-describedby={showErr("registro") ? "registro-error" : "registro-hint"}
                className={cn("h-12 text-base", showErr("registro") && "border-signal-err")} />
              {showErr("registro") ? (
                <p id="registro-error" className="text-sm text-signal-err">{showErr("registro")}</p>
              ) : (
                <p id="registro-hint" className="text-xs text-ink-faint">A avaliação clínica (dados de saúde de pacientes) abre depois que o administrador conferir o seu CRFa.</p>
              )}
            </div>
          ) : null}
        </fieldset>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          placeholder="voce@exemplo.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => touch("email")}
          aria-invalid={showErr("email") ? true : undefined}
          aria-describedby={showErr("email") ? "email-error" : undefined}
          className={cn("h-12 text-base", showErr("email") && "border-signal-err")}
        />
        {showErr("email") ? (
          <p id="email-error" className="text-sm text-signal-err">
            {showErr("email")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="password">Senha</Label>
          {mode === "login" ? (
            <Link
              href={email ? `/esqueci-senha?email=${encodeURIComponent(email)}` : "/esqueci-senha"}
              className="rounded text-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Esqueci minha senha
            </Link>
          ) : null}
        </div>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => touch("password")}
            aria-invalid={showErr("password") ? true : undefined}
            className={cn("h-12 pr-11 text-base", showErr("password") && "border-signal-err")}
            aria-describedby={
              [mode === "register" ? "password-hint" : null, error ? "auth-error" : null]
                .filter(Boolean)
                .join(" ") || undefined
            }
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-canvas-overlay hover:text-ink"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {showErr("password") ? (
          <p id={mode === "register" ? "password-hint" : undefined} className="text-sm text-signal-err">
            {showErr("password")}
          </p>
        ) : mode === "register" ? (
          <p id="password-hint" className="text-sm text-ink-muted">
            Mínimo de 8 caracteres.
          </p>
        ) : null}
      </div>

      {mode === "login" ? (
        <div className="flex items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-line accent-accent"
            />
            Lembrar meu e-mail
          </label>
        </div>
      ) : (
        <div className="space-y-1">
          <label className="flex cursor-pointer items-start gap-2 text-sm text-ink-muted">
            <input id="aceite" type="checkbox" checked={aceite} onChange={(e) => { setAceite(e.target.checked); touch("aceite"); }}
              aria-invalid={showErr("aceite") ? true : undefined} aria-describedby={showErr("aceite") ? "aceite-error" : undefined}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-accent" data-testid="register-aceite" />
            <span>
              Li e aceito os{" "}
              <Link href="/privacidade" target="_blank" className="font-medium text-accent hover:underline">Termos e a Política de Privacidade</Link>
              , inclusive o tratamento de dados de saúde de pacientes quando eu usar a avaliação clínica.
            </span>
          </label>
          {showErr("aceite") ? <p id="aceite-error" className="text-sm text-signal-err">{showErr("aceite")}</p> : null}
        </div>
      )}

      {error ? (
        <p id="auth-error" role="alert" className="rounded-lg border border-signal-err/30 bg-signal-err/10 px-3 py-2 text-sm text-signal-err">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="h-12 w-full text-base" disabled={loading} aria-busy={loading}>
        {loading ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta grátis"}
      </Button>

      <p className="text-center text-sm text-ink-muted">
        {mode === "login" ? (
          <>
            Não tem conta?{" "}
            <Link href="/register" className="font-medium text-accent hover:underline">
              Criar conta grátis
            </Link>
          </>
        ) : (
          <>
            Já tem conta?{" "}
            <Link href="/login" className="font-medium text-accent hover:underline">
              Entrar
            </Link>
          </>
        )}
      </p>

      {mode === "login" && showDevTestAccounts() ? (
        <div className="border-t border-dashed border-line pt-5">
          <p className="mb-3 flex items-center justify-between text-xs font-medium text-ink-faint">
            <span>Acesso rápido</span>
            <span className="rounded-full bg-canvas-raised px-2 py-0.5 normal-case tracking-normal">só em desenvolvimento</span>
          </p>
          <ul className="grid grid-cols-2 gap-2" aria-label="Entrar com uma conta de teste">
            {DEV_TEST_ACCOUNTS.map((account) => {
              const Icon = account.role === "admin" ? Shield : UserRound;
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void loginAs(account)}
                    title={`${account.description} — ${account.email}`}
                    aria-label={`Entrar como ${account.label} (${account.email})`}
                    className={cn(
                      "flex h-full w-full flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors duration-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60",
                      activeAccount === account.id
                        ? "border-accent/40 bg-accent/10"
                        : "border-line/60 bg-canvas/60 hover:border-line hover:bg-canvas-overlay",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-lg",
                        account.role === "admin" ? "bg-brand-blue/20 text-brand-blue" : "bg-accent/15 text-accent",
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="text-xs font-medium leading-tight text-ink">{account.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </form>
  );
}

function formatAuthError(err: unknown): string {
  const msg = friendlyError(err, "");
  const dev = process.env.NODE_ENV === "development";
  if (/failed to fetch|networkerror|load failed|timeout|sem resposta|inacessível/i.test(msg)) {
    return dev
      ? "Não foi possível conectar ao servidor. Em desenvolvimento, confira se o container estudio-api está rodando (porta 8010)."
      : "Não foi possível conectar ao servidor. Verifique sua conexão e tente de novo em instantes.";
  }
  if (/429|muitas tentativas|too many/i.test(msg)) {
    return "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";
  }
  if (/credenciais|inválid|401/i.test(msg)) {
    return "E-mail ou senha incorretos. Confira os dados ou use “Esqueci minha senha”.";
  }
  return msg || "Não foi possível entrar agora. Tente de novo em instantes.";
}
