# VoiceCheck IA 2.0 — Avaliação clínica da voz

**Data:** 2026-10-29
**Rota no site:** `/voz-clinica` (menu "Avaliação clínica")
**API:** `/api/v1/voz-clinica`

A versão 2.0 junta, numa só tela, o que hoje exige vários programas:
análise acústica (VoxMetria, Praat, lingWAVES), protocolos (iVox) e histórico por
paciente. Biofeedback e jogos (VoxGames, Voice Analyst) ficam para a fase 2.

## O que a tela faz

| Etapa | Como |
| --- | --- |
| Paciente | Nome ou código. Com ele preenchido, cada resultado fica salvo; sem ele, só aparece na tela |
| Gravar | Microfone **sem** cancelamento de eco, supressão de ruído e ganho automático (o Treino usa esses filtros; aqui eles distorceriam as medidas). Avisa se o navegador não obedecer, se saturar ou se o sinal ficar baixo |
| Analisar | F0 e variação, jitter (local, RAP, PPQ5), shimmer (local, dB, APQ3, APQ5), HNR, CPPS, F1–F3, tempo de fonação, quebras de voz |
| IDV-10 | 10 itens de 0 a 4; total 0–40; nota de corte 7,5 |
| QVV | 10 itens de 1 a 5; escores 0–100 (total, físico, socioemocional); nota de corte 91,25 |
| GRBASI | G, R, B, A, S, I de 0 a 3; registro (ex.: G2R1B2A0S1I0) |
| Histórico | Lista por paciente, mais recente primeiro, com exclusão confirmada |
| Evolução | Um gráfico por medida (jitter, shimmer, HNR, CPPS, IDV-10, QVV, GRBASI G), até 12 sessões, com linha da nota de corte nos protocolos e valor de cada sessão ao passar o mouse ou focar pelo teclado. Aparece a partir da 2ª avaliação do mesmo tipo |
| Relatório em PDF | Botão no histórico: análise acústica e protocolos mais recentes, gráficos de evolução, todas as sessões, profissional e observações (opcionais). HTML A4 impresso pelo navegador ("Salvar como PDF"), mesmo mecanismo dos relatórios do VoiceCheck |

Os textos das perguntas não estão no sistema: o profissional lê da versão
validada impressa (ou inclui depois de obter licença).

## Arquitetura

```
apps/web/app/(app)/voz-clinica/page.tsx
apps/web/components/voz-clinica/avaliacao-clinica.tsx   tela
apps/web/lib/voz-clinica-gravador.ts                   gravação sem filtros (AudioWorklet)
apps/web/lib/voz-clinica-wav.ts                        WAV PCM 16 bits
apps/web/lib/voz-clinica-api.ts                        cliente + formatação
apps/web/lib/voz-clinica-evolucao.ts                   séries, escala do eixo, variação
apps/web/components/voz-clinica/grafico-evolucao.tsx   gráfico de uma medida
apps/web/lib/voz-clinica-relatorio.ts                  relatório A4 (HTML + SVG estático)
        │  multipart / JSON, cookie de sessão + CSRF
        ▼
apps/api/app/api/v1/voz_clinica.py                     rotas
apps/api/app/services/voz_clinica/                     motores, protocolos, DSI
apps/api/app/models/entities.py → ClinicalEvaluation   tabela clinical_evaluations
apps/api/alembic/versions/20261029_0009_*.py           migração
```

Todo número é calculado no servidor; o navegador só envia o WAV ou as respostas.

### Rotas

| Rota | Entrada | Salva? |
| --- | --- | --- |
| `GET /status` | — | — |
| `POST /analisar` | multipart: `file` (WAV), `f0_min`, `f0_max`, `motor`, `paciente` | se `paciente` |
| `POST /protocolos/{idv10\|qvv\|grbasi}` | `{"respostas": ..., "paciente": ...}` | se `paciente` |
| `POST /dsi` | `{"tmf_s", "f0_alta_hz", "i_baixa_db_spl", "jitter_pct"}` | não |
| `GET /pacientes` | — | — |
| `GET /avaliacoes?paciente=` | — | — |
| `DELETE /avaliacoes/{id}` | — | — |

Todas exigem login; as que alteram dados exigem CSRF. Cada usuário só vê e
exclui as próprias avaliações. `/analisar` tem limite de taxa e roda o cálculo em
thread para não travar a API.

### Motores de análise

| Motor | Quando | Observação |
| --- | --- | --- |
| `praat` | Automático se `praat-parselmouth` estiver instalado (está no requirements) | Usa o próprio Praat; números comparáveis aos da literatura |
| `interno` | Reserva | numpy/scipy. Jitter e shimmer conferidos com erro < 2,5% em voz sintética; HNR e CPPS seguem a tendência do Praat, mas os valores absolutos diferem |

## Testes

```bash
# API (os de cálculo rodam sem banco; o de rotas pula se a API estiver fora)
docker exec -e PUBLIC_API_URL=http://localhost:8000 estudio-api pytest -q tests/test_voz_clinica_*.py
# Site
pnpm --filter @estudio/web test -- voz-clinica
pnpm --filter @estudio/web typecheck
```

Já verificado durante o desenvolvimento: 43 testes de cálculo; tela completa no
Chromium com microfone simulado (gravar → analisar → protocolos → histórico →
excluir), com o React do projeto e a API simulada pelo mesmo código de análise;
TypeScript com as opções estritas do projeto.

**Ainda não executado:** motor Praat (Parselmouth) e rotas contra MySQL — rodam
no Docker com os comandos acima.

## Pontos a conferir antes do uso clínico

- Fórmula de padronização do QVV (`100 − (bruto − mínimo)/(máximo − mínimo) × 100`):
  conferir com Gasparini & Behlau (2009). Domínios (físico 1, 2, 3, 6, 7, 9;
  socioemocional 4, 5, 8, 10) já confirmados em artigos brasileiros.
- Notas de corte IDV-10 7,5 e QVV 91,25: Behlau et al. (2016).
- Intensidade sai em dBFS (relativa). dB SPL exige microfone calibrado.
- Dados de saúde: o nome do paciente e os resultados são dados sensíveis (LGPD).
- A análise não é diagnóstico médico.

## Próximas fases

1. ~~Gráfico de evolução por paciente~~ (feito).
2. ~~Relatório PDF da avaliação clínica~~ (feito).
3. Biofeedback ao vivo (pitch e volume com metas de faixa) e jogos (intensidade,
   frequência, tempo de fonação).
