"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AudioLines, Download, FileAudio, Gauge, Layers, Mic2, Scissors, SlidersHorizontal, Timer, Upload } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { projectsApi, systemApi } from "@/lib/api";
import { STEM_COLORS, STEM_LABELS } from "@/lib/stem-theme";

const PAINEL = "rounded-2xl bg-canvas-raised/70 p-5 ring-1 ring-inset ring-ink/10";

/** Cada cartão abre (como os "Expanded Cards") e diz onde a função fica e uma dica de uso. */
const RECURSOS = [
  { icone: Layers, titulo: "Todos os instrumentos", texto: "Voz, bateria, baixo, guitarra, piano e outros em faixas separadas.",
    onde: "Ao enviar o arquivo, escolha “Todos os instrumentos (6 fontes)”.", dica: "O piano é o mais difícil de isolar; prefira a qualidade equilibrada." },
  { icone: Mic2, titulo: "Voz e acompanhamento", texto: "Modo rápido: a voz de um lado e o instrumental (karaokê) do outro.",
    onde: "Ao enviar, escolha “Vocal / Instrumental (2 fontes)”.", dica: "É o modo mais rápido para ensaio e karaokê." },
  { icone: Gauge, titulo: "Qualidade ajustável", texto: "Rápida, equilibrada ou máxima, e o modelo de alta fidelidade.",
    onde: "No passo “Modelo de IA” do envio.", dica: "Teste na rápida; refaça na máxima só o que for publicar." },
  { icone: SlidersHorizontal, titulo: "Ajustes avançados", texto: "Passadas e sobreposição, como no Ultimate Vocal Remover.",
    onde: "Dentro da música, painel Separação → Ajustes avançados.", dica: "Mais passadas tiram chiado, mas cada uma soma tempo." },
  { icone: AudioLines, titulo: "Ruído e voz", texto: "Reduzir ruído, realçar a voz e normalizar o volume ao exportar.",
    onde: "Dentro da música, aba Exportar → Tratamento e trecho.", dica: "Normalizar deixa todas as faixas no mesmo volume de streaming." },
  { icone: Scissors, titulo: "Editar e cortar", texto: "Mutar, solo e volume no estúdio; cortar o trecho na exportação.",
    onde: "Aba Estúdio (mixer) e aba Exportar (início e fim).", dica: "Em cada faixa, M silencia e S toca só ela." },
  { icone: Download, titulo: "Exportar separado", texto: "Só a voz, só o instrumental ou cada faixa: WAV, MP3, FLAC, M4A, OGG ou ZIP.",
    onde: "Dentro da música, aba Exportar.", dica: "FLAC guarda a qualidade sem perda e ocupa menos que WAV." },
  { icone: Timer, titulo: "Até 1 hora", texto: "Músicas, aulas, entrevistas e vídeos longos num arquivo só.",
    onde: "Vale para qualquer envio, de áudio ou vídeo.", dica: "Arquivos longos demoram mais; você pode navegar enquanto processa." },
] as const;

const FAIXAS_6 = ["vocals", "drums", "bass", "guitar", "piano", "other"];

/** Ponto de entrada da separação de faixas (como o removedor de voz do Filmora e o UVR). */
export default function SepararPage() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const sys = useQuery({ queryKey: ["system-status"], queryFn: () => systemApi.status(), staleTime: 60_000 });
  const projetos = useQuery({ queryKey: ["projects"], queryFn: () => projectsApi.list() });
  const recentes = (projetos.data?.items ?? []).slice(0, 6);
  const semWorker = sys.data && !sys.data.using_contract_silence && (sys.data.models ?? []).every((m) => !m.selectable);

  async function comecar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCriando(true);
    try {
      const p = await projectsApi.create({ name: nome.trim() || "Nova separação" });
      router.push(`/projects/${p.id}`);
    } catch (err) {
      setErro((err as Error).message);
      setCriando(false);
    }
  }

  return (
    <div className="page-shell space-y-8">
      <header className="max-w-3xl">
        <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">Separar faixas</h1>
        <p className="mt-2 text-base text-ink-muted">
          Envie uma música ou um vídeo e receba cada instrumento numa faixa: a voz isolada, o instrumental para karaokê,
          a bateria, o baixo, a guitarra e o piano. Tudo roda no seu servidor, sem mandar o áudio para outra empresa.
        </p>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Faixas do modo Todos os instrumentos">
          {FAIXAS_6.map((f) => (
            <span key={f} className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-3 py-1 text-sm text-ink">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: STEM_COLORS[f] }} aria-hidden />
              {STEM_LABELS[f]}
            </span>
          ))}
        </div>
      </header>

      <section className={PAINEL} aria-labelledby="separar-comecar">
        <h2 id="separar-comecar" className="font-display text-lg font-semibold text-ink">Começar uma separação</h2>
        <form onSubmit={comecar} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <Label htmlFor="separar-nome">Nome (música, aula, entrevista…)</Label>
            <Input id="separar-nome" className="mt-1" value={nome} maxLength={200} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Ensaio do coral — 31/10" />
          </div>
          <Button type="submit" disabled={criando} data-testid="separar-comecar">
            <Upload className="h-4 w-4" aria-hidden /> {criando ? "Criando…" : "Enviar música ou vídeo"}
          </Button>
        </form>
        <p className="mt-2 text-xs text-ink-faint">
          Na próxima tela: envie o arquivo (MP3, WAV, FLAC, M4A, AAC, OGG, MP4, MOV, WEBM ou MKV), escolha o modo e a qualidade.
        </p>
        {erro ? <p role="alert" className="mt-2 text-sm text-signal-err">{erro}</p> : null}
        {semWorker ? (
          <p role="status" className="mt-3 rounded-lg bg-signal-warn/10 px-3 py-2 text-sm text-ink ring-1 ring-inset ring-signal-warn/40">
            Nenhum modelo de separação está disponível neste servidor agora. Peça ao administrador para ligar o processador de áudio (worker).
          </p>
        ) : null}
      </section>

      <section aria-labelledby="separar-recursos">
        <h2 id="separar-recursos" className="font-display text-lg font-semibold text-ink">O que dá para fazer</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {RECURSOS.map(({ icone: Icone, titulo, texto, onde, dica }) => (
            <li key={titulo}>
              <details className="group h-full rounded-2xl bg-canvas-raised/70 ring-1 ring-inset ring-ink/10 transition-shadow duration-200 open:ring-accent/40 hover:ring-ink/20">
                <summary className="flex min-h-11 cursor-pointer list-none flex-col p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between">
                    <Icone className="h-5 w-5 text-accent" aria-hidden />
                    <span className="text-xs font-medium text-ink-faint group-open:hidden">Onde fica?</span>
                    <span className="hidden text-xs font-medium text-accent group-open:inline">Fechar</span>
                  </span>
                  <span className="mt-2 text-sm font-semibold text-ink">{titulo}</span>
                  <span className="mt-1 text-sm text-ink-muted">{texto}</span>
                </summary>
                <div className="-mt-2 space-y-2 px-5 pb-5 text-sm motion-safe:animate-fade-up">
                  <p className="text-ink"><span className="font-semibold">Onde: </span>{onde}</p>
                  <p className="text-ink-muted"><span className="font-semibold text-ink">Dica: </span>{dica}</p>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="separar-recentes">
        <h2 id="separar-recentes" className="font-display text-lg font-semibold text-ink">Suas músicas</h2>
        {recentes.length ? (
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {recentes.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-canvas-raised/60 p-3 ring-1 ring-inset ring-ink/10">
                <FileAudio className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{p.name}</span>
                <Link href={`/projects/${p.id}#separacao`} className={buttonVariants({ size: "sm", variant: "secondary" })}>Separar de novo</Link>
                <Link href={`/projects/${p.id}/export`} className={buttonVariants({ size: "sm", variant: "ghost" })}>Exportar</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">Nenhuma música ainda. Comece enviando um arquivo acima.</p>
        )}
      </section>
    </div>
  );
}
