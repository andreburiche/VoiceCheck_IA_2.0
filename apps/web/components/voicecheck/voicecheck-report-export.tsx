"use client";

import { Printer } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { VoiceCheckF0Report } from "@/lib/voicecheck-f0-analysis";
import {
  printVoiceCheckReport,
  type ReportKind,
  type VoiceCheckReportPersonalization,
} from "@/lib/voicecheck-report";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/errors";

type Props = {
  report: VoiceCheckF0Report;
  defaults?: VoiceCheckReportPersonalization;
  className?: string;
};

export function VoiceCheckReportExport({ report, defaults, className }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ReportKind>("student");
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<VoiceCheckReportPersonalization>({
    studentName: defaults?.studentName ?? "",
    teacherName: defaults?.teacherName ?? "",
    assetName: defaults?.assetName ?? "",
    trainingGoal: defaults?.trainingGoal ?? "",
    experienceLevel: defaults?.experienceLevel ?? "",
    teacherNotes: defaults?.teacherNotes ?? "",
    finalComments: defaults?.finalComments ?? "",
  });

  function setField<K extends keyof VoiceCheckReportPersonalization>(
    key: K,
    value: VoiceCheckReportPersonalization[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function exportPdf() {
    setErr(null);
    try {
      printVoiceCheckReport(
        report,
        {
          ...form,
          generatedAt: new Date(),
        },
        kind,
      );
      setOpen(false);
    } catch (e) {
      setErr(friendlyError(e, "Falha ao gerar PDF"));
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
        <Printer className="h-4 w-4" aria-hidden />
        PDF pedagógico
      </Button>

      {open ? (
        <div className="space-y-3 panel-glass rounded-2xl p-4">
          <p className="text-sm font-medium text-ink">Exportar relatório</p>
          <p className="text-xs text-ink-muted">
            Mesma análise, três formatos. Campos vazios são omitidos no PDF.
          </p>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de relatório">
            {(
              [
                ["student", "Aluno"],
                ["teacher", "Técnico (professor)"],
                ["complete", "Completo"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setKind(id)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm",
                  kind === id
                    ? "border-accent/50 bg-accent/15 text-accent"
                    : "border-line text-ink-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Nome do aluno" value={form.studentName} onChange={(v) => setField("studentName", v)} />
            <Field
              label="Nome do professor"
              value={form.teacherName}
              onChange={(v) => setField("teacherName", v)}
            />
            <Field label="Gravação / música" value={form.assetName} onChange={(v) => setField("assetName", v)} />
            <Field
              label="Nível de experiência"
              value={form.experienceLevel}
              onChange={(v) => setField("experienceLevel", v)}
              placeholder="Iniciante, intermediário…"
            />
            <Field
              label="Objetivo do treinamento"
              value={form.trainingGoal}
              onChange={(v) => setField("trainingGoal", v)}
              className="sm:col-span-2"
            />
            <Field
              label="Observações do professor"
              value={form.teacherNotes}
              onChange={(v) => setField("teacherNotes", v)}
              className="sm:col-span-2"
            />
            <Field
              label="Comentários finais"
              value={form.finalComments}
              onChange={(v) => setField("finalComments", v)}
              className="sm:col-span-2"
            />
          </div>

          {err ? (
            <p role="alert" className="text-sm text-signal-err">
              {err}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={exportPdf}>
              Gerar PDF
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value?: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const id = `vc-rpt-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id} className="text-xs text-ink-faint">
        {label}
      </Label>
      <Input
        id={id}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9"
      />
    </div>
  );
}
