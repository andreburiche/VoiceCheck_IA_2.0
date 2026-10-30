# VoiceCheck IA 2.0 — Avaliação clínica da voz

**Data:** 2026-10-29
**Rota no site:** `/voz-clinica` (menu "Avaliação clínica"), com abas Avaliação · Anamnese · Fonetograma · Biofeedback · Jogos · Prática em casa; o histórico do paciente fica sempre abaixo
**API:** `/api/v1/voz-clinica`

A versão 2.0 junta, numa só tela, o que hoje exige vários programas:
análise acústica (VoxMetria, Praat, lingWAVES), protocolos (iVox) e histórico por
paciente. Biofeedback e jogos (VoxGames, Voice Analyst) ficam para a fase 2.

## O que a tela faz

| Etapa | Como |
| --- | --- |
| Paciente | Nome ou código. Com ele preenchido, cada resultado fica salvo; sem ele, só aparece na tela |
| Gravar | Microfone **sem** cancelamento de eco, supressão de ruído e ganho automático (o Treino usa esses filtros; aqui eles distorceriam as medidas). Avisa se o navegador não obedecer, se saturar ou se o sinal ficar baixo |
| Espectrograma | Logo após gravar: banda estreita (janela gaussiana de 30 ms — harmônicos e quebras) ou larga (5 ms — formantes e pulsos), 0–5 kHz, faixa dinâmica de 70 dB, pré-ênfase, curva de F0 opcional (YIN a cada 10 ms). Calculado no navegador (~0,1–0,2 s para 5 s de áudio) |
| Analisar | F0 e variação, jitter (local, RAP, PPQ5), shimmer (local, dB, APQ3, APQ5), HNR, CPPS, F1–F3, tempo de fonação, quebras de voz |
| IDV-10 | 10 itens de 0 a 4; total 0–40; nota de corte 7,5 |
| QVV | 10 itens de 1 a 5; escores 0–100 (total, físico, socioemocional); nota de corte 91,25 |
| GRBASI | G, R, B, A, S, I de 0 a 3; registro (ex.: G2R1B2A0S1I0) |
| EASE-BR | Facilidade para cantar (Rocha et al., CoDAS 2014). 22 itens; cada resposta é a opção marcada (não 0, um pouco 1, moderadamente 2, muito 3); itens 6, 12 e 21 (positivos) somam 3 − opção. Total 0–66. **Sem nota de corte nem subescalas**, porque a versão brasileira não publicou nenhuma. Lista os itens que somaram 2 ou 3 pontos |
| Anamnese | Aba própria. Queixa, tempo e evolução, 10 sintomas marcáveis, profissão, uso profissional da voz, horas de uso por dia, canto, tabagismo, álcool, água, refluxo, alergia respiratória, audição, terapia anterior, cirurgias/intubações, medicamentos e observações. Tudo opcional; só o que foi preenchido é salvo (tipo `anamnese`, uma versão nova a cada salvamento). "Usar a última anamnese" recupera a versão anterior para atualizar. O relatório PDF traz a mais recente |
| Histórico | Lista por paciente, mais recente primeiro, com exclusão confirmada |
| Evolução | Um gráfico por medida (jitter, shimmer, HNR, CPPS, IDV-10, QVV, GRBASI G, EASE-BR; nasalância por tarefa e quociente de contato do EGG por nível-critério, que só se comparam entre si), até 12 sessões, com linha da nota de corte nos protocolos e valor de cada sessão ao passar o mouse ou focar pelo teclado. Aparece a partir da 2ª avaliação do mesmo tipo |
| Protocolo de voz | Quadro com a medida mais recente de cada parte (fala, vogal, fonetograma, DSI, IDV-10, QVV, GRBASI). **F0 da fala**: leitura de texto, contagem ou fala espontânea (até 60 s) → F0 mediana e nota, média, desvio (Hz e st), faixa p5–p95, tempo com voz, pausas ≥ 250 ms. **Diadococinesia** (/pa/, /ta/, /ka/, /pataka/, até 20 s) → taxa em sílabas/s, intervalo médio, CV do ritmo, DP da intensidade, taxa no início e no fim, traço por sílaba (picos do envelope de intensidade: proeminência ≥ 6 dB, ≥ 70 ms entre sílabas). **Análise cepstral** (como no VoxMetria 5): vogal /ɛ/ + frase "Olha lá o avião azul" → CPP (sem suavização) e CPPS de cada uma; **AVQI 03.01** (Maryn 2010; Barsties & Maryn 2015) só com o motor Praat, com os comandos do roteiro publicado (3 s centrais da vogal + trechos sonoros da frase), sem ponto de corte na tela (depende da língua/protocolo). Voz sintética saudável ≈ 0,6; muito desviada ≈ 7,4. O DAI do VoxMetria não foi implementado (fórmula não publicada). **DSI** (Wuyts 2000) com TMF, F0-alta e jitter sugeridos do histórico e I-baixa em dB SPL digitada (decibelímetro), salvo com as quatro medidas |
| Gráficos da análise | Abaixo da tabela acústica, como no VoxMetria: sinal com trechos com/sem voz, curvas de F0 e intensidade, histograma da F0 (moda e média) e espectro de longo termo (FFT + envelope LPC com formantes). Também o plano da vogal (F1 × F2). O espectrograma ganhou controles de ganho e contraste (banda larga e estreita já existiam). Dados reduzidos (`graficos.py`, < 40 kB) salvos no resultado |
| Importar e editar | Na análise acústica: importar arquivo de áudio (WAV de preferência; MP3/M4A/OGG convertidos no navegador para WAV 16 bits mono, com aviso; até 60 s). Editor sobre a forma de onda: arrastar seleciona (ou campos de início/fim), ampliar/reduzir/ver tudo, ouvir a seleção, manter só a seleção, apagar a seleção (emenda com 5 ms de transição) e desfazer (até 20 passos) |
| Anotações | Cada item do histórico tem "Anotar": texto livre do profissional (até 4000 caracteres), salvo na avaliação (`PUT /avaliacoes/{id}/anotacao`, coluna `notes`, migração 20261030_0012), incluído na exportação LGPD |
| Carga vocal | Como o "Vocal loading test" do lingWAVES: calibração de 6 s em voz habitual, alvo = habitual + 6 a 14 dB; leitura em voz forte por 1 (triagem), 3, 5, 10 ou 15 min com intensidade e F0 ao vivo (a cada 100 ms, no navegador). Resumo: % do tempo com voz na intensidade pedida, F0 e intensidade no início e no fim (trechos de 15–60 s) e por minuto. Só o resumo é salvo (`POST /carga`) |
| Cadastro do paciente | Abaixo do campo Paciente: data de nascimento (idade calculada), sexo, telefone, e-mail, profissão, uso profissional da voz e observações — todos opcionais (minimização LGPD). Tabela `voice_patients` (migração 20261030_0013), ligada pelo nome/código, único por profissional. `GET/PUT /pacientes/cadastro`; entra na exportação e é apagado com o paciente. Idade, sexo e profissão vão para o cabeçalho do relatório; contatos não |
| Variações dos jogos | Como os vários jogos por módulo do VoxGames: Altitude (patamares, forte e fraco, ondas), Trilha (deslizes, escada, sirene), Sopro (vogal, /s/ e /z/ — conta qualquer som de fricativa), Surdo ou sonoro (todos os pares ou só s/z, f/v, ch/j), Som e silêncio (imprevisível, ritmado, rápido). A variação vai no resultado salvo (`variacao`) e no histórico. Altitude e Trilha têm cenário e personagem por variação (céu com balão ou pássaro, mar com peixe, espaço com foguete; `jogos-cenas.ts`) |
| Som e silêncio (jogo) | 5º módulo do VoxGames: ataque vocal e plosivos. O círculo acende em instantes imprevisíveis (1,8–3,5 s); cada início de som na janela de 1,2 s é acerto (com tempo de reação), fora dela é antecipação, sem resposta é perdido. Limiar = ruído de fundo + 15 dB (medido antes do 1º sinal) |
| Planilha (CSV) | Como o Voice Analyst: histórico do paciente em CSV para Excel/Planilhas (";" e vírgula decimal, BOM UTF-8), com F0, jitter, shimmer, HNR, CPPS, GNE, MWC, TMF, F0 da fala, CPPS da frase, AVQI, DSI e anotações; texto iniciado por = + - @ é protegido contra fórmula |
| Comparar | Duas análises acústicas lado a lado (padrão: a primeira e a mais recente): ouvir e baixar as gravações e ver, para cada medida, antes, depois, diferença e se melhorou, piorou ou ficou sem mudança relevante (tolerância da variação comum entre gravações; F0 sem juízo de melhor/pior) |
| Relatório em PDF | Botão no histórico: análise acústica e protocolos mais recentes, gráficos de evolução, todas as sessões, profissional e observações (opcionais). HTML A4 impresso pelo navegador ("Salvar como PDF"), mesmo mecanismo dos relatórios do VoiceCheck |
| Biofeedback ao vivo | Pitch (nota e Hz) e volume (dBFS) na tela enquanto o paciente fala ou canta, com faixas-alvo definidas pelo profissional, indicação "abaixo / dentro / acima" escrita (não só cor), curva dos últimos 8 s e % do tempo na faixa. Pitch por YIN a ~60 leituras/s com mediana de 3 contra leituras isoladas. O áudio não sai do aparelho; ao parar, o resumo da sessão pode ser salvo no histórico (tipo `biofeedback`) e entra na evolução |
| Jogos de terapia | Quatro jogos próprios (não copiam nomes, visual nem mecânica de produtos comerciais): **Altitude** (o volume controla a altura; seguir patamares), **Trilha** (o pitch controla a altura; patamares e deslizes), **Sopro longo** (sustentar a voz até a meta) e **Surdo ou sonoro** (s/z, f/v, ch/j). Faixas, duração, dificuldade e meta definidas pelo profissional. Resultado de cada partida pode ser salvo (tipo `jogo`) e tem curva própria na evolução |
| Prática em casa | Aba própria. O profissional monta até 6 exercícios — **vogal sustentada** (meta opcional), **voz na faixa de altura** (Hz) ou **volume controlado** (dBFS), com repetições, duração e instrução — e gera um **link secreto** (validade de 1 a 180 dias, até 3 ativos por paciente, revogável). Envio por WhatsApp ou cópia; o link aparece uma única vez (só o hash fica salvo). O paciente abre `/pratica` no celular **sem conta**: vê só os exercícios e um nome de tratamento opcional (nunca o nome completo nem o histórico). O áudio é analisado no celular (YIN + dBFS) e só os números de cada repetição são enviados; o servidor confere com o plano e recalcula o resumo (tipo `pratica`). **Funciona offline** depois da primeira abertura (service worker + fila no celular): sessões feitas sem internet são enviadas quando a conexão volta, sem duplicar (id gerado no celular). Sessões feitas antes de o link expirar podem ser enviadas até 7 dias depois; trocar de link no mesmo celular não perde o que o anterior não enviou. Teto de 24 sessões por dia e 400 por link (contra inundar o histórico). No iPhone, o app da tela inicial não enxerga o que o Safari guardou: na primeira abertura, o paciente cola a mensagem com o link. Curvas próprias na evolução (melhor tempo; % na faixa) |
| Fonetograma | Campo vocal: para cada semitom alcançado (≥ 0,15 s), a menor e a maior intensidade, ignorando os primeiros 50 ms de cada nota (ataque). Glissandos em voz fraca e forte, com pausa e retomada somando ao mesmo campo. Nota mais grave e mais aguda, extensão em semitons, faixa dinâmica média e área. Intensidade **relativa (dBFS)** ou, com o microfone **calibrado por decibelímetro**, em **dB SPL**: o profissional sustenta uma vogal estável com o decibelímetro ao lado do microfone, a tela mede o dBFS por 4 s (média de energia; recusa voz instável, acima de 6 dB entre os percentis 10 e 90, e saturação) e ele digita o valor lido; dB SPL = dBFS + deslocamento. A calibração fica no navegador (é do equipamento: microfone, ganho e distância), com aviso se o microfone mudar, se tiver mais de 30 dias ou se a ponderação for A. O fonetograma salvo guarda a calibração e o mínimo e o máximo em dB SPL (`resumo_spl`); os pontos continuam em dBFS. O DSI passa a sugerir a I-baixa do fonetograma calibrado mais recente. A mesma calibração vale no **biofeedback** (faixa de volume mostrada e digitada em dB SPL, guardada em dBFS) e no **teste de carga vocal** (intensidade pedida, início → fim e curva por minuto em dB SPL); salvos com a calibração e um bloco `spl` com os valores convertidos. Uma caixa em cada tela volta a dBFS. Ao salvar, o servidor recalcula o resumo a partir dos pontos (tipo `fonetograma`); extensão e faixa dinâmica entram na evolução |
| Comparar espectrogramas | Na comparação acústica antes/depois, a caixa "Mostrar os espectrogramas lado a lado" desenha o espectrograma de cada gravação guardada (banda estreita ou larga, curva de F0, ganho e contraste), como no VoxMetria. Calculados só quando pedidos. Os dois usam o mesmo eixo de tempo (o da gravação mais longa), para comparar trechos ponto a ponto |
| Comparar fonetogramas | Na aba Comparar, abaixo da comparação acústica: dois fonetogramas do paciente sobrepostos (antes em linha tracejada, depois preenchido), como no lingWAVES. Notas novas e não alcançadas, extensão, voz mais fraca e mais forte, faixa dinâmica e área. Em dB SPL só se os dois foram feitos com o microfone calibrado (cada um com a própria calibração); senão em dBFS, com aviso. Os relatórios trazem a seção **Campo vocal**: no PDF, o gráfico do fonetograma mais recente sobreposto ao primeiro e a tabela de comparação; no Word, a tabela |

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
apps/web/lib/voz-clinica-biofeedback.ts                YIN ao vivo, dBFS, resumo da sessão
apps/web/components/voz-clinica/biofeedback-ao-vivo.tsx tela do biofeedback (canvas)
apps/web/lib/voz-clinica-jogos.ts                      lógica dos jogos e classificação surdo/sonoro
apps/web/components/voz-clinica/jogos-terapia.tsx      tela dos jogos
apps/web/lib/voz-clinica-fonetograma.ts                campo vocal por semitom
apps/web/lib/voz-clinica-calibracao.ts                 calibração dBFS → dB SPL (decibelímetro)
apps/web/components/voz-clinica/fonetograma.tsx        tela do fonetograma (canvas)
apps/web/lib/voz-clinica-espectrograma.ts              FFT, espectrograma, leitura de WAV, escala de cor
apps/web/components/voz-clinica/espectrograma.tsx      espectrograma da gravação (canvas)
apps/web/lib/voz-clinica-anamnese.ts                   opções, rótulos e resumo da anamnese
apps/web/components/voz-clinica/anamnese.tsx           formulário da anamnese
apps/web/lib/voz-clinica-pratica.ts                    medição das repetições, fila offline, link, resumo
apps/web/components/voz-clinica/pratica-casa.tsx       painel do profissional (planos e links)
apps/web/app/pratica/page.tsx                          página pública do paciente (fora do login)
apps/web/components/pratica/pratica-celular.tsx        tela do celular
apps/web/public/pratica-sw.js, pratica.webmanifest     offline e "adicionar à tela inicial"
apps/api/app/api/v1/pratica_casa.py                    rotas do celular (token no cabeçalho)
apps/api/app/services/voz_clinica/pratica.py           token, datas e resumo das sessões
apps/api/alembic/versions/20261029_0010_*.py           tabela home_practice_plans + client_ref e practice_plan_id
apps/api/app/services/voz_clinica/fonetograma.py       resumo do campo no servidor
        │  multipart / JSON, cookie de sessão + CSRF
        ▼
apps/api/app/api/v1/voz_clinica.py                     rotas
apps/api/app/services/voz_clinica/                     motores, protocolos, DSI
apps/api/app/models/entities.py → ClinicalEvaluation   tabela clinical_evaluations
apps/api/alembic/versions/20261029_0009_*.py           migração
```

Todo número é calculado no servidor; o navegador só envia o WAV ou as respostas. A exceção é o biofeedback: o áudio ao vivo não sai do aparelho, então o resumo é medido no navegador, validado no servidor (limites e coerência) e salvo com `fonte: "navegador"`.

### Rotas

| Rota | Entrada | Salva? |
| --- | --- | --- |
| `GET /status` | — | — |
| `POST /analisar` | multipart: `file` (WAV), `f0_min`, `f0_max`, `motor`, `paciente` | se `paciente` |
| `POST /protocolos/{idv10\|qvv\|grbasi\|easebr}` | `{"respostas": ..., "paciente": ...}` | se `paciente` |
| `POST /biofeedback` | resumo da sessão (faixas, % na faixa, pitch p10/mediana/p90, dB mediano) com `paciente` | sim |
| `POST /jogos` | resultado da partida (`jogo`, pontuação, detalhes numéricos) com `paciente` | sim |
| `POST /fonetograma` | pontos por semitom (`midi`, `min_db`, `max_db`, `tempo_s`, até 85) com `paciente`; resumo recalculado no servidor | sim |
| `POST /anamnese` | campos da anamnese (todos opcionais, ao menos um; campos desconhecidos são recusados) com `paciente` | sim |
| `POST /pratica` | `paciente`, `saudacao`, `exercicios` (1–6), `validade_dias` → devolve o `token` uma única vez | sim |
| `GET /pratica?paciente=` | — (planos com situação e sessões recebidas) | — |
| `POST /pratica/{id}/revogar` | — | sim |
| `GET /api/v1/pratica-casa/plano` | cabeçalho `X-Pratica-Token` (sem login) | — |
| `POST /api/v1/pratica-casa/sessoes` | cabeçalho `X-Pratica-Token`; até 50 sessões com `id` (UUID), `exercicio`, `feito_em`, `repeticoes` | sim (idempotente) |
| `POST /dsi` | `{"tmf_s", "f0_alta_hz", "i_baixa_db_spl", "jitter_pct"}` | não |
| `GET /pacientes` | — | — |
| `GET /pacientes/exportar?paciente=` | — (JSON com todas as avaliações e links de prática, sem limite; nunca o segredo dos links) | registra auditoria |
| `DELETE /pacientes?paciente=` | — (apaga avaliações e links de prática do paciente; irreversível) | registra auditoria |
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

Nos dois motores, `excitacao.py` calcula também:

- **GNE** (Glottal-to-Noise Excitation, Michaelis, Gramss & Strube 1997): 1 = pulsos glóticos excitam todas as faixas juntos (voz periódica); valores baixos = excitação por ruído. Filtro inverso LPC 13 a 10 kHz, bandas de 1 kHz a cada 300 Hz, janelas de 100 ms, mediana. Em voz sintética: limpa 1,00; com ruído crescente 0,99 → 0,80; ruído branco 0,30.
- **MWC** (semelhança da forma de onda entre ciclos vizinhos): 1 = ciclos idênticos.

Os dois aparecem na tabela e no gráfico de evolução. **O diagrama de rouquidão de Göttingen (GHD) em si não está feito:** os eixos combinam jitter, shimmer, MWC e GNE com pesos publicados só na tese de Michaelis (1999, Univ. Göttingen), que não conseguimos obter. Com o PDF da tese, o gráfico pode ser montado sobre essas medidas.

### Gravações guardadas

- Com paciente informado, a análise acústica guarda o WAV no storage do projeto (`voz-clinica/<usuário>/<avaliação>.wav`, local ou S3). Caixa "Guardar a gravação" na tela (marcada por padrão); `guardar_audio=false` na API.
- O áudio conta na cota de armazenamento do plano (`quotas.storage_bytes_used`). Cota cheia ou storage fora do ar: a análise é salva assim mesmo, sem a gravação, e a tela avisa.
- `GET /avaliacoes/{id}/audio` só para o dono, `Cache-Control: private, no-store`. A tela busca o arquivo por `fetch` (o `<audio>` não mandaria o cookie com a API em outro domínio).
- Excluir a avaliação ou o paciente apaga as gravações (banco primeiro, arquivo depois). A exportação LGPD informa `gravacoes_guardadas`; cada WAV é baixado pela aba Comparar ou pela rota acima.
- Migração `20261030_0011` (colunas `audio_key`, `audio_bytes`).

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

## Revisão independente (29/10/2026)

Uma revisão feita por outro agente, sem ver o desenvolvimento, apontou 10 pontos; todos foram corrigidos e cobertos por teste:
sessão concluída durante um envio lento era sobrescrita e perdida (corrida no envio); carência de 7 dias não era usada quando o link já tinha expirado;
link novo apagava a fila do anterior; sem teto de sessões por link; microfone podia ficar ligado ao sair da tela durante o pedido de permissão
ou com dois toques (biofeedback, jogos, fonetograma, prática); resposta atrasada de outro paciente podia aparecer no histórico/relatório;
IntegrityError tratado como "recebida" sem confirmar; iPhone perdia o link no app da tela inicial; datas saíam sem fuso (horário 3 h adiantado na tela);
downgrade das migrações falharia no MySQL. Os testes do navegador ainda acharam mais dois: a marca de "enviando" ficava presa quando a fila estava vazia
(nenhum envio acontecia) e um link novo aberto com a página já aberta era ignorado.

## Execução real (29/10/2026)

A API foi executada de verdade (FastAPI 0.115.6, SQLAlchemy 2.0.36 e demais pacotes do `.venv` do projeto, com SQLite no lugar do MySQL)
e as telas foram testadas no Chromium falando com ela, sem simulação: cadastro, gravação e análise acústica (motor interno),
IDV-10, EASE-BR, anamnese, link de prática, paciente praticando no "celular", histórico, exportação e exclusão. Os 33 testes de
rota (`tests/test_voz_clinica_api.py`) passam. O SQL das migrações 0009/0010 para MySQL foi gerado (`alembic upgrade --sql`) e conferido.

Erros que só a execução revelou, corrigidos:
- **A API não subia**: com `from __future__ import annotations`, o FastAPI lê `-> None` da rota 204 de excluir avaliação como o tipo
  NoneType e recusa a rota ("must not have a response body"). Corrigido com `response_model=None`.
- **Dado inválido respondia 500 em vez de 422**: o tratador de validação do projeto (`app/main.py`) devolvia `exc.errors()` cru; no
  pydantic 2 o `ctx` traz o próprio `ValueError` do validador, que não vira JSON. Agora o `ctx` vira texto (afeta todo o projeto,
  não só a voz clínica).
- **Testes de rota**: criavam um usuário por teste e passavam do limite de 20 cadastros/minuto (429); esperavam `detail` em vez do
  formato do projeto (`message`); um helper com nome repetido sobrescrevia outro.

**Docker com MySQL 8.4 e Praat (29/10/2026, `testar-v2-docker.bat`, isolado do projeto original):** migrações do zero até a
0010, reversão até a 0008 e reaplicação sem erro; **119 testes passam** (motor interno e **Praat** — Parselmouth 0.4.7 /
Praat 6.1.38 —, protocolos, fonetograma, anamnese, prática em casa e as 33 rotas). A primeira rodada achou mais um erro, que só o
MySQL mostra: o `DATETIME` guarda só segundos, e duas avaliações salvas no mesmo segundo saíam em ordem aleatória no histórico e
no relatório. `clinical_evaluations.created_at` agora é `DATETIME(6)` com padrão `CURRENT_TIMESTAMP(6)`.

## Segunda revisão independente (30/10/2026) — segurança, LGPD e defeitos

Revisão feita por um agente que não escreveu o código. Corrigido:

- **Prontuários misturados (alta):** no MySQL a collation `utf8mb4_unicode_ci` tratava "Ana Lúcia" e "Ana Lucia" (ou "P01" e "p01") como o mesmo paciente. A migração 0014 passa os nomes de paciente para `utf8mb4_bin`, e a API normaliza o nome em NFC (o mesmo nome digitado no Mac e no Windows fica igual).
- **Histórico de outro paciente na tela (alta):** ao trocar de paciente rápido, uma resposta atrasada do anterior aparecia por um instante. O pedido antigo agora é descartado na hora da troca (teste e2e com rede lenta).
- **Microfone ligado depois de sair da tela (média):** o gravador pode ser cancelado enquanto o navegador pede permissão e desliga tudo se a abertura falhar; clique duplo em "Gravar" não abre dois microfones.
- **Dados do paciente anterior no formulário (média):** formulários (acústica, protocolos, anamnese, protocolo de voz, DSI) recomeçam ao trocar de paciente.
- **Gravação órfã (média):** se o banco falhar ao salvar, o arquivo de áudio já gravado é apagado.
- **Áudio inválido ou longo demais (média):** amostras NaN/infinito são recusadas; limites de duração (vogal 60 s, fala 120 s, DDK 30 s, cepstral 30 s por arquivo) evitam travar o servidor.
- **Nome do paciente no log (média):** o log de acesso do servidor não grava mais a query string das rotas da voz clínica.
- **Baixa:** rastro do paciente com HMAC (não dá para descobrir o nome por força bruta), nome do arquivo exportado em ASCII, datas sem fuso tratadas como UTC, planilha CSV protege só colunas de texto contra fórmulas (o AVQI negativo continua número).

Depois da revisão (30/10/2026, segunda rodada):

- **Cota com trava:** a análise é gravada primeiro; a gravação vem numa segunda transação que começa com `SELECT ... FOR UPDATE` na linha do usuário, então dois envios simultâneos não passam do limite do plano (no InnoDB o snapshot só começa depois da trava). Desde a terceira revisão, a trava só dura a reserva (cota conferida e bytes marcados); o envio ao storage vem depois, já sem a trava.
- **Exportação LGPD em ZIP:** `GET /api/v1/voz-clinica/pacientes/exportar-zip` devolve `dados.json`, `LEIAME.txt` e `gravacoes/*.wav` (cada avaliação aponta seu arquivo em `arquivo_audio`). Botão "Com as gravações (ZIP)" no Histórico. Limite de 10 exportações em 10 minutos.
- **Editor de áudio:** copiar a seleção e colar no ponto clicado (ou no lugar da seleção), com emendas de 5 ms e o limite de 60 s da análise.

- **Nova tentativa de apagar gravações:** se o storage falhar ao apagar (rede, S3 fora do ar), a chave do arquivo fica em `storage_pending_deletes` (migração 0015; só ids, sem nome de paciente) e é apagada numa nova tentativa — a cada nova exclusão e quando a API inicia.

Ainda fica para depois: se houver nginx/proxy na frente, desligar nele também o log de query string.

## Concordância entre os motores (30/10/2026)

Estudo com vozes sintéticas de valor conhecido (`apps/api/scripts/concordancia_motores.py`, resultado em
[CONCORDANCIA_MOTORES.md](CONCORDANCIA_MOTORES.md)). O motor interno (reserva quando o Praat não está instalado)
inflava jitter e shimmer em vozes agudas; foi ajustado para seguir o Praat e agora difere em média 0,16 ponto no
jitter, 0,57 no shimmer, 0,21 dB no CPPS e 0,23 dB no HNR (antes 0,72, 1,53, 1,37 e 1,89). F0 igual.
O teste `test_motor_interno_concorda_com_o_praat_em_jitter_e_shimmer` (Docker) mantém isso.

## Terceira revisão independente (30/10/2026) — código novo

Um revisor separado leu mídias, lote, manipulação, sessões, nasalância, EGG, .docx e exclusão. Corrigido:

- **Trava presa durante o upload (alta):** a trava da cota ficava segura durante o `await` do envio ao storage; um segundo pedido do mesmo usuário no mesmo worker esperava a trava no thread do event loop e parava o worker inteiro até o timeout do InnoDB (50 s). Agora a trava vive numa transação curta, sem `await`: confere a cota e já **reserva** os bytes no registro; o envio ao storage vem depois. Se o envio falha, a reserva é desfeita e o envio parcial apagado; se a avaliação foi excluída durante o envio, o arquivo é apagado.
- **Snapshot antes da trava:** ler `user.id` depois de `commit`/`rollback` recarregava o usuário com um SELECT comum, abrindo o snapshot do InnoDB antes do `FOR UPDATE`. O id é guardado antes.
- **Memória no lote e nas mídias:** o lote lê, analisa e descarta um arquivo por vez (até 20 MB cada; arquivo grande falha sozinho). Lote e mídias passam por um semáforo de 2 por worker.
- **Número da sessão repetido:** usa o maior número já dado (não a contagem), com a trava do usuário contra dois registros ao mesmo tempo; a lista da tela usa o id como chave.
- **Microfone aceso na nasalância:** falha ao montar a captura, clique duplo ou tela fechada durante o pedido de permissão agora param o microfone e fecham o AudioContext; o botão fica desativado enquanto abre.
- Menores: perceptiva com valor que não é texto → 400 (era 500); `/manipular` confere a faixa de F0 (30 a 1200 Hz); AudioContext fechado quando o arquivo está corrompido (nasalância e EGG); URL do download da mídia revogada se o cartão sai da tela; o servidor recusa resumos impossíveis de nasalância e EGG (desvio-padrão acima de 50 %, mais quadros ou ciclos do que cabem na duração).

## Quarta revisão independente (30/10/2026) — calibração em dB SPL e comparação de campos

Corrigido:

- **I-baixa do DSI (alta):** só é sugerida de fonetograma calibrado **a 30 cm** (como pede o DSI de Wuyts) e com a voz mais fraca acima do piso de detecção; antes, uma calibração a 10 cm subestimava o DSI em ~2,5 pontos.
- **Saturação na calibração:** conferida pelo pico da forma de onda (o RMS de uma vogal ceifada fica abaixo de −1 dBFS e passava).
- **Comparação de campos:** com calibrações a distâncias ou ponderações diferentes, a tela e os relatórios avisam que parte da diferença vem disso.
- **Piso de detecção:** o fonetograma avisa quando a voz mais fraca ficou no limite (−55 dBFS + deslocamento): a real pode ser menor.
- **Servidor:** calibração incoerente recusada (o nível medido, referência − deslocamento, tem de ficar entre −60 e 0 dBFS); data sem fuso gravada como UTC.
- Menores: o fonetograma usa a calibração do início do campo (e avisa se ela mudou depois); "Começar" fica desativado enquanto a calibração mede; a medição usa o relógio da página (não trava com o AudioContext suspenso); o relatório busca à parte todos os fonetogramas quando o histórico passa de 500 registros (`GET /avaliacoes?tipo=`).

## Acessibilidade conferida (30/10/2026)

Nas 13 abas, com histórico de exemplo (22 avaliações) e os blocos recolhíveis abertos:

- **Nomes acessíveis** (árvore de acessibilidade do Chromium, a mesma dos leitores de tela): nenhum botão, campo, lista, caixa de seleção ou controle deslizante sem nome; nenhum gráfico sem descrição; nenhum id repetido.
- **Teclado:** todos os elementos alcançados com Tab (de 93 a 153 por aba) mostram o foco.
- **Contraste do texto:** todos acima do mínimo da WCAG AA (4,5:1; 3:1 para texto grande).

Cada verificação foi conferida com um controle negativo (um botão sem nome e um texto de baixo contraste injetados de propósito, que ela precisou achar). Não substitui o teste com leitor de tela real (NVDA, VoiceOver).

## Rodar a v2 isolada no computador

`infra/docker-compose.v2-local.yml` sobe site (http://localhost:3100), API (http://localhost:8110), MySQL e Redis
com nomes, portas e volumes próprios (`vc2l-*`), sem tocar nos contêineres nem no banco do projeto original:

```bash
docker compose -f infra/docker-compose.v2-local.yml up -d --build   # subir (a 1ª vez demora: pnpm install no contêiner)
docker compose -f infra/docker-compose.v2-local.yml down            # parar (os dados ficam guardados)
```

Em desenvolvimento, a tela de login tem "Acesso rápido" com as contas de teste do projeto.

## Pontos a conferir antes do uso clínico

- QVV **conferido** com o algoritmo original do V-RQOL (Hogikyan et al., J Voice 2000, Apêndice B): escore padrão
  `100 − (bruto − n)/(4n) × 100` — denominadores 40 (total), 24 (físico: itens 1, 2, 3, 6, 7, 9) e 16
  (socioemocional: 4, 5, 8, 10); o exemplo do artigo (bruto 30 → 50) bate. Notas de corte por domínio (89,60 e 90,65)
  aparecem só em fonte secundária e **não** são aplicadas; a do total (91,25) está no artigo de Behlau et al. (2016).
- Notas de corte IDV-10 7,5 e QVV 91,25: Behlau et al. (2016).
- Intensidade sai em dBFS (relativa). dB SPL exige microfone calibrado.
- Dados de saúde (LGPD): o nome do paciente, os resultados e a **anamnese** são dados sensíveis. A base legal provável é o art. 11, II, "f" (tutela da saúde em procedimento por profissional de saúde), que dispensa consentimento — confirmar com assessoria jurídica. Direitos do titular (art. 18) atendidos no histórico: **Exportar todos os dados** (acesso/portabilidade, JSON) e **Excluir todos os dados** (eliminação; para os links na hora). Ambos ficam em `audit_logs` com um hash do nome, nunca o nome. Antes de excluir, conferir a regra de guarda de prontuário do conselho profissional.
- **Prática em casa:** o microfone do celular só abre em **https://** — publicar o site com certificado antes de enviar links (em rede local por http não funciona). O volume do celular não é calibrado: combinar a faixa em dBFS testando no aparelho do próprio paciente. Quem tem o link envia resultados para aquele paciente: orientar a não repassar o link, e revogar se vazar.
- EASE-BR: escore conforme Rocha et al. (2014). A validação psicométrica brasileira ainda não tinha nota de corte publicada; não interpretar o total como "normal/alterado".
- A análise não é diagnóstico médico.
- **Surdo ou sonoro**: a classificação (pitch, energia abaixo de 400 Hz e cruzamentos por zero) foi validada só com sinais sintéticos. Testar com gravações reais de crianças e adultos antes de usar a pontuação clinicamente; os limiares estão em `voz-clinica-jogos.ts`.

## Próximas fases

1. ~~Gráfico de evolução por paciente~~ (feito).
2. ~~Relatório PDF da avaliação clínica~~ (feito).
3. ~~Biofeedback ao vivo~~ e ~~jogos de terapia~~ (feitos).
4. ~~Fonetograma~~ (feito; em dBFS — dB SPL exige calibração).
5. ~~Espectrograma~~ (feito).
6. ~~Anamnese vocal e EASE-BR~~ (feitos).
7. ~~Prática em casa (celular, offline)~~ (feita).
8. ~~GNE e MWC~~ (feitos; validados no Docker com Praat e MySQL, 126 testes). Pendente: diagrama GHD (constantes da tese de Michaelis).
9. ~~Gravações guardadas e comparação antes/depois~~ (feitas; ver abaixo).
10. ~~Protocolo de voz (DSI na tela, F0 da fala)~~ (feito).
11. ~~DDK~~ (feito, na aba Protocolo de voz).
12. ~~Gráficos da análise / LTAS~~ (feitos).
13. ~~Análise cepstral com frase e AVQI~~, ~~anotações~~, ~~importar e recortar áudio~~, ~~F1×F2~~, ~~ganho do espectrograma~~ (feitos). ~~Cadastro completo do paciente~~ (feito). Pendência do VoxMetria: Diagrama de Desvio Fonatório (constantes). ~~Teste de carga vocal (lingWAVES)~~ (feito). ~~Copiar e colar no editor~~ (feito). ~~iVox conferido pela página oficial (Hotmart): perceptiva complementar ao GRBASI (ressonância, pitch, loudness, ataque vocal) e registro de sessões de terapia (aba Sessões, numeradas por paciente)~~ (feito). ~~Mídias do paciente (aba Mídias: JPG, PNG, WebP até 15 MB; MP4, MOV, WebM até 100 MB; tipo conferido pelo conteúdo, SVG/HTML recusados; contam na cota, saem no ZIP da LGPD)~~ e ~~relatório em Word (.docx, mesmo conteúdo do PDF sem os gráficos, gerado no navegador)~~ (feitos). Com isso, as funções do iVox listadas na página oficial estão na v2. ~~Diagrama de irregularidade × ruído (histórico e relatório PDF)~~ (feito): inspirado no DDF (VoxMetria) e no GHD (lingWAVES), mas não é o oficial — as constantes deles não foram publicadas. Eixos normalizados pelos limites publicados do VoxMetria (jitter 0,6 %, shimmer 6,5 %, GNE 0,5; Revista CEFAC); na irregularidade conta a medida mais alterada; quadrantes como no DDF. ~~Aba Ferramentas (Praat): análise em lote — até 20 gravações, uma linha de medidas por arquivo, planilha CSV, nada salvo no prontuário (POST /analisar-lote) — e manipulação de tom (±12 semitons) e velocidade (0,5× a 2×) por PSOLA do Praat, para ouvir a própria voz num tom-alvo (POST /manipular; precisa do Praat no servidor)~~ (feito). ~~Aba Equipamentos: nasalância (dois microfones com placa numa interface estéreo, ao vivo ou WAV estéreo; 100 × N/(N+O) por quadro de 20 ms em 350–650 Hz, como o Nasometer; POST /nasalancia) e eletroglotografia (WAV estéreo voz + EGG; quociente de contato por ciclo pelo nível-critério de 25, 35 ou 50 %; POST /egg)~~ (feito; o cálculo é no navegador e só o resumo vai ao histórico). Vídeo laríngeo: guardar e ver na aba Mídias; a estroboscopia em si é do equipamento. ~~Marcação de trechos com etiquetas, exportada como TextGrid do Praat (WAV + TextGrid)~~ (feito; o teste test_voz_clinica_textgrid.py abre o arquivo da tela no Praat). ~~Cinco variações por jogo, como o VoxGames~~ (feito): Altitude (patamares, forte e fraco, ondas, escada, pulsos), Trilha (deslizes, escada, sirene, saltos, entonação), Sopro (vogal, /s/ e /z/, canudo, vibração, contagem), Surdo ou sonoro (todos, s/z, f/v, ch/j, rápido), Som e silêncio (imprevisível, ritmado, rápido, lento, acelerando).

Com isso, a tela cobre as funções dos seis programas levantados (VoxMetria, VoxGames, Praat, Voice Analyst, lingWAVES, iVox). Próximo passo: validação no Docker (rotas contra MySQL, motor Praat) e com pacientes reais.
