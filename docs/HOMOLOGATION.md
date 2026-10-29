# Homologação MVP — Estúdio Musical

Checklist de aceite para considerar o sistema **pronto para homologação**.  
Itens técnicos marcados como feitos no código; validação manual ainda necessária onde indicado.

## Ambiente

- [x] Compose sobe MySQL, Redis, API, worker, web
- [x] `GET /health` → 200
- [x] `GET /metrics` → Prometheus
- [x] `GET /api/v1/system/status` → adapter/storage honestos
- [ ] Produção: secrets, TLS, `COOKIE_SECURE`, S3 (ver RUNBOOK)

## Auth e ownership

- [x] Cadastro / login / logout + CSRF
- [x] IDOR: outro usuário não acessa projeto alheio (pytest)
- [x] Rate limit auth/upload
- [x] Admin só com `role=admin`

## Biblioteca e upload

- [x] Upload WAV/MP3/FLAC/MP4 (validação MIME + ffprobe)
- [x] Storage local ou S3
- [x] Cota de storage no initiate (402)

## Separação

- [x] Job + SSE/polling + cancel + usage_ledger UNIQUE
- [x] Adapter contract (smoke) com aviso na UI
- [x] Adapters `cpu_demucs` / `gpu_demucs` no código
- [ ] **Manual:** instalar Demucs (`scripts/enable-demucs-worker.ps1` ou build `INSTALL_DEMUCS=1`) e processar 1 faixa real
- [x] 6-stem bloqueado (ADR-016)

## Estúdio e treino

- [x] Mixer sync (AudioEngine), mute/solo/volume/pan, presets
- [x] Markers, loops, metrônomo, countdown
- [x] Export mixdown
- [x] Speed/pitch WSOLA + Detectar BPM/key/acordes (`chords_hint`)

## Planos / admin

- [x] Plano free + cotas minutos/concorrência
- [x] Conta mostra uso
- [x] Admin users/jobs/audit

## Qualidade

- [x] Vitest + pytest + E2E smoke (auth + criar projeto)
- [x] CI GitHub Actions
- [x] A11y técnica MVP (skip link, foco, labels, alerts) — **sem certificação AA formal**
- [x] Smoke load `scripts/smoke-load.mjs`

## Decisão de go-live

Homologação de **produto** pode seguir com adapter Demucs validado em staging.  
Com `contract` + `ALLOW_CONTRACT_STEMS=1`, apenas pipeline/dev — **não** liberar como “IA real” para usuários finais.
