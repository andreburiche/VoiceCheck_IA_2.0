# 04 — Alterações Realizadas

**Data:** 2026-10-26  
**Princípio:** apenas correções de segurança comprovadas e de baixo risco no repositório. Sem mudança de layout, regras de negócio ou remoção de endpoints.

## Arquivos modificados

| Arquivo | Alteração | Justificativa |
|---------|-----------|---------------|
| `infra/docker/Dockerfile.web` | Base `node:20-alpine` → `node:24.22.1-alpine` + comentário CVE | Node 20 EOL sem patch CVE-2026-111497; 24.22.1 é versão corrigida oficial |
| `package.json` | `engines.node`: `>=20` → `>=24.22.1` | Impedir instalação inadvertida em runtime vulnerável/EOL |
| `.node-version` | Criado com `24.22.1` | Padronizar toolchains (nvm/fnm/asdf) |
| `.github/workflows/ci.yml` | `node-version: "20"` → `"24.22.1"` | CI não deve validar em runtime sem patch |
| `.env.example` | Comentários sobre secrets e `COOKIE_SECURE` em produção | Hardening documental; sem alterar defaults de dev |

## Arquivos criados (documentação)

- `docs/security/01_AUDITORIA_SEGURANCA.md`
- `docs/security/02_MATRIZ_VULNERABILIDADES.md`
- `docs/security/03_PLANO_CORRECAO.md`
- `docs/security/04_ALTERACOES_REALIZADAS.md` (este)
- `docs/security/05_CHECKLIST_DEVOPS_INFRA.md`
- `docs/security/06_CHECKLIST_CLOUDFLARE.md`
- `docs/security/07_VALIDACAO_POS_CORRECAO.md`

## O que **não** foi alterado (propositalmente)

- Código de negócio VoiceCheck / Demucs / auth flows.
- Layout / identidade visual.
- Dependências npm major (Tailwind 4, Vitest 5, etc.) — sem vínculo comprovado aos CVEs do alerta.
- PHP do XAMPP (fora do controle do repo; checklist Infra).
- Configurações Cloudflare (sem acesso).
- `npm audit fix --force` / upgrades indiscriminados.

## Testes após alteração

- `pnpm audit --prod` → sem vulnerabilidades conhecidas no inventário npm.
- Typecheck/testes completos da app **não** reexecutados neste passo por dependerem do Node local ainda em 24.15.0; ver `07_VALIDACAO_POS_CORRECAO.md`.
