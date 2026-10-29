import Link from "next/link";
import { Upload } from "lucide-react";

import { StatusConsole } from "@/components/dashboard/status-console";
import { buttonVariants } from "@/components/ui/button";

type WaveHeroProps = {
  userName: string;
  importHref: string;
};

/** Abertura do painel: saudação, ação principal e status do estúdio. */
export function WaveHero({ userName, importHref }: WaveHeroProps) {
  const first = userName.split(" ")[0] || userName;

  return (
    <section aria-labelledby="dashboard-hero-title">
      <div className="grid items-center gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <div className="max-w-xl">
          <h1
            id="dashboard-hero-title"
            className="text-balance font-display text-2xl font-semibold tracking-tight text-ink md:text-[1.75rem]"
          >
            Olá, {first}
          </h1>
          <p className="mt-2 max-w-lg text-base text-ink-muted">
            Importe uma música, separe as faixas com IA e treine com loop, metrônomo e
            letras sincronizadas.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={importHref} className={buttonVariants({ size: "lg" })}>
              <Upload className="h-4 w-4" aria-hidden />
              Importar música
            </Link>
            <Link href="/projects" className={buttonVariants({ size: "lg", variant: "secondary" })}>
              Ver minhas músicas
            </Link>
          </div>
        </div>
        <StatusConsole />
      </div>
    </section>
  );
}
