import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { StudioPreview } from "@/components/marketing/studio-preview";

export const metadata = { title: "Criar conta" };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Separe, treine e analise."
      text="Envie uma música e em poucos minutos você tem as faixas separadas e o estúdio de treino pronto."
      aside={<StudioPreview />}
    >
      <AuthForm mode="register" />
    </AuthShell>
  );
}
