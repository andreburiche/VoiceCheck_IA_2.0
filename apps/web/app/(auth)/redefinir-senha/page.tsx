import { AuthShell } from "@/components/auth/auth-shell";
import { LastAnalysisCard } from "@/components/auth/last-analysis-card";
import { ResetPasswordForm } from "@/components/auth/password-recovery";

export const metadata = {
  title: "Criar nova senha",
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Uma senha nova,"
      highlight="e de volta ao estúdio."
      text="Escolha uma senha que você não usa em outros sites."
      aside={<LastAnalysisCard />}
      back={{ href: "/login", label: "Voltar para o login", short: "Login" }}
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
