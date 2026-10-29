"use client";

import { Headphones, Mic, Pause, Play, Square, Trash2, Download, AudioWaveform } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { MicInputControls } from "@/components/practice/mic-input-controls";
import { MicLiveWaveform } from "@/components/practice/mic-live-waveform";
import { VoiceFxPanel } from "@/components/practice/voice-fx-panel";
import { Button } from "@/components/ui/button";
import { LiveVoiceFx, type VoiceFxParams } from "@/lib/live-voice-fx";
import { syncedBackingTime } from "@/lib/practice-latency";
import {
  createTakeId,
  deletePracticeTake,
  getPracticeTakeBlob,
  listPracticeTakes,
  pickRecorderMime,
  savePracticeTake,
  type PracticeTake,
} from "@/lib/practice-recordings";
import { formatClock } from "@/lib/stem-theme";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/errors";
import { useConfirm } from "@/components/ui/use-confirm";

type Props = {
  projectId: string;
  /** Backing (stems) pronto para tocar junto com o ensaio */
  backingReady?: boolean;
  onPlayBacking?: (fromSec?: number) => void | Promise<void>;
  onPauseBacking?: () => void;
  onIsBackingPlaying?: () => boolean;
  /** Tempo atual do player de treino (s) — para seguir a posição ao gravar */
  onGetBackingTime?: () => number;
  /** Mesmo AudioContext do player — obrigatório para ouvir base + mic juntos */
  onEnsureAudioContext?: () => Promise<AudioContext | null>;
  /** Após salvar/excluir takes — atualiza waveform no player */
  onTakesChange?: () => void;
  /** Take ativo na faixa “Sua voz” do player */
  overlayTakeId?: string | null;
  onSelectOverlayTake?: (takeId: string) => void;
};

type RecState = "idle" | "recording" | "paused";

export function PracticeRecorder({
  projectId,
  backingReady = false,
  onPlayBacking,
  onPauseBacking,
  onIsBackingPlaying,
  onGetBackingTime,
  onEnsureAudioContext,
  onTakesChange,
  overlayTakeId,
  onSelectOverlayTake,
}: Props) {
  const [confirmDialog, confirm] = useConfirm();
  const [recState, setRecState] = useState<RecState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [takes, setTakes] = useState<PracticeTake[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playPaused, setPlayPaused] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);
  const [playTime, setPlayTime] = useState(0);
  const [playDuration, setPlayDuration] = useState(0);
  /** Ouvir ensaio + música (stems) juntos */
  const [withBacking, setWithBacking] = useState(true);
  /** Continuar gravando com a música tocando */
  const [recordWithMusic, setRecordWithMusic] = useState(true);
  const [backingLive, setBackingLive] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [liveAnalyser, setLiveAnalyser] = useState<AnalyserNode | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [fx, setFx] = useState<VoiceFxParams>({
    reverb: 0.25,
    delay: 0.12,
    delayTimeMs: 280,
    autotune: 0,
  });

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const fxEngineRef = useRef<LiveVoiceFx | null>(null);
  const fxRef = useRef(fx);
  const recordWithMusicRef = useRef(recordWithMusic);
  const keepAliveRef = useRef<number | null>(null);
  const accruedMs = useRef(0);
  const segmentStartedAt = useRef(0);
  const finalDurationRef = useRef(0);
  const recordOffsetRef = useRef(0);
  const playingOffsetRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const withBackingRef = useRef(withBacking);

  useEffect(() => {
    withBackingRef.current = withBacking;
  }, [withBacking]);

  useEffect(() => {
    recordWithMusicRef.current = recordWithMusic;
  }, [recordWithMusic]);

  useEffect(() => {
    fxRef.current = fx;
    fxEngineRef.current?.setParams(fx);
  }, [fx]);

  function clearKeepAlive() {
    if (keepAliveRef.current != null) {
      window.clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }

  function startKeepAlive(fromSec: number) {
    clearKeepAlive();
    keepAliveRef.current = window.setInterval(() => {
      if (!recordWithMusicRef.current || !onPlayBacking) return;
      void (async () => {
        try {
          if (!onIsBackingPlaying?.()) {
            const t =
              fromSec +
              (mediaRef.current
                ? (accruedMs.current +
                    (mediaRef.current.state === "recording"
                      ? Date.now() - segmentStartedAt.current
                      : 0)) /
                  1000
                : 0);
            await onPlayBacking(t);
          }
        } catch {
          /* ignore */
        }
      })();
    }, 700);
  }

  const refresh = useCallback(
    async (notify = false) => {
      const rows = await listPracticeTakes(projectId);
      setTakes(rows);
      if (notify) onTakesChange?.();
    },
    [projectId, onTakesChange],
  );

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  useEffect(() => {
    return () => {
      stopTicker();
      stopPlayback(false);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTicker() {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function startTicker() {
    stopTicker();
    tickRef.current = window.setInterval(() => {
      const live = Date.now() - segmentStartedAt.current;
      setElapsedMs(accruedMs.current + live);
    }, 200);
  }

  function stopPlayback(pauseBacking = true) {
    const a = audioRef.current;
    if (a) {
      a.pause();
    }
    // Desconecta MediaElementSource ANTES de limpar o src
    if (!mediaRef.current) {
      fxEngineRef.current?.stop();
      fxEngineRef.current = null;
      setLiveAnalyser(null);
    }
    if (a) {
      a.removeAttribute("src");
      try {
        a.load();
      } catch {
        /* ignore */
      }
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPlayingId(null);
    setPlayPaused(false);
    setPlayProgress(0);
    setPlayTime(0);
    setPlayDuration(0);
    if (pauseBacking) onPauseBacking?.();
  }

  async function ensureBacking(fromSec: number, opts?: { force?: boolean }): Promise<boolean> {
    const wantMusic = opts?.force || recordWithMusicRef.current;
    if (!wantMusic || !backingReady || !onPlayBacking) return false;
    try {
      await onPlayBacking(fromSec);
      await new Promise((r) => setTimeout(r, 80));
      for (let i = 0; i < 5; i++) {
        if (onIsBackingPlaying?.()) return true;
        await new Promise((r) => setTimeout(r, 120 + i * 60));
        const drift =
          mediaRef.current?.state === "recording"
            ? (accruedMs.current + Date.now() - segmentStartedAt.current) / 1000
            : 0;
        await onPlayBacking(fromSec + drift);
      }
      return onIsBackingPlaying?.() ?? false;
    } catch {
      return false;
    }
  }

  async function start() {
    setError(null);
    setMsg(null);
    stopPlayback(false);
    const startAt = onGetBackingTime?.() ?? 0;
    recordOffsetRef.current = startAt;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microfone indisponível neste navegador");
      }

      // 1) Toca a base AINDA no gesto do clique (antes do mic) — evita silêncio no Windows/Chrome
      if (recordWithMusic && backingReady && onPlayBacking) {
        setMsg("Iniciando base…");
        try {
          await onPlayBacking(startAt);
          setBackingLive(true);
        } catch {
          setBackingLive(false);
        }
      }

      // 2) Abre o microfone (dispositivo escolhido, se houver)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
      streamRef.current = stream;
      setLiveStream(stream);

      // 3) FX no MESMO AudioContext do player — senão a base fica muda
      fxEngineRef.current?.stop();
      const shared = (await onEnsureAudioContext?.()) ?? undefined;
      const engine = new LiveVoiceFx();
      fxEngineRef.current = engine;
      await engine.attachMic(stream, shared ?? undefined);
      engine.setParams(fxRef.current);
      await engine.resume();
      setLiveAnalyser(engine.getAnalyser());

      const mime = pickRecorderMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      const offsetSec = recordOffsetRef.current;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        void (async () => {
          const mimeType = rec.mimeType || mime || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const durationMs = Math.max(finalDurationRef.current, accruedMs.current, 1);
          const id = createTakeId();
          await savePracticeTake({
            id,
            projectId,
            createdAt: new Date().toISOString(),
            durationMs,
            mimeType,
            label: `Ensaio ${new Date().toLocaleTimeString("pt-BR")}`,
            offsetSec,
            blob,
          });
          clearKeepAlive();
          fxEngineRef.current?.stop();
          fxEngineRef.current = null;
          setLiveAnalyser(null);
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          setLiveStream(null);
          onPauseBacking?.();
          setMsg(
            `Ensaio salvo @ ${formatClock(offsetSec)} na música — use “No player” para ver a waveform`,
          );
          onSelectOverlayTake?.(id);
          await refresh(false);
        })();
      };
      mediaRef.current = rec;
      accruedMs.current = 0;
      segmentStartedAt.current = Date.now();
      setElapsedMs(0);
      rec.start(250);
      setRecState("recording");
      startTicker();

      // 4) Reativa a base no mesmo context
      await engine.resume();
      if (recordWithMusicRef.current && backingReady && onPlayBacking) {
        const ok = await ensureBacking(startAt);
        setBackingLive(ok);
        if (ok) startKeepAlive(startAt);
        setMsg(
          ok
            ? "Gravando — você deve ouvir a base. Prefira fones."
            : "Mic OK, mas a base sumiu — clique em “Tocar base agora”.",
        );
      } else {
        clearKeepAlive();
        onPauseBacking?.();
        setBackingLive(false);
        setMsg("Gravando só a voz (opção “com a música” desmarcada)");
      }
    } catch (e) {
      setError(friendlyError(e, "Falha ao gravar"));
      setRecState("idle");
      stopTicker();
      clearKeepAlive();
      fxEngineRef.current?.stop();
      fxEngineRef.current = null;
      setLiveAnalyser(null);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setLiveStream(null);
    }
  }

  function pauseRec() {
    const rec = mediaRef.current;
    if (!rec || rec.state !== "recording") return;
    try {
      rec.pause();
      accruedMs.current += Date.now() - segmentStartedAt.current;
      setElapsedMs(accruedMs.current);
      stopTicker();
      clearKeepAlive();
      setRecState("paused");
      setBackingLive(false);
      onPauseBacking?.();
    } catch {
      setError("Pausa não suportada neste navegador — use Parar");
    }
  }

  async function resumeRec() {
    const rec = mediaRef.current;
    if (!rec || rec.state !== "paused") return;
    try {
      rec.resume();
      segmentStartedAt.current = Date.now();
      setRecState("recording");
      startTicker();
      if (recordWithMusicRef.current && backingReady && onPlayBacking) {
        const from = (onGetBackingTime?.() ?? 0) || elapsedMs / 1000;
        const ok = await ensureBacking(from);
        setBackingLive(ok);
        if (ok) startKeepAlive(from);
      }
    } catch {
      setError("Não foi possível retomar a gravação");
    }
  }

  async function forceBackingNow() {
    if (!onPlayBacking) return;
    try {
      const from =
        (onGetBackingTime?.() ?? 0) ||
        (typeof elapsedMs === "number" ? elapsedMs / 1000 : 0);
      const ok = await ensureBacking(from);
      setBackingLive(ok);
      setMsg(
        ok
          ? "Base tocando no monitor"
          : "Ainda sem áudio — use fones e confira o volume (Windows pode silenciar ao abrir o mic)",
      );
    } catch (e) {
      setError(friendlyError(e, "Falha ao tocar a base"));
      setBackingLive(false);
    }
  }

  function stopRec() {
    stopTicker();
    clearKeepAlive();
    let durationMs = accruedMs.current;
    if (mediaRef.current?.state === "recording") {
      durationMs += Date.now() - segmentStartedAt.current;
    }
    accruedMs.current = durationMs;
    finalDurationRef.current = durationMs;
    setElapsedMs(durationMs);
    mediaRef.current?.stop();
    mediaRef.current = null;
    setRecState("idle");
    setBackingLive(false);
    onPauseBacking?.();
  }

  useEffect(() => {
    return () => {
      clearKeepAlive();
      fxEngineRef.current?.stop();
      fxEngineRef.current = null;
    };
  }, []);

  async function togglePlay(take: PracticeTake) {
    setError(null);
    if (playingId === take.id) {
      const a = audioRef.current;
      if (a && !a.paused) {
        a.pause();
        onPauseBacking?.();
        setPlayPaused(true);
        setMsg("Pausado — clique de novo para continuar");
        return;
      }
      if (a && a.paused) {
        try {
          await fxEngineRef.current?.resume();
          await a.play();
          setPlayPaused(false);
          if (withBackingRef.current && backingReady && onPlayBacking) {
            await onPlayBacking(syncedBackingTime(playingOffsetRef.current, a.currentTime));
          }
          setMsg(
            withBackingRef.current
              ? "Ensaio + efeitos + música (alinhado à timeline)"
              : "Ouvindo ensaio com efeitos",
          );
        } catch (e) {
          setError(friendlyError(e, "Falha ao retomar"));
        }
        return;
      }
      stopPlayback(true);
      return;
    }

    stopPlayback(true);
    const blob = await getPracticeTakeBlob(take.id);
    if (!blob) {
      setError("Áudio não encontrado");
      return;
    }
    playingOffsetRef.current = take.offsetSec ?? 0;
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;
    const audio = new Audio(url);
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;
    audio.ontimeupdate = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        setPlayProgress(audio.currentTime / audio.duration);
        setPlayTime(audio.currentTime);
        setPlayDuration(audio.duration);
      }
    };
    audio.onended = () => {
      stopPlayback(true);
      setMsg("Fim do ensaio");
    };
    audio.onerror = () => {
      setError("Falha ao reproduzir a gravação");
      stopPlayback(true);
    };
    setPlayingId(take.id);
    setPlayPaused(false);
    setPlayProgress(0);
    try {
      const shared = (await onEnsureAudioContext?.()) ?? undefined;
      fxEngineRef.current?.stop();
      const engine = new LiveVoiceFx();
      fxEngineRef.current = engine;
      await engine.attachElement(audio, shared ?? undefined);
      engine.setParams(fxRef.current);
      await engine.resume();
      await audio.play();
      if (withBackingRef.current && backingReady && onPlayBacking) {
        const syncAt = syncedBackingTime(playingOffsetRef.current, 0);
        const ok = await ensureBacking(syncAt, { force: true });
        setMsg(
          ok
            ? `Ensaio + música @ ${formatClock(playingOffsetRef.current)} — ajuste latência se necessário`
            : "Ensaio tocando; base falhou — use o play do player acima ou fones",
        );
      } else {
        onPauseBacking?.();
        setMsg("Ouvindo só o ensaio (música desmarcada) — efeitos nos sliders");
      }
    } catch (e) {
      setError(friendlyError(e, "Autoplay bloqueado"));
      stopPlayback(true);
    }
  }

  async function download(id: string, label: string, mimeType: string) {
    const blob = await getPracticeTakeBlob(id);
    if (!blob) {
      setError("Áudio não encontrado");
      return;
    }
    const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label.replace(/\s+/g, "_").slice(0, 40)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isLive = recState !== "idle";

  return (
    <section
      className="space-y-4 rounded-3xl border border-line/70 bg-glass p-4 shadow-panel md:p-5"
      aria-label="Gravação de ensaio"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
            Gravação do músico
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            Grave, pause e ouça a faixa que quiser — com ou sem a música de fundo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {recState === "idle" ? (
            <Button type="button" size="lg" onClick={() => void start()}>
              <Mic className="h-4 w-4" aria-hidden />
              Gravar ensaio
            </Button>
          ) : null}
          {recState === "recording" ? (
            <>
              <Button type="button" variant="secondary" onClick={pauseRec}>
                <Pause className="h-4 w-4" aria-hidden />
                Pausar
              </Button>
              <Button type="button" variant="violet" onClick={stopRec}>
                <Square className="h-4 w-4" aria-hidden />
                Salvar
              </Button>
            </>
          ) : null}
          {recState === "paused" ? (
            <>
              <Button type="button" onClick={() => void resumeRec()}>
                <Mic className="h-4 w-4" aria-hidden />
                Continuar
              </Button>
              <Button type="button" variant="violet" onClick={stopRec}>
                <Square className="h-4 w-4" aria-hidden />
                Salvar
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <div className="space-y-2 rounded-2xl border border-line/60 bg-canvas/40 px-3 py-2.5">
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-2 text-ink-muted">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={recordWithMusic}
              disabled={!backingReady}
              onChange={(e) => {
                const on = e.target.checked;
                setRecordWithMusic(on);
                recordWithMusicRef.current = on;
                if (!on) {
                  clearKeepAlive();
                  onPauseBacking?.();
                  setBackingLive(false);
                  setMsg("Música desligada na gravação");
                } else if (isLive && backingReady) {
                  void ensureBacking(onGetBackingTime?.() ?? elapsedMs / 1000).then((ok) => {
                    setBackingLive(ok);
                    if (ok) startKeepAlive(onGetBackingTime?.() ?? 0);
                    setMsg(ok ? "Base ligada na gravação" : "Não deu para tocar a base — tente de novo");
                  });
                }
              }}
            />
            Gravar com a música tocando
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-ink-muted">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={withBacking}
              disabled={!backingReady}
              onChange={(e) => {
                const on = e.target.checked;
                setWithBacking(on);
                withBackingRef.current = on;
                if (!on) {
                  onPauseBacking?.();
                  setMsg("Ao ouvir o ensaio, a música ficará desligada");
                } else if (playingId && audioRef.current && !audioRef.current.paused) {
                  void ensureBacking(
                    syncedBackingTime(playingOffsetRef.current, audioRef.current.currentTime),
                    { force: true },
                  ).then((ok) => {
                    setMsg(ok ? "Música juntada ao ensaio (timeline)" : "Falha ao juntar a música");
                  });
                } else {
                  setMsg("Ao ouvir o ensaio, a música tocará alinhada ao offset da gravação");
                }
              }}
            />
            <Headphones className="h-3.5 w-3.5 text-accent" aria-hidden />
            Ouvir ensaio + música juntos
          </label>
        </div>
        {!backingReady ? (
          <p className="text-xs text-signal-warn">
            Aguarde o player carregar os stems para usar essas opções.
          </p>
        ) : (
          <p className="text-xs text-ink-faint">
            A 1ª liga a base enquanto você grava. A 2ª liga a base ao apertar play no ensaio salvo,
            alinhada ao instante da música em que você começou a gravar. Use fones.
          </p>
        )}
      </div>

      <MicInputControls
        deviceId={deviceId}
        onDeviceIdChange={setDeviceId}
        analyser={liveAnalyser}
        monitoring={isLive}
      />

      <VoiceFxPanel value={fx} onChange={setFx} disabled={false} />

      {isLive ? (
        <div className="space-y-3">
          <MicLiveWaveform
            analyser={liveAnalyser}
            stream={liveStream}
            active={recState === "recording"}
          />
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 font-mono text-sm",
              recState === "recording"
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-violet/40 bg-violet/10 text-violet",
            )}
            role="status"
          >
            <span className="inline-flex items-center gap-3">
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  recState === "recording" ? "animate-pulse-meter bg-flare" : "bg-ink-faint",
                )}
                aria-hidden
              />
              {recState === "recording" ? "Gravando" : "Pausado"} · {formatClock(elapsedMs / 1000)}
            </span>
            <span
              className={cn(
                "rounded-lg px-2 py-0.5 text-xs",
                backingLive ? "bg-accent/20 text-accent" : "bg-signal-warn/15 text-signal-warn",
              )}
            >
              {backingLive ? "Base no monitor" : "Sem áudio da base"}
            </span>
          </div>
          {recordWithMusic ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => void forceBackingNow()}>
              <Headphones className="h-3.5 w-3.5" aria-hidden />
              {backingLive ? "Reiniciar base no monitor" : "Tocar base agora"}
            </Button>
          ) : null}
          <p className="text-xs text-ink-faint">
            Prefira fones: no Windows o microfone pode silenciar os alto-falantes. A base toca no
            player (não entra no arquivo do ensaio — só no monitor).
          </p>
        </div>
      ) : null}

      {msg ? <p className="text-xs text-accent">{msg}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-signal-err">
          {error}
        </p>
      ) : null}

      {takes.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-1">
          {takes.map((t) => {
            const isActive = playingId === t.id;
            const showPause = isActive && !playPaused;
            return (
              <li
                key={t.id}
                className={cn(
                  "rounded-2xl border p-4 transition",
                  isActive
                    ? "border-accent/45 bg-accent/5 shadow-glow"
                    : "border-line/70 bg-canvas/30 hover:border-accent/30",
                )}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void togglePlay(t)}
                    className={cn(
                      "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition",
                      showPause
                        ? "bg-accent text-canvas shadow-glow"
                        : "border border-line bg-canvas-raised text-accent hover:border-accent/50",
                    )}
                    aria-label={showPause ? `Pausar ${t.label}` : `Ouvir ${t.label}`}
                  >
                    {showPause ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-semibold text-ink">{t.label}</p>
                    <p className="font-mono text-xs text-ink-faint">
                      {(t.durationMs / 1000).toFixed(1)}s
                      {typeof t.offsetSec === "number"
                        ? ` · @ ${formatClock(t.offsetSec)} na música`
                        : ""}
                      {isActive
                        ? ` · ${formatClock(playTime)} / ${formatClock(playDuration || t.durationMs / 1000)}`
                        : ""}
                      {withBacking && backingReady ? " · com música" : ""}
                      {overlayTakeId === t.id ? " · no player" : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    {onSelectOverlayTake ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={overlayTakeId === t.id ? "violet" : "ghost"}
                        aria-label={`Mostrar ${t.label} no player`}
                        title="Mostrar waveform no player"
                        onClick={() => onSelectOverlayTake(t.id)}
                      >
                        <AudioWaveform className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label="Baixar"
                      onClick={() => void download(t.id, t.label, t.mimeType)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-ink-faint hover:text-signal-err"
                      aria-label={`Excluir ${t.label}`}
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Excluir “${t.label}”?`,
                          description: "A gravação deste take será apagada e não pode ser recuperada.",
                          confirmLabel: "Excluir take",
                          danger: true,
                        });
                        if (!ok) return;
                        if (playingId === t.id) stopPlayback(true);
                        void deletePracticeTake(t.id).then(() => refresh(true));
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {isActive ? (
                  <div className="mt-3 space-y-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-canvas-overlay">
                      <div
                        className="h-full rounded-full bg-accent transition-[width] duration-100"
                        style={{ width: `${Math.round(playProgress * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-ink-faint">
                      {playPaused
                        ? "Pausado — clique no play para continuar"
                        : withBacking
                          ? "Ensaio + track tocando"
                          : "Só o ensaio — ative “Ouvir ensaio + música” acima"}
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-line/70 px-4 py-8 text-center text-sm text-ink-faint">
          Nenhum ensaio ainda. Grave e depois escolha a faixa para ouvir.
        </div>
      )}
      {confirmDialog}
    </section>
  );
}
