"use client";

import { useEffect, useState } from "react";

import { Label } from "@/components/ui/label";
import {
  getPracticeLatencyMs,
  setPracticeLatencyMs,
} from "@/lib/practice-latency";
import { cn } from "@/lib/utils";

type Props = {
  deviceId: string;
  onDeviceIdChange: (id: string) => void;
  /** Analyser ativo durante gravação/monitor. */
  analyser: AnalyserNode | null;
  monitoring: boolean;
  disabled?: boolean;
};

/**
 * Dispositivo de entrada, nível, clipping e calibração de latência (local).
 */
export function MicInputControls({
  deviceId,
  onDeviceIdChange,
  analyser,
  monitoring,
  disabled,
}: Props) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [level, setLevel] = useState(0);
  const [clipping, setClipping] = useState(false);
  const [latencyMs, setLatency] = useState(0);

  useEffect(() => {
    setLatency(getPracticeLatencyMs());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setDevices(list.filter((d) => d.kind === "audioinput"));
      } catch {
        /* ignore */
      }
    }
    void load();
    const onChange = () => void load();
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
    };
  }, [monitoring]);

  useEffect(() => {
    if (!monitoring || !analyser) {
      setLevel(0);
      setClipping(false);
      return;
    }
    const data = new Float32Array(analyser.fftSize);
    let raf = 0;
    let clipHold = 0;
    const tick = () => {
      analyser.getFloatTimeDomainData(data);
      let peak = 0;
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i] ?? 0);
        peak = Math.max(peak, v);
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setLevel(Math.min(1, rms * 2.8));
      if (peak >= 0.98) clipHold = 24;
      else if (clipHold > 0) clipHold -= 1;
      setClipping(clipHold > 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyser, monitoring]);

  return (
    <div className="space-y-3 rounded-2xl border border-line/60 bg-canvas/40 px-3 py-3">
      <div className="space-y-1.5">
        <Label htmlFor="mic-device" className="text-xs text-ink-faint">
          Microfone
        </Label>
        <select
          id="mic-device"
          className="h-9 w-full rounded-lg border border-line bg-canvas-raised px-2 text-sm text-ink disabled:opacity-50"
          value={deviceId}
          disabled={disabled || monitoring}
          onChange={(e) => onDeviceIdChange(e.target.value)}
        >
          <option value="">Padrão do sistema</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Entrada ${d.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
        {monitoring ? (
          <p className="text-xs text-ink-faint">Troque o dispositivo com a gravação parada.</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs text-ink-faint">Nível de entrada</Label>
          {clipping ? (
            <span className="text-xs font-semibold text-signal-err">
              Clipping
            </span>
          ) : (
            <span className="font-mono text-xs text-ink-faint">
              {monitoring ? `${Math.round(level * 100)}%` : "—"}
            </span>
          )}
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-canvas-overlay"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(level * 100)}
          aria-label="Nível do microfone"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-75",
              clipping ? "bg-signal-err" : level > 0.7 ? "bg-signal-warn" : "bg-accent",
            )}
            style={{ width: `${Math.round(level * 100)}%` }}
          />
        </div>
        {clipping ? (
          <p className="text-xs text-signal-err">
            Sinal saturando — afaste-se do mic ou baixe o ganho do sistema.
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mic-latency" className="text-xs text-ink-faint">
          Calibração de latência {latencyMs > 0 ? `+${latencyMs}` : latencyMs} ms
        </Label>
        <input
          id="mic-latency"
          type="range"
          min={-300}
          max={300}
          step={10}
          value={latencyMs}
          disabled={disabled}
          className="h-3 w-full accent-[var(--accent)]"
          onChange={(e) => {
            const v = Number(e.target.value);
            setLatency(v);
            setPracticeLatencyMs(v);
          }}
        />
        <p className="text-xs leading-snug text-ink-faint">
          Ajusta o alinhamento ensaio ↔ base na reprodução. Prefira fones para evitar vazamento do
          playback no microfone. Áudio permanece só neste dispositivo.
        </p>
      </div>
    </div>
  );
}
