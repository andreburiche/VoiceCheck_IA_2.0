# VoiceCheck IA — Diagnóstico Vocal (plano)

**Data:** 2026-10-25  
**Escopo:** módulo independente da Sala de Treinamento; 100% local; sem métricas inventadas.

## Auditoria — o que reutilizar

| Recurso | Onde | Reuso VoiceCheck |
|---------|------|------------------|
| YIN / F0 frames | `lib/pitch-yin-frames.ts`, `midi-export.ts` | Afinação / estabilidade |
| Cents / nomes | `lib/pitch-math.ts` | Eventos estruturados |
| Comparação + ritmo | `lib/practice-pitch-analysis.ts` | Adaptar (sem depender de practice take) |
| IndexedDB blob | `lib/practice-recordings.ts` | Padrão para assets locais |
| ffprobe / MIME | `apps/api/.../media.py`, uploads | Fase 2–3: validação server/worker |
| FFmpeg decode | `workers/.../ffmpeg_util.py` | Extração áudio de vídeo / WAV interno |
| Demucs 4 stems | worker separate | Separação vocal opcional |
| Basic Pitch / YIN worker | `pitch_basic.py`, `pitch_yin.py` | Adaptadores offline |
| Partitura Lab | vocal-lab / MusicXML | Referência opcional |
| UI dark / tokens | canvas, accent, violet | Layout da referência |

## Modelos / licenças (offline)

| Peça | Licença típica | Nota |
|------|----------------|------|
| Demucs (htdemucs) | MIT | Já no stack |
| YIN client | código nosso | Experimental monofonia |
| Basic Pitch | Apache-2.0 | Opcional `INSTALL_BASIC_PITCH` |
| CREPE / torchcrepe | MIT / BSD-like | Avaliar pesos; não obrigatório F1 |
| librosa (worker) | ISC | Se adicionar pYIN server-side |

**Proibido:** APIs cloud de análise vocal; scores “demo” como reais.

## Independência

- Rota: `/voicecheck` (não sob `/projects/[id]/practice`).
- Persistência própria: IndexedDB `voicecheck_*` → SQLite Tauri depois.
- Pode *opcionalmente* linkar a um projeto do estúdio, sem exigir.

## Fases

| Fase | Entrega | Status |
|------|---------|--------|
| **1** | Página + menu + stepper + import/preview local | ✅ |
| **2** | Validação FFmpeg/ffprobe + extrair áudio de vídeo | ✅ `/voicecheck/prepare` + fallback browser |
| **3** | F0 YIN + indicadores observáveis (sem afinação) | ✅ pitch/analysis + UI + testes sintéticos |
| **4** | Comparação com referência | ✅ MIDI+MusicXML+áudio-ref |
| **4.5** | Análise técnica sem referência (ocorrências reais) | ✅ detectors + JSON + UI |
| **6** | Relatório PDF pedagógico (aluno / técnico / completo) | ✅ |
| **5–9** | Ritmo avançado / PDF / indicadores | conforme PRD |

## Fase 4 — plano de integração

**Estado Fase 3 (preservar):**  
`voicecheck_media` · `voicecheck_pitch` · `voicecheck_analysis` (`voicecheck_f0_v1`, `no_reference: true`) · WAV IndexedDB + `/analyze`.

**Novos módulos:**  
`reference` (MIDI→notas) · `alignment` (offset + transposição sugerida) · `comparison` (cents/ritmo) · `feedback` (texto pedagógico).

**Contrato:** estender JSON com `mode`, `reference`, `alignment`, `comparison`, `events`, `recommendations` sem remover campos v1. Versão `voicecheck_ref_v4`.

| Sub | Entrega |
|-----|---------|
| 4.1 | MIDI (`mido`) + normalização | ✅ |
| 4.2 | MusicXML (stdlib XML → mesmas notas) | ✅ |
| 4.3 | Alinhamento offset + match sequencial | ✅ |
| 4.4 | Afinação (cents, tolerância) | ✅ |
| 4.5 | Detectors sem ref (breaks, stability, dynamics, vibrato, breath, phrasing) + positivos | ✅ |
| 4.8 | Áudio como referência (F0→notas→mesmo compare) | ✅ |
| 4.5+ | Ritmo fino DTW, .mxl zip | pendente |

### Correção 4.5 — por que só aparecia mediana F0

1. Modo `without_reference` não gerava `events` (só F0 agregado).
2. UI Resultados/aside eram placeholders (`HonestEmpty`).
3. Fallback `client_yin_v1` quando a API falhava — sem detectors.

**Pipeline:** `analyze` → YIN Python → `run_technical_analysis` → `voicecheck_tech_v45` → UI.

**Tauri:** ainda sem comandos VoiceCheck dedicados — API local + fallback client.

## Tabelas (Fase 8 — esboço)

`vocal_diagnostic_projects`, `vocal_diagnostic_assets`, `vocal_reference_assets`,  
`vocal_diagnostic_jobs`, `vocal_measurements`, `vocal_diagnostic_events`,  
`vocal_recommendations`, `vocal_diagnostic_reports`  
(campos: algoritmo, versão, parâmetros, confiança, unidades).

## Princípios de UI

Seguir referência VoiceCheck (grafite / turquesa / violeta); painéis vazios honestos até haver job real.
