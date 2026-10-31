"use client";

import { Check, Eye, FileText, Pencil, Printer, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  analysisFingerprint,
  approveDevolutiva,
  buildDevolutivaFromReport,
  technicalPdfFilename,
  touchDevolutiva,
  type DevolutivaExercise,
  type DevolutivaPositive,
  type DevolutivaPriority,
  type VoiceCheckDevolutiva,
} from "@/lib/voicecheck-devolutiva";
import {
  getDevolutivaByFingerprint,
  listDevolutivasByFingerprint,
  saveAnalysisSnapshot,
  saveDevolutiva,
} from "@/lib/voicecheck-devolutiva-store";
import type { VoiceCheckF0Report } from "@/lib/voicecheck-f0-analysis";
import {
  openDevolutivaPreview,
  openTechnicalPreview,
  printDevolutivaReport,
} from "@/lib/voicecheck-report-devolutiva";
import { buildTeacherReportHtml } from "@/lib/voicecheck-report-teacher";
import { printHtmlDocument } from "@/lib/voicecheck-report-shared";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/errors";
import { authApi } from "@/lib/api";
import { useConfirm } from "@/components/ui/use-confirm";

type Props = {
  report: VoiceCheckF0Report;
  projectId?: string | null;
  studentName?: string | null;
  teacherName?: string | null;
  assetName?: string | null;
};

export function VoiceCheckMyReports({
  report,
  projectId,
  studentName,
  teacherName,
  assetName,
}: Props) {
  const [confirmDialog, confirm] = useConfirm();
  // professor(a) de música: o nome de Meu perfil assina as devolutivas por padrão
  const me = useQuery({ queryKey: ["me"], queryFn: () => authApi.me() });
  const professorPadrao = me.data?.perfil === "professor_musica" ? me.data.name : "";
  const fp = analysisFingerprint(report);
  const [devolutiva, setDevolutiva] = useState<VoiceCheckDevolutiva | null>(null);
  const [history, setHistory] = useState<VoiceCheckDevolutiva[]>([]);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [existing, rows] = await Promise.all([
        getDevolutivaByFingerprint(fp),
        listDevolutivasByFingerprint(fp),
      ]);
      setDevolutiva(existing);
      setHistory(rows);
    } catch {
      /* ignore */
    }
  }, [fp]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void saveAnalysisSnapshot({
      projectId,
      fingerprint: fp,
      report,
      assetName,
    }).catch(() => undefined);
  }, [fp, projectId, report, assetName]);

  function personal() {
    return {
      studentName: studentName ?? devolutiva?.personal.studentName ?? "",
      teacherName: teacherName || devolutiva?.personal.teacherName || professorPadrao,
      assetName: assetName ?? "",
      generatedAt: new Date(),
    };
  }

  function viewTechnical() {
    setErr(null);
    try {
      const html = buildTeacherReportHtml(report, personal());
      openTechnicalPreview(html);
    } catch (e) {
      setErr(friendlyError(e, "Falha ao visualizar técnico"));
    }
  }

  function exportTechnicalPdf() {
    setErr(null);
    try {
      const html = buildTeacherReportHtml(report, {
        ...personal(),
        // title via generated html <title> — patch with filename hint
      });
      // Injeta título sugerido de arquivo
      const named = html.replace(
        /<title>[^<]*<\/title>/i,
        `<title>${technicalPdfFilename(studentName)}</title>`,
      );
      printHtmlDocument(named);
      setMsg("Diálogo de impressão do Relatório Técnico aberto.");
    } catch (e) {
      setErr(friendlyError(e, "Falha ao exportar técnico"));
    }
  }

  async function generateDevolutiva() {
    setErr(null);
    setMsg(null);
    const hasApproved = history.some((h) => h.status === "approved");
    const activeApproved = devolutiva?.status === "approved";
    if (hasApproved || activeApproved) {
      const ok = await confirm({
        title: "Gerar uma nova devolutiva?",
        description:
          "Já existe uma devolutiva aprovada para esta análise. Gerar de novo cria um novo rascunho; a versão aprovada continua no histórico.",
        confirmLabel: "Gerar novo rascunho",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      // Sempre novo id se a ativa está aprovada; rascunho pode ser sobrescrito
      const reuseDraftId =
        devolutiva?.status === "draft" ? devolutiva.id : undefined;
      const d = buildDevolutivaFromReport(report, {
        studentName: studentName || devolutiva?.personal.studentName,
        teacherName: teacherName || devolutiva?.personal.teacherName || professorPadrao || undefined,
        existingId: reuseDraftId,
      });
      await saveDevolutiva(d);
      setDevolutiva(d);
      setHistory(await listDevolutivasByFingerprint(fp));
      setEditing(true);
      setMsg(
        reuseDraftId
          ? "Rascunho regenerado a partir da análise."
          : "Novo rascunho gerado. Versões aprovadas permanecem no histórico.",
      );
    } catch (e) {
      setErr(friendlyError(e, "Falha ao gerar devolutiva"));
    } finally {
      setBusy(false);
    }
  }

  async function selectFromHistory(id: string) {
    const row = history.find((h) => h.id === id) ?? null;
    if (!row) return;
    setDevolutiva(row);
    setEditing(false);
    setMsg(
      row.status === "approved"
        ? "Versão aprovada carregada (somente leitura até editar — editar volta a rascunho)."
        : "Rascunho carregado do histórico.",
    );
  }

  function viewDevolutiva() {
    if (!devolutiva) {
      setErr("Gere a devolutiva primeiro.");
      return;
    }
    setErr(null);
    try {
      openDevolutivaPreview(devolutiva);
    } catch (e) {
      setErr(friendlyError(e, "Falha ao visualizar"));
    }
  }

  function exportDevolutivaPdf() {
    if (!devolutiva) {
      setErr("Gere a devolutiva primeiro.");
      return;
    }
    setErr(null);
    try {
      printDevolutivaReport(devolutiva);
      setMsg("Diálogo de impressão da Devolutiva aberto.");
    } catch (e) {
      setErr(friendlyError(e, "Falha ao exportar devolutiva"));
    }
  }

  async function saveEdits() {
    if (!devolutiva) return;
    setBusy(true);
    setErr(null);
    try {
      const next = touchDevolutiva(devolutiva);
      await saveDevolutiva(next);
      setDevolutiva(next);
      setHistory(await listDevolutivasByFingerprint(fp));
      setMsg("Alterações salvas (rascunho).");
      setEditing(false);
    } catch (e) {
      setErr(friendlyError(e, "Falha ao salvar"));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!devolutiva) return;
    setBusy(true);
    try {
      const next = approveDevolutiva(devolutiva);
      await saveDevolutiva(next);
      setDevolutiva(next);
      setHistory(await listDevolutivasByFingerprint(fp));
      setEditing(false);
      setMsg("Devolutiva aprovada e salva no histórico.");
    } catch (e) {
      setErr(friendlyError(e, "Falha ao aprovar"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 panel-glass rounded-2xl p-4 md:p-5">
      <div>
        <h3 className="font-display text-base font-semibold text-ink">Meus Relatórios</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Dois formatos a partir da mesma análise. O relatório técnico permanece intacto.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <article className="flex flex-col gap-3 rounded-2xl bg-ink/[0.03] ring-1 ring-inset ring-ink/10 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-canvas-raised text-ink-muted">
              <FileText className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h4 className="text-sm font-semibold text-ink">Relatório Técnico</h4>
              <p className="mt-1 text-xs text-ink-muted">
                Análise completa da sua gravação, com gráficos, medições e ocorrências técnicas.
              </p>
            </div>
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={viewTechnical}>
              <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Visualizar
            </Button>
            <Button type="button" size="sm" onClick={exportTechnicalPdf}>
              <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Exportar PDF
            </Button>
          </div>
        </article>

        <article className="flex flex-col gap-3 rounded-2xl border border-accent/35 bg-accent/5 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/40 bg-accent/15 text-accent">
              <Sparkles className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h4 className="text-sm font-semibold text-ink">Devolutiva do Aluno</h4>
              <p className="mt-1 text-xs text-ink-muted">
                Resumo simples e personalizado com pontos positivos, aspectos para melhorar e
                exercícios.
              </p>
              {devolutiva ? (
                <p className="mt-1 text-data text-xs text-ink-faint">
                  {devolutiva.status === "approved" ? "Aprovada" : "Rascunho"} ·{" "}
                  {devolutiva.updatedAt.slice(0, 10)}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void generateDevolutiva()}
            >
              {devolutiva ? "Regenerar devolutiva" : "Gerar devolutiva"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!devolutiva}
              onClick={viewDevolutiva}
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Visualizar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!devolutiva}
              onClick={() => setEditing(true)}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Editar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!devolutiva}
              onClick={exportDevolutivaPdf}
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Exportar PDF
            </Button>
          </div>
        </article>
      </div>

      {history.length > 1 || history.some((h) => h.status === "approved") ? (
        <div className="space-y-1.5 rounded-xl border border-line/50 bg-canvas/20 px-3 py-2">
          <p className="hud-label">
            Histórico desta análise
          </p>
          <ul className="max-h-28 space-y-1 overflow-y-auto">
            {history.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => void selectFromHistory(h.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs",
                    devolutiva?.id === h.id
                      ? "bg-accent/15 text-accent"
                      : "text-ink-muted hover:bg-canvas-raised",
                  )}
                >
                  <span>
                    {h.status === "approved" ? "Aprovada" : "Rascunho"} ·{" "}
                    {h.personal.studentName || "sem aluno"} · {h.updatedAt.slice(0, 16).replace("T", " ")}
                  </span>
                  {devolutiva?.id === h.id ? (
                    <span className="text-data text-xs">ativa</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {editing && devolutiva ? (
        <DevolutivaEditor
          value={devolutiva}
          onChange={setDevolutiva}
          onSave={() => void saveEdits()}
          onApprove={() => void approve()}
          onCancel={() => setEditing(false)}
          busy={busy}
        />
      ) : null}

      {msg ? <p className="text-sm text-accent">{msg}</p> : null}
      {err ? (
        <p role="alert" className="text-sm text-signal-err">
          {err}
        </p>
      ) : null}
      {confirmDialog}
    </section>
  );
}

function DevolutivaEditor({
  value,
  onChange,
  onSave,
  onApprove,
  onCancel,
  busy,
}: {
  value: VoiceCheckDevolutiva;
  onChange: (d: VoiceCheckDevolutiva) => void;
  onSave: () => void;
  onApprove: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  function setPersonal(field: "studentName" | "teacherName" | "date", v: string) {
    onChange({ ...value, personal: { ...value.personal, [field]: v } });
  }

  function setPositive(i: number, patch: Partial<DevolutivaPositive>) {
    const positives = value.positives.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    onChange({ ...value, positives });
  }

  function setPriority(i: number, patch: Partial<DevolutivaPriority>) {
    const priorities = value.priorities.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    onChange({ ...value, priorities });
  }

  function setExercise(i: number, patch: Partial<DevolutivaExercise>) {
    const exercises = value.exercises.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    onChange({ ...value, exercises });
  }

  return (
    <div className="space-y-3 panel-glass rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">Editar devolutiva</h4>
        <p className="text-xs text-ink-faint">
          A edição não altera o relatório técnico nem as medições.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Field
          label="Aluno"
          value={value.personal.studentName}
          onChange={(v) => setPersonal("studentName", v)}
        />
        <Field
          label="Professor"
          value={value.personal.teacherName}
          onChange={(v) => setPersonal("teacherName", v)}
        />
        <Field label="Data" value={value.personal.date} onChange={(v) => setPersonal("date", v)} />
      </div>

      <Area
        label="1. Como está sua voz?"
        value={value.howIsYourVoice}
        onChange={(v) => onChange({ ...value, howIsYourVoice: v })}
      />

      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-faint">2. Pontos positivos</p>
        {value.positives.length === 0 ? (
          <p className="text-xs text-ink-muted">Nenhum ponto positivo na análise.</p>
        ) : (
          value.positives.map((p, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-line/50 p-2 sm:grid-cols-2">
              <Field
                label={`Título #${i + 1}`}
                value={p.title}
                onChange={(v) => setPositive(i, { title: v })}
              />
              <Field
                label={`Texto #${i + 1}`}
                value={p.text}
                onChange={(v) => setPositive(i, { text: v })}
              />
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-faint">3. Prioridades</p>
        {value.priorities.map((p, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-line/50 p-2">
            <Field label="Nome" value={p.name} onChange={(v) => setPriority(i, { name: v })} />
            <Area
              label="Explicação"
              value={p.explanation}
              onChange={(v) => setPriority(i, { explanation: v })}
            />
            <Area
              label="Orientação"
              value={p.guidance}
              onChange={(v) => setPriority(i, { guidance: v })}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-faint">4. Exercícios</p>
        {value.exercises.map((e, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-line/50 p-2">
            <Field label="Nome" value={e.name} onChange={(v) => setExercise(i, { name: v })} />
            <Area
              label="Como executar"
              value={e.howTo}
              onChange={(v) => setExercise(i, { howTo: v })}
            />
            <Field
              label="Duração / repetições"
              value={e.duration}
              onChange={(v) => setExercise(i, { duration: v })}
            />
          </div>
        ))}
      </div>

      <Area
        label="5. Mensagem final"
        value={value.closingMessage}
        onChange={(v) => onChange({ ...value, closingMessage: v })}
      />
      <Area
        label="Observações do professor"
        value={value.teacherObservations}
        onChange={(v) => onChange({ ...value, teacherObservations: v })}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={onSave}>
          Salvar alterações
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onApprove}>
          <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Aprovar devolutiva
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Fechar editor
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `dev-f-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-ink-faint">
        {label}
      </Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-9" />
    </div>
  );
}

function Area({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `dev-a-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-ink-faint">
        {label}
      </Label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={cn(
          "w-full rounded-xl border border-line bg-canvas-raised px-3 py-2 text-sm text-ink",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        )}
      />
    </div>
  );
}
