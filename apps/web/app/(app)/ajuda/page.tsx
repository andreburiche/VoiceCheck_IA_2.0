import Link from "next/link";

export const metadata = { title: "Ajuda" };

const SECTIONS = [
  { id: "comecar", title: "Primeiros passos" },
  { id: "separacao", title: "Separação de faixas" },
  { id: "afinacao", title: "Afinação, cents e tolerância" },
  { id: "resultados", title: "Como ler o diagnóstico vocal" },
  { id: "referencia", title: "Referências e modo autoral" },
  { id: "treino", title: "Treino e atalhos de teclado" },
  { id: "exportar", title: "Exportar" },
] as const;

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-line bg-canvas-overlay px-1.5 py-0.5 text-data text-xs text-ink">{children}</kbd>
  );
}

function Block({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-24 space-y-3">
      <h2 id={`${id}-t`} className="font-display text-lg font-semibold text-ink">
        {title}
      </h2>
      <div className="max-w-[70ch] space-y-3 text-sm leading-relaxed text-ink-muted [&_strong]:font-medium [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}

export default function HelpPage() {
  return (
    <div className="page-shell space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">Ajuda</h1>
        <p className="mt-2 text-base text-ink-muted">O que cada número significa e como tirar o melhor de cada ferramenta.</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
        <nav aria-label="Tópicos da ajuda" className="lg:sticky lg:top-24">
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block rounded-lg px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-canvas-overlay hover:text-ink"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="panel-glass space-y-10 rounded-2xl p-6 md:p-8">
          <Block id="comecar" title="Primeiros passos">
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>
                Em <Link href="/separar" className="text-accent hover:underline">Separar faixas</Link> (ou em Minhas músicas), dê um nome e
                importe o áudio ou vídeo (MP3, WAV, FLAC, M4A, OGG, MP4, MOV, WEBM ou MKV).
              </li>
              <li>Escolha o modo (voz e instrumental, 4 faixas, 6 faixas com guitarra e piano, ou alta fidelidade) e a qualidade.</li>
              <li>Quando a separação terminar, abra o Estúdio, o Treino, a Análise ou o Laboratório vocal pelas abas da música.</li>
              <li>
                Para avaliar uma gravação sua, use o{" "}
                <Link href="/voicecheck" className="text-accent hover:underline">Diagnóstico vocal</Link>.
              </li>
            </ol>
          </Block>

          <Block id="separacao" title="Separação de faixas">
            <p>
              A separação usa o modelo de IA <strong>Demucs</strong>, no seu próprio servidor. Com <strong>2 faixas</strong> você
              recebe a voz e o instrumental (karaokê); com <strong>4 faixas</strong>, voz, bateria, baixo e outros; com{" "}
              <strong>6 faixas</strong>, também guitarra e piano. A <strong>alta fidelidade</strong> dá menos vazamento entre as
              faixas e leva cerca de 4 vezes mais tempo. Cada faixa tem sempre a mesma cor no estúdio.
            </p>
            <p>
              A <strong>qualidade</strong> (rápida, equilibrada ou máxima) define quantas passadas o modelo faz; em{" "}
              <strong>Separação</strong>, dentro da música, os ajustes avançados mudam passadas e sobreposição, como no
              Ultimate Vocal Remover. Em <strong>Exportar</strong> dá para baixar só a voz, só o instrumental ou cada faixa
              (WAV, MP3, FLAC, M4A, OGG ou ZIP), reduzir ruído, realçar a voz, normalizar o volume e cortar um trecho.
            </p>
            <p>
              Nenhuma separação é perfeita: em mixagens muito densas, um pouco de instrumento pode aparecer na faixa de
              voz e vice-versa.
            </p>
          </Block>

          <Block id="afinacao" title="Afinação, cents e tolerância">
            <p>
              <strong>Cents</strong> medem distância entre notas: 100 cents são um semitom (de Dó para Dó♯, por exemplo).
              Um desvio de 20 cents é pequeno; de 50 cents, a nota já está a meio caminho da vizinha.
            </p>
            <p>
              A <strong>tolerância</strong> é a margem aceita como afinado. No Treino ela começa em{" "}
              <strong>±50 cents</strong>: dentro dela a nota conta como certa; fora dela, aparece como desvio, com o
              momento exato.
            </p>
          </Block>

          <Block id="resultados" title="Como ler o diagnóstico vocal">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>Nota central (mediana):</strong> a altura do meio da sua voz na gravação, em Hz. Ajuda a ver a
                região onde você canta mais.
              </li>
              <li>
                <strong>Áudio com voz aproveitado:</strong> quanto da gravação tinha voz clara o bastante para medir. Valores
                baixos indicam ruído, instrumentos altos ou muitos silêncios — isolar a voz costuma ajudar.
              </li>
              <li>
                <strong>Ocorrências:</strong> trechos onde algo foi medido fora do esperado (afinação, estabilidade,
                tempo). Clique numa ocorrência para ouvir o trecho.
              </li>
              <li>
                <strong>Pontos positivos e plano de melhoria:</strong> o que já está bom e exercícios ligados às
                ocorrências desta gravação.
              </li>
            </ul>
            <p>É uma análise de afinação e técnica, não um diagnóstico médico.</p>
          </Block>

          <Block id="referencia" title="Referências e modo autoral">
            <p>Para dizer que uma nota está “errada”, o diagnóstico precisa saber qual nota era esperada. Por isso existem quatro modos:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li><strong>Música original do artista:</strong> a melodia vem da gravação original, com a voz separada.</li>
              <li><strong>Partitura ou MIDI:</strong> a melodia vem do arquivo (MIDI ou MusicXML).</li>
              <li><strong>Referência personalizada:</strong> uma gravação-modelo, como uma voz guia.</li>
              <li>
                <strong>Música autoral / sem referência:</strong> sem melodia esperada, não apontamos “nota errada”; a
                análise mostra características da voz (estabilidade, vibrato, pausas) e a coerência melódica, que é
                experimental.
              </li>
            </ul>
          </Block>

          <Block id="treino" title="Treino e atalhos de teclado">
            <p>
              No Treino você repete trechos em loop, muda a velocidade (50–150%) sem mudar o tom, transpõe ±12 semitons,
              usa o metrônomo e grava sua voz por cima para comparar.
            </p>
            <ul className="space-y-1.5">
              <li><Kbd>Espaço</Kbd> tocar ou pausar</li>
              <li><Kbd>L</Kbd> ligar ou desligar o loop</li>
              <li><Kbd>←</Kbd> <Kbd>→</Kbd> voltar ou avançar 5 s (com <Kbd>Shift</Kbd>, 1 s)</li>
              <li><Kbd>Home</Kbd> voltar ao início</li>
            </ul>
            <p>Os atalhos não funcionam enquanto você digita num campo ou mexe num controle deslizante.</p>
          </Block>

          <Block id="exportar" title="Exportar">
            <p>
              Na aba Exportar de cada música você baixa as faixas separadas em WAV, um pacote ZIP com todas elas ou um mix
              com só as faixas que escolher (por exemplo, sem a voz, para cantar por cima).
            </p>
          </Block>
        </div>
      </div>
    </div>
  );
}
