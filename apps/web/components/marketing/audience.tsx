import { Reveal } from "@/components/marketing/reveal";

const AUDIENCE = [
  {
    title: "Quem canta",
    tag: "Voz",
    text: "Descubra quais notas fogem, treine em loop o trecho difícil e acompanhe a evolução a cada gravação.",
  },
  {
    title: "Quem toca",
    tag: "Instrumento",
    text: "Tire o seu instrumento da faixa original, desacelere o solo e toque junto com o resto da banda.",
  },
  {
    title: "Quem ensina canto",
    tag: "Professor",
    text: "Receba a gravação do aluno, gere o relatório técnico e envie uma devolutiva clara em minutos.",
  },
] as const;

export function Audience() {
  return (
    <section id="para-quem" aria-labelledby="audience-title" className="scroll-mt-20 px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto max-w-content">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <h2 id="audience-title" className="text-balance font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl lg:col-span-7">
            Para quem canta, toca e ensina
          </h2>
          <p className="text-lg leading-relaxed text-ink/90 lg:col-span-5">
            O mesmo arquivo serve a três rotinas: o ensaio, o estudo do instrumento e a aula.
          </p>
        </div>
        <ul className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8 lg:mt-16">
          {AUDIENCE.map((a, i) => (
            <Reveal as="li" key={a.title} delay={i * 80} className="border-t-2 border-accent/60 pt-6">
              <h3 className="font-display text-2xl font-semibold text-ink">{a.title}</h3>
              <p className="mt-3 text-base leading-relaxed text-ink-muted">{a.text}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
