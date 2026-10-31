import Image from "next/image";
import Link from "next/link";

import { PitchReportPreview } from "@/components/marketing/pitch-report-preview";
import { buttonVariants } from "@/components/ui/button";
import { studioMedia } from "@/lib/media";

/** Fatos do produto (não são estatísticas de uso). */
const TELEMETRY = [
  { value: "4", unit: "faixas", label: "Voz, bateria, baixo e outros" },
  { value: "±50", unit: "cents", label: "Tolerância padrão, ajustável" },
  { value: "50–150", unit: "%", label: "Velocidade sem mudar o tom" },
  { value: "±12", unit: "semitons", label: "Mude o tom para a sua voz" },
] as const;

export function LandingHero() {
  return (
    <section aria-labelledby="landing-hero-title" className="relative isolate overflow-hidden">
      <Image
        src={studioMedia.heroBooth.src}
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-20 object-cover opacity-40 motion-safe:animate-hero-drift"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-canvas via-canvas/90 to-canvas/60" aria-hidden />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-canvas via-transparent to-canvas/70" aria-hidden />

      <div className="mx-auto grid max-w-content items-center gap-12 px-5 pb-16 pt-28 sm:px-8 lg:grid-cols-12 lg:gap-10 lg:pb-24 lg:pt-40">
        <div className="lg:col-span-5">
          <h1
            id="landing-hero-title"
            className="text-balance font-display text-5xl font-bold leading-[1.02] tracking-[-0.035em] text-ink sm:text-6xl xl:text-[4.75rem]"
          >
            Sua voz, nota <span className="text-accent">por nota.</span>
          </h1>
          <p className="mt-8 max-w-md text-lg leading-relaxed text-ink/90 sm:text-xl">
            O VoiceCheck IA separa a voz da música, mede a afinação de cada frase e mostra
            exatamente onde treinar.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link
              href="/register"
              className={buttonVariants({
                size: "lg",
                className: "rounded-full px-7 shadow-[0_12px_28px_-14px_rgb(var(--c-sombra)/calc(0.8*var(--k-sombra)))]",
              })}
            >
              Criar conta grátis
            </Link>
            <a
              href="#separacao"
              className="text-base font-medium text-ink underline decoration-line underline-offset-8 transition-colors hover:decoration-accent"
            >
              Ver o que ele faz
            </a>
          </div>
        </div>

        <div className="relative lg:col-span-7">
          <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-accent/10 blur-3xl" aria-hidden />
          <PitchReportPreview live />
        </div>
      </div>

      <div className="border-y border-ink/5 bg-canvas/60 backdrop-blur-md">
        <dl className="mx-auto grid max-w-content grid-cols-2 px-5 sm:px-8 lg:grid-cols-4">
          {TELEMETRY.map((t, i) => (
            <div
              key={t.label}
              className={`py-6 lg:py-8 ${i % 2 === 1 ? "pl-5 sm:pl-8" : ""} ${i > 0 ? "lg:border-l lg:border-ink/5 lg:pl-8" : ""} ${i >= 2 ? "border-t border-ink/5 lg:border-t-0" : ""}`}
            >
              <dt className="sr-only">{t.label}</dt>
              <dd>
                <span className="text-data text-3xl font-semibold text-ink sm:text-4xl">{t.value}</span>
                <span className="text-data ml-1.5 text-sm text-accent">{t.unit}</span>
                <span className="mt-1 block text-sm text-ink-muted">{t.label}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
