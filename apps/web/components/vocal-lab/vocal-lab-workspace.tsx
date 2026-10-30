"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileMusic,
  Layers,
  Music2,
  Package,
  Piano,
  Sparkles,
} from "lucide-react";

import { ScoreStaff } from "@/components/vocal-lab/score-staff";
import { VocalDrillPanel } from "@/components/vocal-lab/vocal-drill-panel";
import { VocalDspPanel } from "@/components/vocal-lab/vocal-dsp-panel";
import { VocalLiveRecorder } from "@/components/vocal-lab/vocal-live-recorder";
import { VocalNoteEditor } from "@/components/vocal-lab/vocal-note-editor";
import { VocalPartsBar } from "@/components/vocal-lab/vocal-parts-bar";
import { VocalVerifyPlayer } from "@/components/vocal-lab/vocal-verify-player";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  assetsApi,
  studioApi,
  vocalApi,
  type VocalPart,
  type VocalTranscription,
} from "@/lib/api";
import { buildZipBlob } from "@/lib/client-zip";
import {
  downloadBlob,
  estimateNotesFromBuffer,
  notesToMidiBlob,
  type MidiNoteEvent,
} from "@/lib/midi-export";
import { notesToMusicXml, partsToMusicXml } from "@/lib/musicxml-export";
import {
  midiToSolfege,
  ScoreSynth,
  type SolfegeSystem,
  type SynthInstrument,
} from "@/lib/score-synth";
import { takePendingLabMidi } from "@/lib/voicecheck-lab-bridge";
import { decodeArrayBuffer } from "@/lib/vocal-dsp";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/errors";
import { statusLabel } from "@/lib/format";
import { useConfirm } from "@/components/ui/use-confirm";

type Props = { projectId: string };

const VOICE_ROLES = [
  { value: "principal", label: "Voz principal" },
  { value: "segunda", label: "Segunda voz" },
  { value: "terceira", label: "Terceira voz" },
  { value: "quarta", label: "Quarta voz" },
  { value: "soprano", label: "Soprano" },
  { value: "contralto", label: "Contralto" },
  { value: "tenor", label: "Tenor" },
  { value: "baixo", label: "Baixo" },
  { value: "unassigned", label: "Sem classificação" },
] as const;

function notesFromPart(p: VocalPart): MidiNoteEvent[] {
  return p.notes.map((n) => ({
    midi: n.pitch_midi,
    startSec: n.start_ms / 1000,
    durationSec: Math.max(0.05, (n.end_ms - n.start_ms) / 1000),
    velocity: n.velocity,
  }));
}

function notesPayload(notes: MidiNoteEvent[]) {
  return notes.map((n) => ({
    pitch_midi: n.midi,
    start_ms: Math.round(n.startSec * 1000),
    end_ms: Math.round((n.startSec + n.durationSec) * 1000),
    velocity: n.velocity,
  }));
}

export function VocalLabWorkspace({ projectId }: Props) {
  const [confirmDialog, confirm] = useConfirm();
  const qc = useQueryClient();
  const synthRef = useRef(new ScoreSynth());
  const bufferRef = useRef<AudioBuffer | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [recEpoch, setRecEpoch] = useState(0);

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<MidiNoteEvent[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [tx, setTx] = useState<VocalTranscription | null>(null);
  const [activePartId, setActivePartId] = useState<string | null>(null);
  const [mode, setMode] = useState<"piano" | "solfege" | "isolated">("piano");
  const [instrument, setInstrument] = useState<SynthInstrument>("piano");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [solfegeSystem, setSolfegeSystem] = useState<SolfegeSystem>("fixed");
  const [tonicMidi, setTonicMidi] = useState(60);
  const [activeSyllable, setActiveSyllable] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [annotation, setAnnotation] = useState("");

  useEffect(() => {
    const pending = takePendingLabMidi();
    if (!pending?.notes?.length) return;
    setNotes(pending.notes);
    setActiveIdx(pending.notes.length ? 0 : -1);
    setStatus(
      `Importado do diagnóstico vocal: ${pending.title} (${pending.notes.length} notas). Corrija e salve na partitura.`,
    );
  }, [projectId]);

  const stems = useQuery({
    queryKey: ["stems", projectId],
    queryFn: () => studioApi.stems(projectId),
  });
  const list = useQuery({
    queryKey: ["vocal-tx", projectId],
    queryFn: () => vocalApi.list(projectId),
  });

  const vocals = stems.data?.items.find((s) => s.stem_type === "vocals");
  const part =
    tx?.parts.find((p) => p.id === activePartId) ??
    [...(tx?.parts ?? [])].sort((a, b) => a.order_index - b.order_index)[0] ??
    null;

  const activeNote = activeIdx >= 0 ? notes[activeIdx] : null;

  // Pré-carrega stem vocal para “Ouvir gravação” mesmo sem re-transcrever
  useEffect(() => {
    if (!vocals || audioUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const { url } = await assetsApi.playbackUrl(vocals.asset_id);
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok || cancelled) return;
        const ab = await res.arrayBuffer();
        if (cancelled) return;
        const ctx = new AudioContext();
        try {
          bufferRef.current = await decodeArrayBuffer(ctx, ab);
        } finally {
          await ctx.close().catch(() => undefined);
        }
        setAudioUrl(URL.createObjectURL(new Blob([ab], { type: "audio/wav" })));
      } catch {
        /* stem pode falhar sem bloquear a UI */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando muda o stem
  }, [vocals?.asset_id]);

  const staffNotes = useMemo(
    () =>
      notes.map((n, i) => ({
        id: String(i),
        midi: n.midi,
        startSec: n.startSec,
        durationSec: n.durationSec,
      })),
    [notes],
  );

  const syllables = useMemo(
    () => notes.map((n) => midiToSolfege(n.midi, solfegeSystem, tonicMidi)),
    [notes, solfegeSystem, tonicMidi],
  );

  const durationSec = useMemo(
    () => notes.reduce((m, n) => Math.max(m, n.startSec + n.durationSec), 0),
    [notes],
  );

  function applyTx(next: VocalTranscription, preferPartId?: string | null) {
    setTx(next);
    const sorted = [...next.parts].sort((a, b) => a.order_index - b.order_index);
    const pid =
      preferPartId && sorted.some((p) => p.id === preferPartId)
        ? preferPartId
        : sorted[0]?.id ?? null;
    setActivePartId(pid);
    const p = sorted.find((x) => x.id === pid) ?? sorted[0];
    if (p) {
      setNotes(notesFromPart(p));
      const ann = (next.meta?.part_annotations as Record<string, string> | undefined)?.[p.id] ?? "";
      setAnnotation(ann);
    } else {
      setNotes([]);
      setAnnotation("");
    }
  }

  function selectPart(partId: string) {
    if (!tx) return;
    const p = tx.parts.find((x) => x.id === partId);
    if (!p) return;
    setActivePartId(partId);
    setNotes(notesFromPart(p));
    setActiveIdx(-1);
    const ann = (tx.meta?.part_annotations as Record<string, string> | undefined)?.[partId] ?? "";
    setAnnotation(ann);
  }

  async function loadVocalsBuffer(): Promise<AudioBuffer> {
    if (!vocals) throw new Error("Não encontramos a voz separada. Separe as faixas desta música primeiro.");
    const { url } = await assetsApi.playbackUrl(vocals.asset_id);
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error("Não foi possível carregar a voz separada.");
    const ab = await res.arrayBuffer();
    const ctx = new AudioContext();
    try {
      const buf = await decodeArrayBuffer(ctx, ab);
      bufferRef.current = buf;
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(new Blob([ab], { type: "audio/wav" })));
      return buf;
    } finally {
      await ctx.close().catch(() => undefined);
    }
  }

  const loadAndTranscribe = useMutation({
    mutationFn: async () => {
      setStatus("Carregando a voz separada…");
      const buf = await loadVocalsBuffer();
      setStatus("Transcrevendo (monofônico · experimental)…");
      await new Promise((r) => setTimeout(r, 0));
      const detected = estimateNotesFromBuffer(buf);
      if (!detected.length) throw new Error("Nenhuma nota estável — tente trecho mais limpo/monofônico");
      setNotes(detected);

      const bpm = 120;
      const musicxml = notesToMusicXml(detected, {
        title: "Voz principal",
        partName: "Principal",
        bpm,
      });
      const confidence = Math.min(0.85, 0.35 + detected.length / 200);
      const created = await vocalApi.create(projectId, {
        source_asset_id: vocals!.asset_id,
        engine: "client_yin_v1",
        bpm,
        confidence,
        polyphony_warning: true,
        status: "needs_review",
        meta: {
          disclaimer: "Transcrição de uma voz por vez (aproximada); coral ou várias vozes exigem revisão ou linhas isoladas",
          note_count: detected.length,
          source: "demucs_vocals",
        },
        parts: [
          {
            label: "Voz principal",
            voice_role: "principal",
            needs_review: true,
            order_index: 0,
            notes: notesPayload(detected),
          },
        ],
        musicxml,
      });
      applyTx(created);
      return detected.length;
    },
    onSuccess: (n) => {
      setError(null);
      setStatus(`Transcrição salva · ${n} notas, a partir da voz separada.`);
      void qc.invalidateQueries({ queryKey: ["vocal-tx", projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const workerTx = useMutation({
    mutationFn: async () => {
      setStatus("Enviando a voz para transcrição…");
      const created = await vocalApi.enqueueWorker(projectId, {
        source_asset_id: vocals?.asset_id,
        label: "Voz principal",
        voice_role: "principal",
      });
      applyTx(created);
      // Poll até sair de draft / worker_state done|failed
      const deadline = Date.now() + 180_000;
      let latest = created;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        latest = await vocalApi.get(created.id);
        const state = String((latest.meta?.worker_state as string) || "");
        setStatus(`Transcrevendo no servidor · ${statusLabel(String(state || latest.status))}`);
        if (latest.status === "needs_review" || latest.status === "ready") {
          applyTx(latest);
          return latest;
        }
        if (latest.status === "failed" || state === "failed") {
          throw new Error(String(latest.meta?.error || "A transcrição da voz falhou. Tente de novo."));
        }
        applyTx(latest);
      }
      throw new Error("A transcrição demorou mais que 3 minutos. Tente de novo com um trecho menor.");
    },
    onSuccess: (row) => {
      setError(null);
      const n = row.parts[0]?.notes.length ?? 0;
      setStatus(`Transcrição concluída · ${n} notas — revise a partitura`);
      void qc.invalidateQueries({ queryKey: ["vocal-tx", projectId] });
      if (vocals) void loadVocalsBuffer().catch(() => undefined);
    },
    onError: (e: Error) => setError(e.message),
  });

  const retranscribePart = useMutation({
    mutationFn: async (buf: AudioBuffer) => {
      if (!part) throw new Error("Sem parte ativa");
      const detected = estimateNotesFromBuffer(buf);
      if (!detected.length) throw new Error("Nenhuma nota estável encontrada neste trecho.");
      setNotes(detected);
      const musicxml = notesToMusicXml(detected, { title: part.label, bpm: 120 });
      return vocalApi.replaceNotes(part.id, {
        label: "Re-transcrição",
        musicxml,
        notes: notesPayload(detected),
      });
    },
    onSuccess: (next) => {
      applyTx(next, activePartId);
      setStatus("Parte re-transcrita e salva");
      void qc.invalidateQueries({ queryKey: ["vocal-tx", projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  /** Microfone → notas → parte ativa (ou nova transcrição). */
  const liveToScore = useMutation({
    mutationFn: async ({ buf, blob }: { buf: AudioBuffer; blob: Blob }) => {
      bufferRef.current = buf;
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(blob));

      const detected = estimateNotesFromBuffer(buf);
      if (!detected.length) {
        throw new Error("Nenhuma nota estável na gravação — cante mais limpo / mais perto do mic");
      }
      setNotes(detected);

      if (part) {
        const musicxml = notesToMusicXml(detected, { title: part.label, bpm: 120 });
        return vocalApi.replaceNotes(part.id, {
          label: "Gravação ao vivo",
          musicxml,
          notes: notesPayload(detected),
        });
      }

      if (!vocals) {
        throw new Error("Para salvar a primeira partitura, separe as faixas desta música (4 faixas).");
      }

      const musicxml = notesToMusicXml(detected, {
        title: "Voz ao vivo",
        partName: "Ao vivo",
        bpm: 120,
      });
      return vocalApi.create(projectId, {
        source_asset_id: vocals.asset_id,
        engine: "client_yin_live_v1",
        bpm: 120,
        confidence: Math.min(0.8, 0.3 + detected.length / 200),
        polyphony_warning: true,
        status: "needs_review",
        meta: {
          source: "live_mic",
          disclaimer: "Transcrição de microfone monofônica — revise oitavas e notas",
          note_count: detected.length,
        },
        parts: [
          {
            label: "Voz ao vivo",
            voice_role: "principal",
            needs_review: true,
            order_index: 0,
            notes: notesPayload(detected),
          },
        ],
        musicxml,
      });
    },
    onSuccess: (next) => {
      applyTx(next, activePartId);
      setError(null);
      const n = next.parts.find((p) => p.id === activePartId)?.notes.length
        ?? next.parts[0]?.notes.length
        ?? 0;
      setStatus(`Gravação partiturada · ${n} notas — revise e salve se editar`);
      void qc.invalidateQueries({ queryKey: ["vocal-tx", projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const saveRole = useMutation({
    mutationFn: async (voice_role: string) => {
      if (!part) throw new Error("Sem parte");
      const label = VOICE_ROLES.find((r) => r.value === voice_role)?.label ?? part.label;
      return vocalApi.updatePart(part.id, {
        voice_role,
        label,
        needs_review: voice_role === "unassigned",
      });
    },
    onSuccess: (next) => {
      applyTx(next, activePartId);
      setStatus("Classificação de voz atualizada (manual)");
      void qc.invalidateQueries({ queryKey: ["vocal-tx", projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const addPartMut = useMutation({
    mutationFn: async () => {
      if (!tx) throw new Error("Crie uma transcrição primeiro");
      const n = tx.parts.length + 1;
      return vocalApi.addPart(tx.id, {
        label: `Voz ${n}`,
        voice_role: "unassigned",
        needs_review: true,
        notes: [],
      });
    },
    onSuccess: (next) => {
      const newest = [...next.parts].sort((a, b) => b.order_index - a.order_index)[0];
      applyTx(next, newest?.id);
      setStatus("Parte adicionada — importe WAV ou duplique notas");
      void qc.invalidateQueries({ queryKey: ["vocal-tx", projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const deletePartMut = useMutation({
    mutationFn: (partId: string) => vocalApi.deletePart(partId),
    onSuccess: (next) => {
      applyTx(next);
      setStatus("Parte removida");
      void qc.invalidateQueries({ queryKey: ["vocal-tx", projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const persistEdits = useMutation({
    mutationFn: async () => {
      if (!part) throw new Error("Sem parte");
      const musicxml = notesToMusicXml(notes, { title: part.label, bpm: 120 });
      return vocalApi.replaceNotes(part.id, {
        label: "Edição de oitava/notas",
        musicxml,
        notes: notesPayload(notes),
      });
    },
    onSuccess: (next) => {
      applyTx(next, activePartId);
      setStatus("Versão da partitura salva");
    },
    onError: (e: Error) => setError(e.message),
  });

  const saveAnn = useMutation({
    mutationFn: async () => {
      if (!part) throw new Error("Sem parte");
      return vocalApi.updateAnnotation(part.id, annotation);
    },
    onSuccess: (next) => {
      applyTx(next, activePartId);
      setStatus("Anotação salva");
    },
    onError: (e: Error) => setError(e.message),
  });

  async function onWavFile(file: File) {
    if (!part) {
      setError("Selecione ou adicione uma parte");
      return;
    }
    setStatus(`Decodificando ${file.name}…`);
    const ab = await file.arrayBuffer();
    const ctx = new AudioContext();
    try {
      const buf = await decodeArrayBuffer(ctx, ab);
      bufferRef.current = buf;
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(new Blob([ab], { type: file.type || "audio/wav" })));
      await retranscribePart.mutateAsync(buf);
    } catch (e) {
      setError(friendlyError(e, "Falha ao ler WAV"));
    } finally {
      await ctx.close().catch(() => undefined);
    }
  }

  function duplicateActiveAsHarmony() {
    if (!notes.length || !tx || !part) return;
    const shifted = notes.map((n) => ({
      ...n,
      midi: Math.max(36, Math.min(84, n.midi - 5)),
    }));
    void vocalApi
      .addPart(tx.id, {
        label: `Harmonia · ${part.label}`,
        voice_role: "segunda",
        needs_review: true,
        notes: notesPayload(shifted),
      })
      .then((next) => {
        const newest = [...next.parts].sort((a, b) => b.order_index - a.order_index)[0];
        applyTx(next, newest?.id);
        setStatus("Linha harmônica esboçada (5 semitons abaixo) — revise à mão");
        void qc.invalidateQueries({ queryKey: ["vocal-tx", projectId] });
      })
      .catch((e: Error) => setError(e.message));
  }

  function exportMidi() {
    if (!notes.length) return;
    downloadBlob(notesToMidiBlob(notes, 120), `voz-${part?.voice_role ?? "part"}-${projectId.slice(0, 8)}.mid`);
    setStatus("MIDI da parte ativa exportado");
  }

  function exportMusicXml() {
    if (!tx?.parts.length) return;
    const withNotes = tx.parts
      .map((p) => ({
        id: p.id,
        name: p.label,
        notes: p.id === part?.id ? notes : notesFromPart(p),
      }))
      .filter((p) => p.notes.length);
    if (!withNotes.length) return;
    const xml =
      withNotes.length === 1
        ? notesToMusicXml(withNotes[0]!.notes, { title: withNotes[0]!.name, bpm: 120 })
        : partsToMusicXml(withNotes, { title: "SATB / multi-voz (manual)", bpm: 120 });
    downloadBlob(
      new Blob([xml], { type: "application/vnd.recordare.musicxml+xml" }),
      `score-${projectId.slice(0, 8)}.musicxml`,
    );
    setStatus(withNotes.length > 1 ? "MusicXML multi-parte exportado" : "MusicXML exportado");
  }

  async function playPiano(range?: { from: number; to: number }) {
    setMode("piano");
    setActiveIdx(-1);
    setActiveSyllable(null);
    synthRef.current.stop();
    setRecEpoch((n) => n + 1);
    const slice = range
      ? notes.filter((n) => n.startSec >= range.from && n.startSec < range.to)
      : notes;
    setStatus(range ? `Loop ${range.from.toFixed(1)}–${range.to.toFixed(1)}s · Piano` : "Modo A · Piano");
    await synthRef.current.playNotes(
      slice.map((n) => ({ midi: n.midi, startSec: n.startSec, durationSec: n.durationSec })),
      { instrument, absoluteTimeline: true, onNote: (i) => setActiveIdx(i) },
    );
  }

  async function playSolfege(range?: { from: number; to: number }) {
    setMode("solfege");
    setActiveIdx(-1);
    synthRef.current.stop();
    setRecEpoch((n) => n + 1);
    const slice = range
      ? notes.filter((n) => n.startSec >= range.from && n.startSec < range.to)
      : notes;
    setStatus("Modo B · Solfejo (síntese — não é voz humana)");
    await synthRef.current.playNotes(
      slice.map((n) => ({ midi: n.midi, startSec: n.startSec, durationSec: n.durationSec })),
      {
        solfege: true,
        solfegeSystem,
        tonicMidi,
        absoluteTimeline: true,
        onNote: (i, _t, label) => {
          setActiveIdx(i);
          setActiveSyllable(label ?? null);
        },
      },
    );
  }

  async function playAllParts() {
    if (!tx) return;
    setMode("piano");
    setActiveSyllable(null);
    synthRef.current.stop();
    setRecEpoch((n) => n + 1);
    const all: MidiNoteEvent[] = [];
    for (const p of tx.parts) {
      const ns = p.id === part?.id ? notes : notesFromPart(p);
      all.push(...ns);
    }
    if (!all.length) return;
    setStatus(`Todas as ${tx.parts.length} vozes (piano mix — revisão manual)`);
    await synthRef.current.playNotes(
      all.map((n) => ({ midi: n.midi, startSec: n.startSec, durationSec: n.durationSec })),
      { instrument, absoluteTimeline: true },
    );
  }

  async function exportSynthWav(kind: "piano" | "solfege") {
    if (!notes.length) return;
    setExporting(true);
    try {
      const blob = await synthRef.current.renderToWav(
        notes.map((n) => ({ midi: n.midi, startSec: n.startSec, durationSec: n.durationSec })),
        {
          solfege: kind === "solfege",
          instrument: kind === "piano" ? instrument : "piano",
          solfegeSystem,
          tonicMidi,
        },
      );
      downloadBlob(blob, `voz-${kind}-${part?.voice_role ?? "p"}-${projectId.slice(0, 8)}.wav`);
      setStatus(`WAV ${kind} exportado`);
    } catch (e) {
      setError(friendlyError(e, "Falha no export WAV"));
    } finally {
      setExporting(false);
    }
  }

  async function exportTrainingZip() {
    if (!tx?.parts.length) return;
    setExporting(true);
    setError(null);
    try {
      const entries: { name: string; data: Uint8Array | Blob | string }[] = [];
      const scoreParts = tx.parts
        .map((p) => ({
          id: p.id,
          name: p.label,
          notes: p.id === part?.id ? notes : notesFromPart(p),
        }))
        .filter((p) => p.notes.length);

      if (scoreParts.length) {
        entries.push({
          name: "score.musicxml",
          data: partsToMusicXml(scoreParts, { title: "Treino multi-voz", bpm: 120 }),
        });
      }

      const anns = (tx.meta?.part_annotations as Record<string, string> | undefined) ?? {};
      const readme = [
        "Pacote de treino — Laboratório de Vozes",
        `Projeto: ${projectId}`,
        `Partes: ${tx.parts.length}`,
        "SATB/multi-voz: classificação MANUAL (sem split IA).",
        "",
        ...tx.parts.map((p) => {
          const a = anns[p.id];
          return `- ${p.label} (${p.voice_role})${a ? `: ${a}` : ""}`;
        }),
      ].join("\n");
      entries.push({ name: "LEIA-ME.txt", data: readme });

      for (const p of tx.parts) {
        const ns = p.id === part?.id ? notes : notesFromPart(p);
        if (!ns.length) continue;
        const slug = p.voice_role || p.label.replace(/\s+/g, "_").toLowerCase();
        entries.push({
          name: `${slug}/part.mid`,
          data: notesToMidiBlob(ns, 120),
        });
        const piano = await synthRef.current.renderToWav(
          ns.map((n) => ({ midi: n.midi, startSec: n.startSec, durationSec: n.durationSec })),
          { kind: "piano" },
        );
        entries.push({ name: `${slug}/piano.wav`, data: piano });
        const solf = await synthRef.current.renderToWav(
          ns.map((n) => ({ midi: n.midi, startSec: n.startSec, durationSec: n.durationSec })),
          { kind: "solfege", solfegeSystem, tonicMidi },
        );
        entries.push({ name: `${slug}/solfejo.wav`, data: solf });
      }

      const zip = await buildZipBlob(entries);
      downloadBlob(zip, `treino-vozes-${projectId.slice(0, 8)}.zip`);
      setStatus("ZIP de treino exportado (MusicXML + MIDI + WAV por voz)");
    } catch (e) {
      setError(friendlyError(e, "Falha no ZIP"));
    } finally {
      setExporting(false);
    }
  }

  function setSelectedMidi(midi: number) {
    if (activeIdx < 0) return;
    const clamped = Math.max(36, Math.min(84, midi));
    setNotes((prev) => prev.map((n, i) => (i === activeIdx ? { ...n, midi: clamped } : n)));
  }

  function setSelectedDuration(sec: number) {
    if (activeIdx < 0) return;
    setNotes((prev) =>
      prev.map((n, i) =>
        i === activeIdx ? { ...n, durationSec: Math.max(0.05, Math.min(8, sec)) } : n,
      ),
    );
  }

  function deleteSelected() {
    if (activeIdx < 0) return;
    setNotes((prev) => prev.filter((_, i) => i !== activeIdx));
    setActiveIdx(-1);
    setStatus("Nota removida — clique em Salvar na partitura");
  }

  async function previewSelected() {
    if (!activeNote) return;
    synthRef.current.stop();
    await synthRef.current.playNotes(
      [{ midi: activeNote.midi, startSec: 0, durationSec: Math.max(0.25, activeNote.durationSec) }],
      {
        solfege: mode === "solfege",
        instrument,
        solfegeSystem,
        tonicMidi,
      },
    );
  }

  function syncFromRecording(t: number) {
    if (!notes.length) return;
    let best = -1;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i]!;
      if (t >= n.startSec && t < n.startSec + n.durationSec) {
        best = i;
        break;
      }
      if (n.startSec <= t) best = i;
    }
    if (best >= 0) setActiveIdx(best);
  }

  function openSaved(row: VocalTranscription) {
    applyTx(row);
    setStatus(`Transcrição carregada · ${row.parts.length} ${row.parts.length === 1 ? "parte" : "partes"}`);
  }

  return (
    <div className="page-shell grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="h-fit space-y-3 rounded-2xl border border-line/70 bg-glass p-3.5 lg:sticky lg:top-4">
        <div className="space-y-1">
          <h2 className="font-display text-base font-semibold text-ink">Vozes</h2>
          <p className="text-xs leading-snug text-ink-muted">
            Transforma a <span className="text-accent">voz separada</span> desta música em
            partitura. Escolha a canção abrindo o projeto certo antes de entrar aqui.
          </p>
        </div>

        <div className="space-y-1.5">
          <Button
            type="button"
            className="w-full"
            disabled={!vocals || loadAndTranscribe.isPending}
            title="Analisa o áudio aqui no navegador — rápido, qualidade limitada"
            onClick={() => void loadAndTranscribe.mutate()}
          >
            <Sparkles className="h-4 w-4" />
            {loadAndTranscribe.isPending ? "Transcrevendo…" : "Transcrição rápida"}
          </Button>
          <p className="px-0.5 text-xs leading-snug text-ink-faint">
            Feita aqui no navegador. Boa para testar; pode errar a oitava em trechos densos.
          </p>
        </div>

        <div className="space-y-1.5">
          <Button
            type="button"
            variant="violet"
            className="w-full"
            disabled={!vocals || workerTx.isPending}
            title="Processa no servidor — mais lento, costuma ser mais estável em músicas longas"
            onClick={() => void workerTx.mutate()}
          >
            {workerTx.isPending ? "Enviando…" : "Transcrição completa"}
          </Button>
          <p className="px-0.5 text-xs leading-snug text-ink-faint">
            Feita no servidor. Melhor para músicas longas; leva alguns segundos.
          </p>
        </div>

        {!vocals ? (
          <p className="rounded-lg border border-signal-warn/40 bg-signal-warn/10 px-2 py-1.5 text-xs text-signal-warn">
            Ainda não há voz separada.{" "}
            <Link href={`/projects/${projectId}#separacao`} className="underline">
              Separe a música em 4 faixas
            </Link>{" "}
            e volte.
          </p>
        ) : (
          <p className="rounded-lg border border-line/50 bg-canvas/40 px-2 py-1.5 text-xs text-ink-muted">
            Áudio usado: a <span className="font-medium text-accent">voz separada</span> desta música.
          </p>
        )}

        <div className="space-y-1.5 border-t border-line/50 pt-3">
          <p className="text-xs font-medium text-ink-muted">
            Histórico
          </p>
          <p className="text-xs leading-snug text-ink-faint">
            Clique para reabrir uma partitura salva. “Revisar” = confira notas e classificação.
          </p>
          <ul className="space-y-1">
            {(list.data?.items ?? []).slice(0, 8).map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => openSaved(row)}
                  className={cn(
                    "w-full rounded-xl border px-2.5 py-2 text-left text-xs",
                    tx?.id === row.id
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-line/60 text-ink-muted hover:border-accent/30",
                  )}
                >
                  {new Date(row.created_at).toLocaleString("pt-BR")}
                  <span className="mt-0.5 block text-xs text-ink-faint">
                    {row.parts.length} voz{row.parts.length === 1 ? "" : "es"}
                    {" · "}
                    {row.status === "needs_review"
                      ? "revisar"
                      : row.status === "ready"
                        ? "pronta"
                        : row.status === "failed"
                          ? "falhou"
                          : row.status === "draft"
                            ? "processando…"
                            : row.status}
                  </span>
                </button>
              </li>
            ))}
            {!list.data?.items.length ? (
              <li className="px-1 text-xs text-ink-faint">Nenhuma transcrição ainda.</li>
            ) : null}
          </ul>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        <header className="space-y-2">
          <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">
            Laboratório vocal
          </h1>
          <div className="max-w-3xl space-y-1.5 rounded-2xl border border-line/60 bg-glass px-3.5 py-3 text-sm text-ink-muted">
            <p className="font-medium text-ink">Como usar</p>
            <ol className="list-decimal space-y-1 pl-4 text-sm leading-snug">
              <li>Transcreva a voz (menu à esquerda) ou grave / importe um WAV.</li>
              <li>
                Em “Verificar”, toque gravação + partitura juntos e escolha o timbre (piano, violino…).
              </li>
              <li>Clique nas notas para corrigir; exporte MIDI, MusicXML ou ZIP no final.</li>
            </ol>
            <p className="text-[12px] text-ink-faint">
              Harmonias (SATB) são manuais — uma linha por vez. Síntese ≠ gravação original.
            </p>
          </div>
        </header>

        {tx ? (
          <VocalPartsBar
            parts={tx.parts}
            activePartId={part?.id ?? null}
            onSelect={selectPart}
            onAdd={() => addPartMut.mutate()}
            onDelete={async (id) => {
              const ok = await confirm({
                title: "Remover esta parte?",
                description: "As notas desta parte serão apagadas da transcrição.",
                confirmLabel: "Remover parte",
                danger: true,
              });
              if (ok) deletePartMut.mutate(id);
            }}
            busy={addPartMut.isPending || deletePartMut.isPending}
          />
        ) : null}

        <VocalDspPanel
          buffer={bufferRef.current}
          disabled={retranscribePart.isPending}
          onProcessed={(buf, wav) => {
            bufferRef.current = buf;
            if (audioUrl) URL.revokeObjectURL(audioUrl);
            setAudioUrl(URL.createObjectURL(wav));
            setStatus("Ajuste aplicado — transcrevendo a parte ativa de novo…");
            void retranscribePart.mutate(buf);
          }}
        />

        {part ? (
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line/70 bg-glass p-4">
            <div className="space-y-1">
              <Label htmlFor="voice-role">Classificação (manual)</Label>
              <select
                id="voice-role"
                className="h-10 rounded-lg border border-line bg-canvas px-3 text-sm text-ink"
                value={part.voice_role}
                onChange={(e) => saveRole.mutate(e.target.value)}
              >
                {VOICE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="solfege-sys">Solfejo</Label>
              <select
                id="solfege-sys"
                className="h-10 rounded-lg border border-line bg-canvas px-3 text-sm text-ink"
                value={solfegeSystem}
                onChange={(e) => setSolfegeSystem(e.target.value as SolfegeSystem)}
              >
                <option value="fixed">Fixo (C = Dó)</option>
                <option value="movable">Móvel (tônica = Dó)</option>
              </select>
            </div>
            {solfegeSystem === "movable" ? (
              <div className="space-y-1">
                <Label htmlFor="tonic">Tônica (número da nota MIDI, 60 = Dó central)</Label>
                <input
                  id="tonic"
                  type="number"
                  min={48}
                  max={72}
                  value={tonicMidi}
                  onChange={(e) => setTonicMidi(Number(e.target.value) || 60)}
                  className="h-10 w-24 rounded-xl border border-line bg-canvas px-3 text-sm text-ink"
                />
              </div>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="audio/wav,audio/mpeg,audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onWavFile(f);
                e.target.value = "";
              }}
            />
            <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              Importar WAV nesta voz
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!notes.length || !tx}
              onClick={duplicateActiveAsHarmony}
            >
              Esboçar harmonia (−5 st)
            </Button>
            {part.needs_review ? (
              <span className="rounded-lg border border-signal-warn/40 px-2 py-1 text-xs text-signal-warn">
                Necessita revisão
              </span>
            ) : null}
            <span className="text-xs text-ink-faint">{notes.length} notas</span>
          </div>
        ) : null}

        <VocalLiveRecorder
          busy={liveToScore.isPending || retranscribePart.isPending}
          onCaptured={(buf, blob) => {
            void liveToScore.mutateAsync({ buf, blob });
          }}
        />

        <VocalVerifyPlayer
          audioUrl={audioUrl}
          notes={notes.map((n) => ({
            midi: n.midi,
            startSec: n.startSec,
            durationSec: n.durationSec,
          }))}
          instrument={instrument}
          onInstrumentChange={setInstrument}
          stopEpoch={recEpoch}
          onTimeUpdate={(t) => {
            setMode("isolated");
            syncFromRecording(t);
          }}
        />

        {activeSyllable ? (
          <p
            className="font-display text-center text-4xl font-bold text-accent"
            aria-live="polite"
          >
            {activeSyllable}
          </p>
        ) : null}

        <ScoreStaff
          notes={staffNotes}
          activeIndex={activeIdx}
          syllables={mode === "solfege" || solfegeSystem ? syllables : undefined}
          onSelect={(i) => {
            setActiveIdx(i);
            setStatus(`Nota ${i + 1} selecionada — edite abaixo`);
          }}
        />

        {activeNote ? (
          <VocalNoteEditor
            index={activeIdx}
            midi={activeNote.midi}
            startSec={activeNote.startSec}
            durationSec={activeNote.durationSec}
            solfegeSystem={solfegeSystem}
            tonicMidi={tonicMidi}
            onChangeMidi={setSelectedMidi}
            onChangeDuration={setSelectedDuration}
            onDelete={deleteSelected}
            onPreview={() => void previewSelected()}
            onSave={() => persistEdits.mutate()}
            saving={persistEdits.isPending}
          />
        ) : notes.length ? (
          <p className="rounded-xl border border-line/60 bg-glass px-3 py-2 text-sm text-ink-muted">
            Clique numa nota da pauta para editar altura, duração ou apagar.
          </p>
        ) : null}

        <div className="flex flex-wrap items-end gap-2" role="toolbar" aria-label="Síntese">
          <div className="space-y-1">
            <Label htmlFor="toolbar-inst" className="text-xs text-ink-faint">
              Timbre
            </Label>
            <select
              id="toolbar-inst"
              className="h-9 rounded-lg border border-line bg-canvas px-2 text-sm text-ink"
              value={instrument}
              onChange={(e) => setInstrument(e.target.value as SynthInstrument)}
            >
              <option value="piano">Piano</option>
              <option value="violin">Violino</option>
              <option value="flute">Flauta</option>
              <option value="organ">Órgão</option>
              <option value="bass">Baixo</option>
              <option value="pad">Pad</option>
            </select>
          </div>
          <Button type="button" variant={mode === "piano" ? "default" : "secondary"} disabled={!notes.length} onClick={() => void playPiano()}>
            <Piano className="h-4 w-4" />
            A · Instrumento
          </Button>
          <Button type="button" variant={mode === "solfege" ? "violet" : "secondary"} disabled={!notes.length} onClick={() => void playSolfege()}>
            <Music2 className="h-4 w-4" />
            B · Solfejo
          </Button>
          <Button type="button" variant="secondary" disabled={!tx || tx.parts.length < 2} onClick={() => void playAllParts()}>
            <Layers className="h-4 w-4" />
            Todas as vozes
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => synthRef.current.stop()}>
            Parar síntese
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={!part || persistEdits.isPending || !notes.length} onClick={() => persistEdits.mutate()}>
            Salvar partitura
          </Button>
        </div>

        {part && notes.length ? (
          <VocalDrillPanel
            durationSec={durationSec || 30}
            annotation={annotation}
            onAnnotationChange={setAnnotation}
            onSaveAnnotation={() => saveAnn.mutate()}
            saving={saveAnn.isPending}
            onLoopPlay={(from, to) => void playPiano({ from, to })}
          />
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={!notes.length} onClick={exportMidi}>
            <FileMusic className="h-4 w-4" />
            MIDI
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={!tx?.parts.length} onClick={exportMusicXml}>
            <Download className="h-4 w-4" />
            MusicXML
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={!notes.length || exporting} onClick={() => void exportSynthWav("piano")}>
            WAV Piano
          </Button>
          <Button type="button" variant="violet" size="sm" disabled={!notes.length || exporting} onClick={() => void exportSynthWav("solfege")}>
            WAV Solfejo
          </Button>
          <Button type="button" variant="default" size="sm" disabled={!tx?.parts.length || exporting} onClick={() => void exportTrainingZip()}>
            <Package className="h-4 w-4" />
            {exporting ? "Empacotando…" : "ZIP treino"}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={!notes.length} onClick={() => window.print()}>
            PDF (imprimir)
          </Button>
        </div>

        {status ? <p className="text-sm text-accent">{status}</p> : null}
        {error ? (
          <p role="alert" className="text-sm text-signal-err">
            {error}
          </p>
        ) : null}
      </div>
      {confirmDialog}
    </div>
  );
}
