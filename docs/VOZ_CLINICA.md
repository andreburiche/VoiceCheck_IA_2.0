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
| Evolução | Um gráfico por medida (jitter, shimmer, HNR, CPPS, IDV-10, QVV, GRBASI G, EASE-BR), até 12 sessões, com linha da nota de corte nos protocolos e valor de cada sessão ao passar o mouse ou focar pelo teclado. Aparece a partir da 2ª avaliação do mesmo tipo |
| Relatório em PDF | Botão no histórico: análise acústica e protocolos mais recentes, gráficos de evolução, todas as sessões, profissional e observações (opcionais). HTML A4 impresso pelo navegador ("Salvar como PDF"), mesmo mecanismo dos relatórios do VoiceCheck |
| Biofeedback ao vivo | Pitch (nota e Hz) e volume (dBFS) na tela enquanto o paciente fala ou canta, com faixas-alvo definidas pelo profissional, indicação "abaixo / dentro / acima" escrita (não só cor), curva dos últimos 8 s e % do tempo na faixa. Pitch por YIN a ~60 leituras/s com mediana de 3 contra leituras isoladas. O áudio não sai do aparelho; ao parar, o resumo da sessão pode ser salvo no histórico (tipo `biofeedback`) e entra na evolução |
| Jogos de terapia | Quatro jogos próprios (não copiam nomes, visual nem mecânica de produtos comerciais): **Altitude** (o volume controla a altura; seguir patamares), **Trilha** (o pitch controla a altura; patamares e deslizes), **Sopro longo** (sustentar a voz até a meta) e **Surdo ou sonoro** (s/z, f/v, ch/j). Faixas, duração, dificuldade e meta definidas pelo profissional. Resultado de cada partida pode ser salvo (tipo `jogo`) e tem curva própria na evolução |
| Prática em casa | Aba própria. O profissional monta até 6 exercícios — **vogal sustentada** (meta opcional), **voz na faixa de altura** (Hz) ou **volume controlado** (dBFS), com repetições, duração e instrução — e gera um **link secreto** (validade de 1 a 180 dias, até 3 ativos por paciente, revogável). Envio por WhatsApp ou cópia; o link aparece uma única vez (só o hash fica salvo). O paciente abre `/pratica` no celular **sem conta**: vê só os exercícios e um nome de tratamento opcional (nunca o nome completo nem o histórico). O áudio é analisado no celular (YIN + dBFS) e só os números de cada repetição são enviados; o servidor confere com o plano e recalcula o resumo (tipo `pratica`). **Funciona offline** depois da primeira abertura (service worker + fila no celular): sessões feitas sem internet são enviadas quando a conexão volta, sem duplicar (id gerado no celular). Sessões feitas antes de o link expirar podem ser enviadas até 7 dias depois; trocar de link no mesmo celular não perde o que o anterior não enviou. Teto de 24 sessões por dia e 400 por link (contra inundar o histórico). No iPhone, o app da tela inicial não enxerga o que o Safari guardou: na primeira abertura, o paciente cola a mensagem com o link. Curvas próprias na evolução (melhor tempo; % na faixa) |
| Fonetograma | Campo vocal: para cada semitom alcançado (≥ 0,15 s), a menor e a maior intensidade, ignorando os primeiros 50 ms de cada nota (ataque). Glissandos em voz fraca e forte, com pausa e retomada somando ao mesmo campo. Nota mais grave e mais aguda, extensão em semitons, faixa dinâmica média e área. Intensidade **relativa (dBFS)**. Ao salvar, o servidor recalcula o resumo a partir dos pontos (tipo `fonetograma`); extensão e faixa dinâmica entram na evolução |

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

Com isso, a tela cobre as funções dos seis programas levantados (VoxMetria, VoxGames, Praat, Voice Analyst, lingWAVES, iVox). Próximo passo: validação no Docker (rotas contra MySQL, motor Praat) e com pacientes reais.
