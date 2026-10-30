import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/password-recovery";
import { PainelAoVivo } from "@/components/marketing/voz/painel-ao-vivo";

export const metadata = {
  title: "Criar nova senha",
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Uma senha nova,"
      highlight="e de volta ao trabalho."
      text="Escolha uma senha que você não usa em outros sites."
      aside={<PainelAoVivo compacto />}
      back={{ href: "/login", label: "Voltar para o login", short: "Login" }}
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
