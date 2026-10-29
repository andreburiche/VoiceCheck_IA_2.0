"use client";

import {
  AlertTriangle,
  Download,
  Package,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { isBasicFourStem, packageStatusOf, statusLabel, type ModelBucket } from "@/lib/ai-models";
import type { SeparationModelInfo } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { STEM_COLORS, STEM_LABELS } from "@/lib/stem-theme";
import { cn } from "@/lib/utils";

type Props = {
  model: SeparationModelInfo;
  busy?: boolean;
  onVerify: (code: string) => void;
  onImportOffline: (code: string) => void;
  onUpdate: (code: string) => void;
  onRemove: (code: string) => void;
};

export function ModelCard({
  model,
  busy,
  onVerify,
  onImportOffline,
  onUpdate,
  onRemove,
}: Props) {
  const bucket = packageStatusOf(model);
  const basic = isBasicFourStem(model);
  const diskLabel =
    model.disk_bytes != null && model.disk_bytes > 0
      ? `${formatBytes(model.disk_bytes)} (medido)`
      : model.package_size_hint_bytes
        ? `~${formatBytes(model.package_size_hint_bytes)} (pacote típico)`
        : "Não medido";

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-4 shadow-panel",
        basic && bucket === "installed"
          ? "border-accent/60 bg-accent/10"
          : bucket === "incompatible"
            ? "border-signal-warn/40 bg-canvas-raised/60 opacity-90"
            : "border-line bg-canvas-raised/90",
      )}
      aria-labelledby={`model-${model.code}-title`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`model-${model.code}-title`} className="text-base font-semibold text-ink">
            {model.label || model.name}
          </h3>
          <p className="mt-0.5 font-mono text-xs text-ink-faint">{model.code}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {basic ? (
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
              Básico 4 fontes
            </span>
          ) : null}
          {model.recommended && !basic ? (
            <span className="rounded-full bg-violet/20 px-2 py-0.5 text-xs font-medium text-violet">
              Catálogo
            </span>
          ) : null}
          <StatusBadge bucket={bucket} />
        </div>
      </div>

      <p className="text-sm text-ink-muted">{model.description}</p>

      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-ink-faint">Versão</dt>
          <dd className="font-mono text-ink">{model.version ?? "— (não instalado)"}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Licença</dt>
          <dd className="text-ink">{model.license ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Tamanho</dt>
          <dd className="font-mono text-ink">{diskLabel}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Requisitos</dt>
          <dd className="text-ink">
            {model.requirements ||
              (model.cpu_ok
                ? `CPU OK · VRAM mín. ${model.min_vram_mb} MB`
                : `GPU · VRAM mín. ${model.min_vram_mb} MB`)}
          </dd>
        </div>
      </dl>

      <div>
        <p className="mb-1.5 text-xs text-ink-faint">Fontes suportadas</p>
        <ul className="flex flex-wrap gap-1.5" aria-label="Fontes">
          {model.stems.map((s) => (
            <li
              key={s}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas/60 px-2 py-1 text-xs text-ink"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: STEM_COLORS[s] ?? "#268BFF" }}
                aria-hidden
              />
              {STEM_LABELS[s] ?? s}
            </li>
          ))}
        </ul>
      </div>

      <p
        className={cn(
          "text-xs",
          bucket === "installed" ? "text-accent" : bucket === "incompatible" ? "text-signal-warn" : "text-ink-faint",
        )}
      >
        {model.reason}
      </p>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => onVerify(model.code)}
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Verificar integridade
        </Button>
        {bucket === "available" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onImportOffline(model.code)}
          >
            <Package className="h-3.5 w-3.5" aria-hidden />
            Importar pacote offline
          </Button>
        ) : null}
        {bucket === "installed" ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onUpdate(model.code)}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Atualizar modelo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onRemove(model.code)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Remover
            </Button>
          </>
        ) : null}
        {bucket === "available" ? (
          <Button type="button" size="sm" disabled title="Download automático ainda não disponível">
            <Download className="h-3.5 w-3.5" aria-hidden />
            Baixar (indisponível)
          </Button>
        ) : null}
        {bucket === "incompatible" ? (
          <span className="inline-flex items-center gap-1 text-xs text-signal-warn">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Ajuste hardware/adapter antes de usar
          </span>
        ) : null}
      </div>
    </article>
  );
}

function StatusBadge({ bucket }: { bucket: ModelBucket }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        bucket === "installed" && "bg-accent/20 text-accent",
        bucket === "available" && "bg-violet/20 text-violet",
        bucket === "incompatible" && "bg-signal-warn/20 text-signal-warn",
      )}
    >
      {statusLabel(bucket)}
    </span>
  );
}
