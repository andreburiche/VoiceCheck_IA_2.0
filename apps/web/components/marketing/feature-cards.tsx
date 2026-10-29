import { Reveal } from "@/components/marketing/reveal";
import { StudioPreview } from "@/components/marketing/studio-preview";

const FACTS = [
  { value: "4", unit: "faixas", term: "Separação completa", desc: "Voz, bateria, baixo e outros — ou só voz e instrumental." },
  { value: "15", unit: "s", term: "Prévia rápida", desc: "Ouça o resultado antes de processar a música inteira." },
  { value: "3", unit: "formatos", term: "Exportação", desc: "Cada faixa ou a mixagem em WAV, MP3 ou um ZIP com tudo." },
] as const;

/** Seção "Separação" (mantém o nome do export usado em page.tsx). */
export function FeatureCards() {
  return (
    <section id="separacao" aria-labelledby="separacao-title" className="relative isolate scroll-mt-20 px-5 py-24 sm:px-8 lg:py-32">
      <div className="absolute left-1/4 top-1/3 -z-10 h-80 w-80 rounded-full bg-brand-blue/10 blur-3xl" aria-hidden />
      <div className="mx-auto grid max-w-content items-center gap-14 lg:grid-cols-12 lg:gap-16">
        <Reveal className="order-2 lg:order-1 lg:col-span-7">
          <StudioPreview />
          <p className="mt-4 text-sm text-ink-muted">
            Experimente: <span className="text-data text-ink">M</span> silencia,{" "}
            <span className="text-data text-ink">S</span> deixa só uma faixa.
          </p>
        </Reveal>

        <div className="order-1 lg:order-2 lg:col-span-5">
          <h2 id="separacao-title" className="text-balance font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl">
            Isole a voz de qualquer gravação
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-ink/90">
            Envie MP3, WAV, FLAC ou o vídeo do ensaio. A separação usa o Demucs, um modelo aberto, e
            roda no seu hardware.
          </p>
          <ul className="mt-10 grid gap-3">
            {FACTS.map((f, i) => (
              <Reveal as="li" key={f.term} delay={i * 80} className="panel-glass flex items-center gap-5 rounded-xl px-5 py-4">
                <span className="w-20 shrink-0">
                  <span className="text-data text-2xl font-semibold text-accent">{f.value}</span>
                  <span className="text-data ml-1 text-xs text-ink-muted">{f.unit}</span>
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-semibold text-ink">{f.term}</span>
                  <span className="mt-0.5 block text-sm text-ink-muted">{f.desc}</span>
                </span>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
