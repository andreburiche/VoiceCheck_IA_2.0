import { Check } from "lucide-react";

const POINTS = [
  {
    title: "Sem serviços externos de IA",
    text: "A separação e a análise rodam nos servidores do VoiceCheck, sem APIs de IA de terceiros. Suas gravações não são enviadas a outras empresas.",
  },
  {
    title: "Você decide o que sai",
    text: "Nada é compartilhado sem você exportar, e cada projeto pertence só à sua conta.",
  },
  {
    title: "Modelo aberto",
    text: "A separação usa o Demucs, de código aberto (licença MIT).",
  },
] as const;

export function PrivacySection() {
  return (
    <section id="privacidade" aria-labelledby="privacy-title" className="relative isolate scroll-mt-20 px-5 py-24 sm:px-8 lg:py-32">
      <div className="absolute inset-0 -z-10 bg-canvas-raised" aria-hidden />
      <div className="mx-auto grid max-w-content gap-14 lg:grid-cols-12 lg:gap-16">
        <h2
          id="privacy-title"
          className="text-balance font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl lg:col-span-5 lg:text-6xl"
        >
          Suas gravações <span className="text-accent">ficam com você</span>
        </h2>
        <ul className="divide-y divide-line/70 border-y border-line/70 lg:col-span-7">
          {POINTS.map((p) => (
            <li key={p.title} className="flex gap-4 py-6">
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Check className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-lg font-semibold text-ink">{p.title}</span>
                <span className="mt-1 block text-base leading-relaxed text-ink-muted">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
