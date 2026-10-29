# Sala de Treinamento — Auditoria e plano (Professor Vocal IA)

**Data:** 2026-10-25  
**Escopo:** redesign + análise vocal 100% local, sem inventar métricas.

## Auditoria (estado atual)

| Área | Onde | Status |
|------|------|--------|
| Página | `apps/web/app/(app)/projects/[id]/practice/page.tsx` | Existe |
| Workspace | `practice-workspace.tsx` (~930 linhas) | Player, speed/pitch, loop, metrônomo, presets |
| Gravação | `practice-recorder.tsx` + IndexedDB | Mic, FX, takes locais |
| Waveform | `practice-scrubber.tsx` | Referência (stems) |
| Letras / seções | `lyrics-panel`, `song-sections-panel` | OK |
| Perfis | `practice-profiles.ts` | singer/drums/… |
| Sessões API | `practice_sessions` | duração/perfil; sem pitch events |
| Partitura | Lab vocal (`vocal_*`) | Separado; integração Fase 5 |
| Análise F0/CREPE | — | **Ausente** (só YIN no lab vocal) |
| Modelos no worker | Demucs | Sem CREPE/torchcrepe instalado |

**Preservar:** AudioEngine, gravação IndexedDB, FX de voz, letras, seções, loops/markers, presets, sessões.

## Princípios

1. Nunca inventar erros/métricas — painéis vazios até haver algoritmo + confiança.
2. Offline / local-first; áudio não sobe para nuvem.
3. Sem diagnóstico clínico (tensão laríngea, patologia, etc.).
4. Layout orientado pela referência visual; sem dados fictícios “como se fossem reais”.

## Fases

| Fase | Entrega | Aceite |
|------|---------|--------|
| **1** | Layout: header meta, dual-wave, abas centrais, painel coach (vazio honesto), rodapé/controles | ✅ |
| **2** | Gravação sincronizada + nível/clipping/dispositivo + latência + waveform voz | ✅ offsetSec + overlay no player |
| **3** | F0 client (YIN) vs Lab notes ou stem vocals + ritmo por onsets | ✅ eventos + gráfico + tolerância ¢ |
| **4** | Feedback didático a partir de eventos estruturados | Textos gerados de medições |
| **5** | Sync partitura Lab ↔ treino | Click nota → trecho |
| **6** | Histórico/comparação + exercícios por categoria | Tabelas `vocal_*` / training_* |
| **7** | Vibrato/dinâmica etc. após validação | Sem claims sem evidência |

## Fase 1 (esta entrega)

- Header: nome, BPM/tom (quando houver), perfil, link Alterar música.
- Centro: waveform referência + faixa “Sua voz” (placeholder até take).
- Abas: Treino · Afinação · Letras · Seções · Mais.
- Direita: Coach IA — estados vazios + roadmap.
- Sem migrations ainda (Fase 6).

## Stack prevista (Fases 3+)

- Client: YIN/pYIN (já há base no lab) → eventos `pitch_observations`.
- Opcional worker: CREPE/torchcrepe com `INSTALL_*` (como Basic Pitch).
- Alinhamento temporal: DTW leve ou onset vs markers/score.
