# Plano de Implementação — Estúdio Musical

**Baseline:** repositório vazio (auditoria 2026-10-23)  
**MVP aceite:** cadastro → projeto → upload → job 4 stems → playback sync → mute/solo/volume → loop → preset → mixdown → download; isolamento multi-tenant; sem cobrança duplicada.

---

## Backlog por fases

### Fase 0 — Auditoria e ADRs ✅
- [x] Inspecionar repositório (vazio)
- [x] `docs/ARCHITECTURE.md`
- [x] `docs/IMPLEMENTATION_PLAN.md`
- [x] `docs/DECISIONS.md`
- [x] Checklist de riscos e dependências GPU (em DECISIONS)

**Arquivos:** `docs/*`

---

### Fase 1 — Fundação (monorepo, Docker, banco, auth, design system) ✅ implementada
**Escopo:**
1. [x] Inicializar git + monorepo pnpm (`apps/web`, `apps/api`, `workers/audio`, `packages/contracts`, `infra`)
2. [x] Docker Compose: MySQL 8, Redis, MinIO, api, web, worker
3. [x] FastAPI + SQLAlchemy models + Alembic migration inicial (todas as tabelas MVP)
4. [x] Auth: register/login/logout/me (JWT cookie httpOnly + CSRF)
5. [x] Next.js 16.4 + Tailwind + UI base + layout dark premium
6. [x] Telas: landing, login, cadastro, dashboard, biblioteca/projetos (vazios honestos), conta
7. [x] `.env.example`, `README.md`, `docs/RUNBOOK.md`
8. [x] typecheck web + vitest; pytest security (requer Python/Docker)

**Validação local (2026-10-23):**
- `pnpm --filter @estudio/web test` — OK
- `pnpm --filter @estudio/web typecheck` — OK
- Python host ausente; testes API via imagem Docker

**Aceite Fase 1:** `docker compose -f infra/docker-compose.yml up --build` → registrar → login → dashboard.

---

### Fase 2 — Projetos, biblioteca, upload e storage ✅
- [x] CRUD projects com ownership
- [x] Upload initiate/complete (`STORAGE_BACKEND=local` ou `s3`)
- [x] Validação MIME real (assinatura), tamanho, checksum, duração (ffprobe)
- [x] Biblioteca + drag-drop UI + confirmação de direito de uso
- [x] Playback URL assinada (TTL curto)
- [x] Testes media + integração API

**Aceite:** arquivo válido aparece como asset `ready` no projeto.

---

### Fase 3 — Processamento real 4 stems ✅
- [x] POST separations + Idempotency-Key
- [x] Worker: download → FFmpeg → adapter → QA → upload stems
- [x] Status + progresso + SSE (+ polling)
- [x] Cancelamento cooperativo
- [x] `usage_ledger` UNIQUE(job_id)
- [x] Adapters: contract / cpu_demucs / gpu_demucs
- [x] UI painel de separação no projeto
- [x] Testes de fluxo (contract smoke)

**Aceite:** integração fila→worker→stems validada com `ALLOW_CONTRACT_STEMS=1` (silêncio alinhado, **não** é Demucs). Inferência real: `SEPARATION_ADAPTER=cpu_demucs|gpu_demucs` + `requirements-demucs.txt`.

---

### Fase 4 — Estúdio sincronizado + exportação básica ✅
- [x] AudioEngine (Web Audio API sample-accurate)
- [x] WaveSurfer por stem (visualização)
- [x] Mute/solo/volume/pan + master + autosave de mix
- [x] Markers e loop-regions API (base)
- [x] Export mixdown (ffmpeg amix) + playback URL
- [x] UI `/projects/[id]/studio`

**Aceite:** 4 stems tocam juntos; preset salva; mixdown baixa via URL assinada.

---

### Fase 5 — Modo treino ✅
- [x] Perfis (cantor, bateria, baixo, guitarra, teclado, geral)
- [x] Loops A-B, marcadores, contagem, metrônomo (Web Audio)
- [x] Sessões de prática + histórico
- [x] BPM/key editáveis no projeto
- [x] UI `/projects/[id]/practice`

**Aceite:** loop + metrônomo + perfil mute/solo funcionam.  
**Nota:** time-stretch/pitch-preserving fica na Fase 6.

---

### Fase 6 — Avançado ✅
- [x] Pitch/time-stretch no client (WSOLA próprio, ADR-014) — UI treino
- [x] Análise BPM/tonalidade no browser (estimativas + Detectar, ADR-015)
- [x] 6 stems / vocal split **bloqueados** até ADR de licença (ADR-016)
- [x] Acordes automáticos (estimativa client-side na UI treino; sem schema DB)

**Aceite:** velocidade com pitch preservado; Detectar preenche BPM/tom editáveis; nenhum modelo 6-stem exposto.

---

### Fase 7 — Planos, cotas, admin, observabilidade ✅
- [x] Plans/subscriptions (seed free) + enforcement cotas (minutos, concorrência, storage no upload)
- [x] `GET /users/me/usage` + UI Conta
- [x] Admin API/UI (users, jobs, audit) + `require_admin`
- [x] audit_logs em register, login fail, create/cancel separation
- [x] `GET /metrics` (Prometheus counters)
- [x] Alertas Prometheus de exemplo (`infra/prometheus/alerts.yml.example`); PagerDuty fica opcional

**Aceite:** cota bloqueia com 402; admin só com role; /metrics scrapeável.

---

### Fase 8 — Hardening e deploy ✅
- [x] Rate limit auth/upload (Redis + fallback)
- [x] CSRF assinado (`CSRF_SECRET`) + headers de segurança
- [x] Smoke E2E Playwright (cadastro → painel)
- [x] Checklist a11y + RUNBOOK produção / homologação
- [x] Docs de `pip-audit` / `pnpm audit`
- [x] Smoke/load leve (`scripts/smoke-load.mjs`); k6/locust formal ainda opcional
- [x] A11y técnica MVP (skip link, foco, labels) — auditoria AA formal permanece fora do escopo de código
- [x] Homologação documentada em `docs/HOMOLOGATION.md`

**Aceite:** 429 em flood de auth; mutação sem CSRF → 403; E2E smoke verde com stack up.

---

### Pós-MVP — CI e polish ✅
- [x] GitHub Actions CI (web typecheck/vitest, API units, compose smoke)
- [x] Estimativa de acordes no Detectar (treino) + `chords_hint` persistido
- [x] `.dockerignore` + web container com `pnpm install --ignore-scripts`
- [x] Exemplo Prometheus scrape + alertas
- [x] PyJWT (sem warning utcnow do python-jose)
- [x] Worker com build-arg `INSTALL_DEMUCS=1` + script `enable-demucs-worker.ps1`
- [x] E2E smoke app (cadastro → criar projeto)

---

## Plano de testes

| Camada | Ferramenta | O quê |
|--------|------------|-------|
| Unit API | pytest | auth, quotas, ownership, idempotency |
| Unit worker | pytest | QA stems, state machine, adapter contract |
| Unit web | vitest | AudioEngine scheduling mocks |
| Integração | pytest + compose | API↔DB↔Redis↔MinIO |
| E2E | Playwright | fluxo MVP completo |
| Áudio | fixtures curtas autorizadas | duração/sync stems (± ms) |
| GPU smoke | script manual/CI opcional | Demucs 1 arquivo <30s |
| A11y | axe-core | telas críticas |
| Load | k6/locust (fase 8) | fila e uploads |
| Security | dependency scan + IDOR tests | CI |

**Fixtures:** `tests/fixtures/audio/` — clips curtos com direito de uso documentado (gerar synthetic via FFmpeg no seed, não material copyrighted).

---

## Dependências externas

| Dependência | Fase | Obrigatória p/ MVP? |
|-------------|------|---------------------|
| MySQL 8 | 1 | Sim |
| Redis | 1 | Sim |
| MinIO/S3 | 2 | Sim |
| FFmpeg / ffprobe | 3 | Sim |
| PyTorch | 3 | Sim (CPU ou CUDA) |
| Demucs `htdemucs` pesos | 3 | Sim para inferência real |
| GPU NVIDIA + drivers | 3 | Recomendada; CPU possível porém lento |
| Domínio + TLS | 8 | Produção |

---

## Critérios de aceite MVP (checklist)

- [x] Cadastro / login
- [x] Criar projeto
- [x] Upload MP3/MP4/WAV/FLAC válido
- [x] Acompanhar job (SSE ou polling)
- [x] Receber 4 stems alinhados (Demucs real ou contract só com flag explícita)
- [x] Reprodução simultânea sample-accurate
- [x] Mute / solo / volume
- [x] Criar loop
- [x] Salvar preset
- [x] Solicitar mixdown e baixar
- [x] Outro usuário não acessa assets privados
- [x] Falhas recuperáveis; sem cobrança duplicada em retry (`usage_ledger.job_id` UNIQUE)
- [x] Testes API + unit web + E2E smoke (Playwright)

---

## Ordem de execução imediata

1. ~~Auditoria + docs~~ → concluir Fase 0
2. Implementar Fase 1 completa e validar compose + auth
3. Não pular para Fase 3 sem upload real (Fase 2)
