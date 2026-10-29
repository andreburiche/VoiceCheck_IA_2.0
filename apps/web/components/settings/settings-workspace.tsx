"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { SettingsTabs, type SettingsTabId } from "@/components/settings/settings-tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  APP_VERSION,
  applyAppearance,
  devicePreferenceAllowed,
  listAudioOutputs,
  loadAppSettings,
  probeClientAudio,
  resolveEffectiveDevice,
  saveAppSettings,
  type AppSettings,
  type ClientAudioProbe,
  type DevicePreference,
  type OutputDevice,
} from "@/lib/app-settings";
import { authApi, systemApi, usageApi } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui/skeleton";
import { friendlyError } from "@/lib/errors";

export function SettingsWorkspace() {
  const [tab, setTab] = useState<SettingsTabId>("geral");
  const [prefs, setPrefs] = useState<AppSettings>(DEFAULT_SAFE);
  const [hydrated, setHydrated] = useState(false);
  const [outputs, setOutputs] = useState<OutputDevice[]>([]);
  const [audioProbe, setAudioProbe] = useState<ClientAudioProbe | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => authApi.me(),
    retry: false,
  });
  const isAdmin = me.data?.role === "admin";
  const usage = useQuery({ queryKey: ["usage"], queryFn: () => usageApi.me(), retry: false });
  const status = useQuery({ queryKey: ["system-status"], queryFn: () => systemApi.status() });

  useEffect(() => {
    const loaded = loadAppSettings();
    setPrefs(loaded);
    applyAppearance(loaded);
    setHydrated(true);
  }, []);

  const persist = useCallback((next: AppSettings) => {
    setPrefs(next);
    saveAppSettings(next);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (tab === "audio") {
      void listAudioOutputs().then(setOutputs);
      void probeClientAudio().then(setAudioProbe);
    }
  }, [tab, hydrated]);

  async function runHardwareTest() {
    setBusy(true);
    setMsg(null);
    try {
      const [server, client] = await Promise.all([
        systemApi.hardwareTest(),
        probeClientAudio(),
      ]);
      setAudioProbe(client);
      const notes = [
        ...server.notes,
        client.baseLatencyMs != null
          ? `Latência base do browser: ${client.baseLatencyMs} ms`
          : "Latência base: não reportada pelo browser",
        client.hardwareConcurrency
          ? `Núcleos (navigator): ${client.hardwareConcurrency}`
          : "navigator.hardwareConcurrency indisponível",
      ];
      persist({
        ...prefs,
        lastHardwareTestAt: server.tested_at,
        lastHardwareTestNotes: notes,
      });
      setMsg(server.ok ? "Teste de hardware concluído." : "Teste concluiu com avisos.");
      await status.refetch();
    } catch (e) {
      setMsg(friendlyError(e, "Falha no teste de hardware"));
    } finally {
      setBusy(false);
    }
  }

  function setDevicePref(pref: DevicePreference) {
    const gate = devicePreferenceAllowed(pref, status.data?.gpu_available || status.data?.cuda_available);
    if (!gate.ok) {
      setMsg(gate.reason ?? "Opção incompatível");
      return;
    }
    persist({ ...prefs, devicePreference: pref });
    setMsg("Preferência salva neste navegador.");
  }

  async function checkUpdates() {
    setBusy(true);
    setMsg(null);
    try {
      // Sem canal remoto neste MVP local-first — ação explícita só confirma versão atual.
      const now = new Date().toISOString();
      persist({ ...prefs, lastUpdateCheckAt: now });
      setMsg(
        `Verificação manual: v${APP_VERSION} · canal ${prefs.updateChannel}. Atualizações online/assinatura de pacote indisponíveis neste build web local.`,
      );
    } finally {
      setBusy(false);
    }
  }

  const effective = resolveEffectiveDevice(
    prefs.devicePreference,
    status.data?.separation_adapter,
    status.data?.gpu_available || status.data?.cuda_available,
  );

  if (!hydrated) {
    return <PageSkeleton label="Carregando configurações…" />;
  }

  return (
    <div className="page-shell space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink md:text-[1.75rem]">Configurações</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Sua conta e as preferências deste computador.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
      <SettingsTabs current={tab} onChange={setTab} isAdmin={me.data?.role === "admin"} />
      <div className="min-w-0 space-y-5">

      {msg ? (
        <p role="status" className="rounded-xl border border-line bg-canvas-raised/80 px-3 py-2 text-sm text-accent">
          {msg}
        </p>
      ) : null}

      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="rounded-2xl border border-line bg-canvas-raised/90 p-4 shadow-panel md:p-5"
      >
        {tab === "geral" ? (
          <section className="space-y-4 text-sm">
            <h2 className="text-lg font-semibold text-ink">Geral</h2>
            <p className="text-ink-muted">
              As preferências de áudio, aparência e processamento ficam salvas neste navegador. Seus
              projetos e diagnósticos ficam na sua conta.
            </p>
            {me.data ? (
              <dl className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                <Row label="Nome" value={me.data.name} />
                <Row label="E-mail" value={me.data.email} />
                <Row label="Perfil" value={me.data.role === "admin" ? "Administrador" : "Músico"} />
              </dl>
            ) : (
              <p className="rounded-xl border border-dashed border-line px-3 py-3 text-ink-muted">
                Sem sessão ativa — modo offline/local.{" "}
                <Link href="/login" className="text-accent hover:underline">
                  Entrar
                </Link>{" "}
                só se precisar da API.
              </p>
            )}
            <dl className={cn("grid gap-3 sm:grid-cols-2 2xl:grid-cols-3", !isAdmin && "hidden")}>
              <Row
                label="Ambiente"
                value={status.data?.env ? (status.data.env === "development" ? "Desenvolvimento" : status.data.env === "production" ? "Produção" : status.data.env) : "—"}
              />
              <Row label="Processamento" value={status.data?.local_processing ? "Neste computador" : "—"} />
            </dl>
          </section>
        ) : null}

        {tab === "audio" ? (
          <section className="space-y-4 text-sm">
            <h2 className="text-lg font-semibold text-ink">Áudio</h2>
            <div>
              <Label htmlFor="out-device">Dispositivo de saída</Label>
              <select
                id="out-device"
                className="mt-1 h-10 w-full rounded-lg border border-line bg-canvas px-3 text-ink"
                value={prefs.audioOutputId}
                onChange={(e) => {
                  const id = e.target.value;
                  const label = outputs.find((o) => o.deviceId === id)?.label || "Padrão do sistema";
                  persist({ ...prefs, audioOutputId: id, audioOutputLabel: label });
                }}
              >
                <option value="">Padrão do sistema</option>
                {outputs.map((o) => (
                  <option key={o.deviceId} value={o.deviceId}>
                    {o.label}
                  </option>
                ))}
              </select>
              {!outputs.length ? (
                <p className="mt-1 text-xs text-ink-faint">
                  Lista vazia: permita microfone uma vez (alguns browsers) ou use o padrão do SO.
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="vol">Volume padrão ({Math.round(prefs.defaultVolume * 100)}%)</Label>
              <input
                id="vol"
                type="range"
                min={0}
                max={100}
                value={Math.round(prefs.defaultVolume * 100)}
                onChange={(e) => persist({ ...prefs, defaultVolume: Number(e.target.value) / 100 })}
                className="mt-2 w-full accent-[var(--accent)]"
              />
            </div>
            <dl className={cn("grid gap-2 sm:grid-cols-2 2xl:grid-cols-3", !isAdmin && "hidden")}>
              <Row
                label="Taxa de amostragem"
                value={audioProbe?.sampleRate ? `${audioProbe.sampleRate} Hz` : "—"}
                mono
              />
              <Row
                label="Latência base"
                value={
                  audioProbe?.baseLatencyMs != null ? `${audioProbe.baseLatencyMs} ms` : "Indisponível"
                }
                mono
              />
              <Row
                label="Latência de saída"
                value={
                  audioProbe?.outputLatencyMs != null
                    ? `${audioProbe.outputLatencyMs} ms`
                    : "Indisponível neste navegador"
                }
                mono
              />
              <Row label="Troca de saída de áudio" value={audioProbe?.sinkIdSupported ? "Suportada" : "Não suportada"} />
            </dl>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void probeClientAudio().then(setAudioProbe)}
            >
              Medir latência agora
            </Button>
          </section>
        ) : null}

        {tab === "processamento" ? (
          <section className="space-y-4 text-sm">
            <h2 className="text-lg font-semibold text-ink">Processamento</h2>
            <p className="text-ink-muted">
              Preferência de processador para este navegador. O processamento de fato segue a
              configuração do servidor (variável SEPARATION_ADAPTER).
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Dispositivo de inferência">
              {(["auto", "gpu", "cpu"] as DevicePreference[]).map((p) => {
                const gate = devicePreferenceAllowed(
                  p,
                  status.data?.gpu_available || status.data?.cuda_available,
                );
                const active = prefs.devicePreference === p;
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={!gate.ok}
                    title={gate.reason}
                    onClick={() => setDevicePref(p)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-sm font-medium",
                      active ? "border-accent bg-accent/15 text-accent" : "border-line text-ink-muted",
                      !gate.ok && "cursor-not-allowed opacity-40",
                    )}
                    aria-pressed={active}
                  >
                    {p === "auto" ? "Automático" : p.toUpperCase()}
                  </button>
                );
              })}
            </div>
            <dl className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              <Row label="Separação no servidor" value={status.data?.separation_adapter ?? "—"} mono />
              <Row label="Em uso" value={`${effective.effective} · ${effective.note}`} />
              <Row
                label="Modo de teste (faixas em silêncio)"
                value={status.data?.using_contract_silence ? "Ativo" : "Desligado"}
              />
            </dl>
            <Link href="/models" className="text-sm text-accent hover:underline">
              Abrir Modelos de IA
            </Link>
          </section>
        ) : null}

        {tab === "hardware" ? (
          <section className="space-y-4 text-sm">
            <h2 className="text-lg font-semibold text-ink">Hardware</h2>
            <dl className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              <Row label="CPU (servidor)" value={`${status.data?.cpu_count ?? "—"} núcleos`} />
              <Row
                label="RAM (servidor)"
                value={status.data?.ram_total_bytes ? formatBytes(status.data.ram_total_bytes) : "Não medida"}
              />
              <Row
                label="GPU"
                value={
                  status.data?.gpu_name ||
                  (status.data?.gpu_available ? "Detectada" : "Não detectada")
                }
              />
              <Row
                label="CUDA"
                value={
                  status.data?.cuda_available
                    ? `Sim · driver ${status.data.cuda_driver ?? "—"}`
                    : status.data?.cuda_probe_error || "Não"
                }
              />
              <Row
                label="MPS / Metal"
                value={
                  status.data?.mps_available
                    ? "Disponível (macOS)"
                    : "Não disponível"
                }
              />
              <Row label="Plataforma" value={status.data?.platform ?? "—"} mono />
              <Row
                label="Browser · núcleos"
                value={audioProbe?.hardwareConcurrency?.toString() ?? "—"}
              />
              <Row
                label="Browser · RAM approx."
                value={
                  audioProbe?.deviceMemoryGb != null ? `~${audioProbe.deviceMemoryGb} GB` : "Indisponível"
                }
              />
            </dl>
            <Button type="button" disabled={busy} onClick={() => void runHardwareTest()}>
              {busy ? "Testando…" : "Rodar teste real"}
            </Button>
            {prefs.lastHardwareTestAt ? (
              <div className="rounded-xl border border-line bg-canvas/50 p-3">
                <p className="text-xs text-ink-faint">
                  Último teste: {new Date(prefs.lastHardwareTestAt).toLocaleString("pt-BR")}
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-ink-muted">
                  {prefs.lastHardwareTestNotes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-ink-faint">Nenhum teste executado ainda neste dispositivo.</p>
            )}
          </section>
        ) : null}

        {tab === "armazenamento" ? (
          <section className="space-y-4 text-sm">
            <h2 className="text-lg font-semibold text-ink">Armazenamento</h2>
            <dl className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {isAdmin ? (
                <>
                  <Row label="Armazenamento do servidor" value={status.data?.storage_backend ?? "—"} mono />
                  <Row label="Pasta" value={status.data?.storage_path ?? "—"} mono />
                  <Row label="Disco total" value={formatBytes(status.data?.disk_total_bytes)} />
                  <Row label="Disco livre" value={formatBytes(status.data?.disk_free_bytes)} />
                  <Row label="Disco usado" value={formatBytes(status.data?.disk_used_bytes)} />
                </>
              ) : null}
              <Row
                label="Seus áudios (uso do plano)"
                value={
                  usage.data
                    ? `${formatBytes(usage.data.storage_bytes_used)}${
                        usage.data.max_storage_mb ? ` / ${usage.data.max_storage_mb} MB` : ""
                      }`
                    : "Faça login para ver cota"
                }
              />
            </dl>
            {status.data?.disk_total_bytes && status.data.disk_used_bytes != null ? (
              <div
                className="h-2 overflow-hidden rounded-full bg-canvas"
                role="meter"
                aria-valuenow={Math.round(
                  (status.data.disk_used_bytes / status.data.disk_total_bytes) * 100,
                )}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Uso de disco"
              >
                <div
                  className="h-full bg-accent"
                  style={{
                    width: `${Math.min(
                      100,
                      (status.data.disk_used_bytes / status.data.disk_total_bytes) * 100,
                    )}%`,
                  }}
                />
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === "aparencia" ? (
          <section className="space-y-4 text-sm">
            <h2 className="text-lg font-semibold text-ink">Aparência</h2>
            <p className="text-ink-muted">
              Tema escuro premium é o único tema do produto (#10131D / #1B2231). Preferências visuais
              abaixo são locais.
            </p>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked disabled readOnly />
              Tema escuro (obrigatório)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs.reducedMotion}
                onChange={(e) => persist({ ...prefs, reducedMotion: e.target.checked })}
              />
              Reduzir movimento
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs.compactUi}
                onChange={(e) => persist({ ...prefs, compactUi: e.target.checked })}
              />
              Interface compacta
            </label>
          </section>
        ) : null}

        {tab === "atualizacoes" ? (
          <section className="space-y-4 text-sm">
            <h2 className="text-lg font-semibold text-ink">Atualizações</h2>
            <dl className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              <Row label="Versão do app" value={APP_VERSION} mono />
              <Row label="Versão API" value={status.data?.app_version ?? "—"} mono />
              <Row label="Canal" value={prefs.updateChannel} />
              <Row label="Assinatura de pacote" value="Indisponível (build web)" />
            </dl>
            <div>
              <Label htmlFor="channel">Canal</Label>
              <select
                id="channel"
                className="mt-1 h-10 rounded-lg border border-line bg-canvas px-3 text-ink"
                value={prefs.updateChannel}
                onChange={(e) =>
                  persist({
                    ...prefs,
                    updateChannel: e.target.value as AppSettings["updateChannel"],
                  })
                }
              >
                <option value="stable">stable</option>
                <option value="beta">beta</option>
              </select>
            </div>
            <Button type="button" disabled={busy} onClick={() => void checkUpdates()}>
              Verificar atualizações
            </Button>
            {prefs.lastUpdateCheckAt ? (
              <p className="text-xs text-ink-faint">
                Última verificação: {new Date(prefs.lastUpdateCheckAt).toLocaleString("pt-BR")}
              </p>
            ) : null}
          </section>
        ) : null}

        {tab === "sobre" ? (
          <section className="space-y-4 text-sm">
            <h2 className="text-lg font-semibold text-ink">Sobre</h2>
            <p className="text-ink-muted">
              VoiceCheck IA — análise vocal inteligente: separação de faixas com IA (Demucs, de código
              aberto), diagnóstico vocal nota por nota, estúdio e sala de treino.
            </p>
            <dl className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              <Row label="Produto" value="VoiceCheck IA" />
              <Row label="Versão" value={APP_VERSION} mono />
            </dl>
            <p className="text-xs text-ink-muted">
              Dúvidas sobre os números e as ferramentas?{" "}
              <Link href="/ajuda" className="text-accent hover:underline">
                Veja a Ajuda
              </Link>
              .
            </p>
          </section>
        ) : null}
      </div>
      </div>
      </div>
    </div>
  );
}

const DEFAULT_SAFE: AppSettings = {
  devicePreference: "auto",
  audioOutputId: "",
  audioOutputLabel: "Padrão do sistema",
  defaultVolume: 0.85,
  reducedMotion: false,
  compactUi: false,
  showWaveformGlow: false,
  updateChannel: "stable",
  lastUpdateCheckAt: null,
  lastHardwareTestAt: null,
  lastHardwareTestNotes: [],
};

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-ink-faint">{label}</dt>
      <dd className={cn("mt-0.5 text-ink", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}
