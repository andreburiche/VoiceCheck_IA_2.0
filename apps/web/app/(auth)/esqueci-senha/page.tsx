import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/password-recovery";
import { PainelAoVivo } from "@/components/marketing/voz/painel-ao-vivo";

export const metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Acontece com"
      highlight="todo mundo."
      text="Em poucos segundos você cria uma nova senha e volta para os seus pacientes."
      aside={<PainelAoVivo compacto />}
      back={{ href: "/login", label: "Voltar para o login", short: "Login" }}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
