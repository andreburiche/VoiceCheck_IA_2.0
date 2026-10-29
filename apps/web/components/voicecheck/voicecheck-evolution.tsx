"use client";

import { useEffect, useState } from "react";

import { Panel, TrendChart, type TrendPoint } from "@/components/hud";
import type { VoiceCheckF0Report } from "@/lib/voicecheck-f0-analysis";

/**
 * Evolução entre análises salvas localmente (IndexedDB, mesmo banco do
 * voicecheck-devolutiva-store). Só leitura; sem dados suficientes, estado vazio.
 */

const DB_NAME = "estudio_musical_voicecheck";
const STORE = "analysis_snapshots";

type Snapshot = { createdAt: string; fingerprint: string; report: VoiceCheckF0Report; assetName?: string | null };

type Series = {
  title: string;
  unit: string;
  hint: string;
  min: number;
  max: number;
  points: TrendPoint[];
};

function readSnapshots(): Promise<Snapshot[]> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve([]);
    // Sem versão: abre a atual sem disparar upgrade (quem cria os stores é o store da devolutiva).
    const req = indexedDB.open(DB_NAME);
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.close();
        return resolve([]);
      }
      const tx = db.transaction(STORE, "readonly");
      const all = tx.objectStore(STORE).getAll();
      all.onsuccess = () => {
        resolve((all.result as Snapshot[]) ?? []);
        db.close();
      };
      all.onerror = () => {
        resolve([]);
        db.close();
      };
    };
  });
}

function label(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function buildSeries(rows: Snapshot[]): Series | null {
  const sorted = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-12);
  const tol = sorted.filter((r) => r.report?.comparison?.pitch?.within_tolerance_percent != null);
  if (tol.length >= 2) {
    return {
      title: "Afinação na tolerância",
      unit: "%",
      hint: "Análises comparadas com referência, da mais antiga para a mais recente.",
      min: 0,
      max: 100,
      points: tol.map((r) => ({
        label: label(r.createdAt),
        value: Math.round(r.report.comparison!.pitch!.within_tolerance_percent as number),
      })),
    };
  }
  const stab = sorted.filter((r) => r.report?.statistics?.stable_region_variation_cents_median != null);
  if (stab.length >= 2) {
    const values = stab.map((r) => Math.round(r.report.statistics.stable_region_variation_cents_median as number));
    return {
      title: "Estabilidade nas notas sustentadas",
      unit: "¢",
      hint: "Variação mediana em cents — quanto menor, mais estável.",
      min: 0,
      max: Math.max(50, Math.ceil(Math.max(...values) / 10) * 10),
      points: stab.map((r, i) => ({ label: label(r.createdAt), value: values[i] ?? 0 })),
    };
  }
  return null;
}

export function VoiceCheckEvolution({ refreshKey }: { refreshKey?: string | number | null }) {
  const [series, setSeries] = useState<Series | null>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    // Pequeno atraso: o snapshot da análise atual é gravado por outro componente no mesmo render.
    const t = window.setTimeout(() => {
      void readSnapshots().then((rows) => {
        if (!alive) return;
        setCount(rows.length);
        setSeries(buildSeries(rows));
      });
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [refreshKey]);

  return (
    <Panel
      title="Evolução"
      subtitle={series ? series.hint : "Compare suas análises ao longo do tempo."}
      aside={
        count != null ? (
          <span className="text-data rounded-full bg-ink/5 px-2.5 py-1 text-xs text-ink-muted">
            {count} análise{count === 1 ? "" : "s"} salva{count === 1 ? "" : "s"}
          </span>
        ) : null
      }
    >
      {series ? (
        <>
          <p className="hud-label mb-2">{series.title}</p>
          <TrendChart
            points={series.points}
            min={series.min}
            max={series.max}
            unit={series.unit}
            title={`${series.title}: ${series.points.map((p) => `${p.label} ${p.value}${series.unit}`).join(", ")}`}
          />
        </>
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-dashed border-ink/15 px-4 py-8 text-center">
          <div className="hud-grid pointer-events-none absolute inset-0" aria-hidden />
          <p className="relative text-sm text-ink">
            {count == null ? "Lendo análises salvas…" : "Ainda não há análises suficientes para a curva."}
          </p>
          <p className="relative mt-1 text-xs text-ink-muted">
            A partir da segunda análise neste navegador, a evolução aparece aqui.
          </p>
        </div>
      )}
    </Panel>
  );
}
