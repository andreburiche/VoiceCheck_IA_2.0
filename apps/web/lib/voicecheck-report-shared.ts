/** Utilitários compartilhados dos PDFs VoiceCheck. */

export type ReportKind = "student" | "teacher" | "complete";

export type VoiceCheckReportPersonalization = {
  studentName?: string | null;
  teacherName?: string | null;
  assetName?: string | null;
  trainingGoal?: string | null;
  experienceLevel?: string | null;
  teacherNotes?: string | null;
  finalComments?: string | null;
  generatedAt?: Date;
};

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function omitEmpty(label: string, value?: string | null): string {
  const v = value?.trim();
  if (!v) return "";
  return `<div><strong>${esc(label)}:</strong> ${esc(v)}</div>`;
}

export function printHtmlDocument(html: string): void {
  if (typeof document === "undefined") {
    throw new Error("Impressão só disponível no navegador.");
  }
  const id = "voicecheck-report-print-frame";
  let iframe = document.getElementById(id) as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = id;
    iframe.setAttribute("title", "Relatório VoiceCheck");
    iframe.setAttribute("aria-hidden", "true");
    Object.assign(iframe.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "0",
      height: "0",
      border: "0",
      opacity: "0",
      pointerEvents: "none",
    });
    document.body.appendChild(iframe);
  }
  const win = iframe.contentWindow;
  const doc = iframe.contentDocument ?? win?.document;
  if (!win || !doc) throw new Error("Não foi possível preparar a impressão.");

  const go = () => {
    try {
      win.focus();
      win.print();
    } catch {
      throw new Error("Falha ao abrir o diálogo de impressão / PDF.");
    }
  };

  doc.open();
  doc.write(html);
  doc.close();
  if (doc.readyState === "complete") {
    requestAnimationFrame(go);
  } else {
    iframe.onload = () => {
      iframe!.onload = null;
      go();
    };
  }
}

export const BRAND = {
  teal: "#0d9488",
  tealDark: "#0f766e",
  ink: "#1e293b",
  muted: "#64748b",
  positive: "#059669",
  caution: "#d97706",
  alert: "#dc2626",
  paper: "#fafafa",
  card: "#ffffff",
  line: "#e2e8f0",
};
