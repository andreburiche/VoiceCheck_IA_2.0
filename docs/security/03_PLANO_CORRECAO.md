# 03 — Plano de Correção

## Prioridade 1 — Runtime Node (CVE-2026-111497)

1. **DevOps:** atualizar Node do host/CI runners para **≥ 24.22.1** (ou 22.23.4 LTS se política exigir 22).
2. **Dev (repo — feito):** `Dockerfile.web` → `node:24.22.1-alpine`; CI → `24.22.1`; `engines` + `.node-version`.
3. Rebuild e redeploy do serviço **web**.
4. Validar `node -v` / tag da imagem após pull.

**Rollback:** reverter tag Docker anterior (não recomendado — Node 20 sem patch). Preferir imagem 24.x saudável anterior ao incidente apenas se build 24.22.1 falhar, e documentar risco residual.

## Prioridade 2 — PHP do host XAMPP (CVE-2026-109618/109619)

1. **Não aplicável ao código do monorepo.**
2. **DevOps/Sec:** se Apache/PHP do XAMPP estiver exposto (mesmo em LAN), atualizar para **PHP ≥ 8.3.36**.
3. Definir `session.upload_progress.enabled=Off` em `php.ini` e reiniciar Apache.
4. Se PHP não for necessário neste host, **desligar** o serviço Apache/PHP para reduzir superfície.

## Prioridade 3 — Python / Brotli (validação)

1. Nos containers `api` e `worker`: `pip list | findstr -i brotli` e `pip-audit`.
2. Se `brotli`/`brotlicffi` presentes e < versões corrigidas → pin e rebuild.
3. Sem pacote → registrar N/A com evidência do `pip list`.

## Prioridade 4 — Produção / edge

1. Revisar exceções Cloudflare (checklist 06).
2. `COOKIE_SECURE=true`, secrets fortes, sem seed de usuários de teste.
3. TLS terminado corretamente; não expor portas internas.

## Ordem sugerida de execução

| Ordem | Ação | Quem | Risco de indisponibilidade |
|------|------|------|----------------------------|
| 1 | Merge alterações Dockerfile/CI/engines | Dev | Baixo |
| 2 | Atualizar Node local/CI | Dev/DevOps | Baixo–médio |
| 3 | Rebuild web Docker | DevOps | Médio (janela) |
| 4 | Patch PHP XAMPP (se exposto) | DevOps | Médio |
| 5 | Validação Cloudflare | Sec/Infra | Médio (WAF) |
| 6 | pip-audit containers | DevOps | Baixo |

## Aprovações necessárias antes de

- Atualização major forçada de Next/React.
- Remoção de exceções Cloudflare em produção.
- Alteração de PHP em servidores compartilhados.
- Mudança de porta/TLS em produção.
