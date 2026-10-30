import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { PainelAoVivo } from "@/components/marketing/voz/painel-ao-vivo";

export const metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Seus pacientes,"
      highlight="onde você deixou."
      text="Prontuários, gravações, medidas e relatórios. Abaixo, uma voz de exemplo medida agora pelas mesmas funções da avaliação."
      aside={<PainelAoVivo compacto />}
    >
      <AuthForm mode="login" />
    </AuthShell>
  );
}
