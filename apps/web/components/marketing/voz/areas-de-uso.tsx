"use client";

import { useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Area = { id: string; aba: string; titulo: string; texto: string; itens: string[] };

/** Funções reais da plataforma, agrupadas por quem usa. */
const AREAS: Area[] = [
  {
    id: "fono",
    aba: "Fonoaudiologia",
    titulo: "A avaliação vocal completa, num só prontuário",
    texto: "Anamnese, medidas acústicas, protocolos de autoavaliação e perceptivos, fonetograma e evolução do mesmo paciente, sem exportar de um programa para outro.",
    itens: ["Jitter, shimmer, HNR, CPPS, GNE e formantes", "AVQI 03.01 e DSI", "IDV-10, QVV, EASE-BR e GRBASI", "Diagrama de irregularidade × ruído", "Relatório em PDF e Word"],
  },
  {
    id: "canto",
    aba: "Canto e ensino",
    titulo: "Afinação nota a nota e extensão sob medida",
    texto: "Para o cantor e o professor: separe a voz da música, veja cada nota fora do tom e acompanhe o campo vocal crescer de sessão em sessão.",
    itens: ["Separação de voz e instrumentos", "Afinação em cents e vibrato", "Fonetograma com antes e depois", "Biofeedback de pitch e volume ao vivo", "Devolutiva pronta para o aluno"],
  },
  {
    id: "terapia",
    aba: "Terapia em casa",
    titulo: "Os exercícios continuam entre as sessões",
    texto: "O profissional monta o plano e envia um link; o paciente pratica no celular, sem criar conta, e as medidas voltam para o prontuário — até sem internet.",
    itens: ["Vogal sustentada, faixa de altura e volume", "Funciona offline e envia depois", "25 jogos de terapia", "Teste de carga vocal", "Sessões registradas e numeradas"],
  },
  {
    id: "pesquisa",
    aba: "Pesquisa",
    titulo: "Os números que você confere no Praat",
    texto: "O Praat roda no servidor; o motor interno foi calibrado contra ele e os dois nunca se misturam. Lote de gravações, manipulação PSOLA e marcações que abrem no Praat.",
    itens: ["Análise em lote com planilha CSV", "Manipulação de tom e duração (PSOLA)", "Marcações exportadas em TextGrid", "Espectrograma de banda estreita e larga", "Concordância documentada com o Praat"],
  },
  {
    id: "equipamentos",
    aba: "Equipamentos",
    titulo: "Pronto para o que já está no consultório",
    texto: "Nasalância com dois microfones numa interface estéreo, eletroglotografia a partir do WAV do aparelho e revisão do vídeo laríngeo quadro a quadro.",
    itens: ["Nasalância por tarefa (N/(N+O))", "Quociente de contato do EGG", "Vídeo laríngeo em câmera lenta", "Calibração em dB SPL", "Mídias guardadas no prontuário"],
  },
];

/** Abas por área de uso (padrão WAI-ARIA de abas: setas, Home e End). */
export function AreasDeUso() {
  const base = useId();
  const [ativa, setAtiva] = useState(0);
  const abas = useRef<(HTMLButtonElement | null)[]>([]);

  function teclado(e: React.KeyboardEvent, i: number) {
    const n = AREAS.length;
    const alvo = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (alvo === null) return;
    e.preventDefault();
    setAtiva(alvo);
    abas.current[alvo]?.focus();
  }

  const a = AREAS[ativa]!;
  return (
    <section id="para-quem" aria-labelledby="areas-title" className="relative isolate scroll-mt-20 px-5 py-24 sm:px-8 lg:py-32">
      <div className="absolute inset-0 -z-10 bg-canvas-raised" aria-hidden />
      <div className="mx-auto max-w-content">
        <h2 id="areas-title" className="max-w-3xl text-balance font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl lg:text-6xl">
          Feito para quem trabalha com voz
        </h2>

        <div role="tablist" aria-label="Áreas de uso" className="-mx-5 mt-12 flex gap-2 overflow-x-auto px-5 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
          {AREAS.map((ar, i) => (
            <button
              key={ar.id}
              ref={(el) => { abas.current[i] = el; }}
              type="button"
              role="tab"
              id={`${base}-aba-${ar.id}`}
              aria-selected={i === ativa}
              aria-controls={`${base}-painel`}
              tabIndex={i === ativa ? 0 : -1}
              onClick={() => setAtiva(i)}
              onKeyDown={(e) => teclado(e, i)}
              className={cn(
                "min-h-11 shrink-0 rounded-full border px-5 py-2.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                i === ativa ? "border-accent bg-accent text-canvas" : "border-line bg-canvas-overlay text-ink hover:border-ink-muted",
              )}
            >
              {ar.aba}
            </button>
          ))}
        </div>

        <div id={`${base}-painel`} role="tabpanel" aria-labelledby={`${base}-aba-${a.id}`} tabIndex={0}
          className="mt-10 grid gap-10 focus-visible:outline-none lg:grid-cols-12 lg:gap-16">
          <div key={a.id} className="motion-safe:animate-fade-up lg:col-span-6">
            <h3 className="text-balance font-display text-3xl font-semibold tracking-[-0.02em] text-ink sm:text-4xl">{a.titulo}</h3>
            <p className="mt-5 text-lg leading-relaxed text-ink-muted">{a.texto}</p>
          </div>
          <ul key={`${a.id}-itens`} className="divide-y divide-line/70 border-y border-line/70 lg:col-span-6">
            {a.itens.map((it, i) => (
              <li key={it} className="flex items-center gap-4 py-4 motion-safe:animate-fade-up" style={{ animationDelay: `${60 + i * 60}ms` }}>
                <span className="text-data w-8 shrink-0 text-sm text-accent">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-lg text-ink">{it}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
