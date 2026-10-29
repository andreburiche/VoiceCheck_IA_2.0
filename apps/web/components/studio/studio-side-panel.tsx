"use client";

import { Button } from "@/components/ui/button";
import type { EqState } from "@/lib/eq";
import type { FxState } from "@/lib/fx";
import { formatClock } from "@/lib/stem-theme";

type Marker = {
  id: string;
  position_ms: number;
  label: string;
  color: string | null;
};

type StudioSidePanelProps = {
  open: boolean;
  master: number;
  onMaster: (v: number) => void;
  eq: EqState;
  onEqChange: (eq: EqState) => void;
  fx: FxState;
  onFxChange: (fx: FxState) => void;
  markers: Marker[];
  onSeekMarker: (sec: number) => void;
  onDeleteMarker?: (id: string) => void;
  loopOn: boolean;
  loopA: number;
  loopB: number;
  onSaveLoop?: () => void;
  saveLoopPending?: boolean;
  jobOptions?: { id: string; label: string }[];
  selectedJobId?: string | null;
  onSelectJob?: (jobId: string | null) => void;
};

export function StudioSidePanel({
  open,
  master,
  onMaster,
  eq,
  onEqChange,
  fx,
  onFxChange,
  markers,
  onSeekMarker,
  onDeleteMarker,
  loopOn,
  loopA,
  loopB,
  onSaveLoop,
  saveLoopPending,
  jobOptions,
  selectedJobId,
  onSelectJob,
}: StudioSidePanelProps) {
  if (!open) return null;

  function setBandGain(index: number, gainDb: number) {
    const bands = eq.bands.map((b, i) => (i === index ? { ...b, gainDb } : b));
    onEqChange({ ...eq, bands });
  }

  function resetEq() {
    onEqChange({
      enabled: true,
      bands: eq.bands.map((b) => ({ ...b, gainDb: 0 })),
    });
  }

  return (
    <aside
      className="flex w-full shrink-0 flex-col gap-4 border-t border-line bg-canvas-raised/90 p-4 lg:w-72 lg:border-l lg:border-t-0"
      aria-label="Detalhes do estúdio"
    >
      {jobOptions && jobOptions.length > 0 && onSelectJob ? (
        <div>
          <h2 className="text-sm font-semibold text-ink">Separação (A/B)</h2>
          <p className="mt-1 text-xs text-ink-faint">Compare resultados de modelos no mesmo projeto.</p>
          <select
            className="mt-2 h-9 w-full rounded-lg border border-line bg-canvas px-2 text-xs text-ink"
            value={selectedJobId ?? ""}
            onChange={(e) => onSelectJob(e.target.value || null)}
            aria-label="Separação usada no estúdio"
          >
            <option value="">Mais recente por faixa</option>
            {jobOptions.map((j) => (
              <option key={j.id} value={j.id}>
                {j.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <h2 className="text-sm font-semibold text-ink">Master</h2>
        <label className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
          Ganho
          <input
            type="range"
            min={0}
            max={2}
            step={0.01}
            value={master}
            className="flex-1 accent-[var(--accent)]"
            onChange={(e) => onMaster(Number(e.target.value))}
          />
          <span className="font-mono text-ink">{master.toFixed(2)}</span>
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Equalizador</h2>
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={eq.enabled}
              onChange={(e) => onEqChange({ ...eq, enabled: e.target.checked })}
            />
            Ativo
          </label>
        </div>
        <ul className={`mt-2 space-y-2 ${eq.enabled ? "" : "opacity-40"}`}>
          {eq.bands.map((band, i) => (
            <li key={band.id}>
              <label className="flex items-center gap-2 text-xs text-ink-muted">
                <span className="w-20 shrink-0 truncate" title={`${band.frequency} Hz`}>
                  {band.label}
                </span>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={band.gainDb}
                  disabled={!eq.enabled}
                  className="flex-1 accent-[var(--violet)]"
                  aria-label={`EQ ${band.label}`}
                  onChange={(e) => setBandGain(i, Number(e.target.value))}
                />
                <span className="w-8 font-mono text-ink">
                  {band.gainDb > 0 ? `+${band.gainDb}` : band.gainDb}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={resetEq}>
          Zerar EQ
        </Button>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Efeitos</h2>
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={fx.enabled}
              onChange={(e) => onFxChange({ ...fx, enabled: e.target.checked })}
            />
            Ativo
          </label>
        </div>
        <div className={`mt-2 space-y-3 text-xs text-ink-muted ${fx.enabled ? "" : "opacity-40"}`}>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={fx.compressor.enabled}
              disabled={!fx.enabled}
              onChange={(e) =>
                onFxChange({
                  ...fx,
                  compressor: { ...fx.compressor, enabled: e.target.checked },
                })
              }
            />
            Compressor
          </label>
          {fx.compressor.enabled ? (
            <label className="flex items-center gap-2">
              Threshold
              <input
                type="range"
                min={-48}
                max={0}
                step={1}
                value={fx.compressor.threshold}
                disabled={!fx.enabled}
                className="flex-1 accent-[var(--violet)]"
                onChange={(e) =>
                  onFxChange({
                    ...fx,
                    compressor: { ...fx.compressor, threshold: Number(e.target.value) },
                  })
                }
              />
              <span className="w-8 font-mono text-ink">{fx.compressor.threshold}</span>
            </label>
          ) : null}

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={fx.delay.enabled}
              disabled={!fx.enabled}
              onChange={(e) =>
                onFxChange({ ...fx, delay: { ...fx.delay, enabled: e.target.checked } })
              }
            />
            Delay
          </label>
          {fx.delay.enabled ? (
            <>
              <label className="flex items-center gap-2">
                Tempo
                <input
                  type="range"
                  min={0.05}
                  max={0.8}
                  step={0.01}
                  value={fx.delay.timeSec}
                  disabled={!fx.enabled}
                  className="flex-1 accent-[var(--accent)]"
                  onChange={(e) =>
                    onFxChange({
                      ...fx,
                      delay: { ...fx.delay, timeSec: Number(e.target.value) },
                    })
                  }
                />
                <span className="w-10 font-mono text-ink">{fx.delay.timeSec.toFixed(2)}s</span>
              </label>
              <label className="flex items-center gap-2">
                Mix
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={fx.delay.mix}
                  disabled={!fx.enabled}
                  className="flex-1 accent-[var(--accent)]"
                  onChange={(e) =>
                    onFxChange({
                      ...fx,
                      delay: { ...fx.delay, mix: Number(e.target.value) },
                    })
                  }
                />
              </label>
            </>
          ) : null}

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={fx.reverb.enabled}
              disabled={!fx.enabled}
              onChange={(e) =>
                onFxChange({ ...fx, reverb: { ...fx.reverb, enabled: e.target.checked } })
              }
            />
            Reverb
          </label>
          {fx.reverb.enabled ? (
            <>
              <label className="flex items-center gap-2">
                Mix
                <input
                  type="range"
                  min={0}
                  max={0.7}
                  step={0.01}
                  value={fx.reverb.mix}
                  disabled={!fx.enabled}
                  className="flex-1 accent-[var(--violet)]"
                  onChange={(e) =>
                    onFxChange({
                      ...fx,
                      reverb: { ...fx.reverb, mix: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label className="flex items-center gap-2">
                Decay
                <input
                  type="range"
                  min={0.2}
                  max={0.95}
                  step={0.01}
                  value={fx.reverb.decay}
                  disabled={!fx.enabled}
                  className="flex-1 accent-[var(--violet)]"
                  onChange={(e) =>
                    onFxChange({
                      ...fx,
                      reverb: { ...fx.reverb, decay: Number(e.target.value) },
                    })
                  }
                />
              </label>
            </>
          ) : null}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-ink">Loop A–B</h2>
        <p className="mt-1 text-xs text-ink-muted">
          {loopOn ? "Ativo" : "Inativo"} · {loopA.toFixed(2)}s → {loopB.toFixed(2)}s
        </p>
        {onSaveLoop ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-2"
            disabled={saveLoopPending || loopB <= loopA}
            onClick={onSaveLoop}
          >
            {saveLoopPending ? "Salvando…" : "Salvar região"}
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        <h2 className="text-sm font-semibold text-ink">Marcadores</h2>
        {markers.length === 0 ? (
          <p className="mt-2 text-xs text-ink-faint">Nenhum marcador. Use o botão na barra inferior.</p>
        ) : (
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {markers.map((m) => (
              <li key={m.id} className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-ink hover:bg-canvas-overlay"
                  onClick={() => onSeekMarker(m.position_ms / 1000)}
                >
                  <span className="truncate">{m.label}</span>
                  <span className="font-mono text-ink-faint">{formatClock(m.position_ms / 1000)}</span>
                </button>
                {onDeleteMarker ? (
                  <button
                    type="button"
                    className="shrink-0 rounded px-1.5 py-1 text-xs text-ink-faint hover:bg-signal-err/15 hover:text-signal-err"
                    aria-label={`Remover marcador ${m.label}`}
                    onClick={() => onDeleteMarker(m.id)}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
