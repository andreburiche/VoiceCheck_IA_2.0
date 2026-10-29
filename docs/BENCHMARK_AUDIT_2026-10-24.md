# Auditoria de benchmarking — Estúdio Musical IA (2026-10-24)

**Escopo:** funcionalidades selecionadas (P0/P1/P2) vs estado do monorepo Next/FastAPI/Celery.  
**Prompt mestre:** `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/DECISIONS.md` (ADR-005/006/016).  
**Regra:** sem mocks de separação em produção; Demucs real via `cpu_demucs` (validado neste ambiente).

---

## 1. Matriz de aderência (seleção do produto)

| Prioridade | Funcionalidade | Estado | Evidência / lacuna |
|---|---|---|---|
| **P0** | Separação vocal/instrumental — IA | **OK** | `htdemucs_two`: Demucs 4 + soma drums/bass/other → `instrumental` (Sprint A) |
| **P0** | Separação em 4 stems — IA | **OK** | `cpu_demucs` + `htdemucs`; progresso SSE; cancel cooperativo; reprocess via novo job |
| **P1** | Separação em 6 stems — IA | **Bloqueado** | ADR-016; enum `StemType` = 4; sem pesos licenciados |
| **P2** | Voz principal / backing — IA | **Bloqueado** | ADR-016; sem modelo |
| **P1** | Prévia e comparação de modelos — IA | **OK** | A/B + prévia 15s real (`preview_seconds`, Sprint C) |
| **P2** | Redução de ruído / reverb — IA | **Parcial** | Lab vocal DSP experimental (ADR-017); sem ML |
| **P0** | Mixer sincronizado — Estúdio | **OK** | `AudioEngine` + WaveSurfer; relógio central |
| **P0** | Mute, solo, volume e pan — Estúdio | **OK** | UI + persistência `mix_presets` |
| **P1** | Equalizador e efeitos — Estúdio | **OK** | EQ + compressor/delay/reverb no master (Sprint D) |
| **P0** | Loop A–B e marcadores — Treino | **OK** | CRUD completo markers/loops (PATCH/DELETE) + UI remover (Sprint A) |
| **P1** | Metrônomo e contagem inicial — Treino | **OK** | Practice + transport |
| **P1** | Velocidade e tom — Treino | **OK** | Speed + pitch UI no estúdio e treino (Sprint B) |
| **P1** | BPM e acordes estimados — Treino | **OK** | Client `audio-analysis.ts` + PATCH projeto |
| **P2** | Letras e seções — Treino | **OK** | Seções + letras manuais com tempo/export TXT (Sprint E); ASR ainda não |
| **P1** | Setlists e repertórios — Biblioteca | **OK** | IndexedDB local-first (Sprint B); sync MySQL futuro |
| **P0** | Export WAV, MP3 e ZIP — Biblioteca | **OK** | WAV/ZIP + MP3 via `params.format` + libmp3lame (Sprint A) |
| **P2** | Stems → MIDI — Estúdio | **Parcial** | Lab vocal → MIDI experimental (ADR-017) |
| **P2** | Gravação do músico — Treino | **OK** | MediaRecorder + IndexedDB local (Sprint C) |

**Cobertura P0:** 5/5 OK após Sprint A (2-stem, mixer, mute/solo, loop/markers, export WAV/MP3/ZIP).  
**Cobertura P1:** ~40% (metrônomo/BPM OK; EQ/setlists/comparação/pitch UI/6-stem faltam).  
**Cobertura P2:** letras/seções/gravação/MIDI-lab OK-parcial; 6-stem e vocal-split bloqueados.

---

## 2. Arquitetura atual (resumo)

```
Browser (Next :3000)
  ├─ Web Audio AudioEngine (sync, stretch, metronome)
  ├─ IndexedDB (library / practice presets / analysis local)
  └─ localStorage (app settings)
        │ HTTPS cookies JWT+CSRF
API FastAPI (:8010)
  ├─ MySQL 8 (metadados, jobs, stems, mix, practice)
  ├─ Redis (Celery + SSE events)
  └─ Storage local /data/audio
Worker Celery
  └─ adapters: contract | cpu_demucs | gpu_demucs → Demucs htdemucs (MIT)
```

**Persistência:** MySQL = fonte de verdade servidor; IndexedDB/localStorage = preferências e rascunhos locais (caminho Tauri/SQLite futuro documentado no código).

---

## 3. Modelos e licenças

| Artefato | Licença | Uso |
|---|---|---|
| Demucs `htdemucs` | MIT | Único modelo de produção; 4 stems |
| `contract` adapter | N/A | Smoke apenas; não usar como produto |
| Catálogo 6-stem / vocal split | — | Bloqueado até ADR de pesos + licença |
| WSOLA (`audio-stretch.ts`) | Código do projeto | Speed no client |

**Hardware:** CPU Demucs validado (~35s para clipe ~4,5s). GPU opcional via `gpu_demucs`. Build: `INSTALL_DEMUCS=1`.

---

## 4. Plano incremental (após aprovação)

### Sprint A — Fechar P0 (essencial)
1. Job/adaptador **2 stems** (vocals + instrumental) reusando Demucs 4 e somando drums+bass+other **ou** modelo two oficial se licença OK.
2. Export **MP3** no worker (lame/ffmpeg libmp3lame) + desbloquear UI.
3. CRUD completo markers/loops (DELETE/PATCH).
4. Testes: pytest fluxo 2-stem; e2e export MP3; Vitest AudioEngine.

### Sprint B — P1 estúdio/treino
1. **EQ** 3–5 bandas no `AudioEngine` + UI + persistência no mix preset.
2. **Pitch** UI (ligar `setPitchSemitones`) no transport/practice.
3. **Comparação de modelos**: 2 jobs no mesmo asset + UI A/B (mesmo catálogo 4-stem / variantes instaladas).
4. **Setlists** (MySQL ou IndexedDB com sync futuro) na Biblioteca.
5. Prévia curta (ex.: 15s) opcional antes do job full.

### Sprint C — P1/P2 com compliance
1. Nova ADR + modelo **6 stems** somente com licença de pesos explícita.
2. Laboratório vocal experimental (noise/reverb) com flag `experimental` e disclaimers.
3. MIDI (basic pitch / onset) marcado experimental.
4. Gravação de ensaio (MediaRecorder → asset local).

**Não fazer em paralelo:** reescrever UI inteira; anunciar 10 stems; simular Demucs.

---

## 5. Critérios de aceite (P0)

- [ ] Separação 4 stems Demucs sem contract em `APP_ENV=development|production` com `ALLOW_CONTRACT_STEMS=0`.
- [ ] Vocal/instrumental disponível como preset real (2 faixas audíveis distintas).
- [ ] Mute/solo/vol/pan + loop + markers funcionam após F5 (persistidos).
- [ ] Export WAV individual + ZIP; MP3 mixdown ou stems conforme UI.
- [ ] Progresso SSE + cancel interrompe entre etapas; falha com `error_code` legível.
- [ ] Testes automatizados da API de separations + smoke web typecheck.

---

## 6. Limitações conhecidas (hoje)

- Cancel não mata processo Demucs mid-inference (cooperativo).
- OpenAPI em `packages/contracts` desatualizado.
- Preferência de device na Settings não altera `SEPARATION_ADAPTER` do servidor.
- Clipes curtos (ex. MP4 4,5s) limitam percepção de qualidade da separação.
- UI de pitch e EQ ainda não existem.

---

## 7. Sprint A — concluído (2026-10-24)

Defaults aplicados: (1) 2-stem via soma drums+bass+other; (2) MP3 em stem, mixdown e ZIP; (3) setlists ficam para Sprint B.

**Arquivos principais:** `separate.py`, `stem_mix.py`, `export.py`, `studio.py` (CRUD), `entities.StemType.instrumental`, migração `20261024_0003`, UI separação/export/estúdio/treino.

**Sprint B (2026-10-24):** EQ 5 bandas, pitch UI, A/B jobs, setlists IndexedDB.

**Sprint C (2026-10-24):** Prévia 15s, lab vocal DSP, MIDI experimental, gravação ensaio, ADR-017. 6-stem/vocal-split ainda bloqueados (ADR-016).

**Sprint D (2026-10-24):** FX master (comp/delay/reverb) + seções manuais no treino.

**Sprint E (2026-10-24):** Letras manuais com timestamps, vínculo a seções, export TXT.

**Próximo:** ASR só com motor local + licença explícita; ou ADR de pesos para 6-stem.
