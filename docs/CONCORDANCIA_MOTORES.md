# Concordância entre os motores (Praat × interno)

Gerado no Docker (Praat via Parselmouth) por `python scripts/concordancia_motores.py docs/CONCORDANCIA_MOTORES.md`,
em 30/10/2026, depois do ajuste do motor interno (commit desta data). O motor usado em cada análise fica
gravado no resultado ("motor": "praat" ou "interno"); compare sessões de antes e depois com o mesmo motor.

Antes do ajuste, a diferença média Praat × interno era 0,72 ponto no jitter e 1,53 ponto no shimmer, com o
interno inflando os dois em vozes agudas (220 Hz leve: jitter 0,86 % e shimmer 6,94 %, contra 0,51 % e 4,30 % do Praat).
O ajuste seguiu o Praat: ciclos marcados por correlação (como o "periodic, cc"), amplitude por RMS com janela de Hann
em volta do pulso e o "maximum amplitude factor" 1,6 no shimmer.

O que continua diferente: HNR (média de 1,9 dB) e CPPS (1,4 dB, o interno mede um pouco abaixo), sempre na mesma
ordem (Spearman 0,98–0,99): servem para acompanhar a evolução, não para misturar valores dos dois motores.
Na voz severa (muito ruído), jitter e shimmer divergem mais nos dois motores — inclusive do valor sintetizado.

Vozes sintéticas (vogal com 3 formantes, 3 s). Valor sintetizado = o que foi gerado; Praat e interno = o que cada motor mediu.

| Voz | F0 Praat / interno (Hz) | Jitter % sintet. / Praat / interno | Shimmer % sintet. / Praat / interno | HNR Praat / interno (dB) | CPPS Praat / interno (dB) |
|---|---|---|---|---|---|
| 110 Hz limpa | 110,0 / 110,0 | 0,00 / 0,00 / 0,01 | 0,00 / 0,10 / 0,11 | 37,0 / 43,7 | 20,0 / 18,0 |
| 110 Hz leve | 110,0 / 110,0 | 0,52 / 0,49 / 0,47 | 3,26 / 3,43 / 3,43 | 21,2 / 23,0 | 17,0 / 15,5 |
| 110 Hz moderada | 110,1 / 110,1 | 1,05 / 1,01 / 0,97 | 6,56 / 6,83 / 6,82 | 14,9 / 13,3 | 14,4 / 13,3 |
| 110 Hz intensa | 110,1 / 110,2 | 2,08 / 1,98 / 1,99 | 11,02 / 11,65 / 11,82 | 7,1 / 6,2 | 10,1 / 9,7 |
| 110 Hz severa | 110,4 / 110,6 | 3,11 / 1,89 / 2,51 | 16,68 / 14,34 / 15,67 | 1,2 / 0,9 | 6,2 / 6,1 |
| 220 Hz limpa | 220,5 / 220,5 | 0,00 / 0,01 / 0,01 | 0,00 / 0,12 / 0,13 | 40,1 / 42,9 | 19,4 / 15,9 |
| 220 Hz leve | 220,0 / 220,0 | 0,52 / 0,51 / 0,43 | 3,36 / 4,30 / 4,45 | 22,9 / 21,5 | 14,6 / 12,7 |
| 220 Hz moderada | 220,1 / 220,1 | 1,04 / 1,03 / 0,78 | 6,75 / 8,09 / 8,73 | 16,9 / 15,4 | 12,3 / 10,7 |
| 220 Hz intensa | 220,2 / 220,2 | 2,07 / 2,07 / 1,60 | 11,31 / 14,05 / 15,10 | 9,5 / 8,6 | 8,7 / 7,7 |
| 220 Hz severa | 220,6 / 218,1 | 3,12 / 2,98 / 2,93 | 17,09 / 15,88 / 18,23 | 2,9 / 1,9 | 5,7 / 5,2 |

| Medida | Diferença média Praat × interno | Ordem igual Praat × interno (Spearman) | Praat × sintetizado | Interno × sintetizado |
|---|---|---|---|---|
| f0 | 0,27 | 0,88 | 0,93 | 0,81 |
| jitter | 0,16 | 0,93 | 0,94 | 0,99 |
| shimmer | 0,57 | 1,00 | 1,00 | 1,00 |
| hnr | 1,89 | 0,98 | — | — |
| cpps | 1,37 | 0,99 | — | — |

## Gravações reais (PC-GITA, via DisVoice — licença MIT)

Quatro gravações públicas de voz humana (16 kHz): /a/ sustentado de um homem (001_a1), /u/ sustentado de uma
mulher (098_u1), uma leitura (001_readtext) e uma diadococinesia (001_ddk1). Os arquivos não ficam no
repositório; foram baixados de github.com/jcvasquezc/DisVoice (pasta audios) e medidos no Docker com o Praat.

| Gravação | Motor | F0 (Hz) | Jitter % | Shimmer % | HNR (dB) | CPPS (dB) |
|---|---|---|---|---|---|---|
| /a/ (homem) | Praat | 91,6 | 0,86 | 7,96 | 12,7 | 14,5 |
| /a/ (homem) | interno (agora) | 93,0 | 0,79 | 7,64 | 12,5 | 12,2 |
| /a/ (homem) | interno (antes do ajuste) | 93,0 | 3,17 | 9,24 | 12,5 | 12,2 |
| /u/ (mulher) | Praat | 179,0 | 0,41 | 2,82 | 28,3 | 13,2 |
| /u/ (mulher) | interno (agora) | 178,9 | 0,62 | 3,20 | 30,2 | 9,9 |
| /u/ (mulher) | interno (antes do ajuste) | 178,9 | 1,17 | 4,91 | 30,2 | 9,9 |

Leitura: F0 mediana 98,0 Hz (Praat) e 99,7 Hz (interno); a faixa p5–p95 sai maior no interno (9,3 contra 7,6
semitons), por alguns quadros com F0 alta demais. Diadococinesia: 12 sílabas, 3,49 sílabas/s, ritmo (CV) 14,4 %.

Conclusões: em voz real o ajuste levou o jitter do interno de 3,7× o do Praat para perto dele; o CPPS do interno
fica 2–3 dB abaixo do Praat em voz real (mais que nas sintéticas), então nunca misture CPPS dos dois motores.
Esta comparação também achou um defeito: a análise de fala com o motor interno quebrava nessa leitura
(StopIteration num quadro sem periodicidade) — corrigido, com teste.
