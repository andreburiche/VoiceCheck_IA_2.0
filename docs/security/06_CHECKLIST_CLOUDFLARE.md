# 06 — Checklist Cloudflare

**Status no repositório:** nenhuma configuração Cloudflare/WAF/Wrangler encontrada.  
**Acesso ao painel:** não disponível a este agente.  
**Ação:** equipe de Segurança da Informação + Infraestrutura.

## Contexto do alerta

A SI informou que **exceções** previamente solicitadas podem reduzir a efetividade das proteções contra Node2Shell/PHP2Shell e vetores HTTP/Brotli.

## Verificações obrigatórias no painel

Para cada zona que publica a aplicação:

### Regras e exceções

- [ ] Listar **Custom Rules** com ação *Skip* / *Bypass* / *Allow*.
- [ ] Listar exceções de **Managed Rulesets** (WAF gerenciado).
- [ ] Identificar skips de **Bot Fight / Super Bot Fight**.
- [ ] Identificar skips de **Rate limiting**.
- [ ] Verificar se há bypass por path (`/api/*`, `/uploads/*`, `/voicecheck/*`, webhooks).
- [ ] Verificar bypass por IP/ASN “confiável” amplo demais.

### Para cada exceção encontrada, registrar

| Campo | Conteúdo |
|-------|----------|
| ID da regra | |
| Zona / hostname | |
| Aplicação afetada | Estúdio Musical / VocalAcademy / outro |
| Motivo original | |
| Risco associado aos CVEs 2026-111497 / 109618 / 109619 | |
| Impacto se removida | (quebra de cliente? upload grande?) |
| Recomendação | Remover / estreitar / substituir por allowlist |
| Homologação necessária | Sim/Não |
| Responsável | |

### HTTP/2 e compressão

- [ ] Confirmar se Cloudflare faz compressão Brotli na borda (comum) — isso **não** substitui patch do origin Node.
- [ ] Confirmar se o **origin** Node/Next ainda decodifica Brotli de clientes; se sim, patch de runtime é obrigatório mesmo com WAF.
- [ ] Revisar regras que inspecionam corpos comprimidos / HTTP/2.

### Mitigações temporárias (enquanto patch incompleto)

- [ ] Ativar/ajustar managed rules recomendadas pelo vendor para Brotli/RCE (se disponíveis).
- [ ] Rate limit agressivo em endpoints de upload e auth.
- [ ] Restringir métodos/paths desnecessários na edge.
- [ ] **Não** desligar WAF para “fazer o app funcionar”.

## Princípio

Priorizar **redução de bypass** sem causar indisponibilidade: estreitar exceções (path + método + IP) em vez de skip global. Remoções em produção exigem homologação.
