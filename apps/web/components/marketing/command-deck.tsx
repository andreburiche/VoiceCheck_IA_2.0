import Image from "next/image";

import { Reveal } from "@/components/marketing/reveal";
import { studioMedia } from "@/lib/media";

const TOOLS = [
  { term: "Loop A–B", value: "", desc: "Repita o trecho difícil quantas vezes precisar." },
  { term: "Velocidade", value: "50–150%", desc: "Desacelere sem mudar o tom." },
  { term: "Tom", value: "±12 semitons", desc: "Transponha a música para a sua extensão." },
  { term: "Metrônomo", value: "", desc: "Com contagem antes de entrar." },
  { term: "Letras e seções", value: "", desc: "Verso, refrão e ponte marcados no tempo." },
  { term: "Gravação", value: "", desc: "Grave seu take por cima e compare." },
] as const;

/** Seção "Estúdio de treino" (mantém o nome do export usado em page.tsx). */
export function CommandDeck() {
  return (
    <section id="estudio" aria-labelledby="estudio-title" className="relative isolate scroll-mt-20 overflow-hidden">
      <Image
        src={studioMedia.headphones.src}
        alt={studioMedia.headphones.alt}
        fill
        sizes="100vw"
        className="-z-20 object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-l from-canvas via-canvas/85 to-canvas/20" aria-hidden />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-canvas via-transparent to-canvas" aria-hidden />

      <div className="mx-auto grid max-w-content px-5 py-24 sm:px-8 lg:grid-cols-12 lg:py-36">
        <div className="lg:col-span-6 lg:col-start-7">
          <h2 id="estudio-title" className="max-w-lg text-balance font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl">
            Treine em cima da faixa certa
          </h2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink/90">
            Com as faixas separadas, o estúdio vira sala de ensaio: tire a sua voz do original e cante
            por cima, no seu andamento.
          </p>
          <ul className="panel-glass mt-10 grid divide-ink/5 overflow-hidden rounded-2xl sm:grid-cols-2 sm:divide-x">
            {TOOLS.map((t, i) => (
              <Reveal
                as="li"
                key={t.term}
                delay={(i % 2) * 80}
                className={`px-5 py-4 ${i >= 2 ? "border-t border-ink/5" : ""} ${i === 1 ? "border-t border-ink/5 sm:border-t-0" : ""}`}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-base font-semibold text-ink">{t.term}</span>
                  {t.value ? <span className="text-data text-xs text-accent">{t.value}</span> : null}
                </span>
                <span className="mt-1 block text-sm text-ink-muted">{t.desc}</span>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
