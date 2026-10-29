import { AuthShell } from "@/components/auth/auth-shell";
import { LastAnalysisCard } from "@/components/auth/last-analysis-card";
import { ForgotPasswordForm } from "@/components/auth/password-recovery";

export const metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Acontece com"
      highlight="todo mundo."
      text="Em poucos segundos você cria uma nova senha e volta para os seus projetos."
      aside={<LastAnalysisCard />}
      back={{ href: "/login", label: "Voltar para o login", short: "Login" }}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
