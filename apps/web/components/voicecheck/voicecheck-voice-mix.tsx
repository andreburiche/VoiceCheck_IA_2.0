"use client";

import { Download, Pause, Play, Power, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useObjectUrl } from "@/lib/use-object-url";
import { cn } from "@/lib/utils";
import {
  VOICE_MIX_PRESETS,
  buildVoiceMixChain,
  defaultVoiceMix,
  renderVoiceMix,
  type VoiceMixChain,
  type VoiceMixState,
} from "@/lib/voice-mix";
import { friendlyError } from "@/lib/errors";

type Source = "aprimorada" | "voz";

function same(a: VoiceMixState, b: VoiceMixState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Equalização e efeitos (reverb, delay, chorus…) na voz, com prévia ao vivo e
 * exportação em WAV. A gravação e a análise não mudam — é só para ouvir e baixar.
 */
export function VoiceCheckVoiceMix({
  voiceWav,
  enhancedWav,
  value,
  assetName,
  onChange,
}: {
  /** Voz analisada (já isolada quando possível). */
  voiceWav: Blob | null;
  /** Versão aprimorada com IA, se existir. */
  enhancedWav: Blob | null;
  value: VoiceMixState | null;
  assetName?: string | null;
  onChange: (s: VoiceMixState) => void;
}) {
  const [state, setState] = useState<VoiceMixState>(value ?? VOICE_MIX_PRESETS[0]!.state);
  const [source, setSource] = useState<Source>(enhancedWav ? "aprimorada" : "voz");
  const [playing, setPlaying] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const chainRef = useRef<VoiceMixChain | null>(null);
  /** Só salva depois que a pessoa mexe (abrir não conta como edição). */
  const touched = useRef(false);
  const edit = (fn: (s: VoiceMixState) => VoiceMixState) => {
    touched.current = true;
    setState(fn);
  };

  useEffect(() => {
    if (value && !same(value, state)) setState(value);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enhancedWav && source === "aprimorada") setSource("voz");
  }, [enhancedWav, source]);

  const blob = source === "aprimorada" && enhancedWav ? enhancedWav : voiceWav;
  const url = useObjectUrl(blob);

  // Prévia ao vivo: a mesma cadeia da exportação, ligada ao player
  useEffect(() => {
    chainRef.current?.update(state);
  }, [state]);

  useEffect(
    () => () => {
      chainRef.current?.dispose();
      void ctxRef.current?.close().catch(() => undefined);
    },
    [],
  );

  // Salva os ajustes com o diagnóstico (debounce)
  useEffect(() => {
    if (!touched.current || (value && same(value, state))) return;
    const t = window.setTimeout(() => onChange(state), 600);
    return () => window.clearTimeout(t);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  function ensureGraph() {
    const el = audioRef.current;
    if (!el || ctxRef.current) return;
    const ctx = new AudioContext();
    const src = ctx.createMediaElementSource(el);
    const chain = buildVoiceMixChain(ctx, state);
    src.connect(chain.input);
    chain.output.connect(ctx.destination);
    ctxRef.current = ctx;
    chainRef.current = chain;
  }

  async function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    ensureGraph();
    await ctxRef.current?.resume().catch(() => undefined);
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  }

  function patch<K extends keyof VoiceMixState>(key: K, v: Partial<VoiceMixState[K]> | VoiceMixState[K]) {
    edit((s) => {
      const cur = s[key];
      const next =
        typeof cur === "object" && cur !== null && !Array.isArray(cur)
          ? { ...(cur as object), ...(v as object) }
          : v;
      return { ...s, [key]: next } as VoiceMixState;
    });
  }

  function setBand(id: string, gainDb: number) {
    edit((s) => ({ ...s, eq: s.eq.map((b) => (b.id === id ? { ...b, gainDb } : b)) }));
  }

  async function download() {
    if (!blob) return;
    setRendering(true);
    setError(null);
    try {
      const wav = await renderVoiceMix(blob, state);
      const a = document.createElement("a");
      const href = URL.createObjectURL(wav);
      a.href = href;
      const label = VOICE_MIX_PRESETS.find((p) => same(p.state, state))?.label ?? "efeitos";
      a.download = `${(assetName || "voz").replace(/\.[^.]+$/, "")} (${label.toLowerCase()}).wav`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 3000);
    } catch (e) {
      setError(friendlyError(e, "Não foi possível exportar"));
    } finally {
      setRendering(false);
    }
  }

  const presetId = VOICE_MIX_PRESETS.find((p) => same(p.state, state))?.id;

  if (!voiceWav && !enhancedWav) return null;

  return (
    <section className="panel-glass space-y-5 rounded-2xl p-4 md:p-5" aria-labelledby="vc-mix-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="hud-label flex items-center gap-2 text-accent">
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            Mixagem da voz
          </p>
          <h2 id="vc-mix-title" className="mt-1 font-display text-xl font-semibold text-ink">
            Equalização e efeitos
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Dê acabamento à voz com equalizador, compressor, reverb, delay e chorus. Ouça ao vivo
            enquanto ajusta e baixe o resultado. A análise não muda.
          </p>
        </div>
      </div>

      {/* Fonte + presets */}
      <div className="flex flex-wrap items-center gap-3">
        {enhancedWav ? (
          <div className="inline-flex rounded-xl bg-canvas-raised p-1 ring-1 ring-inset ring-ink/10" role="group" aria-label="Aplicar em">
            {(
              [
                ["aprimorada", "Versão aprimorada"],
                ["voz", "Voz analisada"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={source === v}
                onClick={() => {
                  audioRef.current?.pause();
                  setSource(v);
                }}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  source === v ? "bg-accent text-canvas" : "text-ink-muted hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="space-y-2">
        <p className="hud-label">Estilo pronto</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Estilos prontos">
          {VOICE_MIX_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={presetId === p.id}
              title={p.hint}
              onClick={() => edit(() => structuredClone(p.state))}
              className={cn(
                "rounded-xl px-3 py-2 text-left text-sm ring-1 ring-inset transition-colors",
                presetId === p.id
                  ? "bg-accent/15 text-accent ring-accent/40"
                  : "bg-canvas-raised/60 text-ink-muted ring-ink/10 hover:text-ink",
              )}
            >
              <span className="font-medium">{p.label}</span>
              <span className="mt-0.5 block text-xs text-ink-faint">{p.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Player com A/B (efeitos ligados/desligados) */}
      <div className="space-y-2 rounded-2xl bg-ink/[0.03] p-3 ring-1 ring-inset ring-ink/10">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => void togglePlay()} disabled={!url}>
            {playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
            {playing ? "Pausar" : "Ouvir com efeitos"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={state.enabled ? "secondary" : "default"}
            aria-pressed={!state.enabled}
            onClick={() => patch("enabled", !state.enabled)}
            title="Compare com a voz sem efeitos"
          >
            <Power className="h-3.5 w-3.5" aria-hidden />
            {state.enabled ? "Efeitos ligados" : "Efeitos desligados"}
          </Button>
          <span className="text-xs text-ink-faint">Ligue e desligue enquanto ouve para comparar.</span>
        </div>
        {url ? (
          <audio
            ref={audioRef}
            src={url}
            controls
            preload="metadata"
            className="w-full"
            onPlay={() => {
              ensureGraph();
              void ctxRef.current?.resume();
              setPlaying(true);
            }}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        ) : null}
      </div>

      <div className={cn("grid gap-4 lg:grid-cols-2", !state.enabled && "opacity-60")}>
        <Group title="Equalização">
          <div className="grid grid-cols-5 gap-2">
            {state.eq.map((b) => (
              <VSlider
                key={b.id}
                id={`mix-eq-${b.id}`}
                label={b.label}
                sub={b.frequency >= 1000 ? `${b.frequency / 1000}k` : `${b.frequency}`}
                value={b.gainDb}
                min={-12}
                max={12}
                step={0.5}
                format={(v) => `${v > 0 ? "+" : ""}${v} dB`}
                onChange={(v) => setBand(b.id, v)}
              />
            ))}
          </div>
          <Range
            id="mix-hp"
            label="Cortar graves abaixo de"
            value={state.highpassHz}
            min={0}
            max={400}
            step={10}
            format={(v) => (v === 0 ? "desligado" : `${v} Hz`)}
            onChange={(v) => patch("highpassHz", v)}
          />
        </Group>

        <Group title="Dinâmica e cor">
          <Switch id="mix-comp" label="Compressor" checked={state.compressor.enabled} onChange={(v) => patch("compressor", { enabled: v })} />
          <Range id="mix-comp-a" label="Intensidade" value={Math.round(state.compressor.amount * 100)} min={0} max={100} step={5} format={(v) => `${v}%`} disabled={!state.compressor.enabled} onChange={(v) => patch("compressor", { amount: v / 100 })} hint="Deixa o volume mais constante e a voz mais à frente." />
          <Switch id="mix-sat" label="Saturação" checked={state.saturation.enabled} onChange={(v) => patch("saturation", { enabled: v })} />
          <Range id="mix-sat-d" label="Calor / distorção" value={Math.round(state.saturation.drive * 100)} min={0} max={100} step={5} format={(v) => `${v}%`} disabled={!state.saturation.enabled} onChange={(v) => patch("saturation", { drive: v / 100 })} />
        </Group>

        <Group title="Reverb (ambiente)">
          <Switch id="mix-rev" label="Reverb" checked={state.reverb.enabled} onChange={(v) => patch("reverb", { enabled: v })} />
          <Range id="mix-rev-mix" label="Quantidade" value={Math.round(state.reverb.mix * 100)} min={0} max={100} step={1} format={(v) => `${v}%`} disabled={!state.reverb.enabled} onChange={(v) => patch("reverb", { mix: v / 100 })} />
          <Range id="mix-rev-size" label="Tamanho do ambiente" value={state.reverb.sizeSec} min={0.3} max={6} step={0.1} format={(v) => `${v.toFixed(1)} s`} disabled={!state.reverb.enabled} onChange={(v) => patch("reverb", { sizeSec: v })} hint="Sala pequena ↔ catedral." />
          <Range id="mix-rev-decay" label="Cauda" value={Math.round(state.reverb.decay * 100)} min={20} max={95} step={1} format={(v) => `${v}%`} disabled={!state.reverb.enabled} onChange={(v) => patch("reverb", { decay: v / 100 })} />
          <Range id="mix-rev-pre" label="Pré-delay" value={state.reverb.preDelayMs} min={0} max={150} step={5} format={(v) => `${v} ms`} disabled={!state.reverb.enabled} onChange={(v) => patch("reverb", { preDelayMs: v })} hint="Separa a voz do ambiente (mais clareza)." />
          <Range id="mix-rev-tone" label="Brilho do reverb" value={Math.round(state.reverb.tone * 100)} min={0} max={100} step={5} format={(v) => `${v}%`} disabled={!state.reverb.enabled} onChange={(v) => patch("reverb", { tone: v / 100 })} />
        </Group>

        <Group title="Delay (eco)">
          <Switch id="mix-del" label="Delay" checked={state.delay.enabled} onChange={(v) => patch("delay", { enabled: v })} />
          <Range id="mix-del-mix" label="Quantidade" value={Math.round(state.delay.mix * 100)} min={0} max={100} step={1} format={(v) => `${v}%`} disabled={!state.delay.enabled} onChange={(v) => patch("delay", { mix: v / 100 })} />
          <Range id="mix-del-time" label="Tempo" value={state.delay.timeMs} min={40} max={1000} step={10} format={(v) => `${v} ms`} disabled={!state.delay.enabled} onChange={(v) => patch("delay", { timeMs: v })} />
          <Range id="mix-del-fb" label="Repetições" value={Math.round(state.delay.feedback * 100)} min={0} max={85} step={1} format={(v) => `${v}%`} disabled={!state.delay.enabled} onChange={(v) => patch("delay", { feedback: v / 100 })} />
          <Switch id="mix-del-pp" label="Alternar esquerda/direita (ping-pong)" checked={state.delay.pingPong} disabled={!state.delay.enabled} onChange={(v) => patch("delay", { pingPong: v })} />
        </Group>

        <Group title="Chorus (dobra)">
          <Switch id="mix-cho" label="Chorus" checked={state.chorus.enabled} onChange={(v) => patch("chorus", { enabled: v })} />
          <Range id="mix-cho-mix" label="Quantidade" value={Math.round(state.chorus.mix * 100)} min={0} max={100} step={1} format={(v) => `${v}%`} disabled={!state.chorus.enabled} onChange={(v) => patch("chorus", { mix: v / 100 })} />
          <Range id="mix-cho-depth" label="Profundidade" value={Math.round(state.chorus.depth * 100)} min={0} max={100} step={5} format={(v) => `${v}%`} disabled={!state.chorus.enabled} onChange={(v) => patch("chorus", { depth: v / 100 })} />
          <Range id="mix-cho-rate" label="Velocidade" value={state.chorus.rateHz} min={0.1} max={5} step={0.1} format={(v) => `${v.toFixed(1)} Hz`} disabled={!state.chorus.enabled} onChange={(v) => patch("chorus", { rateHz: v })} />
        </Group>

        <Group title="Estéreo e volume">
          <Range id="mix-width" label="Abertura estéreo" value={Math.round(state.width * 100)} min={0} max={100} step={5} format={(v) => (v === 0 ? "mono" : `${v}%`)} onChange={(v) => patch("width", v / 100)} />
          <Range id="mix-out" label="Volume de saída" value={state.outputDb} min={-12} max={12} step={0.5} format={(v) => `${v > 0 ? "+" : ""}${v} dB`} onChange={(v) => patch("outputDb", v)} hint="Um limitador evita distorção no final." />
        </Group>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void download()} disabled={!blob || rendering}>
          <Download className="h-4 w-4" aria-hidden />
          {rendering ? "Gerando WAV…" : "Baixar com efeitos (WAV)"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => edit(() => defaultVoiceMix())}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          Zerar ajustes
        </Button>
        <span className="text-xs text-ink-faint">Os ajustes ficam salvos com este diagnóstico.</span>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-signal-err">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-2xl bg-ink/[0.03] p-4 ring-1 ring-inset ring-ink/10">
      <legend className="hud-label px-1">{title}</legend>
      {children}
    </fieldset>
  );
}

function Switch({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-center gap-2 text-sm text-ink", disabled && "opacity-50")}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--accent)]"
      />
      {label}
    </label>
  );
}

function Range({
  id,
  label,
  value,
  min,
  max,
  step,
  format,
  hint,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  hint?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className={cn("space-y-1", disabled && "opacity-50")}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-xs text-ink-muted">
          {label}
        </Label>
        <span className="text-data text-xs text-ink">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-3 w-full accent-[var(--accent)]"
      />
      {hint ? <p className="text-xs text-ink-faint">{hint}</p> : null}
    </div>
  );
}

function VSlider({
  id,
  label,
  sub,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  id: string;
  label: string;
  sub: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <span className="text-data text-xs text-ink">{format(value)}</span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(0)}
        aria-label={`${label} (${sub} Hz)`}
        className="h-28 w-6 accent-[var(--accent)] [writing-mode:vertical-lr] [direction:rtl]"
        title="Duplo clique zera"
      />
      <label htmlFor={id} className="truncate text-center text-xs text-ink-muted">
        {label}
      </label>
      <span className="text-data text-xs text-ink-faint">{sub} Hz</span>
    </div>
  );
}
