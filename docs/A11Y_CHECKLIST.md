# Checklist de acessibilidade (WCAG 2.2 AA — MVP)

Auditoria formal completa fica para pós-MVP. Use esta lista em smoke manual + Playwright.

## Telas críticas

| Tela | Foco | Status |
|------|------|--------|
| Landing | contraste, skip link, heading único | Manual |
| Login / Cadastro | labels associados, erros `role=alert`, teclado | Manual + E2E |
| Painel / Projetos | navegação sidebar, foco visível | Manual |
| Upload | status de progresso anunciável | Manual |
| Estúdio | controles mute/solo com nome acessível; transporte teclado | Manual |
| Treino | sliders velocidade/pitch com `Label`; Detectar com feedback | Manual |
| Admin | tabelas com `<th>` | Implementado |

## Critérios mínimos

- [x] Skip link “Ir para o conteúdo” (layout raiz)
- [x] Foco visível (`*:focus-visible` no globals.css)
- [x] Formulários auth/treino: `<Label htmlFor>`
- [x] Mensagens de erro com `role="alert"` nas telas críticas
- [ ] Todo controle interativo alcançável por Tab / Shift+Tab (revisão manual)
- [ ] Contraste texto ≥ 4.5:1 no tema atual (Lighthouse/axe)
- [x] Ícones decorativos com `aria-hidden` (nav/branding)
- [ ] Modais (se houver): trap de foco + Escape
- [ ] Auditoria formal WCAG AA (especialista) — **não declarar conformidade sem isso**

## Ferramentas sugeridas

```bash
# DevTools Lighthouse → Accessibility
# Extensão axe DevTools nas rotas /login /dashboard /projects /studio /practice
pnpm --filter @estudio/web test:e2e
```

Não declarar conformidade AA sem auditoria especializada.
