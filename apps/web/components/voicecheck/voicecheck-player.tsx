"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/stem-theme";
import type { VoiceCheckAssetMeta } from "@/lib/voicecheck-store";

type Props = {
  objectUrl: string | null;
  asset: VoiceCheckAssetMeta | null;
  seekSec?: number | null;
  /** Se definido com seekSec, reproduz até este tempo e pausa. */
  playUntilSec?: number | null;
  highlight?: { start: number; end: number } | null;
  onDuration?: (sec: number) => void;
  onTime?: (sec: number) => void;
};

export function VoiceCheckPlayer({
  objectUrl,
  asset,
  seekSec,
  playUntilSec,
  highlight,
  onDuration,
  onTime,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopAtRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const isVideo = asset?.kind === "video";

  useEffect(() => {
    setPlaying(false);
    setTime(0);
    setDuration(0);
    stopAtRef.current = null;
  }, [objectUrl]);

  useEffect(() => {
    if (seekSec == null || !Number.isFinite(seekSec)) return;
    const el = isVideo ? videoRef.current : audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, seekSec);
    setTime(seekSec);
    if (playUntilSec != null && Number.isFinite(playUntilSec) && playUntilSec > seekSec) {
      stopAtRef.current = playUntilSec;
      void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }, [seekSec, playUntilSec, isVideo]);

  function bindMedia(el: HTMLMediaElement | null) {
    if (!el) return;
    const onMeta = () => {
      const d = el.duration;
      if (Number.isFinite(d)) {
        setDuration(d);
        onDuration?.(d);
      }
    };
    const onT = () => {
      setTime(el.currentTime);
      onTime?.(el.currentTime);
      const stopAt = stopAtRef.current;
      if (stopAt != null && el.currentTime >= stopAt) {
        el.pause();
        stopAtRef.current = null;
        setPlaying(false);
      }
    };
    const onEnded = () => setPlaying(false);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("timeupdate", onT);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("timeupdate", onT);
      el.removeEventListener("ended", onEnded);
    };
  }

  useEffect(() => {
    if (isVideo) return bindMedia(videoRef.current);
    return bindMedia(audioRef.current);
  }, [objectUrl, isVideo, onDuration, onTime]);

  async function toggle() {
    const el = isVideo ? videoRef.current : audioRef.current;
    if (!el) return;
    try {
      if (el.paused) {
        await el.play();
        setPlaying(true);
      } else {
        el.pause();
        setPlaying(false);
      }
    } catch {
      setPlaying(false);
    }
  }

  if (!objectUrl || !asset) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-faint">
        Importe um arquivo para pré-escutar.
      </p>
    );
  }

  return (
    <div className="space-y-3 panel-glass rounded-2xl p-4">
      <p className="hud-label text-accent">Player</p>
      {isVideo ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          ref={videoRef}
          src={objectUrl}
          className="max-h-64 w-full rounded-xl border border-line bg-canvas object-contain"
          playsInline
          preload="metadata"
        />
      ) : (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio ref={audioRef} src={objectUrl} preload="metadata" className="hidden" />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={() => void toggle()}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "Pausar" : "Ouvir"}
        </Button>
        <span className="text-data text-xs text-ink-faint">
          {formatClock(time)} / {formatClock(duration)}
        </span>
        <div className="relative h-2 min-w-[8rem] flex-1">
          {highlight && duration > 0 ? (
            <div
              className="pointer-events-none absolute inset-y-0 rounded-full bg-accent/35"
              style={{
                left: `${(Math.max(0, highlight.start) / duration) * 100}%`,
                width: `${(Math.max(0.05, highlight.end - highlight.start) / duration) * 100}%`,
              }}
            />
          ) : null}
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.01)}
            step={0.01}
            value={Math.min(time, duration || 0)}
            aria-label="Posição"
            className="absolute inset-0 h-2 w-full accent-[var(--accent)]"
            onChange={(e) => {
              const t = Number(e.target.value);
              const el = isVideo ? videoRef.current : audioRef.current;
              if (el) el.currentTime = t;
              setTime(t);
              stopAtRef.current = null;
            }}
          />
        </div>
      </div>
    </div>
  );
}
