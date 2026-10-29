# Arquitetura — Estúdio Musical com Separação por IA

**Versão:** 0.1.0  
**Data da auditoria:** 2026-10-23  
**Status do repositório:** vazio (sem código, sem git, sem dependências)

---

## 1. Resultado da auditoria (Fase 0)

| Item | Estado |
|------|--------|
| Código-fonte | Ausente |
| Git | Não inicializado |
| `package.json` / `pyproject.toml` | Ausentes |
| Autenticação | Inexistente |
| Componentes UI | Inexistentes |
| Testes | Inexistentes |
| Infraestrutura (Docker/CI) | Inexistente |
| Modelos de IA | Não instalados |

**Decisão:** inicializar monorepo do zero, preservando apenas esta documentação como baseline.

---

## 2. Visão do sistema

Plataforma SaaS web (pt-BR) para:

1. Upload de áudio/vídeo (MP3, MP4, WAV, FLAC)
2. Separação real de fontes em nuvem (IA — Demucs 4 stems)
3. Estúdio de treino sincronizado (Web Audio API + WaveSurfer)
4. Exportação de stems e mixdowns

**Princípios:**

- API stateless; MySQL só metadados; mídia em storage privado S3-compatible
- Separação real via workers GPU; sem mocks em produção
- Autorização por `owner_id` / tenant em todos os recursos
- Contratos OpenAPI como fonte da verdade

---

## 3. Diagrama de contexto (C4 L1)

```
┌─────────────┐     HTTPS      ┌──────────────┐
│  Browser    │◄──────────────►│  apps/web    │
│  (Next.js)  │                │  Next.js 16  │
└─────────────┘                └──────┬───────┘
                                      │ /api/v1
                               ┌──────▼───────┐
                               │  apps/api    │
                               │  FastAPI     │
                               └──────┬───────┘
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
             ┌──────▼──────┐   ┌──────▼──────┐  ┌──────▼──────┐
             │ MySQL 8     │   │ Redis       │  │ MinIO/S3    │
             │ (metadados) │   │ (fila/SSE)  │  │ (áudios)    │
             └─────────────┘   └──────┬──────┘  └─────────────┘
                                      │ Celery
                               ┌──────▼───────┐
                               │ workers/audio│
                               │ Demucs+FFmpeg│
                               │ (GPU/CPU)    │
                               └──────────────┘
```

---

## 4. Árvore de diretórios proposta

```
estudio_musical/
├── apps/
│   ├── web/                      # Next.js 16 + React + TS strict + Tailwind + shadcn
│   │   ├── app/                  # App Router (landing, auth, dashboard, studio…)
│   │   ├── components/           # UI + studio + upload
│   │   ├── lib/                  # API client, auth, audio engine
│   │   ├── hooks/
│   │   └── e2e/                  # Playwright
│   └── api/                      # FastAPI
│       ├── app/
│       │   ├── api/v1/           # routers
│       │   ├── core/             # config, security, deps
│       │   ├── models/           # SQLAlchemy
│       │   ├── schemas/          # Pydantic
│       │   ├── services/
│       │   └── main.py
│       ├── alembic/
│       └── tests/
├── workers/
│   └── audio/                    # Celery + Demucs + FFmpeg
│       ├── tasks/
│       ├── pipeline/             # validate → decode → infer → encode → store
│       ├── adapters/             # GPU / CPU / noop contract
│       └── tests/
├── packages/
│   └── contracts/                # OpenAPI + tipos gerados
│       ├── openapi.yaml
│       └── generated/
├── infra/
│   ├── docker-compose.yml
│   ├── docker/
│   │   ├── Dockerfile.web
│   │   ├── Dockerfile.api
│   │   └── Dockerfile.worker
│   └── prometheus/               # métricas (fase 7+)
├── docs/
│   ├── ARCHITECTURE.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── DECISIONS.md
│   └── RUNBOOK.md                # como rodar local/prod
├── scripts/
│   ├── seed_dev.py
│   └── generate_client.sh
├── .env.example
├── .gitignore
├── package.json                  # workspaces (pnpm)
├── pnpm-workspace.yaml
└── README.md
```

---

## 5. Domínios e bounded contexts

| Domínio | Responsabilidade |
|---------|------------------|
| **Identity** | users, auth (JWT + cookies httpOnly), recuperação de senha |
| **Billing** | plans, subscriptions, usage_ledger, cotas |
| **Library** | projects, audio_assets, uploads |
| **Processing** | processing_models, processing_jobs, stems, eventos SSE |
| **Studio** | mix_presets, markers, loop_regions |
| **Practice** | practice_sessions, perfis, speed/pitch (WSOLA client), análise BPM/key estimada |
| **Export** | export_jobs |
| **Admin/Audit** | audit_logs, administração |

---

## 6. Modelo de dados (MySQL 8)

IDs públicos: `CHAR(36)` UUID. Soft delete (`deleted_at`) onde aplicável.  
Timestamps: `created_at`, `updated_at`. Índices em FKs, status e `(owner_id, created_at)`.

### 6.1 Entidades

```
users
  id UUID PK, email UNIQUE, password_hash, name, role ENUM(user,admin),
  email_verified_at, deleted_at, created_at, updated_at

plans
  id UUID PK, code UNIQUE, name, max_minutes_month, max_storage_mb,
  max_concurrent_jobs, features JSON, price_cents, active

subscriptions
  id UUID PK, user_id FK, plan_id FK, status ENUM(active,past_due,cancelled),
  current_period_start, current_period_end, created_at, updated_at

projects
  id UUID PK, owner_id FK, name, description, bpm DECIMAL NULL,
  musical_key VARCHAR NULL, deleted_at, created_at, updated_at

audio_assets
  id UUID PK, owner_id FK, project_id FK NULL, kind ENUM(original,stem,proxy,export),
  storage_key, mime_type, format, checksum_sha256, size_bytes, duration_ms,
  sample_rate, channels, original_filename, status ENUM(pending,ready,failed),
  deleted_at, created_at, updated_at

processing_models
  id UUID PK, code UNIQUE, name, version, stem_layout JSON,  -- ["vocals","drums","bass","other"]
  license, is_enabled, min_vram_mb, params_schema JSON

processing_jobs
  id UUID PK, owner_id FK, project_id FK, source_asset_id FK, model_id FK,
  status ENUM(queued,preparing,processing,postprocessing,completed,failed,cancelled),
  progress DECIMAL(5,2), idempotency_key UNIQUE, params JSON, model_version,
  error_code, error_message, started_at, finished_at, billed_usage_id FK NULL,
  attempt INT, created_at, updated_at

stems
  id UUID PK, job_id FK, project_id FK, owner_id FK, stem_type ENUM(vocals,drums,bass,other,...),
  asset_id FK, proxy_asset_id FK NULL, order_index, created_at

mix_presets
  id UUID PK, project_id FK, owner_id FK, name, is_default BOOL,
  state JSON,  -- volumes, mute, solo, pan, gain por stem
  version INT, created_at, updated_at

markers
  id UUID PK, project_id FK, owner_id FK, position_ms INT, label, color, created_at, updated_at

loop_regions
  id UUID PK, project_id FK, owner_id FK, name, start_ms, end_ms, created_at, updated_at

practice_sessions
  id UUID PK, project_id FK, owner_id FK, profile ENUM(singer,drums,bass,guitar,keys,general),
  notes TEXT, duration_sec, metronome_bpm, speed_pct, created_at, updated_at

export_jobs
  id UUID PK, project_id FK, owner_id FK, kind ENUM(stem,stems_zip,mixdown),
  status ENUM(queued,processing,completed,failed), params JSON,
  result_asset_id FK NULL, idempotency_key, error_message,
  created_at, updated_at, finished_at

usage_ledger
  id UUID PK, user_id FK, job_id FK UNIQUE NULL,  -- UNIQUE impede cobrança duplicada
  kind ENUM(separation_minutes,export,storage),
  quantity DECIMAL, unit ENUM(minutes,bytes,count),
  period_ym CHAR(7), created_at

audit_logs
  id UUID PK, actor_id FK NULL, action, resource_type, resource_id,
  ip, user_agent, meta JSON, created_at
```

### 6.2 Regras importantes

- Asset físico ≠ stem lógico (`audio_assets` vs `stems`)
- `processing_jobs.model_version` + `params` imutáveis após conclusão
- Reprocessamento cria **novo** job e novos stems (não sobrescreve)
- `usage_ledger.job_id UNIQUE` + só grava em `completed` bem-sucedido
- Soft delete em projects/assets; retenção configurável

---

## 7. Contratos API `/api/v1`

### Auth & Users
| Método | Path | Notas |
|--------|------|-------|
| POST | `/auth/register` | email, senha, nome |
| POST | `/auth/login` | cookie httpOnly + CSRF |
| POST | `/auth/logout` | |
| POST | `/auth/forgot-password` | |
| GET | `/users/me` | |
| GET | `/users/me/usage` | cotas + ledger do período |

### Projects
| Método | Path |
|--------|------|
| GET/POST | `/projects` |
| GET/PATCH/DELETE | `/projects/{id}` |

### Uploads
| Método | Path | Notas |
|--------|------|-------|
| POST | `/uploads/initiate` | retorna URL assinada + asset_id |
| POST | `/uploads/complete` | valida checksum/MIME/duração |

### Separação & Jobs
| Método | Path | Notas |
|--------|------|-------|
| POST | `/projects/{id}/separations` | Idempotency-Key |
| GET | `/processing-jobs/{id}` | |
| POST | `/processing-jobs/{id}/cancel` | cancelamento cooperativo |
| GET | `/processing-jobs/{id}/events` | SSE; fallback polling no client |
| GET | `/projects/{id}/stems` | |

### Áudio & Mix
| Método | Path |
|--------|------|
| GET | `/audio-assets/{id}/playback-url` | URL assinada TTL curto |
| GET/PUT | `/projects/{id}/mix` | preset atual |
| GET/POST | `/projects/{id}/markers` |
| GET/POST | `/projects/{id}/loop-regions` |

### Export
| Método | Path |
|--------|------|
| POST | `/projects/{id}/exports` | Idempotency-Key |
| GET | `/export-jobs/{id}` |

**Padrões:** paginação cursor/offset, erros `{code,message,details}`, rate limit, CORS restrito, OpenAPI em `packages/contracts`.

---

## 8. Pipeline de IA (workers/audio)

```
validate → download → ffprobe/ffmpeg decode → infer (Demucs htdemucs)
  → QA (duração, NaN, silence, sync) → encode WAV+proxy → S3
  → update job/stems → usage_ledger → cleanup → SSE event
```

**Estados:** `queued → preparing → processing → postprocessing → completed | failed | cancelled`

**Adapter pattern:**

- `GpuDemucsAdapter` — inferência real (requer CUDA + pesos MIT)
- `CpuDemucsAdapter` — fallback lento para smoke local
- `ContractAdapter` — testes de contrato sem modelo (CI sem GPU)

Demucs (`htdemucs`, 4 stems: vocals/drums/bass/other) — licença MIT, adequado a SaaS comercial.  
6 stems / vocal split: **fase 6**, só com modelo + licença validados.

---

## 9. Estúdio (apps/web)

- **Um** `AudioContext`; stems como `AudioBufferSourceNode` / `AudioBuffer` agendados no mesmo `currentTime`
- WaveSurfer.js só para visualização (waveform); transporte via Web Audio API
- Mute/solo/volume/pan → `GainNode` / `StereoPannerNode`
- Marcadores, loop A-B, presets, autosave
- Mobile: controles simplificados; multitrack completo prioriza desktop

---

## 10. Segurança

- Cookies httpOnly Secure SameSite; CSRF em mutações cookie-based
- Validação server-side de ownership (anti-IDOR)
- MIME real (python-magic / ffprobe), limites de tamanho/duração
- Isolamento FFmpeg (tmpdir, timeouts, sem network)
- URLs assinadas TTL curto; TLS; LGPD (exclusão, retenção)
- Confirmação de direito de uso no upload; termos claros
- Sem bypass de DRM

---

## 11. Observabilidade

- Logs estruturados JSON (request_id, user_id, job_id)
- Métricas: fila Redis, duração GPU, taxa de falha, custo por minuto
- Alertas: fila parada, OOM, taxa de failed > limiar

---

## 12. Ambientes

| Env | Storage | GPU | Auth |
|-----|---------|-----|------|
| local (compose) | MinIO | opcional / ContractAdapter | JWT local |
| staging | S3 | 1× GPU | real |
| prod | S3 + CDN privado | pool GPU autoscaling | real |

Segredos apenas em variáveis de ambiente (`.env.example` sem credenciais).
