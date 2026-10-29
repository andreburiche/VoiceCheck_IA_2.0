# 01 — Auditoria de Segurança

**Projeto:** Estúdio Musical / VocalAcademy  
**Data:** 2026-10-26  
**Escopo:** repositório `c:\xampp\htdocs\estudio_musical` + runtimes observados no host de desenvolvimento  
**Método:** inventário de código/config, consulta a boletins oficiais (Node.js, PHP.net, CISA, NVD), `pnpm audit`  
**Limitação:** configuração real de produção / Cloudflare / servidores não está no repositório — requer validação por Infra/Sec.

---

## 1. Tecnologias identificadas

| Camada | Tecnologia | Evidência |
|--------|------------|-----------|
| Frontend | Next.js **16.4.3**, React **19.3.1**, pnpm **9.15.0** | `apps/web/package.json`, `pnpm-lock.yaml` |
| Runtime JS (dev host) | Node.js **v24.15.0** | `node -v` |
| Runtime JS (Docker web) | era `node:20-alpine` → atualizado para `node:24.22.1-alpine` | `infra/docker/Dockerfile.web` |
| API | FastAPI **0.115.6**, Uvicorn **0.34.0**, Python **3.12** (imagem) | `apps/api/requirements.txt`, `Dockerfile.api` |
| Worker | Celery **5.4.0**, Python **3.12**, Demucs opcional | `workers/audio/` |
| DB / cache | MySQL **8.4**, Redis **7-alpine** | `infra/docker-compose.yml` |
| PHP no **código da app** | **Não presente** (0 `*.php`, sem Composer) | inventário |
| PHP no **host XAMPP** | PHP **8.3.31** (CLI) | `php -v` — **fora do app**, mas no mesmo host |

---

## 2. CVEs do alerta — validação oficial

### CVE-2026-111497 — Node2Shell / HTTP2Shell (Brotli)

| Campo | Resultado |
|-------|-----------|
| Autenticidade | **Confirmada** — advisory Node.js 21/10/2026; NVD; SecurityWeek; Vercel KB |
| Descrição | Out-of-bounds write no decoder Brotli (lib 1.0.3–1.2.0). Input Brotli malformado → crash / leak / RCE |
| Afetados | Node.js **22.x / 24.x / 26.x** com Brotli vulnerável; também runtimes/libs que embutem o mesmo decoder |
| Corrigido (Node) | **22.23.4**, **24.22.1**, **26.12.1** |
| Pré-requisito | Processo **decodifica** dados Brotli controlados pelo atacante (request body, resposta fetch, arquivo) |
| Aplicabilidade neste projeto | **Potencial / confirmada no runtime** — host Node **24.15.0 < 24.22.1**; Docker web usava **Node 20 EOL** (sem patch desta linha). App não chama Brotli explicitamente no código, mas Next.js/Node podem decodificar `Content-Encoding: br` |

### CVE-2026-109618 / CVE-2026-109619 — PHP2Shell

| Campo | Resultado |
|-------|-----------|
| Autenticidade | **Confirmada** — PHP.net (21/10/2026), CISA, CERT-EU, Datadog |
| Descrição | RCE não autenticado no runtime PHP (OOM corruption + stale global state), antes do código da aplicação |
| Corrigido | **8.2.35**, **8.3.36**, **8.4.27**, **8.5.12** (confirmado em php.net/archive) |
| Aplicabilidade **à aplicação** | **Não aplicável** — nenhum PHP no código/containers da app |
| Aplicabilidade **ao host XAMPP** | **Confirmada (potencial exploração se PHP servir HTTP)** — PHP **8.3.31 < 8.3.36**. Responsabilidade: Infra do host, não o monorepo Node/Python |

### `session.upload_progress.enabled`

No `C:\xampp\php\php.ini` a diretiva aparece **comentada** (`;session.upload_progress.enabled = On`). Em PHP, valor default típico é **On** quando não sobrescrito. Mitigação recomendada pelos boletins: **definir explicitamente `= Off`** e reiniciar workers — **não substitui** o patch 8.3.36+.

---

## 3. Dependências npm

```
pnpm audit --prod → No known vulnerabilities found
```

Pacotes desatualizados existem (Tailwind, Vitest, etc.), mas **não** foram tratados como CVE críticos neste ciclo (sem evidência de exposição igual aos alertas).

---

## 4. Python / Brotli

- `requirements.txt` (API/worker): **sem** pacotes `brotli` / `brotlicffi` listados.
- Aplicabilidade CVE-2026-111497 via Python: **não verificada em imagem runtime** (requer `pip list` / `pip-audit` no container). Sem dependência direta no lock de requirements.

---

## 5. Autenticação / API / uploads (resumo)

- JWT em cookie HttpOnly + CSRF double-submit (`em_access`, `em_csrf`, `X-CSRF-Token`).
- Rate limit em auth/upload.
- Security headers middleware.
- Uploads: allowlist MIME/extensão, tamanho, anti path traversal, HMAC em PUT local.
- VoiceCheck: job_id UUID, raiz por usuário.

---

## 6. Cloudflare / Nginx / Apache

**Não há** configs no repositório. Checklist separado para Infra/Sec.
