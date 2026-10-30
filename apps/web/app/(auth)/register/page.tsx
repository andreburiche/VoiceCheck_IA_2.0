import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { PassosCadastro } from "@/components/auth/passos-cadastro";

export const metadata = { title: "Criar conta" };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Comece pela"
      highlight="próxima voz."
      text="Avaliação, terapia e treino de canto numa só conta, com números que conferem com o Praat."
      aside={<PassosCadastro />}
    >
      <AuthForm mode="register" />
    </AuthShell>
  );
}
