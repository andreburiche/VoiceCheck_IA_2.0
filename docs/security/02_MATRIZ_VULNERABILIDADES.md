# 02 — Matriz de Vulnerabilidades

| ID | Vulnerabilidade | Componente | Versão atual | Versão corrigida | Aplicabilidade | Criticidade | Evidência | Correção | Responsável | Impacto | Status |
|----|-----------------|------------|--------------|------------------|----------------|-------------|-----------|----------|-------------|--------|--------|
| SEC-01 | CVE-2026-111497 Node2Shell/Brotli | Node.js (host) | 24.15.0 | ≥ 24.22.1 | **Confirmada (runtime)** | Crítica | `node -v` | Atualizar Node no host/dev | DevOps + Dev | Reinício processos Node | Pendente (host) |
| SEC-02 | CVE-2026-111497 | Node Docker web | era 20-alpine (EOL) | 24.22.1-alpine | **Confirmada (imagem)** | Crítica | `Dockerfile.web` | Imagem pinada 24.22.1 | Dev (repo) + DevOps (deploy) | Rebuild web | **Corrigido no repo** |
| SEC-03 | CVE-2026-111497 | CI Node 20 | 20 | 24.22.1 | Potencial (pipeline) | Alta | `.github/workflows/ci.yml` | setup-node 24.22.1 | Dev | Rebuild CI | **Corrigido no repo** |
| SEC-04 | CVE-2026-111497 | Python/Brotli packages | N/D | brotli≥1.2.1 / brotlicffi≥1.2.1.0 | **Não verificada** | Alta (se presente) | Sem pacote nos requirements | `pip-audit` no container | DevOps | Rebuild worker/api se houver | Pendente validação |
| SEC-05 | CVE-2026-109618 PHP2Shell | PHP app | — | — | **Não aplicável** | — | 0 arquivos PHP | Nenhuma | — | — | N/A |
| SEC-06 | CVE-2026-109618/109619 | PHP XAMPP host | 8.3.31 | ≥ 8.3.36 | **Confirmada (host)** se PHP servir web | Crítica | `php -v` | Atualizar PHP XAMPP/servidor | DevOps / Sec | Restart Apache/PHP | Pendente (host) |
| SEC-07 | session.upload_progress | php.ini XAMPP | default/comentado | `enabled=Off` explícito | Potencial mitigação | Média | `C:\xampp\php\php.ini` | Definir Off + restart | DevOps | Sem impacto na app Node/Python | Pendente (host) |
| SEC-08 | Node 20 EOL | engines/Docker | ≥20 / node:20 | ≥24.22.1 | Confirmada | Alta | package.json antigo | engines + .node-version | Dev | Compat Next 16 | **Corrigido no repo** |
| SEC-09 | Secrets placeholders | .env.example | placeholders | secrets fortes + COOKIE_SECURE=true em prod | Potencial (se copiado p/ prod) | Alta | `.env.example` | Comentários + checklist Infra | Dev + DevOps | Config only | Comentários adicionados |
| SEC-10 | Contas seed _DEV_TEST_USERS | API main.py | presentes | desabilitar em prod | Potencial | Média | `apps/api/app/main.py` | Garantir só em APP_ENV≠production | Dev | Auth | Pendente revisão código |
| SEC-11 | Cloudflare WAF exceptions | Edge | desconhecido | N/D | **Não verificada** | Alta (se bypass) | Sem config no repo | Revisar painel CF | Sec + Infra | Possível bloqueio legítimo | Pendente |
| SEC-12 | HTTP/2 Node (CVE-2026-56848 etc.) | Node HTTP/2 | 24.15.0 | patches 22.23.2+/24.18.1+ (linha) / ideal ≥24.22.1 | Potencial se HTTP/2 ativo | Alta | advisory Node julho/out 2026 | Mesmo upgrade de runtime | DevOps | DoS | Coberto por upgrade SEC-01/02 |

### Legenda de aplicabilidade

- **Confirmada:** evidência local de versão vulnerável + CVE autenticado.
- **Potencial:** condições de exploração possíveis, sem prova de caminho ativo.
- **Não aplicável:** componente ausente.
- **Não verificada:** falta acesso a runtime/imagem/painel.
