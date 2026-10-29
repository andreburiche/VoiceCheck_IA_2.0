# Decisões de Arquitetura (ADRs)

Registro de decisões da Fase 0. Formato: contexto → decisão → consequências → status.

---

## ADR-001 — Monorepo pnpm + apps/workers/packages

**Status:** Aceito  
**Data:** 2026-10-23

**Contexto:** Repositório vazio; necessidade de web, API, workers e contratos versionados juntos.

**Decisão:** Monorepo com pnpm workspaces para JS/TS; Python em `apps/api` e `workers/audio` com `pyproject.toml` próprios. Contratos OpenAPI em `packages/contracts`.

**Consequências:** Deploy independente por serviço; versionamento único; CI orquestra lint/test por pacote. Evita polyrepo prematuro.

---

## ADR-002 — Next.js 16 (App Router) + FastAPI

**Status:** Aceito

**Contexto:** Requisito explícito de stack.

**Decisão:** `apps/web` Next.js 16 + React + TypeScript strict + Tailwind + shadcn/ui + TanStack Query. `apps/api` FastAPI + Pydantic v2 + SQLAlchemy 2 + Alembic.

**Consequências:** SSR/SEO na landing; API tipada via OpenAPI; client gerado a partir do contrato.

---

## ADR-003 — MySQL 8 para metadados; S3-compatible para blobs

**Status:** Aceito

**Contexto:** Áudio não deve viver no banco; necessidade de FKs e índices relacionais.

**Decisão:** MySQL 8 somente metadados. MinIO em dev; S3 (ou compatível) em staging/prod. URLs assinadas com TTL curto.

**Consequências:** Escala de storage independente; backups de DB menores; política de retenção no object storage.

---

## ADR-004 — Celery + Redis para filas de áudio

**Status:** Aceito

**Contexto:** Inferência é longa, GPU-bound, com retries e cancelamento.

**Decisão:** Celery workers em `workers/audio`; Redis como broker/result backend leve; estados de job no MySQL como fonte da verdade; Redis também para pub/sub de eventos SSE.

**Consequências:** Horizontal scaling de workers; necessidade de cancelamento cooperativo (flag no DB checada entre chunks).

---

## ADR-005 — Demucs `htdemucs` (4 stems) como modelo inicial

**Status:** Aceito  
**Licença:** MIT (facebookresearch/demucs) — adequada a uso comercial SaaS

**Contexto:** Separação real obrigatória; não inventar resultados; não instalar modelos de licença duvidosa.

**Decisão:** MVP com Demucs `htdemucs` → vocals, drums, bass, other. Pesos baixados explicitamente em build/runtime documentado. 6 stems / vocal split adiados à Fase 6 com nova ADR de licença.

**Consequências:** Qualidade de isolamento **imperfeita** (comunicar na UI). Reprocessamento versionado. Alternativa futura (ex.: Open-Unmix, MDX) exige ADR e validação de licença.

---

## ADR-006 — Adapter de inferência (GPU / CPU / Contract)

**Status:** Aceito (Fase 3 implementada)

**Contexto:** GPU pode estar indisponível em CI/dev local.

**Decisão:** Interface `SeparationAdapter` com implementações:
- `GpuDemucsAdapter` / `CpuDemucsAdapter` (Demucs htdemucs, MIT)
- `ContractNoopAdapter`: falha por padrão; com `ALLOW_CONTRACT_STEMS=1` gera WAVs silenciosos alinhados **somente** para smoke de pipeline (metadado `contract-0.0.0`)

Seleção via `SEPARATION_ADAPTER` env. Produção: Demucs + `ALLOW_CONTRACT_STEMS=0`.

**Consequências:** Fila, SSE, QA e ledger testáveis sem GPU. UI não deve apresentar silence contract como “IA real”.

---

## ADR-007 — Autenticação cookie httpOnly + CSRF

**Status:** Aceito

**Contexto:** App web first-party; XSS não deve vazar tokens facilmente.

**Decisão:** JWT (ou session token) em cookie `HttpOnly; Secure; SameSite=Lax`; CSRF double-submit ou header token em mutações; CORS allowlist.

**Consequências:** Melhor postura XSS; clients não-browser usam Bearer (Fase 7+ se necessário).

---

## ADR-008 — Web Audio API única para sync; WaveSurfer só visual

**Status:** Aceito

**Contexto:** Players HTMLAudioElement independentes destoam.

**Decisão:** Um `AudioContext`; buffers agendados no mesmo `currentTime`. WaveSurfer.js para waveforms/zoom, sem ser fonte da verdade do transporte.

**Consequências:** Sync sample-accurate; maior complexidade de memória (decode progressivo, liberar buffers).

---

## ADR-009 — Cobrança idempotente via usage_ledger.job_id UNIQUE

**Status:** Aceito

**Contexto:** Retries de worker não podem debitar cota duas vezes.

**Decisão:** Inserir linha em `usage_ledger` somente ao marcar job `completed`, com `job_id UNIQUE`. Retries reutilizam o mesmo job_id.

**Consequências:** Simples e à prova de race (constraint DB). Reprocessamento explícito = novo job = nova cobrança (esperado).

---

## ADR-010 — Soft delete + retenção; IDs UUID públicos

**Status:** Aceito

**Contexto:** LGPD e recuperação de exclusões acidentais.

**Decisão:** `deleted_at` em users/projects/assets; job de retenção (Fase 7/8) remove blobs e hard-delete após período. UUIDs públicos evitam enumeração sequencial.

---

## ADR-011 — OpenAPI como contrato canônico

**Status:** Aceito

**Decisão:** `packages/contracts/openapi.yaml` gerado/mantido a partir do FastAPI; client TS gerado para o web.

**Consequências:** Tipagem ponta a ponta; breaking changes visíveis em CI.

---

## ADR-012 — Sem mocks em produção; sem botões mortos

**Status:** Aceito

**Decisão:** Features incompletas ficam desabilitadas com mensagem ou atrás de feature flag. Separação sempre passa por job real (mesmo que adapter Contract só em test).

---

## ADR-013 — Storage adapter `local` | `s3`

**Status:** Aceito (atualizado Fase 2)  
**Data:** 2026-10-23 / 2026-10-24

**Contexto:** Pull de imagens MinIO falhou neste ambiente; upload real é obrigatório na Fase 2.

**Decisão:**
- `STORAGE_BACKEND=local` (padrão): disco em `/data/audio` com URLs assinadas HMAC via API (`/uploads/local`, `/audio-assets/local-download`).
- `STORAGE_BACKEND=s3`: presigned PUT/GET MinIO/S3; Compose profile `storage` opcional.
- Validação no `complete`: checksum SHA-256, sniff MIME, tamanho, ffprobe (duração/canais/SR).

**Consequências:** Dev funciona sem MinIO. Produção deve usar `s3`. Mesma API de initiate/complete para ambos.

---

## ADR-014 — Time-stretch / pitch no client (WSOLA próprio)

**Status:** Aceito (Fase 6)  
**Data:** 2026-10-24

**Contexto:** Modo treino precisa de velocidade 50–150% e pitch ±12 st sem libs GPL (Rubber Band) nem LGPL (SoundTouch) no bundle.

**Decisão:** Implementar WSOLA + resample em `apps/web/lib/audio-stretch.ts` (código do projeto). `AudioEngine` guarda buffers raw e reprocessa playback ao mudar speed/pitch. Metrônomo escala com a velocidade de prática.

**Consequências:** Qualidade de treino (não mastering); CPU no browser em mudanças de parâmetro; sem dependência de licença restritiva. Server-side ffmpeg/`atempo` permanece opção futura para export “slow practice”.

---

## ADR-015 — Análise BPM/tonalidade no browser (estimativa)

**Status:** Aceito (Fase 6)

**Contexto:** Campos `projects.bpm` / `musical_key` já existem e são editáveis.

**Decisão:** Análise client-side (`audio-analysis.ts`: envelope + autocorrelação para BPM; chroma + Krumhansl-Schmuckler para tom; tríades por compasso para acordes). UI “Detectar” preenche e persiste via PATCH (`bpm`, `musical_key`, `chords_hint`).

**Consequências:** Sem job/GPU para análise básica; honestidade na UI (“estimativa”); falsos positivos possíveis em áudio denso — usuário corrige.

---

## ADR-019 — PyJWT no lugar de python-jose

**Status:** Aceito  
**Data:** 2026-10-24

**Contexto:** `python-jose` emite `DeprecationWarning` por `datetime.utcnow()` interno.

**Decisão:** Usar `PyJWT[crypto]==2.10.1` em `apps/api` com `datetime.now(UTC)` no payload.

**Consequências:** Mesma API HS256; warning eliminado; biblioteca mais mantida.

---

## ADR-018 — Rate limit Redis + CSRF assinado

**Status:** Aceito (Fase 8)

**Contexto:** Auth e upload são alvos de abuso; `CSRF_SECRET` existia sem uso.

**Decisão:** Rate limit por IP em login/register/upload initiate (`rate_limit.py`, Redis com fallback memória). CSRF double-submit com HMAC (`nonce.sig`) via `CSRF_SECRET`. Headers `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`; HSTS só em `APP_ENV=production`.

**Consequências:** 429 sob flood; tokens CSRF antigos (uuid puro) invalidam após deploy — usuários reautenticam.

---

## ADR-017 — Cotas no plano ativo + HTTP 402

**Status:** Aceito (Fase 7)

**Contexto:** usage_ledger já registra minutos ao completar job; faltava enforcement.

**Decisão:** `services/quotas.py` resolve subscription ativa (fallback `free`). Antes de enfileirar separação: `max_concurrent_jobs` e `max_minutes_month` (incluindo duração estimada do asset). Upload: `max_storage_mb`. Violação → HTTP **402** com mensagem clara. Sem Stripe nesta fase.

**Consequências:** UX honesta de limite; billing real fica para iteração futura; testes promovem admin via ORM (sem endpoint público de escalate).

---

## ADR-016 — Modelos 6-stem / vocal split bloqueados

**Status:** Aceito (bloqueio explícito)

**Contexto:** Fase 6 previa modelos extras “somente se licença OK”. Candidatos comuns (alguns pesos MDX/UVR, forks) têm licenças ou termos de peso ambíguos para SaaS comercial.

**Decisão:** Manter apenas Demucs `htdemucs` (MIT, 4 stems). Não habilitar 6-stem nem vocal split até nova ADR nomeando modelo, licença do código **e** dos pesos, e plano de compliance. Enum `StemType` e seed `processing_models` permanecem 4 stems.

**Consequências:** Escopo de produto claro; evita risco legal; UI/worker não carregam layouts extras.

---

## ADR-017 — Recursos experimentais client-side (Sprint C)

**Status:** Aceito

**Contexto:** Benchmark pedia lab vocal (noise/reverb), MIDI e gravação sem violar ADR-016 nem simular modelos.

**Decisão:**
1. **Prévia 15s** — Demucs real no trecho (`params.preview_seconds`); não é mock.
2. **Lab vocal** — DSP local (gate RMS + high-pass), flag experimental e disclaimer; sem pesos ML de noise/reverb.
3. **MIDI** — autocorrelação → Type 0; limitado a monofonia aproximada; rotulado experimental.
4. **Gravação de ensaio** — `MediaRecorder` + IndexedDB local; não sobe ao servidor nesta fase.
5. **6-stem / vocal split** — continuam bloqueados (ADR-016).

**Consequências:** Entrega honesta de P2 parcial; usuários veem limitações; caminho aberto para ADR futura com pesos licenciados.

---

## ADR-018 — FX de master no Web Audio (Sprint D)

**Status:** Aceito

**Contexto:** Após EQ, faltavam efeitos de estúdio sem plugins proprietários.

**Decisão:** Compressor (`DynamicsCompressorNode`), delay com feedback e reverb via `ConvolverNode` + impulse sintético. Estado em `mix_presets.state.fx`. Processamento 100% local no browser.

**Consequências:** UX de mixagem útil; reverb não compete com IR comerciais; sem dependência de VST.

---

## ADR-019 — Letras manuais locais (Sprint E)

**Status:** Aceito

**Contexto:** Benchmark pedia letras/seções; ASR cloud violaria privacidade local-first; Whisper local exige pesos/licença.

**Decisão:** Editor de letras em IndexedDB com linhas, timestamps opcionais (playhead), vínculo a seções e export TXT. Sem ASR até ADR dedicada.

**Consequências:** Treino com letra sincronizável; honestidade sobre ausência de reconhecimento automático.

---

## ADR-020 — Laboratório de Vozes e Solfejo (Fase 1)

**Status:** Aceito (defaults após “seguir” sem respostas pontuais)

**Contexto:** PRD de partitura/solfejo/SATB. Demucs só entrega um stem `vocals`. ADR-016 bloqueia vocal-split. Basic Pitch no worker exige rebuild pesado.

**Decisão (Fase 1 — voz única):**
1. Fonte padrão: stem `vocals` do projeto (Demucs).
2. Transcrição monofônica no **browser** (F0/autocorrelação melhorada) + persistência MySQL (`vocal_*`).
3. Classificação SATB / “voz 2–4” **somente manual**; sem inferência por altura média.
4. Partitura SVG própria + export MIDI e MusicXML; PDF via impressão do browser nesta fase.
5. Modo Piano (síntese Web Audio); Solfejo com formantes (Fase 2); multi-voz fica Fase 4.
6. Polifonia/coral: UI declara **incerteza**; não marcar Fase 4 concluída sem testes reais + eventual ADR de modelo.

**Fase 2 (2026-10-25):** Solfejo fixo/móvel via formantes vocálicos locais (sem banco de amostras); export WAV piano/solfejo via `OfflineAudioContext`; sílabas na pauta. Não confundir com voz humana.

**Fase 3 (2026-10-25):** Fonte default = stem Demucs `vocals` do projeto; painel DSP experimental (gate/high-pass) opcional antes de re-transcrever. Sem vocal-split.

**Fase 4 (2026-10-25):** Multi-voz **manual** — API `POST/DELETE` partes (máx. 8); rótulos SATB; import WAV por voz; esboço harmônico (−5 st) só como rascunho editável; MusicXML multi-parte; play “todas as vozes”. **Não** declara polifonia automática concluída.

**Fase 5 (2026-10-25):** Loop por trecho na parte ativa; anotações em `meta.part_annotations`; export ZIP de treino (MusicXML + MIDI + WAV piano/solfejo por voz) via ZIP store no browser.

**Worker pitch (2026-10-25):** `POST .../vocal-transcriptions/worker` enfileira Celery `transcribe_vocal`. Motor: Spotify **Basic Pitch** se `INSTALL_BASIC_PITCH=1` no build; senão **YIN/numpy** (`worker_yin_v1`). Mesmo schema `vocal_*`; UI faz poll. Verovio/MuseScore CLI permanece opcional.

**Consequências:** Aceite monofônico + coral assistido manual; Basic Pitch opcional sem obrigar rebuild TF; Verovio ainda em aberto.

---

## Riscos conhecidos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| GPU ausente em dev | Sem stems reais locais | Adapter + documentar; smoke GPU em staging |
| VRAM insuficiente | OOM / falha | Chunking/overlap, limites de duração, fila dedicada |
| Demucs qualidade variável | Expectativa irreal do usuário | Disclaimer na UI; permitir reprocessamento |
| Uploads maliciosos | RCE/DoS via FFmpeg | Validação MIME, limites, sandbox tmp, timeout |
| Custo GPU | Margem SaaS | Cotas por plano; métricas de custo/minuto |
| Autoplay browser | Playback bloqueado | Gesture gate; mensagem clara |
| Sync drift mobile | UX ruim | Simplificar mobile; full studio no desktop |
| Licenças futuras (6-stem) | Legal | Bloquear até ADR de licença |
| Zip bomb / stem ZIP | DoS | Limites de tamanho comprimido/descomprimido |
| IDOR | Vazamento de áudio | Testes de ownership em toda rota |

---

## Dependências de GPU (explícito)

Para **inferência real** no MVP:

1. NVIDIA GPU com CUDA compatível com a build PyTorch escolhida
2. Drivers + nvidia-container-toolkit (Docker)
3. Pesos Demucs `htdemucs` baixados (cache volume)
4. FFmpeg instalado no worker
5. `SEPARATION_ADAPTER=gpu_demucs`

Sem isso: pipeline e API completos; jobs falham com erro claro **ou** usam `cpu_demucs` (lento) em ambiente de desenvolvimento — nunca inventar stems sintéticos passados como reais ao usuário final.
