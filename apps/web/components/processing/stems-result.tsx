"use client";

import Link from "next/link";
import { CheckCircle2, Download, Dumbbell, RefreshCw, Waves } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEM_COLORS: Record<string, string> = {
  vocals: "bg-stem-vocals",
  drums: "bg-stem-drums",
  bass: "bg-stem-bass",
  other: "bg-stem-other/40",
  guitar: "bg-stem-guitar",
  piano: "bg-stem-keys",
  keys: "bg-stem-keys",
};

const STEM_LABELS: Record<string, string> = {
  vocals: "Voz",
  drums: "Bateria",
  bass: "Baixo",
  other: "Outros",
  guitar: "Guitarra",
  piano: "Piano",
  keys: "Teclas",
};

type StemItem = {
  id: string;
  stem_type: string;
  asset_id: string;
};

type StemsResultProps = {
  projectId: string;
  stems: StemItem[];
  onReprocess?: () => void;
};

export function StemsResult({ projectId, stems, onReprocess }: StemsResultProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <CheckCircle2 className="h-12 w-12 text-accent" aria-hidden />
        <h3 className="text-xl font-semibold text-ink">Processamento concluído</h3>
        <p className="text-sm text-ink-muted">
          {stems.length} {stems.length === 1 ? "faixa gerada" : "faixas geradas"} nesta separação
        </p>
      </div>

      {stems.length === 0 ? (
        <p className="text-center text-sm text-signal-warn">
          A separação terminou, mas nenhuma faixa foi registrada. Tente reprocessar.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-canvas/50">
          {stems.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className={cn("h-8 w-1.5 rounded-full", STEM_COLORS[s.stem_type] ?? "bg-accent")}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{STEM_LABELS[s.stem_type] ?? s.stem_type}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {onReprocess ? (
          <Button type="button" variant="secondary" onClick={onReprocess}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Reprocessar
          </Button>
        ) : null}
        <Link href={`/projects/${projectId}/studio`} className={buttonVariants()}>
          <Waves className="h-4 w-4" aria-hidden />
          Abrir no estúdio
        </Link>
        <Link href={`/projects/${projectId}/practice`} className={buttonVariants({ variant: "secondary" })}>
          <Dumbbell className="h-4 w-4" aria-hidden />
          Treinar
        </Link>
        {stems.length > 0 ? (
          <Link href={`/projects/${projectId}/export`} className={buttonVariants({ variant: "secondary" })}>
            <Download className="h-4 w-4" aria-hidden />
            Exportar
          </Link>
        ) : null}
      </div>
    </div>
  );
}
