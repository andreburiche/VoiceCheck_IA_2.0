# Estúdio Musical — Separação por IA

Plataforma SaaS (pt-BR) para upload de áudio/vídeo, separação real de stems com Demucs e estúdio de treino sincronizado.

## Status

| Fase | Descrição | Estado |
|------|-----------|--------|
| 0 | Auditoria, ADRs, arquitetura | Concluída |
| 1 | Monorepo, Docker, banco, auth, design system | Concluída |
| 2 | Projetos, biblioteca, upload e storage | Concluída |
| 3 | Pipeline 4 stems (jobs/SSE/adapters) | Concluída |
| 4 | Estúdio sincronizado + exportação | Concluída |
| 5 | Modo treino (loops, metrônomo) | Concluída |
| 6 | Stretch/pitch + análise BPM/key (6-stem bloqueado) | Concluída |
| 7 | Planos, cotas, admin, /metrics | Concluída |
| 8 | Hardening, E2E smoke, RUNBOOK prod | Concluída |
| + | CI, acordes, smoke-load, homologação | Concluída |
| 2.0 | Avaliação clínica da voz: acústica, IDV-10, QVV, GRBASI, histórico por paciente | Em validação |

Documentação: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) · [`docs/DECISIONS.md`](docs/DECISIONS.md) · [`docs/RUNBOOK.md`](docs/RUNBOOK.md) · [`docs/HOMOLOGATION.md`](docs/HOMOLOGATION.md) · [`docs/A11Y_CHECKLIST.md`](docs/A11Y_CHECKLIST.md) · [`docs/VOZ_CLINICA.md`](docs/VOZ_CLINICA.md)

## Stack

- **web:** Next.js 16, React, TypeScript, Tailwind, shadcn/ui, TanStack Query
- **api:** FastAPI, SQLAlchemy, Alembic, MySQL 8
- **worker:** Celery, Redis, FFmpeg, PyTorch/Demucs (adapter GPU/CPU/contract)
- **storage:** MinIO (dev) / S3 (prod)

## Início rápido (dev)

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up --build
```

- Web: http://localhost:3000  
- API docs: http://localhost:8010/docs  (porta 8010 no host; 8000 fica para o PHP/XAMPP)  
- MinIO console: http://localhost:9001  

**GPU:** sem CUDA, use `SEPARATION_ADAPTER=contract` ou `cpu_demucs`. Inferência real exige `gpu_demucs` + pesos Demucs — ver RUNBOOK.

```bash
# testes
pnpm --filter @estudio/web typecheck && pnpm --filter @estudio/web test
pnpm --filter @estudio/web test:e2e   # web + API no ar
docker exec -e PUBLIC_API_URL=http://localhost:8000 estudio-api pytest -q
node scripts/smoke-load.mjs http://localhost:8010 20
```

## Licenças de modelo

MVP usa **Demucs `htdemucs`** (MIT). Não afirmamos isolamento perfeito. Modelos adicionais só após validação de licença (ADR).
