"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, Eye, EyeOff, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/errors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorText(err: unknown, fallback: string): string {
  const msg = friendlyError(err, "");
  if (!msg) return fallback;
  if (/failed to fetch|networkerror|load failed|timeout|sem resposta|inacessível/i.test(msg)) {
    return "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.";
  }
  if (/429|muitas tentativas|too many/i.test(msg)) {
    return "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";
  }
  return msg;
}

/* ------------------------------------------------------------------ */
/* Esqueci minha senha                                                  */
/* ------------------------------------------------------------------ */

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("email");
      if (q) setEmail(q);
    } catch {
      /* ignore */
    }
  }, []);

  const emailInvalid = touched && !EMAIL_RE.test(email.trim());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    const value = email.trim();
    if (!EMAIL_RE.test(value)) return;
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.forgotPassword(value);
      setSentTo(value);
      setDevUrl(res.dev_reset_url ?? null);
    } catch (err) {
      setError(errorText(err, "Não foi possível enviar o link agora. Tente de novo em instantes."));
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <div className="mx-auto w-full max-w-[420px] space-y-6" aria-live="polite">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <MailCheck className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-[-0.025em] text-ink sm:text-4xl">Confira seu e-mail</h1>
          <p className="mt-2 text-base text-ink-muted">
            Se houver uma conta com <strong className="font-medium text-ink">{sentTo}</strong>, enviamos um link para
            criar uma nova senha. Ele vale por 30 minutos.
          </p>
        </div>
        <ul className="space-y-1.5 text-sm text-ink-muted">
          <li>• Não chegou em alguns minutos? Olhe a caixa de spam ou promoções.</li>
          <li>• Pediu mais de uma vez? Use sempre o link do e-mail mais recente.</li>
        </ul>

        {devUrl ? (
          <div className="space-y-2 rounded-2xl border border-dashed border-line bg-canvas-raised p-4">
            <p className="text-sm font-medium text-ink">Ambiente de desenvolvimento</p>
            <p className="text-xs text-ink-muted">
              O envio de e-mail (SMTP) não está configurado, então o link aparece aqui. Em produção ele só vai por e-mail.
            </p>
            <Link
              href={devUrl.replace(/^https?:\/\/[^/]+/, "")}
              className="inline-flex text-sm font-medium text-accent hover:underline"
            >
              Abrir link de redefinição
            </Link>
          </div>
        ) : null}

        <div>
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setDevUrl(null);
            }}
            className="rounded text-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Usar outro e-mail
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-[420px] space-y-6" noValidate>
      <div>
        <h1 className="font-display text-3xl font-bold tracking-[-0.025em] text-ink sm:text-4xl">Esqueceu a senha?</h1>
        <p className="mt-2 text-base text-ink-muted">
          Informe o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="forgot-email">E-mail</Label>
        <Input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          placeholder="voce@exemplo.com"
          autoFocus
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          onBlur={() => setTouched(true)}
          aria-invalid={emailInvalid || undefined}
          aria-describedby={emailInvalid ? "forgot-email-error" : undefined}
          className={cn("h-12 text-base", emailInvalid && "border-signal-err")}
        />
        {emailInvalid ? (
          <p id="forgot-email-error" className="text-sm text-signal-err">
            Digite um e-mail completo, como voce@exemplo.com.
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-signal-err/30 bg-signal-err/10 px-3 py-2 text-sm text-signal-err">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="h-12 w-full text-base" disabled={loading} aria-busy={loading}>
        {loading ? "Enviando…" : "Enviar link de redefinição"}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Redefinir senha (link do e-mail)                                     */
/* ------------------------------------------------------------------ */

function PasswordField({
  id,
  label,
  value,
  onChange,
  onBlur,
  show,
  onToggle,
  describedBy,
  invalid,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  show: boolean;
  onToggle: () => void;
  describedBy?: string;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={8}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn("h-12 pr-11 text-base", invalid && "border-signal-err")}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-canvas-overlay hover:text-ink"
          onClick={onToggle}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [touchedPw, setTouchedPw] = useState(false);
  const [touchedConfirm, setTouchedConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenRead = useRef(false);

  useEffect(() => {
    // Lê uma vez só: no StrictMode o efeito roda duas vezes e o token já saiu da URL.
    if (tokenRead.current) return;
    tokenRead.current = true;
    try {
      const t = new URLSearchParams(window.location.search).get("token");
      setToken(t && t.length >= 20 ? t : null);
      // Tira o token da barra de endereço (histórico, prints, compartilhamento)
      if (t) window.history.replaceState(null, "", window.location.pathname);
    } catch {
      setToken(null);
    }
  }, []);

  const longEnough = password.length >= 8;
  const pwInvalid = touchedPw && !longEnough;
  const mismatch = touchedConfirm && confirm.length > 0 && confirm !== password;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouchedPw(true);
    setTouchedConfirm(true);
    if (!token || !longEnough || confirm !== password) return;
    setError(null);
    setLoading(true);
    try {
      await authApi.resetPassword({ token, password });
      router.replace("/login?senha=alterada");
    } catch (err) {
      setError(errorText(err, "Não foi possível alterar a senha. Peça um novo link."));
      setLoading(false);
    }
  }

  if (token === undefined) {
    return <div className="mx-auto h-72 w-full max-w-[420px]" aria-busy="true" />;
  }

  if (token === null) {
    return (
      <div className="mx-auto w-full max-w-[420px] space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-[-0.025em] text-ink sm:text-4xl">Link inválido</h1>
          <p className="mt-2 text-base text-ink-muted">
            Este endereço está incompleto ou expirou. Peça um novo link — leva poucos segundos.
          </p>
        </div>
        <Link
          href="/esqueci-senha"
          className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-accent text-base font-semibold text-canvas transition-opacity hover:opacity-90"
        >
          Pedir novo link
        </Link>      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-[420px] space-y-6" noValidate>
      <div>
        <h1 className="font-display text-3xl font-bold tracking-[-0.025em] text-ink sm:text-4xl">Crie uma nova senha</h1>
        <p className="mt-2 text-base text-ink-muted">
          Ao salvar, você sai de todos os aparelhos conectados e entra de novo com a nova senha.
        </p>
      </div>

      <div className="space-y-2">
        <PasswordField
          id="new-password"
          label="Nova senha"
          value={password}
          onChange={(v) => {
            setPassword(v);
            setError(null);
          }}
          onBlur={() => setTouchedPw(true)}
          show={show}
          onToggle={() => setShow((v) => !v)}
          describedBy="new-password-hint"
          invalid={pwInvalid}
          autoFocus
        />
        <p
          id="new-password-hint"
          className={cn("flex items-center gap-1.5 text-sm", pwInvalid ? "text-signal-err" : longEnough ? "text-accent" : "text-ink-muted")}
        >
          {longEnough ? <Check className="h-4 w-4" aria-hidden /> : null}
          Mínimo de 8 caracteres{password.length > 0 && !longEnough ? ` (faltam ${8 - password.length})` : ""}.
        </p>
      </div>

      <div className="space-y-2">
        <PasswordField
          id="confirm-password"
          label="Confirme a nova senha"
          value={confirm}
          onChange={(v) => {
            setConfirm(v);
            setError(null);
          }}
          onBlur={() => setTouchedConfirm(true)}
          show={show}
          onToggle={() => setShow((v) => !v)}
          describedBy={mismatch ? "confirm-password-error" : undefined}
          invalid={mismatch}
        />
        {mismatch ? (
          <p id="confirm-password-error" className="text-sm text-signal-err">
            As senhas não são iguais.
          </p>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="space-y-1 rounded-lg border border-signal-err/30 bg-signal-err/10 px-3 py-2 text-sm text-signal-err">
          <p>{error}</p>
          <Link href="/esqueci-senha" className="font-medium underline">
            Pedir novo link
          </Link>
        </div>
      ) : null}

      <Button type="submit" className="h-12 w-full text-base" disabled={loading} aria-busy={loading}>
        {loading ? "Salvando…" : "Salvar nova senha"}
      </Button>
    </form>
  );
}
