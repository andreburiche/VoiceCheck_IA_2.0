/**
 * Só em desenvolvimento: o navegador fala com a API pelo proxy /__api do próprio
 * Next (ver next.config.ts), no mesmo endereço da página. Assim o cookie de sessão
 * funciona tanto em http://localhost:3000 quanto em http://127.0.0.1:3000 — com a
 * API em outra origem (127.0.0.1:8010), abrir o site por "localhost" virava
 * requisição entre sites e o navegador não mandava o cookie (login não entrava).
 * Para falar direto com NEXT_PUBLIC_API_URL: localStorage "dev_api_proxy" = "0".
 * Em produção é ignorado.
 */
function resolveApiUrl(): string {
  const fallback = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return fallback;
  try {
    return window.localStorage.getItem("dev_api_proxy") === "0" ? fallback : "/__api";
  } catch {
    return "/__api";
  }
}

export const API_URL = resolveApiUrl();

/**
 * Com o proxy de desenvolvimento ativo, links absolutos da própria API (ex.: áudio em
 * http://127.0.0.1:8010/...) passam pelo /__api também. Fora disso devolve a URL intacta.
 */
export function viaDevProxy(url: string): string {
  if (API_URL !== "/__api") return url;
  try {
    const u = new URL(url);
    if (/^(localhost|127\.0\.0\.1|api)$/.test(u.hostname)) return `/__api${u.pathname}${u.search}`;
  } catch {
    /* URL relativa: mantém */
  }
  return url;
}

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

/** fonoaudiologo (acessa a avaliação clínica) | professor_musica | musico */
export type PerfilProfissional = "fonoaudiologo" | "professor_musica" | "musico";

/** Dados de Meu perfil, usados nos documentos clínicos e nos relatórios de música. */
export type PerfilDados = {
  registro?: string;
  especialidade?: string;
  instituicao?: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  apresentacao?: string;
};

export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  email_verified_at: string | null;
  created_at: string;
  perfil?: PerfilProfissional | null;
  perfil_dados?: PerfilDados | null;
  tem_foto?: boolean;
  /** pode abrir a avaliação clínica (fonoaudiólogo ou administrador) */
  acesso_clinico?: boolean;
  /** Quando aceitou a Política de Privacidade (null = ainda não aceitou). */
  privacidade_aceita_em?: string | null;
  privacidade_versao?: string | null;
  /** Conferência do CRFa pelo administrador: pendente | aprovado | recusado (null = não pediu). */
  verificacao_clinica?: "pendente" | "aprovado" | "recusado" | null;
  verificacao_clinica_nota?: string | null;
};

export const ROTULO_PERFIL: Record<PerfilProfissional, string> = {
  fonoaudiologo: "Fonoaudiólogo(a)",
  professor_musica: "Professor(a) de música",
  musico: "Cantor(a) ou músico(a)",
};

export type AuthResponse = {
  user: User;
  csrf_token: string;
};

export type Project = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  bpm: string | null;
  musical_key: string | null;
  chords_hint: string | null;
  created_at: string;
  updated_at: string;
};

export type SeparationModelInfo = {
  code: string;
  tier: "basic" | "instrumental" | "advanced" | string;
  label: string;
  name: string;
  description: string;
  stems: string[];
  recommended?: boolean;
  min_vram_mb: number;
  cpu_ok: boolean;
  version: string | null;
  license?: string | null;
  installed: boolean;
  compatible: boolean;
  selectable: boolean;
  /** installed | available | incompatible — derivado do runtime */
  package_status?: "installed" | "available" | "incompatible" | string;
  reason: string;
  device: "cpu" | "gpu" | "contract" | string;
  /** Bytes medidos no cache local (null = não encontrado). */
  disk_bytes?: number | null;
  /** Tamanho típico do pacote (hint, não medição). */
  package_size_hint_bytes?: number | null;
  requirements?: string | null;
};

export type SystemStatus = {
  env: string;
  separation_adapter: string;
  allow_contract_stems: boolean;
  using_contract_silence: boolean;
  storage_backend: string;
  message: string;
  cpu_count?: number;
  gpu_available?: boolean;
  local_processing?: boolean;
  disk_total_bytes?: number | null;
  disk_free_bytes?: number | null;
  disk_used_bytes?: number | null;
  max_upload_bytes?: number;
  max_duration_seconds?: number;
  models?: SeparationModelInfo[];
  platform?: string;
  arch?: string;
  hostname?: string;
  ram_total_bytes?: number | null;
  cuda_available?: boolean;
  mps_available?: boolean;
  gpu_name?: string | null;
  gpu_memory_total?: string | null;
  cuda_driver?: string | null;
  cuda_probe_error?: string | null;
  storage_path?: string;
  app_version?: string;
};

export type HardwareTestResult = {
  ok: boolean;
  tested_at: string;
  notes: string[];
  hardware: Record<string, unknown>;
  disk: Record<string, number | null | undefined>;
  separation_adapter: string;
};

export type AudioAsset = {
  id: string;
  owner_id: string;
  project_id: string | null;
  kind: string;
  mime_type: string;
  format: string;
  checksum_sha256: string | null;
  size_bytes: number;
  duration_ms: number | null;
  sample_rate: number | null;
  channels: number | null;
  original_filename: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ProcessingJob = {
  id: string;
  owner_id: string;
  project_id: string;
  source_asset_id: string;
  model_id: string;
  status: string;
  progress: number | string;
  idempotency_key: string;
  params: Record<string, unknown>;
  model_version: string;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  attempt: number;
  created_at: string;
  updated_at: string;
  model_code?: string | null;
};

function getCsrfFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)em_csrf=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { json?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 20_000, json, signal: userSignal, ...rest } = options;
  const headers = new Headers(rest.headers);
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const method = (rest.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    const csrf = getCsrfFromCookie();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }

  let res: Response;
  try {
    const signal =
      userSignal ??
      (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
        ? AbortSignal.timeout(timeoutMs)
        : undefined);
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers,
      credentials: "include",
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    const timedOut =
      (err instanceof DOMException && err.name === "TimeoutError") ||
      (err instanceof Error && /aborted|timeout/i.test(err.message));
    throw Object.assign(
      new Error(
        (timedOut
          ? "O servidor demorou demais para responder. Tente de novo em instantes."
          : "Não foi possível falar com o servidor. Verifique a conexão e tente de novo.") +
          (process.env.NODE_ENV === "development"
            ? ` [dev: ${API_URL}${timedOut ? `, timeout ${Math.round(timeoutMs / 1000)}s` : ""} — confira o container estudio-api (:8010)]`
            : ""),
      ),
      { api: { code: timedOut ? "timeout" : "network_error", message: "Failed to fetch" }, status: 0 },
    );
  }

  if (!res.ok) {
    let err: ApiError = { code: "http_error", message: "Falha na requisição" };
    try {
      const body = (await res.json()) as ApiError & { detail?: unknown };
      err = {
        code: body.code ?? "http_error",
        message:
          body.message ??
          (typeof body.detail === "string" ? body.detail : "Falha na requisição"),
        details: body.details ?? body.detail,
      };
    } catch {
      /* ignore */
    }
    if (res.status === 401) {
      err.message = "Sessão expirada — faça login novamente.";
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.assign("/login");
      }
    }
    throw Object.assign(new Error(err.message), { api: err, status: res.status });
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function sha256Hex(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const authApi = {
  register: (body: { email: string; password: string; name: string; perfil?: PerfilProfissional; registro?: string; aceite_privacidade?: boolean }) =>
    apiFetch<AuthResponse>("/api/v1/auth/register", { method: "POST", json: body }),
  login: (body: { email: string; password: string }) =>
    apiFetch<AuthResponse>("/api/v1/auth/login", { method: "POST", json: body }),
  logout: () => apiFetch<{ message: string }>("/api/v1/auth/logout", { method: "POST" }),
  /** Troca a senha (confere a atual); os outros aparelhos saem, este continua. */
  changePassword: (senha_atual: string, nova_senha: string) =>
    apiFetch<AuthResponse>("/api/v1/auth/password/change", { method: "POST", json: { senha_atual, nova_senha } }),
  /** Encerra todas as sessões, inclusive esta. */
  logoutAll: () => apiFetch<{ message: string }>("/api/v1/auth/logout-all", { method: "POST" }),
  me: () => apiFetch<User>("/api/v1/users/me"),
  forgotPassword: (email: string) =>
    apiFetch<{ message: string; dev_reset_url?: string | null }>("/api/v1/auth/password/forgot", {
      method: "POST",
      json: { email },
    }),
  resetPassword: (body: { token: string; password: string }) =>
    apiFetch<{ message: string }>("/api/v1/auth/password/reset", { method: "POST", json: body }),
};

export type UsageSnapshot = {
  plan_code: string;
  plan_name: string;
  period_ym: string;
  minutes_used: number | string;
  max_minutes_month: number;
  storage_bytes_used: number;
  max_storage_mb: number;
  concurrent_jobs: number;
  max_concurrent_jobs: number;
  features: Record<string, unknown>;
};

export const perfilApi = {
  aceitarPrivacidade: () => apiFetch<User>("/api/v1/users/me/aceite-privacidade", { method: "POST" }),
  salvar: (body: { name: string; perfil: PerfilProfissional | null } & PerfilDados) =>
    apiFetch<User>("/api/v1/users/me/perfil", { method: "PUT", json: body }),
  enviarFoto: (arquivo: Blob, nome = "foto.jpg") => {
    const dados = new FormData();
    dados.append("file", arquivo, nome);
    return apiFetch<User>("/api/v1/users/me/foto", { method: "POST", body: dados, timeoutMs: 60_000 });
  },
  apagarFoto: () => apiFetch<User>("/api/v1/users/me/foto", { method: "DELETE" }),
  /** A foto como Blob (com o cookie de sessão); null se não houver. */
  foto: async (): Promise<Blob | null> => {
    const res = await fetch(`${API_URL}/api/v1/users/me/foto`, { credentials: "include" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Não foi possível carregar a foto.");
    return res.blob();
  },
};

export const usageApi = {
  me: () => apiFetch<UsageSnapshot>("/api/v1/users/me/usage"),
};

export const systemApi = {
  status: () => apiFetch<SystemStatus>("/api/v1/system/status"),
  hardwareTest: () => apiFetch<HardwareTestResult>("/api/v1/system/hardware-test"),
};

export const adminApi = {
  conformidade: () => apiFetch<Record<string, unknown>>("/api/v1/admin/conformidade"),
  verificacoesClinicas: (situacao: "pendente" | "aprovado" | "recusado" = "pendente") =>
    apiFetch<{ items: Array<{ id: string; nome: string; email: string; registro: string | null; cidade: string | null; situacao: string; nota: string | null; criado_em: string }> }>(
      `/api/v1/admin/verificacoes-clinicas?situacao=${situacao}`,
    ),
  decidirVerificacao: (id: string, aprovar: boolean, nota?: string) =>
    apiFetch<{ id: string; situacao: string }>(`/api/v1/admin/usuarios/${encodeURIComponent(id)}/verificacao-clinica`, {
      method: "POST",
      json: { aprovar, nota: nota?.trim() || null },
    }),
  users: () =>
    apiFetch<{ items: Array<{ id: string; email: string; name: string; role: string; created_at: string }>; total: number }>(
      "/api/v1/admin/users",
    ),
  jobs: () =>
    apiFetch<{
      items: Array<{
        id: string;
        owner_id: string;
        project_id: string;
        status: string;
        progress: number | string;
        created_at: string;
        finished_at: string | null;
      }>;
      total: number;
    }>("/api/v1/admin/jobs"),
  auditLogs: () =>
    apiFetch<{
      items: Array<{
        id: string;
        actor_id: string | null;
        action: string;
        resource_type: string;
        resource_id: string | null;
        created_at: string;
      }>;
      total: number;
    }>("/api/v1/admin/audit-logs"),
};

export const projectsApi = {
  list: () => apiFetch<{ items: Project[]; total: number }>("/api/v1/projects"),
  create: (body: { name: string; description?: string }) =>
    apiFetch<Project>("/api/v1/projects", { method: "POST", json: body }),
  get: (id: string) => apiFetch<Project>(`/api/v1/projects/${id}`),
  update: (
    id: string,
    body: Partial<{
      name: string;
      description: string;
      bpm: number;
      musical_key: string | null;
      chords_hint: string | null;
    }>,
  ) => apiFetch<Project>(`/api/v1/projects/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) => apiFetch<void>(`/api/v1/projects/${id}`, { method: "DELETE" }),
  restore: (id: string) => apiFetch<Project>(`/api/v1/projects/${id}/restore`, { method: "POST" }),
  assets: (id: string) =>
    apiFetch<{ items: AudioAsset[]; total: number }>(`/api/v1/projects/${id}/assets`),
};

export const separationsApi = {
  list: (projectId: string) =>
    apiFetch<{ items: ProcessingJob[]; total: number }>(
      `/api/v1/projects/${projectId}/separations`,
    ),
  create: (
    projectId: string,
    body: { source_asset_id: string; model_code?: string; params?: Record<string, unknown> },
    idempotencyKey: string,
  ) =>
    apiFetch<ProcessingJob>(`/api/v1/projects/${projectId}/separations`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      json: { model_code: "htdemucs", params: {}, ...body },
    }),
  get: (jobId: string) => apiFetch<ProcessingJob>(`/api/v1/processing-jobs/${jobId}`),
};

export const uploadsApi = {
  initiate: (body: {
    project_id: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
    checksum_sha256: string;
    rights_confirmed: boolean;
  }) =>
    apiFetch<{
      asset_id: string;
      upload_url: string;
      storage_key: string;
      expires_in: number;
      method: string;
    }>("/api/v1/uploads/initiate", { method: "POST", json: body }),
  complete: (body: { asset_id: string; checksum_sha256: string }) =>
    apiFetch<AudioAsset>("/api/v1/uploads/complete", { method: "POST", json: body }),
  putFile: async (uploadUrl: string, file: File) => {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
    if (!res.ok) {
      throw new Error("Falha ao enviar o arquivo para o storage");
    }
  },
};

export const assetsApi = {
  list: (params?: { kind?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.kind) q.set("kind", params.kind);
    if (params?.status) q.set("status", params.status);
    const qs = q.toString();
    return apiFetch<{ items: AudioAsset[]; total: number }>(
      `/api/v1/audio-assets${qs ? `?${qs}` : ""}`,
    );
  },
  playbackUrl: async (id: string) => {
    const res = await apiFetch<{ url: string; expires_in: number }>(`/api/v1/audio-assets/${id}/playback-url`);
    return { ...res, url: viaDevProxy(res.url) };
  },
};

export type StemMixState = {
  volume: number;
  mute: boolean;
  solo: boolean;
  pan: number;
};

export type MixEqBand = {
  id: string;
  label?: string;
  type: string;
  frequency: number;
  gainDb?: number;
  gain_db?: number;
  q: number;
};

export type MixEqState = {
  enabled: boolean;
  bands: MixEqBand[];
};

export type MixFxState = {
  enabled: boolean;
  compressor: {
    enabled: boolean;
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
  };
  delay: { enabled: boolean; timeSec: number; feedback: number; mix: number };
  reverb: { enabled: boolean; mix: number; decay: number };
};

export type MixPreset = {
  id: string;
  project_id: string;
  name: string;
  is_default: boolean;
  state: {
    stems: Record<string, StemMixState>;
    master_gain: number;
    eq?: MixEqState | null;
    fx?: MixFxState | null;
  };
  version: number;
};

export type StemRow = {
  id: string;
  job_id: string;
  project_id: string;
  stem_type: string;
  asset_id: string;
  order_index: number;
};

export type ExportJob = {
  id: string;
  project_id: string;
  kind: string;
  status: string;
  params: Record<string, unknown>;
  result_asset_id: string | null;
  error_message: string | null;
};

export const studioApi = {
  stems: (projectId: string, jobId?: string) => {
    const q = jobId ? `?job_id=${jobId}` : "";
    return apiFetch<{ items: StemRow[]; total: number }>(`/api/v1/projects/${projectId}/stems${q}`);
  },
  getMix: (projectId: string) => apiFetch<MixPreset>(`/api/v1/projects/${projectId}/mix`),
  putMix: (projectId: string, body: { name?: string; state: MixPreset["state"]; is_default?: boolean }) =>
    apiFetch<MixPreset>(`/api/v1/projects/${projectId}/mix`, { method: "PUT", json: body }),
  createExport: (projectId: string, body: { kind: string; params?: Record<string, unknown> }, idem: string) =>
    apiFetch<ExportJob>(`/api/v1/projects/${projectId}/exports`, {
      method: "POST",
      headers: { "Idempotency-Key": idem },
      json: body,
    }),
  getExport: (jobId: string) => apiFetch<ExportJob>(`/api/v1/export-jobs/${jobId}`),
  markers: (projectId: string) =>
    apiFetch<{ id: string; position_ms: number; label: string; color: string | null }[]>(
      `/api/v1/projects/${projectId}/markers`,
    ),
  createMarker: (projectId: string, body: { position_ms: number; label: string; color?: string }) =>
    apiFetch(`/api/v1/projects/${projectId}/markers`, { method: "POST", json: body }),
  updateMarker: (
    projectId: string,
    markerId: string,
    body: Partial<{ position_ms: number; label: string; color: string | null }>,
  ) =>
    apiFetch(`/api/v1/projects/${projectId}/markers/${markerId}`, { method: "PATCH", json: body }),
  deleteMarker: (projectId: string, markerId: string) =>
    apiFetch<void>(`/api/v1/projects/${projectId}/markers/${markerId}`, { method: "DELETE" }),
  loops: (projectId: string) =>
    apiFetch<{ id: string; name: string; start_ms: number; end_ms: number }[]>(
      `/api/v1/projects/${projectId}/loop-regions`,
    ),
  createLoop: (projectId: string, body: { name: string; start_ms: number; end_ms: number }) =>
    apiFetch(`/api/v1/projects/${projectId}/loop-regions`, { method: "POST", json: body }),
  updateLoop: (
    projectId: string,
    regionId: string,
    body: Partial<{ name: string; start_ms: number; end_ms: number }>,
  ) =>
    apiFetch(`/api/v1/projects/${projectId}/loop-regions/${regionId}`, {
      method: "PATCH",
      json: body,
    }),
  deleteLoop: (projectId: string, regionId: string) =>
    apiFetch<void>(`/api/v1/projects/${projectId}/loop-regions/${regionId}`, { method: "DELETE" }),
};

export type PracticeSession = {
  id: string;
  project_id: string;
  profile: string;
  notes: string | null;
  duration_sec: number;
  metronome_bpm: number | null;
  speed_pct: number;
  created_at: string;
};

export const practiceApi = {
  list: (projectId: string) =>
    apiFetch<{ items: PracticeSession[]; total: number }>(
      `/api/v1/projects/${projectId}/practice-sessions`,
    ),
  create: (
    projectId: string,
    body: {
      profile: string;
      notes?: string;
      duration_sec: number;
      metronome_bpm?: number;
      speed_pct?: number;
    },
  ) =>
    apiFetch<PracticeSession>(`/api/v1/projects/${projectId}/practice-sessions`, {
      method: "POST",
      json: body,
    }),
};

export type VocalNote = {
  id?: string;
  pitch_midi: number;
  start_ms: number;
  end_ms: number;
  velocity: number;
  is_rest?: boolean;
  tie_group?: string | null;
  lyric_syllable?: string | null;
};

export type VocalPart = {
  id: string;
  label: string;
  voice_role: string;
  needs_review: boolean;
  order_index: number;
  notes: VocalNote[];
};

export type VocalTranscription = {
  id: string;
  project_id: string;
  source_asset_id: string;
  status: string;
  engine: string;
  bpm: string | number | null;
  musical_key: string | null;
  confidence: string | number | null;
  polyphony_warning: boolean;
  meta: Record<string, unknown>;
  parts: VocalPart[];
  created_at: string;
  updated_at: string;
};

export const vocalApi = {
  list: (projectId: string) =>
    apiFetch<{ items: VocalTranscription[]; total: number }>(
      `/api/v1/projects/${projectId}/vocal-transcriptions`,
    ),
  create: (
    projectId: string,
    body: {
      source_asset_id: string;
      engine?: string;
      bpm?: number;
      musical_key?: string;
      confidence?: number;
      polyphony_warning?: boolean;
      status?: string;
      meta?: Record<string, unknown>;
      parts: Array<{
        label: string;
        voice_role: string;
        needs_review?: boolean;
        order_index?: number;
        notes: VocalNote[];
      }>;
      musicxml?: string;
    },
  ) =>
    apiFetch<VocalTranscription>(`/api/v1/projects/${projectId}/vocal-transcriptions`, {
      method: "POST",
      json: body,
    }),
  enqueueWorker: (
    projectId: string,
    body?: { source_asset_id?: string; label?: string; voice_role?: string },
  ) =>
    apiFetch<VocalTranscription>(`/api/v1/projects/${projectId}/vocal-transcriptions/worker`, {
      method: "POST",
      json: body ?? {},
    }),
  get: (id: string) => apiFetch<VocalTranscription>(`/api/v1/vocal-transcriptions/${id}`),
  addPart: (
    transcriptionId: string,
    body: {
      label: string;
      voice_role?: string;
      needs_review?: boolean;
      order_index?: number;
      audio_asset_id?: string;
      notes?: VocalNote[];
      annotation?: string;
    },
  ) =>
    apiFetch<VocalTranscription>(`/api/v1/vocal-transcriptions/${transcriptionId}/parts`, {
      method: "POST",
      json: body,
    }),
  deletePart: (partId: string) =>
    apiFetch<VocalTranscription>(`/api/v1/vocal-parts/${partId}`, { method: "DELETE" }),
  updatePart: (partId: string, body: { voice_role: string; label?: string; needs_review?: boolean }) =>
    apiFetch<VocalTranscription>(`/api/v1/vocal-parts/${partId}`, { method: "PATCH", json: body }),
  updateAnnotation: (partId: string, annotation: string) =>
    apiFetch<VocalTranscription>(`/api/v1/vocal-parts/${partId}/annotation`, {
      method: "PATCH",
      json: { annotation },
    }),
  replaceNotes: (
    partId: string,
    body: { notes: VocalNote[]; musicxml?: string; label?: string },
  ) =>
    apiFetch<VocalTranscription>(`/api/v1/vocal-parts/${partId}/notes`, {
      method: "PUT",
      json: body,
    }),
};

export type VoiceCheckProbe = {
  duration_ms: number | null;
  sample_rate: number | null;
  channels: number | null;
  has_audio: boolean;
  has_video: boolean;
  format_name: string | null;
  audio_codec: string | null;
  video_codec: string | null;
  ffprobe_ok: boolean;
};

export type VoiceCheckPrepareResult = {
  job_id: string;
  original_filename: string;
  original_unchanged: boolean;
  probe: VoiceCheckProbe;
  wav: {
    duration_ms?: number;
    sample_rate?: number;
    channels?: number;
    size_bytes?: number;
  };
  audio_path: string;
  message: string;
};

export type AutotuneScale = "chromatic" | "major" | "minor" | "auto";

export type AutotuneSettings = {
  /** "auto" ou 0..11 (Dó..Si) */
  key: "auto" | number;
  scale: AutotuneScale;
  /** 0..100 */
  strength: number;
  /** 0..400 ms (0 = robótico) */
  retuneMs: number;
  /** 0..50 cents preservados */
  humanizeCents: number;
};

export type AutotuneTuningStats = {
  mean_abs_cents: number | null;
  in_tune_percent: number | null;
  voiced_frames: number;
};

export type AutotuneStats = {
  key: number;
  scale: string;
  key_label: string;
  detected_key: number;
  detected_scale: string;
  detected_key_label: string;
  key_confidence: number | null;
  strength: number;
  retune_ms: number;
  humanize_cents: number;
  duration_seconds: number;
  corrected_percent: number;
  before: AutotuneTuningStats;
  after: AutotuneTuningStats;
};

export type EnhanceSettings = {
  /** Deixar só a voz (Demucs no worker) */
  isolate: boolean;
  /** Limpeza: ronco, ruído, "s" */
  denoise: boolean;
  /** events = força total nos erros e leve no resto; all = música toda; off = sem afinação */
  pitchMode: "events" | "all" | "off";
  /** 0..100 — correção fora dos trechos com erro */
  baseStrength: number;
  key: "auto" | number;
  scale: AutotuneScale;
  retuneMs: number;
  humanizeCents: number;
  leveling: boolean;
  breaths: boolean;
};

export type EnhanceEventIn = {
  id: string;
  category: string;
  title: string;
  start_seconds: number;
  end_seconds: number;
  expected_note?: string | null;
};

export type EnhanceCorrection = {
  event_id: string;
  category: string;
  title: string;
  start_seconds: number;
  end_seconds: number;
  action: string;
  fixed: boolean;
  before_cents: number | null;
  after_cents: number | null;
};

export type EnhanceStats = {
  isolated: boolean;
  mode?: "enhance" | "isolate";
  /** Só no modo isolate: energia da voz / energia da mistura. */
  voice_ratio?: number;
  cleanup?: {
    noise_floor_before_db?: number;
    noise_floor_after_db?: number;
    noise_reduction_db?: number | null;
    deessed_frames?: number;
  };
  pitch?: (AutotuneStats & { skipped?: undefined }) | { skipped: string };
  level?: {
    level_before_db?: number;
    level_after_db?: number;
    leveled_frames?: number;
    breaths_softened?: number;
    peak_db?: number;
  };
  corrections: EnhanceCorrection[];
  fixed_count: number;
  not_fixable_count: number;
  warnings?: string[];
};

export type EnhanceJob = {
  job_id: string;
  state: "queued" | "running" | "done" | "failed";
  stage: string | null;
  progress: number;
  queue?: "worker" | "api" | null;
  stats: EnhanceStats | null;
  warnings: string[];
  error: string | null;
  created_at?: string;
  updated_at?: string;
};

export const voicecheckApi = {
  /** Inicia "Aprimorar com IA" (job assíncrono; a separação roda no worker). */
  enhanceStart: (wav: Blob, settings: EnhanceSettings, events: EnhanceEventIn[]) => {
    const fd = new FormData();
    fd.append("file", wav, "prepared.wav");
    fd.append(
      "options",
      JSON.stringify({
        isolate: settings.isolate,
        denoise: settings.denoise,
        pitch_mode: settings.pitchMode,
        base_strength: settings.baseStrength,
        key: settings.key,
        scale: settings.scale,
        retune_ms: settings.retuneMs,
        humanize_cents: settings.humanizeCents,
        leveling: settings.leveling,
        breaths: settings.breaths,
        events: events.slice(0, 2000),
      }),
    );
    return apiFetch<EnhanceJob>("/api/v1/voicecheck/enhance", {
      method: "POST",
      body: fd,
      timeoutMs: 120_000,
    });
  },
  /** Só separa a voz (Demucs no worker) — é o áudio que a análise mede. */
  isolateStart: (wav: Blob) => {
    const fd = new FormData();
    fd.append("file", wav, "prepared.wav");
    fd.append("options", JSON.stringify({ mode: "isolate" }));
    return apiFetch<EnhanceJob>("/api/v1/voicecheck/enhance", {
      method: "POST",
      body: fd,
      timeoutMs: 120_000,
    });
  },
  enhanceStatus: (jobId: string) =>
    apiFetch<EnhanceJob>(`/api/v1/voicecheck/enhance/${encodeURIComponent(jobId)}`),
  enhanceAudio: async (jobId: string): Promise<Blob> => {
    const res = await fetch(
      `${API_URL}/api/v1/voicecheck/enhance/${encodeURIComponent(jobId)}/audio`,
      { credentials: "include" },
    );
    if (!res.ok) throw new Error("Não foi possível baixar o áudio aprimorado");
    return res.blob();
  },
  enhanceDelete: (jobId: string) =>
    apiFetch<void>(`/api/v1/voicecheck/enhance/${encodeURIComponent(jobId)}`, {
      method: "DELETE",
    }),
  /** Afina a voz do WAV preparado. Pode levar ~1 min em gravações longas. */
  autotune: async (
    wav: Blob,
    settings: AutotuneSettings,
  ): Promise<{ wav: Blob; stats: AutotuneStats | null }> => {
    const fd = new FormData();
    fd.append("file", wav, "prepared.wav");
    fd.append("key", settings.key === "auto" ? "auto" : String(settings.key));
    fd.append("scale", settings.scale);
    fd.append("strength", String(settings.strength));
    fd.append("retune_ms", String(settings.retuneMs));
    fd.append("humanize_cents", String(settings.humanizeCents));
    const csrf = getCsrfFromCookie();
    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/v1/voicecheck/autotune`, {
        method: "POST",
        body: fd,
        credentials: "include",
        headers: csrf ? { "X-CSRF-Token": csrf } : undefined,
        signal:
          typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
            ? AbortSignal.timeout(240_000)
            : undefined,
      });
    } catch {
      throw new Error("Não foi possível falar com o servidor para afinar o áudio. Tente de novo em instantes.");
    }
    if (!res.ok) {
      let msg = "Não foi possível afinar o áudio";
      try {
        const body = (await res.json()) as { detail?: unknown; message?: string };
        msg = body.message ?? (typeof body.detail === "string" ? body.detail : msg);
      } catch {
        /* ignore */
      }
      throw Object.assign(new Error(msg), { status: res.status });
    }
    let stats: AutotuneStats | null = null;
    try {
      const raw = res.headers.get("X-Autotune-Stats");
      stats = raw ? (JSON.parse(raw) as AutotuneStats) : null;
    } catch {
      stats = null;
    }
    return { wav: await res.blob(), stats };
  },
  prepare: async (file: File): Promise<VoiceCheckPrepareResult> => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    return apiFetch<VoiceCheckPrepareResult>("/api/v1/voicecheck/prepare", {
      method: "POST",
      body: fd,
    });
  },
  fetchPreparedWav: async (jobId: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}/api/v1/voicecheck/jobs/${encodeURIComponent(jobId)}/audio`, {
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error("Falha ao baixar WAV preparado");
    }
    return res.blob();
  },
  deleteJob: (jobId: string) =>
    apiFetch<void>(`/api/v1/voicecheck/jobs/${encodeURIComponent(jobId)}`, {
      method: "DELETE",
    }),
  /** Análise F0 YIN + técnica — timeout longo (DSP no servidor). */
  analyze: async (wav: Blob): Promise<Record<string, unknown>> => {
    const fd = new FormData();
    fd.append("file", wav, "prepared.wav");
    return apiFetch<Record<string, unknown>>("/api/v1/voicecheck/analyze", {
      method: "POST",
      body: fd,
      timeoutMs: 180_000,
    });
  },
  midiTracks: async (midi: File): Promise<{ tracks: Array<{ index: number; name: string; note_count: number }> }> => {
    const fd = new FormData();
    fd.append("file", midi, midi.name);
    return apiFetch("/api/v1/voicecheck/midi/tracks", { method: "POST", body: fd });
  },
  musicxmlParts: async (
    xml: File,
  ): Promise<{ parts: Array<{ index: number; name: string; note_count: number; id?: string }> }> => {
    const fd = new FormData();
    fd.append("file", xml, xml.name);
    return apiFetch("/api/v1/voicecheck/musicxml/parts", { method: "POST", body: fd });
  },
  analyzeWithReference: async (opts: {
    wav: Blob;
    reference: File;
    trackIndex?: number | null;
    acceptTransposition?: boolean;
    pitchToleranceCents?: number;
    referenceMode?: "score" | "artist" | "custom" | "midi" | "musicxml" | "audio";
    isolateVocals?: boolean;
  }): Promise<Record<string, unknown>> => {
    const fd = new FormData();
    fd.append("wav", opts.wav, "prepared.wav");
    fd.append("reference", opts.reference, opts.reference.name);
    if (opts.trackIndex != null) fd.append("track_index", String(opts.trackIndex));
    fd.append("accept_transposition", opts.acceptTransposition ? "true" : "false");
    if (opts.pitchToleranceCents != null) {
      fd.append("pitch_tolerance_cents", String(opts.pitchToleranceCents));
    }
    if (opts.referenceMode) {
      fd.append("reference_mode", opts.referenceMode);
    }
    if (opts.isolateVocals != null) {
      fd.append("isolate_vocals", opts.isolateVocals ? "true" : "false");
    }
    return apiFetch("/api/v1/voicecheck/analyze-with-reference", {
      method: "POST",
      body: fd,
      // Artista + Demucs pode demorar bastante em CPU
      timeoutMs: opts.referenceMode === "artist" || opts.isolateVocals ? 900_000 : 240_000,
    });
  },
};


// ---------------------------------------------------------------------------
// VoiceCheck — registro de diagnósticos no servidor
// ---------------------------------------------------------------------------

export type VoiceCheckDiagnosisAsset = {
  name: string;
  mime_type: string;
  size_bytes: number;
  duration_sec: number | null;
  kind: "audio" | "video" | "unknown";
  ext: string;
};

export type VoiceCheckDiagnosisSummary = {
  events: number;
  positives: number;
  valid_frame_percent: number | null;
};

export type VoiceCheckDiagnosisItem = {
  id: string;
  title: string;
  step: string;
  max_reached: number;
  asset: VoiceCheckDiagnosisAsset | null;
  summary: VoiceCheckDiagnosisSummary | null;
  analysis_source: "python" | "browser_fallback" | null;
  has_original: boolean;
  has_prepared: boolean;
  has_report: boolean;
  has_corrected?: boolean;
  autotune?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type VoiceCheckDiagnosisFull = VoiceCheckDiagnosisItem & {
  probe: Record<string, unknown> | null;
  voice_mix?: Record<string, unknown> | null;
  report: Record<string, unknown> | null;
};

export type VoiceCheckDiagnosisUpsert = {
  title: string;
  step?: string;
  max_reached?: number;
  asset?: VoiceCheckDiagnosisAsset | null;
  probe?: Record<string, unknown> | null;
  summary?: VoiceCheckDiagnosisSummary | null;
  analysis_source?: "python" | "browser_fallback" | null;
  /** Omitido = mantém o relatório salvo; null = apaga. */
  report?: Record<string, unknown> | null;
  autotune?: Record<string, unknown> | null;
  voice_mix?: Record<string, unknown> | null;
  created_at?: string;
};

const DIAG = "/api/v1/voicecheck/diagnoses";

export const voicecheckDiagnosesApi = {
  list: () => apiFetch<{ items: VoiceCheckDiagnosisItem[] }>(DIAG),
  get: (id: string) =>
    apiFetch<VoiceCheckDiagnosisFull>(`${DIAG}/${encodeURIComponent(id)}`, { timeoutMs: 60_000 }),
  upsert: (id: string, body: VoiceCheckDiagnosisUpsert) =>
    apiFetch<VoiceCheckDiagnosisItem>(`${DIAG}/${encodeURIComponent(id)}`, {
      method: "PUT",
      json: body,
      timeoutMs: 60_000,
    }),
  uploadFile: (
    id: string,
    kind: "original" | "prepared" | "corrected",
    blob: Blob,
    filename: string,
  ) => {
    const fd = new FormData();
    fd.append("file", blob, filename);
    return apiFetch<VoiceCheckDiagnosisItem>(
      `${DIAG}/${encodeURIComponent(id)}/files/${kind}`,
      { method: "PUT", body: fd, timeoutMs: 300_000 },
    );
  },
  downloadFile: async (id: string, kind: "original" | "prepared" | "corrected"): Promise<Blob> => {
    const res = await fetch(`${API_URL}${DIAG}/${encodeURIComponent(id)}/files/${kind}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Não foi possível baixar o áudio salvo no servidor");
    return res.blob();
  },
  remove: (id: string) =>
    apiFetch<void>(`${DIAG}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  removeCorrected: (id: string) =>
    apiFetch<VoiceCheckDiagnosisItem>(`${DIAG}/${encodeURIComponent(id)}/files/corrected`, {
      method: "DELETE",
    }),
};
