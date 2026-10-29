---
name: VoiceCheck IA
description: Análise vocal inteligente — separe faixas, meça a voz nota por nota e treine em cima da música.
colors:
  studio-night: "#070B14"
  control-room: "#0B1120"
  rack-panel: "#0E1524"
  console-overlay: "#111827"
  console-card: "#151D2E"
  hairline: "#263247"
  ink: "#F8FAFC"
  ink-muted: "#94A3B8"
  ink-faint: "#7B8AA0"
  meter-teal: "#20D9D2"
  meter-teal-soft: "#5EEAE4"
  meter-teal-deep: "#17BDB8"
  signal-blue: "#268BFF"
  rec-orange: "#FF7A1A"
  rec-orange-soft: "#FF9C55"
  signal-warn: "#E8B84A"
  signal-err: "#E85D6F"
  stem-vocals: "#20D9D2"
  stem-drums: "#268BFF"
  stem-bass: "#3DDB8A"
  stem-other: "#94A3B8"
  stem-guitar: "#F0A05A"
  stem-keys: "#5FA9FF"
typography:
  display-hero:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "4.75rem"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  display:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
  data:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
rounded:
  control: "8px"
  card: "12px"
  panel: "16px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.meter-teal}"
    textColor: "{colors.studio-night}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.meter-teal-soft}"
  button-secondary:
    backgroundColor: "{colors.console-overlay}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  button-tonal:
    backgroundColor: "#20D9D21A"
    textColor: "{colors.meter-teal}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.control-room}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "40px"
  panel:
    backgroundColor: "{colors.rack-panel}"
    rounded: "{rounded.panel}"
    padding: "24px"
  status-ready:
    backgroundColor: "#20D9D21A"
    textColor: "{colors.meter-teal}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  status-busy:
    backgroundColor: "#FF7A1A26"
    textColor: "{colors.rec-orange-soft}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: VoiceCheck IA

## Overview

**Creative North Star: "O Estúdio de Gravação"**

O portal é uma sala de controle à noite: superfícies escuras e opacas, como racks de equipamento, onde a única luz forte é a dos medidores — o turquesa. Tudo que acende significa algo: uma ação disponível, uma seleção, um valor medido. O resto fica quieto para a música e os números aparecerem.

Nas telas do app (painel, projetos, estúdio, treino, VoiceCheck) o visual é sóbrio e preciso: ferramenta antes de efeito, densidade de mesa de som, mesmo vocabulário em todas as páginas. A página inicial pode ter mais atmosfera (fotos de estúdio, títulos grandes), mas usa os mesmos tokens e no máximo uma camada atmosférica por seção.

**Key Characteristics:**
- Fundo escuro em camadas tonais; cartões e painéis opacos com borda fina.
- Turquesa só para ação, seleção e medição; laranja só para "ao vivo", picos e alertas.
- Fonte mono só para números com unidade (tempo, cents, Hz, BPM, tamanhos).
- Cada faixa tem sua cor fixa (voz, bateria, baixo, outros).

## Colors

Uma paleta de sala escura com um acento luminoso e um sinal de alerta.

### Primary
- **Meter Teal** (meter-teal): botão principal, item ativo do menu e das abas, foco, valores medidos dentro da tolerância, faixa de voz. Hover clareia para meter-teal-soft; pressionado escurece para meter-teal-deep.

### Secondary
- **Signal Blue** (signal-blue): segunda cor de dados — faixa de bateria (ou instrumental, na separação em 2 faixas), série "sua voz" no treino e séries secundárias de gráficos. Não é cor de ação.

### Tertiary
- **REC Orange** (rec-orange / rec-orange-soft): processamento em andamento, notas fora do tom, picos, gravando. Nunca em botões nem decoração.

### Neutral
- **Studio Night** (studio-night): fundo da página.
- **Control Room** (control-room): campos, menu lateral, faixas de fundo de seção.
- **Rack Panel** (rack-panel): superfície padrão de cartões e painéis.
- **Console Overlay / Console Card** (console-overlay, console-card): menus suspensos, botões secundários, item selecionado dentro de painel.
- **Hairline** (hairline): bordas e divisórias.
- **Ink / Ink Muted / Ink Faint**: texto principal, texto de apoio, metadados. Ink Faint não é usado em frases longas.

### Named Rules
**The Meter Light Rule.** O turquesa é luz de medidor: se não é ação, seleção ou medida, não é turquesa.
**The REC Rule.** Laranja só acende quando algo está acontecendo ou precisa de atenção agora.

## Typography

**Display Font:** Manrope (com system-ui)
**Body Font:** Inter (com system-ui)
**Label/Mono Font:** JetBrains Mono, com algarismos tabulares
**Notação musical:** a partitura do Laboratório vocal é desenhada como papel claro e usa Georgia só para a clave (glifo 𝄞); é a única exceção de fonte.

**Character:** Manrope dá títulos firmes e um pouco geométricos; Inter carrega a interface; a mono aparece como leitura de instrumento, nunca como fantasia "tecnológica".

### Hierarchy
- **Display hero** (700, 4.75rem em telas largas, 1.02): só o título de abertura da página inicial.
- **Display** (700, 3.75rem, 1.05): títulos das seções da página inicial. No app, nunca.
- **Headline** (600, 1.75rem; 1.5rem no celular): título único (h1) de cada página do app.
- **Title** (600, 1.125rem): títulos de seção e de painel.
- **Body** (400, 0.875rem, 1.5): texto da interface; textos longos até 65–75 caracteres por linha.
- **Label** (500, 0.75rem): rótulos de campo e de medida, em sentença normal (sem caixa alta).
- **Data** (mono 500, 0.75rem, tabular): tempos, cents, Hz, BPM, tamanhos de arquivo.

### Named Rules
**The No Kicker Rule.** Nenhuma etiqueta pequena acima de título. O título fala sozinho.
**The 12px Floor Rule.** Nada menor que 12px (0.75rem).

## Layout

Páginas internas ocupam a largura útil (contêiner até 110rem), com espaçamento padrão de 24px entre blocos e 16px dentro de seções. Menu lateral fixo de 15.5rem (recolhível para 4.25rem), barra superior de 4.25rem. Dentro de uma música, abas fixas (Visão geral · Estúdio · Treino · Análise · Laboratório vocal · Exportar) sob o caminho "‹ Projetos / nome da música". Grades de cartões: 1 coluna no celular, 2–4 no desktop. O estúdio ocupa a largura toda, sem margens laterais. Telas de acesso: duas colunas no desktop (foto + produto à esquerda, formulário de até 440px à direita), uma no celular.

## Elevation & Depth

Profundidade vem primeiro de camadas tonais (night → control room → rack panel → console) e da borda fina; sombras são curtas, com deslocamento para baixo, nunca halos coloridos. Vidro desfocado só na barra superior, no menu lateral e em sobreposições.

### Shadow Vocabulary
- **Panel** (`inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 32px -18px rgba(0,0,0,0.7)`): cartões e painéis.
- **Popover** (`0 16px 40px -12px rgba(0,0,0,0.7)`): menus suspensos.
- **Dialog** (`0 24px 60px -20px rgba(0,0,0,0.8)`): janelas modais, com fundo escurecido (black 60%).

### Named Rules
**The No Glow Rule.** Nada de brilho colorido em volta de botões, cartões ou texto.

## Motion

**The Live Reading Rule.** Movimento existe para mostrar medição acontecendo, nunca como enfeite. É parte da identidade e deve ser mantido:

- Hero da landing: a curva de afinação é desenhada da esquerda para a direita, nota a nota (`animate-draw-line`, ~1,8 s), e um cursor de leitura percorre o gráfico em loop (`animate-scan-x`, 4,5 s linear) com o selo "Analisando".
- Foto de fundo do hero com deriva lenta (`animate-hero-drift`, 28 s).
- Sem brilho: o No Glow Rule remove halos e sombras coloridas, não o movimento.
- Sempre respeitar `prefers-reduced-motion`: a curva aparece pronta e o cursor fica parado.

## Shapes

Cantos suaves e consistentes por função: controles (botões, campos, selects, abas internas) com 8px; cartões de música e itens de lista com 12px; painéis, janelas e cartões de destaque com 16px; selos de status e avatar em pílula. Bordas de 1px na cor hairline. Na página inicial, os botões de chamada podem ser em pílula.

## Components

### Buttons
- **Shape:** controle de 8px; altura 40px (sm 32px, lg 44px).
- **Primary:** fundo meter-teal, texto studio-night; uma ação principal por área.
- **Secondary:** fundo console-overlay com borda hairline; hover clareia a superfície.
- **Tonal:** turquesa a 10% com texto turquesa, para ação de destaque secundária.
- **Danger:** vermelho de sinal, só em confirmações de exclusão.
- **Focus:** anel turquesa de 2px com afastamento.
- **Links com cara de botão** usam o mesmo estilo (nunca botão dentro de link).

### Cards / Containers
- **Corner Style:** 12px (cartão de música) ou 16px (painel).
- **Background:** rack-panel opaco.
- **Shadow Strategy:** Panel (ver Elevation & Depth).
- **Border:** 1px hairline; hover só realça a borda.
- **Internal Padding:** 16px (cartão), 24px (painel).
- **Cartão de música:** capa com as iniciais (44px), nome e artista; linha de dados embaixo, separada por divisória; status em selo; ações no menu "⋯". Sem formas de onda inventadas.

### Inputs / Fields
- **Style:** fundo control-room, borda hairline, 8px, altura 40px; rótulo visível acima.
- **Focus:** anel turquesa de 2px.
- **Error:** borda e mensagem em signal-err, logo abaixo do campo, validação ao sair do campo.

### Navigation
- **Menu lateral:** itens com ícone + texto; ativo com fundo console e barra turquesa de 3px à esquerda.
- **Abas da música:** texto 14px, sublinhado turquesa de 2px no ativo, rolagem horizontal no celular.
- **Conta:** avatar com iniciais abre menu com nome, e-mail, Configurações e Sair.

### Status Pill
Selo em pílula com ponto: Pronto (turquesa), Na fila / Processando (laranja), Falhou (vermelho), Sem separação (neutro). O mesmo em todas as telas.

### Loading
Esqueletos no formato do conteúdo final (blocos com pulso leve), nunca "Carregando…" solto.

## Do's and Don'ts

### Do:
- **Do** usar um único h1 por página, em Headline (1.75rem, 600).
- **Do** manter 24px entre blocos de página e 16px dentro de seções.
- **Do** mostrar números medidos em Data (mono tabular) com a unidade.
- **Do** usar a cor fixa de cada faixa sempre que a faixa aparecer.
- **Do** construir janelas sobre `<dialog>` nativo, com foco no "Cancelar" em ações destrutivas.

### Don't:
- **Don't** usar vidro desfocado em cartões ou painéis.
- **Don't** colocar grade decorativa ou manchas de luz atrás do conteúdo das telas do app.
- **Don't** usar texto em degradê, bordas laterais coloridas grossas ou brilho em volta de elementos.
- **Don't** usar laranja em botões ou como enfeite.
- **Don't** usar mono ou caixa alta em rótulos e títulos.
- **Don't** desenhar formas de onda, números ou selos "ao vivo" que não venham de dados reais.
