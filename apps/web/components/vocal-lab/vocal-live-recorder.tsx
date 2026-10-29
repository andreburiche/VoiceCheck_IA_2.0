"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { pickRecorderMime } from "@/lib/practice-recordings";
import { decodeArrayBuffer } from "@/lib/vocal-dsp";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/errors";

type Props = {
  disabled?: boolean;
  busy?: boolean;
  onCaptured: (buf: AudioBuffer, blob: Blob) => void | Promise<void>;
};

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

/** Gravação ao vivo pelo microfone → buffer para partitura. */
export function VocalLiveRecorder({ disabled, busy, onCaptured }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAt = useRef(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (tickRef.current != null) window.clearInterval(tickRef.current);
      mediaRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    setError(null);
    setHint(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microfone indisponível neste navegador");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = pickRecorderMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        void finish(rec.mimeType || mime || "audio/webm");
      };

      rec.start(250);
      startedAt.current = Date.now();
      setElapsed(0);
      setRecording(true);
      setHint("Cante uma linha monofônica — ao parar, geramos a partitura");
      tickRef.current = window.setInterval(() => {
        setElapsed(Date.now() - startedAt.current);
      }, 200);
    } catch (e) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setError(friendlyError(e, "Não foi possível acessar o microfone"));
    }
  }

  function stop() {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const rec = mediaRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    else void finish("audio/webm");
    setRecording(false);
  }

  async function finish(mimeType: string) {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRef.current = null;

    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    if (blob.size < 800) {
      setError("Gravação muito curta — tente de novo");
      return;
    }

    setHint("Transcrevendo gravação…");
    try {
      const ab = await blob.arrayBuffer();
      const ctx = new AudioContext();
      let buf: AudioBuffer;
      try {
        buf = await decodeArrayBuffer(ctx, ab);
      } finally {
        await ctx.close().catch(() => undefined);
      }
      await onCaptured(buf, blob);
      setHint("Partitura atualizada a partir do microfone — revise as notas");
    } catch (e) {
      setError(friendlyError(e, "Falha ao processar gravação"));
      setHint(null);
    }
  }

  return (
    <div
      className={cn(
        "space-y-2 rounded-2xl border p-3",
        recording ? "border-signal-err/50 bg-signal-err/10" : "border-violet/35 bg-violet/10",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-display text-sm font-semibold text-ink">Gravar ao vivo</p>
          <p className="text-xs text-ink-faint">
            Cante no microfone; ao parar, o Lab tenta gerar as notas da pauta.
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs text-ink-faint">
          {recording ? fmtMs(elapsed) : "mic"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!recording ? (
          <Button
            type="button"
            size="sm"
            variant="violet"
            disabled={disabled || busy}
            title="Permite o microfone, cante e pare para gerar a partitura"
            onClick={() => void start()}
          >
            <Mic className="h-4 w-4" />
            Gravar e partiturar
          </Button>
        ) : (
          <Button type="button" size="sm" variant="default" onClick={stop}>
            <Square className="h-4 w-4" />
            Parar e gerar partitura
          </Button>
        )}
        <span className="text-xs text-ink-muted">Melhor com uma nota de cada vez</span>
      </div>
      {hint ? <p className="text-xs text-accent">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-signal-err">
          {error}
        </p>
      ) : null}
    </div>
  );
}
