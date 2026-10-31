"use client";

import { useMemo } from "react";

import { fixoBR, type Avaliacao } from "@/lib/voz-clinica-api";
import { useTemaAtivo } from "@/lib/tema";
import { LIMITES_DDF, ROTULO_QUADRANTE, pontosDdf, svgDdf } from "@/lib/voz-clinica-ddf";

function dia(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

/** Diagrama irregularidade × ruído das análises acústicas (inspirado no DDF; ver lib/voz-clinica-ddf.ts). */
export function DiagramaDesvio({ itens }: { itens: Avaliacao[] }) {
  const pontos = useMemo(() => pontosDdf(itens), [itens]);
  const tema = useTemaAtivo();
  if (!pontos.length) return null;
  const ultimo = pontos[pontos.length - 1]!;
  const svg = svgDdf(pontos, tema, 320);
  const descricao = `Diagrama de irregularidade por ruído com ${pontos.length} ${pontos.length === 1 ? "análise" : "análises"}. A mais recente está ${ROTULO_QUADRANTE[ultimo.quadrante]}.`;
  return (
    <section className="mt-4 rounded-xl p-4 ring-1 ring-inset ring-ink/10" aria-label="Diagrama de Desvio Fonatório: evolução do paciente" data-testid="vc2-ddf">
      <h3 className="font-display text-base font-semibold text-ink">Diagrama de Desvio Fonatório — evolução</h3>
      <div className="mt-3 flex flex-wrap items-start gap-4">
        {/* SVG montado só com números e rótulos fixos (lib/voz-clinica-ddf.ts) */}
        <div className="max-w-full shrink-0" role="img" aria-label={descricao} dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="min-w-[14rem] flex-1 text-sm">
          <p className="text-ink">
            Mais recente ({dia(ultimo.criado_em)}): <strong data-testid="vc2-ddf-quadrante">{ROTULO_QUADRANTE[ultimo.quadrante]}</strong>.
          </p>
          <p className="mt-1 text-ink-muted">
            Jitter {fixoBR(ultimo.jitter, 2)}% · shimmer {fixoBR(ultimo.shimmer, 2)}% · GNE {fixoBR(ultimo.gne, 2)}
          </p>
          <ol className="mt-2 space-y-0.5 text-xs text-ink-muted">
            {pontos.map((p, i) => (
              <li key={p.criado_em + i}>{i + 1}. {dia(p.criado_em)} — {ROTULO_QUADRANTE[p.quadrante]}</li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-ink-faint">
            Inspirado no Diagrama de Desvio Fonatório (VoxMetria) e no diagrama de rouquidão (lingWAVES), mas não é o oficial:
            as constantes deles não foram publicadas. Cada eixo vale 1 no limite de normalidade do VoxMetria; na irregularidade conta a medida mais alterada
            (jitter {fixoBR(LIMITES_DDF.jitter_pct, 1)}%, shimmer {fixoBR(LIMITES_DDF.shimmer_pct, 1)}%, GNE {fixoBR(LIMITES_DDF.gne, 1)}).
            Use sempre o mesmo motor (Praat ou interno) para comparar sessões.
          </p>
        </div>
      </div>
    </section>
  );
}
