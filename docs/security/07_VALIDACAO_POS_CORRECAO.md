# 07 — Validação Pós-Correção

**Data:** 2026-10-26

## Evidências obtidas neste ciclo

| Verificação | Resultado |
|-------------|-----------|
| Inventário repo | Concluído (`01`) |
| Validação CVE-2026-111497 | Confirmada (nodejs.org, NVD, CISA-adjacente/indústria) |
| Validação CVE-2026-109618/109619 | Confirmada (php.net, CISA) |
| PHP no código da app | Ausente → N/A |
| PHP no host | 8.3.31 vulnerável se servir HTTP → pendência Infra |
| `pnpm audit --prod` | Sem vulnerabilidades conhecidas no inventário npm |
| Alterações repo Node | Dockerfile/CI/engines aplicados |
| Node host após correção | **Ainda 24.15.0** no momento da auditoria → **risco residual até upgrade local/CI runners/prod** |
| Build Docker web com `24.22.1-alpine` | **Não executado aqui** (requer Docker + pull) — validar na Infra |
| Cloudflare | Não acessível — checklist entregue |
| Funcionalidades de negócio | Não alteradas propositalmente |

## O que **não** pode ser afirmado

- Que a vulnerabilidade CVE-2026-111497 está **eliminada em todos os ambientes** (host/dev ainda abaixo do patch).
- Que PHP2Shell está mitigado no XAMPP (versão ainda 8.3.31).
- Que a ausência de findings no `pnpm audit` implica ausência total de risco.
- Que WAF Cloudflare está adequado.

## Riscos residuais

1. Desenvolvedores com Node &lt; 24.22.1 executando `next dev` localmente.
2. Imagens antigas em cache Docker (`node:20-alpine`) se rebuild não for forçado.
3. PHP do XAMPP no mesmo host, se Apache estiver ligado e exposto.
4. Pacotes Python transitivos com Brotli não inventariados no container.
5. Exceções Cloudflare desconhecidas.

## Próximas validações (critério de aceite operacional)

- [ ] `node -v` ≥ 24.22.1 em todos os ambientes de build/execução JS.
- [ ] Container web: `node -v` dentro da imagem = 24.22.1+.
- [ ] Smoke funcional: login, listar projetos, upload, VoiceCheck analyze.
- [ ] PHP host ≥ 8.3.36 **ou** serviço PHP desligado.
- [ ] `pip-audit` limpo / sem brotli vulnerável nos containers Python.
- [ ] Checklist Cloudflare preenchido e exceções críticas removidas/estreitadas.
- [ ] Reexecução `pnpm audit` após qualquer bump de dependência.

## Conclusão

A auditoria **identificou e documentou** os CVEs do alerta, a aplicabilidade real à stack e as pendências de Infra/Sec.  
Correções **de código/repo de baixo risco** para Node foram aplicadas.  
A aplicação **não pode ser declarada plenamente segura** até conclusão das validações de runtime acima.
