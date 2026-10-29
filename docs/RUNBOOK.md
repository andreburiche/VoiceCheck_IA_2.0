# Runbook — Estúdio Musical

## Pré-requisitos

- Docker + Docker Compose v2
- Node 20+ e pnpm 9 (dev web fora do compose, opcional)
- Python 3.12+ (testes API locais)
- (Opcional) NVIDIA GPU + drivers + nvidia-container-toolkit para `gpu_demucs`

## Configuração

```bash
cp .env.example .env
# Edite JWT_SECRET e senhas MySQL antes de qualquer ambiente compartilhado
```

## Subir stack de desenvolvimento

```bash
# Núcleo Fase 1 (MySQL + Redis + API + worker + web)
docker compose -f infra/docker-compose.yml up --build -d

# Padrão: STORAGE_BACKEND=local (volume audio_data) — sem MinIO
# S3/MinIO opcional:
#   STORAGE_BACKEND=s3 no .env
#   docker compose -f infra/docker-compose.yml --profile storage up -d
```

| Serviço | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API + Swagger | http://localhost:8000/docs |
| MinIO API (profile storage) | http://localhost:9000 |
| MinIO Console | http://localhost:9001 |
| MySQL | localhost:3307 |

Migrações: `alembic upgrade head` roda no start do container `api`.  
Seed: plano `free` + modelo `htdemucs` no lifespan da API.

## Testes locais (sem Docker completo)

### API

```bash
cd apps/api
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest
```

### Web

```bash
pnpm install
pnpm --filter @estudio/web typecheck
pnpm --filter @estudio/web lint
```

## Adapters de separação

| `SEPARATION_ADAPTER` | Uso |
|----------------------|-----|
| `contract` | Padrão: falha com mensagem clara; com `ALLOW_CONTRACT_STEMS=1` gera silêncio alinhado **só para smoke de pipeline** |
| `cpu_demucs` | Inferência real CPU (`pip install -r requirements-demucs.txt`) |
| `gpu_demucs` | Inferência real CUDA |

**Importante:** stems de `ALLOW_CONTRACT_STEMS` **não** são separação musical. Em produção: `ALLOW_CONTRACT_STEMS=0` e Demucs instalado.

### Inferência real (Demucs)

**Opção A — instalar no worker em execução (CPU):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts/enable-demucs-worker.ps1
# .env:
# SEPARATION_ADAPTER=cpu_demucs
# ALLOW_CONTRACT_STEMS=0
docker compose -f infra/docker-compose.yml up -d worker
```

**Opção B — rebuild da imagem com Demucs:**
```bash
docker compose -f infra/docker-compose.yml build --build-arg INSTALL_DEMUCS=1 worker
```

**GPU:** imagem CUDA + `nvidia-container-toolkit` + `SEPARATION_ADAPTER=gpu_demucs`.

Smoke: processar faixa curta com direito de uso e validar 4 stems (duração alinhada).

## Cotas, admin e métricas (Fase 7)

- Uso do usuário: `GET /api/v1/users/me/usage` (também em Conta na web)
- Admin: promover no MySQL `UPDATE users SET role='admin' WHERE email='...';` — não há self-escalate
- Rotas admin: `/api/v1/admin/users|jobs|audit-logs` e UI `/admin`
- Métricas: `GET /metrics` (Prometheus). Exemplo scrape:

```yaml
scrape_configs:
  - job_name: estudio-api
    static_configs:
      - targets: ["api:8000"]
```

- HTTP 402 = cota (minutos / storage / concorrência)

## Modo treino (Fase 5–6)

- URL: `/projects/{id}/practice` (requer stems ready)
- Velocidade/pitch: reprocessamento WSOLA no browser (CPU local; pode levar 1–few s)
- “Detectar” BPM/tom: estimativa client-side; sempre editável
- 6-stem / vocal split: **não disponíveis** (ADR-016) até licença validada

## Produção (checklist)

### Pré-requisitos
- [ ] `APP_ENV=production`
- [ ] `JWT_SECRET` e `CSRF_SECRET` ≥ 32 chars aleatórios (secret manager)
- [ ] `COOKIE_SECURE=true` + TLS no proxy
- [ ] `CORS_ORIGINS` = origem(ões) exatas da web
- [ ] `STORAGE_BACKEND=s3` + bucket privado
- [ ] `ALLOW_CONTRACT_STEMS=0`
- [ ] `SEPARATION_ADAPTER=gpu_demucs` (ou `cpu_demucs` com SLA honesto)
- [ ] MySQL gerenciado + backups; Redis persistente ou managed
- [ ] Workers GPU com volume de cache de pesos Demucs
- [ ] Reverse proxy único (mesmo site) para cookies SameSite

### Rate limit
- `RATE_LIMIT_AUTH` / `RATE_LIMIT_AUTH_WINDOW_SEC` (login/register)
- `RATE_LIMIT_UPLOAD` / `RATE_LIMIT_UPLOAD_WINDOW_SEC` (initiate)
- Storage: Redis (`REDIS_URL`); fallback memória só em single-instance

### Health / métricas
- Liveness: `GET /health`
- Prometheus: `GET /metrics`
- Não expor `/docs` publicamente em prod (desligar ou proteger no proxy)

### Scan de dependências
```bash
# API (no container ou venv)
pip install pip-audit && pip-audit -r apps/api/requirements.txt
# Web
pnpm audit --prod
```

### Homologação MVP
1. Cadastro → login → criar projeto → upload WAV curto → job → 4 stems
2. Estúdio: play sync, mute/solo, preset, mixdown
3. Treino: loop A-B, metrônomo, velocidade, Detectar BPM
4. Conta: ver uso/cota; forçar 402 se esgotar minutos (ledger)
5. IDOR: segundo usuário não lê projeto/asset alheio
6. `pnpm --filter @estudio/web test:e2e` (web + API no ar)
7. Revisar [`docs/A11Y_CHECKLIST.md`](A11Y_CHECKLIST.md)

### Load (opcional)
```bash
node scripts/smoke-load.mjs http://localhost:8000 40
```
Fila Celery: enfileirar N jobs contract/CPU e observar Redis + progress SSE. k6/locust formal fica como follow-up.  
Prometheus: `infra/prometheus/prometheus.yml.example` + alertas em `infra/prometheus/alerts.yml.example`.

## Troubleshooting

| Sintoma | Ação |
|---------|------|
| API não sobe | Verificar health MySQL; logs `estudio-api` |
| MySQL 8.4 aborta | Não usar `--default-authentication-plugin` (removido no 8.4); recriar volume `docker compose down -v` |
| MinIO pull falha | Subir sem `--profile storage` e usar S3 remoto; ou definir `MINIO_IMAGE` |
| CORS / cookies | `CORS_ORIGINS` deve incluir a origem da web; `credentials: include` |
| Worker idle | Redis acessível? `celery -A worker.celery_app inspect ping` |
| OOM GPU | Reduzir duração, chunking (Fase 3), fila dedicada |
