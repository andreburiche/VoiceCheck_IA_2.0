"use client";

import { ArrowRight, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { LiveBadge } from "@/components/hud";
import { VoiceCheckEnhance } from "@/components/voicecheck/voicecheck-enhance";
import { VoiceCheckIsolation } from "@/components/voicecheck/voicecheck-isolation";
import { VoiceCheckVoiceMix } from "@/components/voicecheck/voicecheck-voice-mix";
import { VoiceCheckEvolution } from "@/components/voicecheck/voicecheck-evolution";
import { VoiceCheckHistory } from "@/components/voicecheck/voicecheck-history";
import { VoiceCheckImport } from "@/components/voicecheck/voicecheck-import";
import { VoiceCheckPerformance } from "@/components/voicecheck/voicecheck-performance";
import { VoiceCheckPlayer } from "@/components/voicecheck/voicecheck-player";
import { VoiceCheckPreparePanel } from "@/components/voicecheck/voicecheck-prepare-panel";
import {
  VOICECHECK_STEP_ORDER,
  VoiceCheckStepper,
} from "@/components/voicecheck/voicecheck-stepper";
import { VoiceCheckReferenceEditor } from "@/components/voicecheck/voicecheck-reference-editor";
import {
  VoiceCheckReferencePanel,
  type RefMode,
  type ScoreFormat,
} from "@/components/voicecheck/voicecheck-reference-panel";
import { VoiceCheckReportExport } from "@/components/voicecheck/voicecheck-report-export";
import { VoiceCheckResultsPanel } from "@/components/voicecheck/voicecheck-results-panel";
import { VoiceCheckVoiceTraits } from "@/components/voicecheck/voicecheck-voice-traits";
import { Button } from "@/components/ui/button";
import { authApi, voicecheckApi, voicecheckDiagnosesApi } from "@/lib/api";
import {
  downloadBlob,
  estimateNotesFromBuffer,
  notesToMidiBlob,
  type MidiNoteEvent,
} from "@/lib/midi-export";
import {
  analyzePreparedWavBlob,
  type VoiceCheckEvent,
  type VoiceCheckF0Report,
} from "@/lib/voicecheck-f0-analysis";
import { stashPendingLabMidi } from "@/lib/voicecheck-lab-bridge";
import { prepareAudioInBrowser } from "@/lib/voicecheck-prepare-client";
import {
  deleteVoiceCheckReference,
  getVoiceCheckReference,
  listVoiceCheckReferences,
  referenceToMidiFile,
  saveVoiceCheckReference,
} from "@/lib/voicecheck-references";
import { findAnalysisSnapshotByProject } from "@/lib/voicecheck-devolutiva-store";
import {
  deleteRemoteDiagnosis,
  mergeDiagnosisLists,
  needsPush,
  pullDiagnosis,
  pushDiagnosis,
  renameRemoteDiagnosis,
} from "@/lib/voicecheck-sync";
import {
  createVoiceCheckId,
  deleteVoiceCheckProject,
  getVoiceCheckProject,
  listVoiceCheckProjects,
  renameVoiceCheckProject,
  saveVoiceCheckProject,
  summarizeReport,
  type VoiceCheckAssetMeta,
  type VoiceCheckAutotuneInfo,
  type VoiceCheckProbeLocal,
  type VoiceCheckProjectListItem,
  type VoiceCheckStep,
} from "@/lib/voicecheck-store";
import { cn } from "@/lib/utils";
import type { VoiceMixState } from "@/lib/voice-mix";
import { useRouter } from "next/navigation";
import { friendlyError } from "@/lib/errors";

/**
 * VoiceCheck IA — Fases 1–2: importação + preparação (ffprobe/FFmpeg).
 * Análises F0 entram na Fase 3+; painéis posteriores permanecem honestos.
 */
export function VoiceCheckWorkspace() {
  const router = useRouter();
  const [step, setStep] = useState<VoiceCheckStep>("importar");
  const [maxReached, setMaxReached] = useState(0);
  const [asset, setAsset] = useState<VoiceCheckAssetMeta | null>(null);
  const [fileBlob, setFileBlob] = useState<Blob | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [preparedBlob, setPreparedBlob] = useState<Blob | null>(null);
  const [preparedUrl, setPreparedUrl] = useState<string | null>(null);
  const [probe, setProbe] = useState<VoiceCheckProbeLocal | null>(null);
  const [prepareJobId, setPrepareJobId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [f0Report, setF0Report] = useState<VoiceCheckF0Report | null>(null);
  const [correctedBlob, setCorrectedBlob] = useState<Blob | null>(null);
  /** WAV preparado com instrumentos; o preparedBlob passa a ser só a voz. */
  const [mixBlob, setMixBlob] = useState<Blob | null>(null);
  const [voiceMix, setVoiceMix] = useState<VoiceMixState | null>(null);
  const [voiceIsolated, setVoiceIsolated] = useState(false);
  const [useMixAnyway, setUseMixAnyway] = useState(false);
  const [analyzeAfterIsolation, setAnalyzeAfterIsolation] = useState(false);
  const [autotuneInfo, setAutotuneInfo] = useState<VoiceCheckAutotuneInfo | null>(null);
  const [f0Analyzing, setF0Analyzing] = useState(false);
  const [f0Error, setF0Error] = useState<string | null>(null);
  const [refMode, setRefMode] = useState<RefMode>("authorial");
  const [scoreFormat, setScoreFormat] = useState<ScoreFormat>("midi");
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refParts, setRefParts] = useState<
    Array<{ index: number; name: string; note_count: number; id?: string }>
  >([]);
  const [partIndex, setPartIndex] = useState<number | null>(null);
  const [acceptTransposition, setAcceptTransposition] = useState(false);
  const [tolCents, setTolCents] = useState(50);
  const [refComparing, setRefComparing] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);
  const [referenceQuality, setReferenceQuality] = useState<string | null>(null);
  const [creatingRef, setCreatingRef] = useState(false);
  const [draftNotes, setDraftNotes] = useState<MidiNoteEvent[] | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [savingRef, setSavingRef] = useState(false);
  const [savedRefs, setSavedRefs] = useState<
    Array<{ id: string; title: string; noteCount: number; updatedAt: string }>
  >([]);
  const [refEvents, setRefEvents] = useState<
    Array<{
      id: string;
      category: string;
      start_seconds: number;
      end_seconds: number;
      expected_note?: string | null;
      observed_note?: string | null;
      deviation?: number | null;
      unit?: string | null;
      confidence?: number | null;
      description: string;
      recommendation_key?: string;
    }>
  >([]);
  const [refRecs, setRefRecs] = useState<
    Array<{ key: string; title: string; text: string; disclaimer?: string }>
  >([]);
  const [alignmentSummary, setAlignmentSummary] = useState<string | null>(null);
  const [seekSec, setSeekSec] = useState<number | null>(null);
  const [playUntilSec, setPlayUntilSec] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<{ start: number; end: number } | null>(null);
  const [analysisSource, setAnalysisSource] = useState<"python" | "browser_fallback" | null>(
    null,
  );
  const [projectId, setProjectId] = useState<string | null>(null);
  const [savedList, setSavedList] = useState<VoiceCheckProjectListItem[]>([]);
  const [projectTitle, setProjectTitle] = useState<string | null>(null);
  const [projectCreatedAt, setProjectCreatedAt] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(() => new Set());
  /** Abrir um diagnóstico não conta como edição: pula o próximo salvamento automático. */
  const skipNextSave = useRef(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [studentName, setStudentName] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState<string | null>(null);

  /** Lista deste navegador + registro da conta no servidor (null = API fora). */
  const refreshSaved = useCallback(async () => {
    const [local, remote] = await Promise.all([
      listVoiceCheckProjects(),
      voicecheckDiagnosesApi
        .list()
        .then((r) => r.items)
        .catch(() => null),
    ]);
    setServerOnline(remote !== null);
    const merged = mergeDiagnosisLists(local, remote);
    setSavedList(merged);
    return { merged, online: remote !== null };
  }, []);

  /** Envia para o servidor sem travar a tela. */
  const pushInBackground = useCallback(
    async (id: string) => {
      setSyncingIds((prev) => new Set(prev).add(id));
      try {
        await pushDiagnosis(id);
      } finally {
        setSyncingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        await refreshSaved();
      }
    },
    [refreshSaved],
  );

  const refreshRefs = useCallback(async () => {
    setSavedRefs(await listVoiceCheckReferences());
  }, []);

  useEffect(() => {
    void refreshRefs();
    // Ao abrir a página: envia o que ficou só neste navegador (ou mudou offline).
    void (async () => {
      const { merged, online } = await refreshSaved();
      if (!online) return;
      for (const item of merged) {
        if (item.location === "server") continue;
        if (needsPush(item, item.location === "both")) await pushInBackground(item.id);
      }
    })();
  }, [refreshSaved, refreshRefs, pushInBackground]);

  useEffect(() => {
    void authApi
      .me()
      .then((u) => {
        const display = u.name || u.email || null;
        const role = (u.role || "").toLowerCase();
        // Professor/admin: sessão = professor; aluno/usuário comum: sessão = aluno
        if (role === "teacher" || role === "professor" || role === "admin") {
          setTeacherName(display);
          setStudentName(null);
        } else {
          setStudentName(display);
          setTeacherName(null);
        }
      })
      .catch(() => {
        setStudentName(null);
        setTeacherName(null);
      });
  }, []);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (preparedUrl) URL.revokeObjectURL(preparedUrl);
    };
  }, [objectUrl, preparedUrl]);

  function clearPrepared() {
    if (preparedUrl) URL.revokeObjectURL(preparedUrl);
    setPreparedUrl(null);
    setPreparedBlob(null);
    setProbe(null);
    setPrepareJobId(null);
    setPrepareError(null);
    setF0Report(null);
    setF0Error(null);
    setAnalysisSource(null);
    // A versão afinada vem do WAV preparado: se ele muda, ela deixa de valer.
    setCorrectedBlob(null);
    setAutotuneInfo(null);
    setMixBlob(null);
    setVoiceIsolated(false);
    setUseMixAnyway(false);
    setAnalyzeAfterIsolation(false);
  }

  function playSegment(start: number, end: number) {
    setHighlight({ start, end });
    setPlayUntilSec(end);
    setSeekSec(start);
  }

  async function runF0Analysis() {
    if (!preparedBlob) {
      setF0Error("Prepare o WAV antes de analisar");
      return;
    }
    setF0Analyzing(true);
    setF0Error(null);
    try {
      try {
        const remote = (await voicecheckApi.analyze(preparedBlob)) as VoiceCheckF0Report;
        if (!remote?.pitch_track) {
          throw new Error("Resposta de análise inválida (sem pitch_track)");
        }
        // Aceita v4.5 técnico (sem referência) — no_reference pode ser true
        if (remote.no_reference === false && remote.mode === "with_reference") {
          throw new Error("Use Comparar com referência para modo com partitura/MIDI");
        }
        setF0Report(remote);
        setAnalysisSource("python");
        const nEv = remote.events?.length ?? 0;
        const nPos = remote.positive_findings?.length ?? 0;
        setMsg(
          `Análise concluída: ${nEv} ${nEv === 1 ? "ocorrência" : "ocorrências"} e ${nPos} ${nPos === 1 ? "ponto positivo" : "pontos positivos"}.`,
        );
      } catch (apiErr) {
        const local = await analyzePreparedWavBlob(preparedBlob);
        setF0Report(local);
        setAnalysisSource("browser_fallback");
        setF0Error(
          "Não foi possível usar a análise completa agora. Fizemos uma análise simplificada no navegador: mostra a afinação, mas não lista as ocorrências técnicas. Tente analisar de novo em instantes.",
        );
        setMsg(
          "Análise simplificada concluída (só afinação).",
        );
      }
      setMaxReached((m) => Math.max(m, 4));
    } catch (e) {
      setF0Report(null);
      setAnalysisSource(null);
      setF0Error(friendlyError(e, "Não foi possível analisar a voz. Tente de novo."));
    } finally {
      setF0Analyzing(false);
    }
  }

  async function listRefParts() {
    if (!refFile || refMode !== "score") return;
    setRefError(null);
    try {
      if (scoreFormat === "midi") {
        const res = await voicecheckApi.midiTracks(refFile);
        setRefParts(res.tracks ?? []);
      } else {
        const res = await voicecheckApi.musicxmlParts(refFile);
        setRefParts(res.parts ?? []);
      }
    } catch (e) {
      setRefError(friendlyError(e, "Falha ao listar partes da referência"));
    }
  }

  async function runCompareWithReference() {
    if (!preparedBlob || !refFile) {
      setRefError("Precisa do WAV preparado e de uma referência");
      return;
    }
    if (refMode !== "score" && refMode !== "artist" && refMode !== "custom") {
      setRefError("Selecione um modo com referência (partitura, artista ou personalizada)");
      return;
    }
    setRefComparing(true);
    setRefError(null);
    setReferenceQuality(null);
    try {
      const report = await voicecheckApi.analyzeWithReference({
        wav: preparedBlob,
        reference: refFile,
        trackIndex: partIndex,
        acceptTransposition,
        pitchToleranceCents: tolCents,
        referenceMode: refMode,
        isolateVocals: refMode === "artist",
      });
      const events = (report.events as typeof refEvents) ?? [];
      const recs = (report.recommendations as typeof refRecs) ?? [];
      setRefEvents(events);
      setRefRecs(recs);
      const quality =
        typeof report.reference_quality === "string" ? report.reference_quality : null;
      setReferenceQuality(quality);
      const al = report.alignment as {
        status?: string;
        confidence?: number | null;
        time_offset_seconds?: number;
        transposition_semitones_suggested?: number;
        matched_notes?: number;
        reference_notes?: number;
      } | null;
      const transp =
        (report.detected_transposition as number | null | undefined) ??
        al?.transposition_semitones_suggested;
      const qualityNote = quality ? ` · qualidade ${quality}` : "";
      setAlignmentSummary(
        al
          ? `Alinhamento ${al.status} · offset ${al.time_offset_seconds ?? 0}s · pares ${al.matched_notes ?? 0}/${al.reference_notes ?? 0}` +
              (transp
                ? ` · transp. sugerida ${Number(transp) > 0 ? "+" : ""}${transp} st`
                : "") +
              (al.confidence != null ? ` · confiança ${Math.round(al.confidence * 100)}%` : "") +
              qualityNote
          : null,
      );
      if (report.pitch_track) {
        setF0Report(report as unknown as VoiceCheckF0Report);
      }
      const within = (
        report.comparison as { pitch?: { within_tolerance_percent?: number } } | undefined
      )?.pitch?.within_tolerance_percent;
      const refLabel =
        refMode === "artist"
          ? "música original"
          : refMode === "custom"
            ? "ref. personalizada"
            : scoreFormat === "musicxml"
              ? "MusicXML"
              : "MIDI";
      setMsg(`Comparação ${refLabel} · ${within ?? "—"}% notas na tolerância`);
      setAnalysisSource("python");
      setMaxReached((m) => Math.max(m, 3));
    } catch (e) {
      setRefError(friendlyError(e, "Falha na comparação"));
    } finally {
      setRefComparing(false);
    }
  }

  function applyMidiNotesAsReference(notes: MidiNoteEvent[], title: string) {
    const midiBlob = notesToMidiBlob(notes);
    const safe = title.replace(/[^\w\-]+/g, "_").slice(0, 48) || "referencia";
    const file = new File([midiBlob], `${safe}.mid`, { type: "audio/midi" });
    setRefMode("score");
    setScoreFormat("midi");
    setRefFile(file);
    setRefParts([]);
    setPartIndex(null);
  }

  async function createReferenceFromRecording() {
    if (!preparedBlob) {
      setRefError("Prepare o WAV antes de criar uma referência");
      return;
    }
    setCreatingRef(true);
    setRefError(null);
    try {
      const ctx = new AudioContext();
      const ab = await preparedBlob.arrayBuffer();
      const buffer = await ctx.decodeAudioData(ab.slice(0));
      await ctx.close();
      const notes = estimateNotesFromBuffer(buffer);
      if (notes.length < 2) {
        throw new Error(
          "Poucas notas detectadas para gerar MIDI. Grave um trecho mais limpo ou monofônico.",
        );
      }
      const nameBase = (asset?.name || "voicecheck").replace(/\.[^.]+$/, "");
      setDraftNotes(notes);
      setDraftTitle(`${nameBase} — referência`);
      setMsg(`Melodia preliminar: ${notes.length} notas. Corrija e salve antes de comparar.`);
      setMaxReached((m) => Math.max(m, 3));
    } catch (e) {
      setRefError(friendlyError(e, "Falha ao criar referência"));
    } finally {
      setCreatingRef(false);
    }
  }

  async function persistDraftReference() {
    if (!draftNotes?.length) return;
    setSavingRef(true);
    setRefError(null);
    try {
      const saved = await saveVoiceCheckReference({
        title: draftTitle,
        notes: draftNotes,
        sourceProjectId: projectId,
      });
      applyMidiNotesAsReference(saved.notes, saved.title);
      downloadBlob(saved.blob, `${saved.title.replace(/[^\w\-]+/g, "_").slice(0, 48)}.mid`);
      setDraftNotes(null);
      await refreshRefs();
      setMsg(`Referência salva: ${saved.title} (${saved.noteCount} notas)`);
    } catch (e) {
      setRefError(friendlyError(e, "Falha ao salvar referência"));
    } finally {
      setSavingRef(false);
    }
  }

  function useDraftReferenceNow() {
    if (!draftNotes?.length) return;
    applyMidiNotesAsReference(draftNotes, draftTitle || "referencia");
    setDraftNotes(null);
    setMsg("Referência aplicada nesta análise (ainda não salva no histórico).");
  }

  function openDraftInLab() {
    if (!draftNotes?.length) return;
    stashPendingLabMidi({ title: draftTitle || "Referência VoiceCheck", notes: draftNotes });
    setMsg("Melodia enviada ao Laboratório — escolha um projeto para abrir o editor.");
    router.push("/projects");
  }

  async function loadSavedReference(id: string) {
    setRefError(null);
    try {
      const ref = await getVoiceCheckReference(id);
      if (!ref) throw new Error("Referência não encontrada");
      setRefMode("score");
      setScoreFormat("midi");
      setRefFile(referenceToMidiFile(ref));
      setRefParts([]);
      setPartIndex(null);
      setMsg(`Referência carregada: ${ref.title}`);
    } catch (e) {
      setRefError(friendlyError(e, "Falha ao carregar referência"));
    }
  }

  async function removeSavedReference(id: string) {
    await deleteVoiceCheckReference(id);
    await refreshRefs();
  }

  function clearImport() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(null);
    setAsset(null);
    setFileBlob(null);
    setProjectId(null);
    setProjectTitle(null);
    setProjectCreatedAt(null);
    setSavedAt(null);
    setVoiceMix(null);
    clearPrepared();
    setStep("importar");
    setMaxReached(0);
    setMsg(null);
    setError(null);
  }

  function onFile(file: File, meta: VoiceCheckAssetMeta) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    clearPrepared();
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    setFileBlob(file);
    setAsset(meta);
    setProjectId(createVoiceCheckId());
    setProjectTitle(meta.name.replace(/\.[^.]+$/, "") || "Diagnóstico");
    setProjectCreatedAt(new Date().toISOString());
    setSavedAt(null);
    setError(null);
    setMsg(`Arquivo pronto: ${meta.name}`);
    setMaxReached((m) => Math.max(m, 1));
  }

  function onDuration(sec: number) {
    setAsset((prev) => (prev ? { ...prev, durationSec: sec } : prev));
  }

  function go(next: VoiceCheckStep) {
    const idx = VOICECHECK_STEP_ORDER.indexOf(next);
    setStep(next);
    setMaxReached((m) => Math.max(m, idx));
  }

  async function runPrepare() {
    if (!fileBlob || !asset) {
      setPrepareError("Importe um arquivo antes");
      return;
    }
    setPreparing(true);
    setPrepareError(null);
    setError(null);
    try {
      const file =
        fileBlob instanceof File
          ? fileBlob
          : new File([fileBlob], asset.name, { type: asset.mimeType });

      try {
        const result = await voicecheckApi.prepare(file);
        const wav = await voicecheckApi.fetchPreparedWav(result.job_id);
        if (preparedUrl) URL.revokeObjectURL(preparedUrl);
        const url = URL.createObjectURL(wav);
        setPreparedBlob(wav);
        setPreparedUrl(url);
        // A separação da voz (IA) começa sozinha a partir daqui.
        setMixBlob(wav);
        setVoiceIsolated(false);
        setUseMixAnyway(false);
        setPrepareJobId(result.job_id);
        setProbe({
          durationMs: result.probe.duration_ms ?? result.wav.duration_ms ?? null,
          sampleRate: result.probe.sample_rate ?? result.wav.sample_rate ?? null,
          channels: result.probe.channels ?? result.wav.channels ?? null,
          hasAudio: result.probe.has_audio,
          hasVideo: result.probe.has_video,
          formatName: result.probe.format_name,
          audioCodec: result.probe.audio_codec,
          videoCodec: result.probe.video_codec,
          source: "ffprobe",
        });
        setMsg(result.message);
        setMaxReached((m) => Math.max(m, 2));
        // Limpa job no servidor após baixar (áudio fica no IndexedDB do client)
        void voicecheckApi.deleteJob(result.job_id).catch(() => undefined);
      } catch (apiErr) {
        if (asset.kind === "video") {
          throw apiErr instanceof Error
            ? apiErr
            : new Error("Não foi possível extrair o áudio deste vídeo agora. Tente de novo em instantes ou envie só o áudio.");
        }
        // Fallback áudio no browser
        const local = await prepareAudioInBrowser(fileBlob);
        if (preparedUrl) URL.revokeObjectURL(preparedUrl);
        const url = URL.createObjectURL(local.wav);
        setPreparedBlob(local.wav);
        setPreparedUrl(url);
        setMixBlob(local.wav);
        setVoiceIsolated(false);
        setUseMixAnyway(false);
        setPrepareJobId(null);
        setProbe(local.probe);
        setMsg(
          "Áudio preparado no navegador. A voz não foi isolada, então a análise pode captar instrumentos.",
        );
        setMaxReached((m) => Math.max(m, 2));
      }
    } catch (e) {
      setPrepareError(friendlyError(e, "Falha na preparação"));
    } finally {
      setPreparing(false);
    }
  }

  /** Grava o diagnóstico aberto no IndexedDB (áudio, WAV preparado e relatório). */
  const saveCurrent = useCallback(async () => {
    if (!asset || !fileBlob || !projectId) return false;
    const now = new Date().toISOString();
    await saveVoiceCheckProject({
      id: projectId,
      title: projectTitle || asset.name.replace(/\.[^.]+$/, "") || "Diagnóstico",
      createdAt: projectCreatedAt ?? now,
      updatedAt: now,
      step,
      maxReached,
      asset,
      blob: fileBlob,
      preparedWav: preparedBlob ?? undefined,
      prepareJobId,
      probe: probe ? { ...probe, voiceIsolated } : probe,
      mixWav: voiceIsolated ? (mixBlob ?? undefined) : undefined,
      f0Report,
      analysisSource,
      summary: summarizeReport(f0Report),
      correctedWav: correctedBlob ?? undefined,
      autotune: correctedBlob ? autotuneInfo : null,
      voiceMix,
    });
    setSavedAt(
      new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    );
    void pushInBackground(projectId);
    return true;
  }, [
    asset,
    fileBlob,
    projectId,
    projectTitle,
    projectCreatedAt,
    step,
    maxReached,
    preparedBlob,
    prepareJobId,
    probe,
    f0Report,
    analysisSource,
    correctedBlob,
    autotuneInfo,
    voiceIsolated,
    mixBlob,
    voiceMix,
    pushInBackground,
  ]);

  // Salvamento automático: cada mudança relevante atualiza o registro.
  useEffect(() => {
    if (!asset || !fileBlob || !projectId || openingId) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void saveCurrent().catch(() =>
        setError("Não foi possível salvar o diagnóstico neste navegador (espaço cheio?)."),
      );
    }, 600);
    return () => window.clearTimeout(t);
  }, [asset, fileBlob, projectId, openingId, saveCurrent]);

  async function persistLocal() {
    if (!asset || !fileBlob || !projectId) {
      setError("Importe um arquivo antes de salvar");
      return;
    }
    try {
      await saveCurrent();
      setMsg("Diagnóstico salvo. O envio para a sua conta acontece em segundo plano.");
    } catch (e) {
      setError(friendlyError(e, "Falha ao salvar"));
    }
  }

  async function openProject(id: string) {
    setOpeningId(id);
    setError(null);
    try {
      const item = savedList.find((p) => p.id === id);
      let row = await getVoiceCheckProject(id);
      if ((!row?.blob || item?.stale) && item?.location !== "local") {
        // Salvo em outro computador (ou mais novo lá): baixa a cópia do servidor.
        setMsg("Baixando o diagnóstico da sua conta…");
        try {
          row = await pullDiagnosis(id);
          void refreshSaved();
        } catch (pullErr) {
          if (!row?.blob) throw pullErr;
        }
      }
      if (!row || !row.blob) {
        throw new Error("Este diagnóstico não tem mais o áudio salvo. Exclua e importe de novo.");
      }
      let report = row.f0Report ?? null;
      if (!report) {
        // Registros antigos: o relatório ficava só no histórico de análises.
        report = (await findAnalysisSnapshotByProject(id).catch(() => null))?.report ?? null;
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (preparedUrl) URL.revokeObjectURL(preparedUrl);
      setObjectUrl(URL.createObjectURL(row.blob));
      setFileBlob(row.blob);
      setAsset(row.asset);
      setProjectId(row.id);
      setProjectTitle(row.title);
      setProjectCreatedAt(row.createdAt);
      if (row.preparedWav) {
        setPreparedBlob(row.preparedWav);
        setPreparedUrl(URL.createObjectURL(row.preparedWav));
      } else {
        setPreparedBlob(null);
        setPreparedUrl(null);
      }
      setProbe(row.probe ?? null);
      setPrepareJobId(row.prepareJobId ?? null);
      setPrepareError(null);
      setF0Report(report);
      setF0Error(null);
      setAnalysisSource(row.analysisSource ?? null);
      setCorrectedBlob(row.correctedWav ?? null);
      setVoiceMix(row.voiceMix ?? null);
      const isolatedSaved = Boolean(row.probe?.voiceIsolated);
      setVoiceIsolated(isolatedSaved);
      setMixBlob(isolatedSaved ? (row.mixWav ?? null) : (row.preparedWav ?? null));
      setUseMixAnyway(!isolatedSaved && Boolean(report));
      setAnalyzeAfterIsolation(false);
      setAutotuneInfo(row.correctedWav ? (row.autotune ?? null) : null);
      setHighlight(null);
      setSeekSec(null);
      setPlayUntilSec(null);

      const reached = Math.max(
        row.maxReached ?? 0,
        VOICECHECK_STEP_ORDER.indexOf(row.step),
        report ? 4 : row.preparedWav ? 2 : 1,
      );
      setMaxReached(reached);
      const target: VoiceCheckStep = report
        ? "resultados"
        : row.preparedWav
          ? "analisar"
          : row.step;
      setStep(target);
      setSavedAt(null);
      skipNextSave.current = true;
      setMsg(`Diagnóstico “${row.title}” aberto.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(friendlyError(e, "Não foi possível abrir o diagnóstico"));
    } finally {
      setOpeningId(null);
    }
  }

  /** Voz isolada pela IA: passa a ser o áudio que a análise mede. */
  const onVoiceIsolated = useCallback(
    (vocals: Blob) => {
      if (preparedUrl) URL.revokeObjectURL(preparedUrl);
      setPreparedBlob(vocals);
      setPreparedUrl(URL.createObjectURL(vocals));
      setVoiceIsolated(true);
      setUseMixAnyway(false);
      setProbe((p) => (p ? { ...p, voiceIsolated: true } : p));
      // Resultados anteriores mediam a mistura: deixam de valer.
      setF0Report(null);
      setAnalysisSource(null);
      setCorrectedBlob(null);
      setAutotuneInfo(null);
      setMsg("Voz isolada com IA — a análise vai medir só a sua voz.");
    },
    [preparedUrl],
  );

  // "Isolar e analisar de novo": quando a voz fica pronta, roda a análise sozinha.
  useEffect(() => {
    if (!analyzeAfterIsolation || !voiceIsolated || !preparedBlob) return;
    setAnalyzeAfterIsolation(false);
    go("analisar");
    void runF0Analysis().then(() => go("resultados"));
  }, [analyzeAfterIsolation, voiceIsolated, preparedBlob]); // eslint-disable-line react-hooks/exhaustive-deps

  const voiceReady = voiceIsolated || useMixAnyway;
  const isolationBlock = (
    <VoiceCheckIsolation
      projectId={projectId}
      mixWav={mixBlob ?? (voiceIsolated ? null : preparedBlob)}
      isolated={voiceIsolated}
      usingMix={useMixAnyway}
      autoStart={!useMixAnyway}
      durationSec={asset?.durationSec ?? (probe?.durationMs != null ? probe.durationMs / 1000 : null)}
      onIsolated={onVoiceIsolated}
      onUseMix={() => setUseMixAnyway(true)}
    />
  );

  async function renameProject(id: string, title: string) {
    const item = savedList.find((p) => p.id === id);
    if (item?.location === "server") {
      await renameRemoteDiagnosis(id, title);
    } else {
      await renameVoiceCheckProject(id, title);
      // O aberto é reenviado pelo salvamento automático; os demais, aqui.
      if (id !== projectId) void pushInBackground(id);
    }
    if (id === projectId) setProjectTitle(title.trim());
    await refreshSaved();
  }

  async function removeProject(id: string) {
    const item = savedList.find((p) => p.id === id);
    try {
      if (item?.location !== "local") await deleteRemoteDiagnosis(id);
      await deleteVoiceCheckProject(id);
      if (id === projectId) clearImport();
      setMsg("Diagnóstico excluído.");
    } catch (e) {
      setError(
        e instanceof Error
          ? `Não foi possível excluir da sua conta: ${e.message}`
          : "Não foi possível excluir da sua conta",
      );
    } finally {
      await refreshSaved();
    }
  }

  return (
    <div className="space-y-6">
      <header className="panel-glass relative overflow-hidden rounded-2xl p-5 md:p-6 2xl:flex 2xl:items-center 2xl:gap-8">
        <div className="relative flex flex-wrap items-start justify-between gap-4 2xl:w-[26rem] 2xl:shrink-0">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">
              Diagnóstico vocal
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-muted">
              Importe áudio ou vídeo cantado e veja cada ocorrência com o momento exato. É uma análise de
              afinação e técnica, não um diagnóstico médico.
            </p>
          </div>
          {preparing || f0Analyzing || refComparing ? (
            <LiveBadge
              label={preparing ? "Extraindo áudio" : f0Analyzing ? "Analisando voz" : "Comparando"}
            />
          ) : (
            <LiveBadge label={f0Report ? "Análise pronta" : "Pronto"} active={false} />
          )}
        </div>
        <dl className="relative mt-5 grid min-w-0 flex-1 grid-cols-2 gap-px overflow-hidden rounded-xl bg-ink/10 md:grid-cols-4 2xl:mt-0">
          <HeaderReadout label="Arquivo" value={asset?.name ?? "—"} />
          <HeaderReadout
            label="Duração"
            value={
              asset?.durationSec != null
                ? `${Math.floor(asset.durationSec / 60)}:${String(Math.floor(asset.durationSec % 60)).padStart(2, "0")}`
                : "—"
            }
          />
          <HeaderReadout
            label="Áudio analisado"
            value={!preparedBlob ? "pendente" : voiceIsolated ? "Só a voz (IA)" : "Com instrumentos"}
            alert={Boolean(preparedBlob) && !voiceIsolated}
          />
          <HeaderReadout
            label="Ocorrências"
            value={f0Report ? String(f0Report.events?.length ?? 0) : "—"}
            alert={(f0Report?.events?.length ?? 0) > 0}
          />
        </dl>
      </header>

      <VoiceCheckHistory
        items={savedList.map((p) => (syncingIds.has(p.id) ? { ...p, syncing: true } : p))}
        serverOnline={serverOnline}
        activeId={projectId}
        openingId={openingId}
        savedAt={savedAt}
        onOpen={(id) => void openProject(id)}
        onRename={renameProject}
        onDelete={removeProject}
        onNew={clearImport}
      />

      {/* xl: etapas | conteúdo (monitor embaixo) · 2xl: etapas | conteúdo | monitor */}
      <div className="grid items-start gap-4 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <VoiceCheckStepper
          step={step}
          maxReached={maxReached}
          onStepChange={(s) => {
            if (VOICECHECK_STEP_ORDER.indexOf(s) <= maxReached) setStep(s);
          }}
        />

        <div className="min-w-0 space-y-4">
          {step === "importar" ? (
            <section className="panel-glass space-y-4 rounded-2xl p-4 md:p-5" aria-labelledby="vc-import-title">
              <div>
                <h2 id="vc-import-title" className="font-display text-xl font-semibold text-ink">
                  Importar
                </h2>
              </div>
              <VoiceCheckImport
                asset={asset}
                objectUrl={objectUrl}
                onFile={onFile}
                onClear={clearImport}
              />
              <VoiceCheckPlayer
                objectUrl={objectUrl}
                asset={asset}
                onDuration={onDuration}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={!asset}
                  onClick={() => go("preparar")}
                >
                  Continuar para preparar
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!asset}
                  onClick={() => void persistLocal()}
                >
                  <Save className="h-4 w-4" aria-hidden />
                  Salvar agora
                </Button>
              </div>
            </section>
          ) : null}

          {step === "preparar" ? (
            <div className="space-y-4">
              <VoiceCheckPreparePanel
                asset={asset}
                originalUrl={objectUrl}
                preparedUrl={preparedUrl}
                probe={probe}
                preparing={preparing}
                error={prepareError}
                onPrepare={() => void runPrepare()}
                onContinue={() => go("analisar")}
                onBack={() => setStep("importar")}
                isolation={preparedBlob ? isolationBlock : null}
                canContinue={voiceReady}
                preparedLabel={voiceIsolated ? "Voz isolada (IA)" : "WAV preparado (com instrumentos)"}
              />
            </div>
          ) : null}

          {step === "analisar" ? (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-xl font-semibold text-ink">Analisar sua voz</h2>
                <p className="mt-1 max-w-2xl text-sm text-ink-muted">
                  Escolha com o que comparar (ou use “Música autoral” para analisar só a sua voz) e
                  depois rode a análise. Quando terminar, siga para os resultados.
                </p>
              </div>
              {preparedBlob && !voiceIsolated ? isolationBlock : null}
              <VoiceCheckReferencePanel
                mode={refMode}
                onModeChange={(m) => {
                  setRefMode(m);
                  setRefFile(null);
                  setRefParts([]);
                  setPartIndex(null);
                  setRefEvents([]);
                  setRefRecs([]);
                  setAlignmentSummary(null);
                  setReferenceQuality(null);
                  setRefError(null);
                }}
                scoreFormat={scoreFormat}
                onScoreFormatChange={(f) => {
                  setScoreFormat(f);
                  setRefFile(null);
                  setRefParts([]);
                  setPartIndex(null);
                }}
                refFile={refFile}
                onRefFile={(f) => {
                  setRefFile(f);
                  setRefParts([]);
                  setPartIndex(null);
                  setRefEvents([]);
                  setRefRecs([]);
                  setAlignmentSummary(null);
                  setReferenceQuality(null);
                }}
                parts={refParts}
                partIndex={partIndex}
                onPartIndex={setPartIndex}
                acceptTransposition={acceptTransposition}
                onAcceptTransposition={setAcceptTransposition}
                toleranceCents={tolCents}
                onToleranceCents={setTolCents}
                canCompare={Boolean(preparedBlob) && voiceReady}
                comparing={refComparing}
                preparingArtist={refComparing && refMode === "artist"}
                error={refError}
                onCompare={() => void runCompareWithReference()}
                onListParts={() => void listRefParts()}
                events={refEvents}
                recommendations={refRecs}
                alignmentSummary={alignmentSummary}
                referenceQuality={referenceQuality}
                onSeek={(sec) => playSegment(sec, sec + 1.2)}
                canCreateReference={Boolean(preparedBlob) && voiceReady}
                creatingReference={creatingRef}
                onCreateReference={() => void createReferenceFromRecording()}
                savedReferences={savedRefs}
                onLoadSavedReference={(id) => void loadSavedReference(id)}
                onDeleteSavedReference={(id) => void removeSavedReference(id)}
              />
              {draftNotes ? (
                <VoiceCheckReferenceEditor
                  notes={draftNotes}
                  title={draftTitle}
                  onTitleChange={setDraftTitle}
                  onNotesChange={setDraftNotes}
                  onSave={() => void persistDraftReference()}
                  onUse={useDraftReferenceNow}
                  onOpenLab={openDraftInLab}
                  onCancel={() => setDraftNotes(null)}
                  saving={savingRef}
                />
              ) : null}
              <VoiceCheckVoiceTraits
                report={f0Report}
                analyzing={f0Analyzing}
                error={f0Error}
                canAnalyze={Boolean(preparedBlob) && voiceReady && refMode === "authorial"}
                onAnalyze={() => void runF0Analysis()}
              />
              {preparedUrl ? (
                <details className="rounded-2xl border border-line/70 bg-canvas-raised/50">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink marker:text-ink-muted hover:text-accent">
                    Ouvir o áudio que será analisado
                  </summary>
                  <div className="border-t border-line/70 p-4">
                    <VoiceCheckPlayer
                      objectUrl={preparedUrl}
                      asset={{
                        name: asset?.name ?? "Áudio preparado",
                        mimeType: "audio/wav",
                        sizeBytes: preparedBlob?.size ?? 0,
                        durationSec: null,
                        kind: "audio",
                        ext: "wav",
                      }}
                      seekSec={seekSec}
                      playUntilSec={playUntilSec}
                      highlight={highlight}
                    />
                  </div>
                </details>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setStep("preparar")}>
                  Voltar
                </Button>
                <Button
                  type="button"
                  disabled={!f0Report && refEvents.length === 0}
                  onClick={() => go("resultados")}
                >
                  Ver resultados
                </Button>
              </div>
              {!preparedBlob ? (
                <p className="text-xs text-signal-warn">Volte a Preparar e extraia o áudio primeiro.</p>
              ) : null}
            </div>
          ) : null}

          {step === "resultados" ? (
            <PhasePlaceholder
              title="Resultados"
              body="Resumo, linha do tempo e cada ocorrência medida na sua voz. Clique numa ocorrência para ouvir o trecho."
              nextLabel="Plano de melhoria"
              onNext={() => go("melhorar")}
              onBack={() => setStep("analisar")}
              canNext={Boolean(f0Report)}
              nextDisabledHint={f0Report ? undefined : "Execute a análise antes"}
            >
              {f0Report && !voiceIsolated ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-flare/10 px-4 py-3 ring-1 ring-inset ring-flare/25">
                  <p className="min-w-0 flex-1 text-sm text-flare-soft">
                    Esta análise mediu a gravação inteira, com instrumentos. Isole a voz para
                    resultados mais certos.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setUseMixAnyway(false);
                      setAnalyzeAfterIsolation(true);
                      setMixBlob((m) => m ?? preparedBlob);
                      setStep("preparar");
                    }}
                  >
                    Isolar a voz e analisar de novo
                  </Button>
                </div>
              ) : null}
              {f0Report ? <VoiceCheckPerformance report={f0Report} /> : null}
              {preparedUrl ? (
                <VoiceCheckPlayer
                  objectUrl={preparedUrl}
                  asset={{
                    name: "Áudio preparado",
                    mimeType: "audio/wav",
                    sizeBytes: preparedBlob?.size ?? 0,
                    durationSec: null,
                    kind: "audio",
                    ext: "wav",
                  }}
                  seekSec={seekSec}
                  playUntilSec={playUntilSec}
                  highlight={highlight}
                />
              ) : null}
              <VoiceCheckResultsPanel
                report={f0Report}
                onPlayEvent={playSegment}
                studentName={studentName}
                teacherName={teacherName}
                assetName={asset?.name}
                projectId={projectId}
              />
              {f0Report ? (
                <VoiceCheckEvolution refreshKey={`${f0Report.analysis_version}:${f0Report.duration_seconds}:${f0Report.events?.length ?? 0}`} />
              ) : null}
              {refMode === "authorial" ? (
                <p className="text-xs text-ink-muted">
                  Modo autoral: como não há partitura de referência, não apontamos "nota errada" —
                  só características da voz e coerência melódica (experimental).
                </p>
              ) : null}
              <details className="group rounded-2xl border border-line/70 bg-canvas-raised/50">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink marker:text-ink-muted hover:text-accent">
                  Melhorar o áudio e equalizar (opcional)
                  <span className="ml-2 font-normal text-ink-muted">
                    Correção de afinação com IA, só a voz, equalização e efeitos
                  </span>
                </summary>
                <div className="space-y-4 border-t border-line/70 p-4">
                  <VoiceCheckEnhance
                    alreadyIsolated={voiceIsolated}
                    projectId={projectId}
                    preparedWav={preparedBlob}
                    correctedWav={correctedBlob}
                    info={autotuneInfo}
                    events={[...((f0Report?.events as VoiceCheckEvent[] | undefined) ?? []), ...refEvents]}
                    assetName={asset?.name}
                    durationSec={asset?.durationSec ?? f0Report?.duration_seconds ?? null}
                    onResult={(wav, info) => {
                      setCorrectedBlob(wav);
                      setAutotuneInfo(info);
                      const st = info.kind === "enhance" ? info.stats : null;
                      setMsg(
                        st
                          ? `Versão aprimorada pronta: ${st.fixed_count} de ${st.corrections.length} trechos corrigidos${st.isolated ? ", voz isolada" : ""}.`
                          : "Versão aprimorada pronta.",
                      );
                    }}
                    onDiscard={() => {
                      setCorrectedBlob(null);
                      setAutotuneInfo(null);
                      setMsg("Versão aprimorada descartada.");
                    }}
                  />
                  <VoiceCheckVoiceMix
                    voiceWav={preparedBlob}
                    enhancedWav={correctedBlob}
                    value={voiceMix}
                    assetName={asset?.name}
                    onChange={setVoiceMix}
                  />
                </div>
              </details>
            </PhasePlaceholder>
          ) : null}

          {step === "melhorar" ? (
            <PhasePlaceholder
              title="Praticar e melhorar"
              body="Exercícios ligados às ocorrências detectadas nesta gravação."
              onBack={() => setStep("resultados")}
            >
              {f0Report ? (
                <VoiceCheckReportExport
                  report={f0Report}
                  defaults={{
                    studentName,
                    assetName: asset?.name ?? "Áudio preparado",
                  }}
                />
              ) : null}
              {(f0Report?.recommendations?.length ?? 0) === 0 && refRecs.length === 0 ? (
                <HonestEmpty
                  title="Sem plano ainda"
                  hint="Analise a voz ou compare com uma referência para gerar exercícios."
                />
              ) : (
                <ul className="space-y-2">
                  {(f0Report?.recommendations ?? refRecs).map((r) => (
                    <li
                      key={r.key}
                      className="rounded-xl bg-accent/[0.05] px-4 py-3 text-sm ring-1 ring-inset ring-accent/20"
                    >
                      <p className="font-medium text-ink">{r.title}</p>
                      <p className="mt-1 text-xs text-ink-muted">{r.text}</p>
                      {typeof (r as unknown as { exercise?: unknown }).exercise === "string" ? (
                        <p className="mt-2 text-xs font-medium text-accent">
                          Exercício: {(r as unknown as { exercise: string }).exercise}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </PhasePlaceholder>
          ) : null}

          {msg ? <p className="text-sm text-accent">{msg}</p> : null}
          {error ? (
            <p role="alert" className="text-sm text-signal-err">
              {error}
            </p>
          ) : null}

        </div>

      </div>
    </div>
  );
}

function HeaderReadout({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="min-w-0 bg-canvas-raised/85 px-3 py-2.5">
      <dt className="hud-label">{label}</dt>
      <dd className={cn("text-data mt-1 truncate text-sm", alert ? "text-flare-soft" : "text-ink")} title={value}>
        {value}
      </dd>
    </div>
  );
}

function PhasePlaceholder({
  title,
  body,
  children,
  onNext,
  onBack,
  nextLabel,
  canNext,
  nextDisabledHint,
}: {
  title: string;
  body: string;
  children?: ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  canNext?: boolean;
  nextDisabledHint?: string;
}) {
  return (
    <section className="panel-glass space-y-4 rounded-2xl p-4 md:p-5">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{body}</p>
      </div>
      {children}
      <div className="flex flex-wrap gap-2">
        {onBack ? (
          <Button type="button" variant="secondary" onClick={onBack}>
            Voltar
          </Button>
        ) : null}
        {onNext ? (
          <Button type="button" disabled={canNext === false} onClick={onNext}>
            {nextLabel ?? "Continuar"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        ) : null}
      </div>
      {canNext === false && nextDisabledHint ? (
        <p className="text-xs text-ink-faint">{nextDisabledHint}</p>
      ) : null}
    </section>
  );
}

function HonestEmpty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-ink/15 px-4 py-4">
      <p className="hud-label">{title}</p>
      <p className="mt-1 text-xs text-ink-muted">{hint}</p>
    </div>
  );
}



