# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Cantores (amadores e profissionais) que querem saber exatamente onde a voz sai do tom e treinar esses trechos.
- Professores de canto que recebem gravações de alunos, geram o relatório técnico e enviam uma devolutiva.
- Músicos profissionais (instrumentistas e cantores) que estudam com as faixas separadas: tirar o próprio instrumento, desacelerar, mudar o tom, fazer loop.

Os três públicos têm o mesmo peso; nenhuma tela deve servir só a um deles sem motivo.

## Product Purpose

VoiceCheck IA (repositório "Estúdio Musical") é um SaaS em português do Brasil para enviar áudio ou vídeo, separar as faixas com IA (Demucs), analisar a voz nota por nota (afinação, desvio em cents, vibrato, ocorrências com o momento exato) e treinar em cima da música (loop A–B, velocidade, tom, metrônomo, letras sincronizadas, gravação de takes). Sucesso = o usuário entende o que errou, treina o trecho certo e vê a evolução entre gravações.

## Positioning

Medição real em vez de opinião: cada número vem do áudio analisado (curva de afinação, cents, timestamps), sem notas genéricas nem dados inventados. Junta separação de faixas, diagnóstico vocal e sala de treino no mesmo arquivo de música.

## Operating Context

- Fluxo principal: importar música → separar faixas → estúdio / treino / análise / laboratório vocal → exportar.
- VoiceCheck: importar → preparar (isolar a voz) → analisar → resultados → devolutiva (para professores).
- Entradas comuns: áudio de celular, vídeo de WhatsApp, gravação de estúdio (MP3, WAV, FLAC, M4A, MP4, MOV).
- Uso em sessões de estudo: o usuário fica com o player tocando e alterna entre ouvir, gravar e comparar.

## Capabilities and Constraints

- Separação: Demucs htdemucs (2 faixas voz/instrumental ou 4 faixas voz, bateria, baixo, outros). Não afirmar isolamento perfeito.
- Termos do produto: "música" para o objeto do usuário (projeto é termo interno), "faixas" para stems, "Estúdio", "Treino", "Análise", "Laboratório vocal", "Exportar", "VoiceCheck".
- Contas com planos e cotas (minutos de separação, armazenamento, processamentos simultâneos); perfis músico e administrador.
- Decisão em aberto — onde roda o processamento: hoje roda no computador do usuário; o produto pode oferecer local e nuvem. Até decidir, não prometer "só local" como regra absoluta em textos novos.
- A análise vocal não é diagnóstico médico.

## Brand Commitments

- Nome: VoiceCheck IA, slogan "Análise vocal inteligente". Logo em apps/web/public/brand/.
- Tom de voz: técnico e encorajador — preciso como um professor, mede e explica sem julgar, e motiva a treinar.
- Interface toda em português do Brasil, sem jargão de engenharia para o usuário (worker, job, stem, MVP etc.).

## Evidence on Hand

- Sem depoimentos, clientes, números de uso ou imprensa reais. Não inventar nenhum.
- Exemplos na interface (relatório de afinação de exemplo, gráfico de evolução) devem continuar marcados como "exemplo".

## Product Principles

1. Todo número na tela é medido; o que é estimado diz que é estimado.
2. Mostrar o erro com o momento exato e o próximo passo de treino, nunca só a nota.
3. Ferramenta primeiro: nas telas do app, clareza e consistência valem mais que efeito visual.
4. Servir igualmente quem canta, quem ensina e quem toca.

## Accessibility & Inclusion

Seguir docs/A11Y_CHECKLIST.md (foco visível, navegação por teclado, movimento reduzido, rótulos em todos os campos).
