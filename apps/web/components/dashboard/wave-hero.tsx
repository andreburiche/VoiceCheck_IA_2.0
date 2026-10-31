import Link from "next/link";
import { Stethoscope, Upload } from "lucide-react";

import { StatusConsole } from "@/components/dashboard/status-console";
import { buttonVariants } from "@/components/ui/button";

type WaveHeroProps = {
  userName: string;
  importHref: string;
  /** fonoaudiólogo/admin: ação principal é a avaliação clínica */
  clinico?: boolean;
};

/** Abertura do painel: saudação, as duas ações principais (clínica e música) e o status. */
export function WaveHero({ userName, importHref, clinico = false }: WaveHeroProps) {
  const first = userName.split(" ")[0] || userName;

  return (
    <section aria-labelledby="dashboard-hero-title" className="motion-safe:animate-fade-up">
      <div className="grid items-center gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <div className="max-w-xl">
          <h1
            id="dashboard-hero-title"
            className="text-balance font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl"
          >
            Olá, {first}
          </h1>
          <p className="mt-2 max-w-lg text-base text-ink-muted">
            {clinico
              ? "Avaliação clínica, terapia e treino de canto. Tudo o que você mediu fica aqui, com números que conferem com o Praat."
              : "Importe uma música, separe as faixas, treine e analise a voz, nota por nota."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {clinico ? (
              <Link href="/voz-clinica" className={buttonVariants({ size: "lg" })}>
                <Stethoscope className="h-4 w-4" aria-hidden />
                Nova avaliação
              </Link>
            ) : null}
            <Link href={importHref} className={buttonVariants({ size: "lg", variant: clinico ? "secondary" : "default" })}>
              <Upload className="h-4 w-4" aria-hidden />
              Importar música
            </Link>
          </div>
        </div>
        <StatusConsole />
      </div>
    </section>
  );
}
