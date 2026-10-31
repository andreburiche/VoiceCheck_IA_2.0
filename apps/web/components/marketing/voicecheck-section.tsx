import Image from "next/image";

import { TrendChart } from "@/components/hud";
import { Reveal } from "@/components/marketing/reveal";
import { studioMedia } from "@/lib/media";

const MEASURES = [
  { term: "Afinação", unit: "cents", desc: "Desvio de cada nota em relação à referência." },
  { term: "Estabilidade", unit: "%", desc: "Quanto a nota oscila depois que você chega nela." },
  { term: "Vibrato", unit: "Hz", desc: "Velocidade e amplitude, separados de desafinação." },
  { term: "Fraseado", unit: "s", desc: "Onde as frases quebram e onde falta ar." },
  { term: "Registro", unit: "quebras", desc: "Passagens em que a voz falha ou muda de registro." },
  { term: "Dinâmica", unit: "dB", desc: "Variação de volume ao longo da música." },
] as const;

/** Evolução de exemplo: % de notas dentro da tolerância por sessão. */
const EXAMPLE_TREND = [
  { label: "S1", value: 58 },
  { label: "S2", value: 61 },
  { label: "S3", value: 60 },
  { label: "S4", value: 67 },
  { label: "S5", value: 71 },
  { label: "S6", value: 70 },
  { label: "S7", value: 76 },
  { label: "S8", value: 82 },
];

export function VoiceCheckSection() {
  const first = EXAMPLE_TREND[0]?.value ?? 0;
  const last = EXAMPLE_TREND[EXAMPLE_TREND.length - 1]?.value ?? 0;
  return (
    <section id="voicecheck" aria-labelledby="voicecheck-title" className="relative isolate scroll-mt-20 px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto max-w-content">
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-16">
          <h2
            id="voicecheck-title"
            className="text-balance font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl lg:col-span-7 lg:text-6xl"
          >
            Uma devolutiva que dá para usar
          </h2>
          <p className="text-lg leading-relaxed text-ink/90 lg:col-span-5 lg:pt-3">
            Compare sua gravação com a partitura (MIDI ou MusicXML) ou com a voz do artista. O
            relatório aponta o trecho, diz o que aconteceu e sugere o exercício — e o professor recebe
            uma versão pronta para enviar ao aluno.
          </p>
        </div>

        <div className="mt-16 grid gap-5 lg:mt-20 lg:grid-cols-12">
          <Reveal className="panel-glass rounded-2xl p-5 lg:col-span-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Notas dentro da tolerância</p>
                <p className="hud-label mt-0.5 normal-case tracking-normal">8 sessões de treino · exemplo</p>
              </div>
              <p className="text-right">
                <span className="text-data text-2xl font-semibold text-accent">+{last - first}</span>
                <span className="text-data ml-1 text-xs text-ink-muted">pontos</span>
              </p>
            </div>
            <TrendChart
              className="mt-4"
              points={EXAMPLE_TREND}
              min={40}
              max={100}
              unit="%"
              title={`Exemplo de evolução: de ${first}% para ${last}% das notas dentro da tolerância em 8 sessões`}
            />
          </Reveal>

          <Reveal delay={80} className="relative min-h-[260px] overflow-hidden rounded-2xl lg:col-span-4">
            <Image
              src={studioMedia.mic.src}
              alt={studioMedia.mic.alt}
              fill
              sizes="(max-width: 1024px) 100vw, 33vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/30 to-transparent" aria-hidden />
            <div className="absolute inset-x-0 bottom-0 p-5">
              <p className="text-sm font-medium text-ink">
                Funciona com o áudio do celular, de um vídeo ou de uma gravação de estúdio.
              </p>
            </div>
          </Reveal>
        </div>

        <ul className="mt-5 grid gap-px overflow-hidden rounded-2xl bg-ink/5 sm:grid-cols-2 lg:grid-cols-3">
          {MEASURES.map((m, i) => (
            <Reveal as="li" key={m.term} delay={(i % 3) * 80} className="bg-canvas-raised p-6">
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-display text-xl font-semibold text-ink">{m.term}</span>
                <span className="text-data text-xs text-accent">{m.unit}</span>
              </span>
              <span className="mt-2 block text-base text-ink-muted">{m.desc}</span>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
