import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { LastAnalysisCard } from "@/components/auth/last-analysis-card";

export const metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Sua voz, nota"
      highlight="por nota."
      text="Seus projetos, faixas separadas e relatórios estão onde você deixou."
      aside={<LastAnalysisCard />}
    >
      <AuthForm mode="login" />
    </AuthShell>
  );
}
