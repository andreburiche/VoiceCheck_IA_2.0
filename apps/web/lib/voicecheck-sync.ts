/**
 * Sincroniza os diagnósticos VoiceCheck entre o navegador (IndexedDB) e a API.
 *
 * O navegador continua sendo a cópia de trabalho (abre rápido, funciona sem API);
 * o servidor guarda o registro da conta para abrir em qualquer computador.
 */

import {
  voicecheckDiagnosesApi,
  type VoiceCheckDiagnosisAsset,
  type VoiceCheckDiagnosisItem,
  type VoiceCheckDiagnosisUpsert,
} from "@/lib/api";
import { normalizeVoiceMix } from "@/lib/voice-mix";
import { analysisFingerprint } from "@/lib/voicecheck-devolutiva";
import type { VoiceCheckF0Report } from "@/lib/voicecheck-f0-analysis";
import {
  getVoiceCheckProject,
  patchVoiceCheckSync,
  saveVoiceCheckProject,
  summarizeReport,
  type VoiceCheckAssetMeta,
  type VoiceCheckAutotuneInfo,
  type VoiceCheckProbeLocal,
  type VoiceCheckProject,
  type VoiceCheckProjectListItem,
  type VoiceCheckStep,
  type VoiceCheckSyncState,
} from "@/lib/voicecheck-store";

/** Mesmo teto de upload da API (MAX_UPLOAD_BYTES). Acima disso o original fica só aqui. */
export const MAX_SERVER_FILE_BYTES = 100 * 1024 * 1024;

const STEPS: VoiceCheckStep[] = ["importar", "preparar", "analisar", "resultados", "melhorar"];

export type PushResult = { ok: boolean; error?: string };

function errorMessage(e: unknown): string {
  const status = (e as { status?: number } | null)?.status;
  if (status === 402) return "Cota de armazenamento cheia — ficou salvo só neste navegador.";
  if (status === 0) return "Sem conexão com o servidor — o diagnóstico será salvo na sua conta assim que a conexão voltar.";
  return e instanceof Error ? e.message : "Falha ao enviar para o servidor";
}

function errorStatus(e: unknown): number | undefined {
  return (e as { status?: number } | null)?.status;
}

function toApiAsset(a: VoiceCheckAssetMeta | null): VoiceCheckDiagnosisAsset | null {
  if (!a) return null;
  return {
    name: a.name.slice(0, 255),
    mime_type: (a.mimeType || "application/octet-stream").slice(0, 128),
    size_bytes: Math.max(0, Math.round(a.sizeBytes || 0)),
    duration_sec: a.durationSec != null && Number.isFinite(a.durationSec) ? a.durationSec : null,
    kind: a.kind,
    ext: (a.ext || "").slice(0, 10),
  };
}

function fromApiAsset(a: VoiceCheckDiagnosisAsset | null): VoiceCheckAssetMeta | null {
  if (!a) return null;
  return {
    name: a.name,
    mimeType: a.mime_type,
    sizeBytes: a.size_bytes,
    durationSec: a.duration_sec,
    kind: a.kind,
    ext: a.ext,
  };
}

function toStep(s: string): VoiceCheckStep {
  return (STEPS as string[]).includes(s) ? (s as VoiceCheckStep) : "importar";
}

function reportFp(report: VoiceCheckF0Report | null | undefined): string | null {
  if (!report) return null;
  try {
    return `${analysisFingerprint(report)}|${report.statistics?.valid_frame_percent ?? ""}`;
  } catch {
    return null;
  }
}

/** Envia metadados, relatório (se mudou) e áudios (se mudaram) de um diagnóstico local. */
async function pushOnce(id: string): Promise<PushResult> {
  const row = await getVoiceCheckProject(id);
  if (!row) return { ok: false, error: "Diagnóstico não encontrado neste navegador" };
  const prev: VoiceCheckSyncState = row.sync ?? {};
  const fp = reportFp(row.f0Report);
  const next: VoiceCheckSyncState = { ...prev };

  try {
    const body: VoiceCheckDiagnosisUpsert = {
      title: (row.title || "Diagnóstico").slice(0, 120),
      step: row.step,
      max_reached: Math.min(4, Math.max(0, row.maxReached ?? 0)),
      asset: toApiAsset(row.asset),
      probe: (row.probe as unknown as Record<string, unknown>) ?? null,
      summary: (() => {
        const s = row.summary ?? summarizeReport(row.f0Report);
        return s
          ? { events: s.events, positives: s.positives, valid_frame_percent: s.validFramePercent }
          : null;
      })(),
      analysis_source: row.analysisSource ?? null,
      autotune: row.correctedWav && row.autotune
        ? (row.autotune as unknown as Record<string, unknown>)
        : null,
      voice_mix: (row.voiceMix as unknown as Record<string, unknown>) ?? null,
      created_at: row.createdAt,
    };
    if (fp !== (prev.reportFp ?? null)) {
      body.report = (row.f0Report as unknown as Record<string, unknown>) ?? null;
    }
    await voicecheckDiagnosesApi.upsert(id, body);
    next.reportFp = fp;

    let note: string | null = null;
    if (row.blob && prev.originalSize !== row.blob.size) {
      if (row.blob.size <= MAX_SERVER_FILE_BYTES) {
        await voicecheckDiagnosesApi.uploadFile(id, "original", row.blob, row.asset?.name || "original");
        next.originalSize = row.blob.size;
      } else {
        note = "Arquivo original acima de 100 MB: só o áudio preparado foi para o servidor.";
      }
    }
    if (row.preparedWav && prev.preparedSize !== row.preparedWav.size) {
      await voicecheckDiagnosesApi.uploadFile(id, "prepared", row.preparedWav, "prepared.wav");
      next.preparedSize = row.preparedWav.size;
    }
    if (row.correctedWav && prev.correctedSize !== row.correctedWav.size) {
      await voicecheckDiagnosesApi.uploadFile(id, "corrected", row.correctedWav, "afinado.wav");
      next.correctedSize = row.correctedWav.size;
    } else if (!row.correctedWav && prev.correctedSize) {
      // Versão afinada descartada aqui: descarta também na conta.
      await voicecheckDiagnosesApi.removeCorrected(id).catch((e) => {
        if (errorStatus(e) !== 404) throw e;
      });
      next.correctedSize = null;
    }

    next.syncedAt = new Date().toISOString();
    next.syncedUpdatedAt = row.updatedAt;
    next.error = note;
    await patchVoiceCheckSync(id, next);
    return { ok: true };
  } catch (e) {
    const msg = errorMessage(e);
    await patchVoiceCheckSync(id, { ...next, error: msg }).catch(() => undefined);
    return { ok: false, error: msg };
  }
}

const inflight = new Map<string, Promise<PushResult>>();
const again = new Set<string>();

/** Agenda o envio; chamadas repetidas durante um envio viram um único reenvio no fim. */
export function pushDiagnosis(id: string): Promise<PushResult> {
  const running = inflight.get(id);
  if (running) {
    again.add(id);
    return running;
  }
  const p = (async () => {
    let result: PushResult;
    do {
      again.delete(id);
      result = await pushOnce(id);
    } while (again.has(id) && result.ok);
    return result;
  })().finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

export function isPushing(id: string): boolean {
  return inflight.has(id);
}

/** Precisa enviar? (nunca foi, ou mudou desde o último envio) */
export function needsPush(item: VoiceCheckProjectListItem, onServer: boolean): boolean {
  if (!onServer) return true;
  // A conta tem uma versão mais nova (editada em outro computador): nunca
  // sobrescrever com a cópia antiga daqui — ela é baixada ao abrir.
  if (item.stale) return false;
  return (item.sync?.syncedUpdatedAt ?? null) !== item.updatedAt;
}

/** Junta a lista local com a do servidor (servidor null = API fora do ar). */
export function mergeDiagnosisLists(
  local: VoiceCheckProjectListItem[],
  remote: VoiceCheckDiagnosisItem[] | null,
): VoiceCheckProjectListItem[] {
  if (!remote) return local.map((l) => ({ ...l, location: "local" as const }));
  const byId = new Map(remote.map((r) => [r.id, r]));
  const out: VoiceCheckProjectListItem[] = local.map((l) => {
    const r = byId.get(l.id);
    if (!r) return { ...l, location: "local" as const };
    byId.delete(l.id);
    const remoteNewer = Date.parse(r.updated_at) > Date.parse(l.updatedAt) + 2000 &&
      (l.sync?.syncedUpdatedAt ?? null) === l.updatedAt;
    return remoteNewer
      ? { ...l, ...remoteToItem(r), location: "both" as const, sync: l.sync, stale: true }
      : { ...l, location: "both" as const };
  });
  for (const r of byId.values()) out.push(remoteToItem(r));
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function remoteToItem(r: VoiceCheckDiagnosisItem): VoiceCheckProjectListItem {
  return {
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    step: toStep(r.step),
    maxReached: r.max_reached,
    asset: fromApiAsset(r.asset),
    summary: r.summary
      ? {
          events: r.summary.events,
          positives: r.summary.positives,
          validFramePercent: r.summary.valid_frame_percent,
        }
      : null,
    analysisSource: r.analysis_source,
    hasPreparedWav: r.has_prepared,
    hasReport: r.has_report,
    hasCorrected: Boolean(r.has_corrected),
    location: "server",
  };
}

/**
 * Baixa um diagnóstico do servidor e guarda a cópia neste navegador.
 * Usado para abrir algo salvo em outro computador (ou mais novo lá).
 */
export async function pullDiagnosis(id: string): Promise<VoiceCheckProject> {
  const full = await voicecheckDiagnosesApi.get(id);
  const [original, prepared, corrected] = await Promise.all([
    full.has_original ? voicecheckDiagnosesApi.downloadFile(id, "original") : Promise.resolve(null),
    full.has_prepared ? voicecheckDiagnosesApi.downloadFile(id, "prepared") : Promise.resolve(null),
    full.has_corrected
      ? voicecheckDiagnosesApi.downloadFile(id, "corrected").catch(() => null)
      : Promise.resolve(null),
  ]);
  const blob = original ?? prepared;
  if (!blob) throw new Error("Este diagnóstico não tem áudio salvo no servidor.");
  const report = (full.report as unknown as VoiceCheckF0Report | null) ?? null;
  const asset = fromApiAsset(full.asset);
  const row: VoiceCheckProject = {
    id: full.id,
    title: full.title,
    createdAt: full.created_at,
    updatedAt: full.updated_at,
    step: toStep(full.step),
    maxReached: full.max_reached,
    asset: original
      ? asset
      : asset
        ? { ...asset, name: asset.name.replace(/\.[^.]+$/, "") + " (preparado).wav", mimeType: "audio/wav", ext: "wav", kind: "audio", sizeBytes: blob.size }
        : null,
    blob,
    preparedWav: prepared ?? undefined,
    correctedWav: corrected ?? undefined,
    autotune: corrected && full.autotune ? (full.autotune as unknown as VoiceCheckAutotuneInfo) : null,
    voiceMix: full.voice_mix ? normalizeVoiceMix(full.voice_mix) : null,
    probe: (full.probe as unknown as VoiceCheckProbeLocal | null) ?? null,
    f0Report: report,
    analysisSource: full.analysis_source,
    summary: summarizeReport(report),
    sync: {
      syncedAt: new Date().toISOString(),
      syncedUpdatedAt: full.updated_at,
      originalSize: original?.size ?? null,
      preparedSize: prepared?.size ?? null,
      correctedSize: corrected?.size ?? null,
      reportFp: reportFp(report),
      error: original ? null : "O arquivo original não estava no servidor; abrimos o áudio preparado.",
    },
  };
  await saveVoiceCheckProject(row);
  return row;
}

/** Apaga no servidor (ignora se já não existir lá). */
export async function deleteRemoteDiagnosis(id: string): Promise<void> {
  try {
    await voicecheckDiagnosesApi.remove(id);
  } catch (e) {
    if (errorStatus(e) !== 404) throw e;
  }
}

/** Renomeia no servidor sem mexer no resto. */
export async function renameRemoteDiagnosis(id: string, title: string): Promise<void> {
  await voicecheckDiagnosesApi.upsert(id, { title: title.trim().slice(0, 120) });
}
