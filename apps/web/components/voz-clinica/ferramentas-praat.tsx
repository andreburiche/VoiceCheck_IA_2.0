"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  FAIXAS_F0,
  analisarLote,
  manipularGravacao,
  statusVozClinica,
  type ItemLote,
} from "@/lib/voz-clinica-api";
import { importarAudio } from "@/lib/voz-clinica-importar";
import { COLUNAS_LOTE, csvLote, linhasLote } from "@/lib/voz-clinica-lote";

const SELECT =
  "mt-1 block h-9 rounded-lg border border-line bg-canvas-raised px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";
const PAINEL = "rounded-2xl bg-canvas-card p-5 ring-1 ring-inset ring-ink/10";
const MAX_LOTE = 20;
type Faixa = keyof typeof FAIXAS_F0;

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Várias gravações de uma vez → tabela de medidas (como um script de análise do Praat). */
function AnaliseLote() {
  const id = useId();
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [faixa, setFaixa] = useState<Faixa>("feminina");
  const [etapa, setEtapa] = useState<string | null>(null);
  const [itens, setItens] = useState<ItemLote[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function analisar(e: React.FormEvent) {
    e.preventDefault();
    if (!arquivos.length) { setErro("Escolha os arquivos de áudio."); return; }
    setErro(null);
    setItens(null);
    try {
      // cada arquivo vira WAV mono no navegador (aceita MP3, M4A, OGG); os que não abrem viram linha de erro
      const prontos: { nome: string; wav: Blob }[] = [];
      const falhas: ItemLote[] = [];
      for (const [i, f] of arquivos.entries()) {
        setEtapa(`Preparando ${i + 1} de ${arquivos.length}…`);
        try {
          prontos.push({ nome: f.name, wav: (await importarAudio(f)).wav });
        } catch (err) {
          falhas.push({ arquivo: f.name, ok: false, erro: friendlyError(err, "Não foi possível abrir o arquivo.") });
        }
      }
      setEtapa(`Analisando ${prontos.length} ${prontos.length === 1 ? "arquivo" : "arquivos"} no servidor…`);
      const r = prontos.length ? await analisarLote(prontos, FAIXAS_F0[faixa]) : { itens: [] };
      const ordem = new Map(arquivos.map((f, i) => [f.name, i]));
      setItens([...r.itens, ...falhas].sort((a, b) => (ordem.get(a.arquivo) ?? 0) - (ordem.get(b.arquivo) ?? 0)));
    } catch (err) {
      setErro(friendlyError(err, "Não foi possível analisar o lote."));
    } finally {
      setEtapa(null);
    }
  }

  const linhas = itens ? linhasLote(itens) : [];
  return (
    <section className={PAINEL} aria-labelledby={`${id}-t`} data-testid="vc2-lote">
      <h2 id={`${id}-t`} className="font-display text-lg font-semibold text-ink">Análise em lote</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-muted">
        Como um script do Praat: várias gravações de vogal sustentada de uma vez (até {MAX_LOTE}, 60 s cada), uma linha de medidas por arquivo.
        Serve para pesquisa ou para rever gravações antigas; nada é salvo no prontuário.
      </p>
      <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => void analisar(e)} noValidate>
        <div>
          <Label htmlFor={`${id}-arq`}>Arquivos</Label>
          <input id={`${id}-arq`} type="file" multiple accept="audio/*,.wav,.mp3,.m4a,.ogg"
            className="mt-1 block max-w-full text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-canvas-raised file:px-3 file:py-2 file:text-sm file:text-ink"
            onChange={(e) => {
              const lista = Array.from(e.target.files ?? []);
              setItens(null);
              if (lista.length > MAX_LOTE) { setErro(`No máximo ${MAX_LOTE} arquivos por vez.`); setArquivos([]); return; }
              setErro(null);
              setArquivos(lista);
            }} data-testid="vc2-lote-arquivos" />
        </div>
        <div>
          <Label htmlFor={`${id}-faixa`}>Tipo de voz</Label>
          <select id={`${id}-faixa`} className={SELECT} value={faixa} onChange={(e) => setFaixa(e.target.value as Faixa)}>
            {Object.entries(FAIXAS_F0).map(([k, f]) => <option key={k} value={k}>{f.rotulo}</option>)}
          </select>
        </div>
        <Button type="submit" disabled={!!etapa || !arquivos.length} data-testid="vc2-lote-analisar">
          {etapa ? "Analisando…" : `Analisar ${arquivos.length || ""} ${arquivos.length === 1 ? "arquivo" : "arquivos"}`.replace("  ", " ")}
        </Button>
        {itens?.length ? (
          <Button type="button" variant="secondary" onClick={() => baixar(new Blob([csvLote(itens)], { type: "text/csv;charset=utf-8" }), "voicecheck-lote.csv")} data-testid="vc2-lote-csv">
            Planilha (CSV)
          </Button>
        ) : null}
      </form>
      {etapa ? <p className="mt-2 text-sm text-ink-muted" role="status">{etapa}</p> : null}
      {erro ? <p className="mt-2 text-sm text-signal-err" role="alert">{erro}</p> : null}
      {linhas.length ? (
        <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-inset ring-ink/10">
          <table className="w-full min-w-[56rem] text-sm" data-testid="vc2-lote-tabela">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                {COLUNAS_LOTE.map(([k, r]) => <th key={k} scope="col" className={cn("px-3 py-2 font-medium", k !== "arquivo" && k !== "motor" && k !== "erro" && "text-right")}>{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={`${l.arquivo}-${i}`} className="border-t border-ink/[0.07]">
                  {COLUNAS_LOTE.map(([k]) => (
                    <td key={k} className={cn("px-3 py-2", k === "arquivo" ? "max-w-[14rem] truncate text-ink" : k === "erro" ? "text-signal-err" : k === "motor" ? "text-ink-muted" : "text-data text-right text-ink")}
                      title={k === "arquivo" ? l.arquivo : undefined}>{l[k]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

/** Ouvir a própria voz mais aguda/grave ou mais lenta/rápida (PSOLA do Praat), como modelo na terapia. */
function ManipulacaoVoz() {
  const id = useId();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [faixa, setFaixa] = useState<Faixa>("feminina");
  const [semitons, setSemitons] = useState(0);
  const [fator, setFator] = useState(1);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [urls, setUrls] = useState<{ original: string; nova: string; blob: Blob } | null>(null);
  const [praat, setPraat] = useState<boolean | null>(null);
  const atual = useRef<{ original: string; nova: string } | null>(null);

  useEffect(() => {
    statusVozClinica().then((s) => setPraat(s.motores.includes("praat"))).catch(() => setPraat(null));
    return () => { if (atual.current) { URL.revokeObjectURL(atual.current.original); URL.revokeObjectURL(atual.current.nova); } };
  }, []);

  async function aplicar(e: React.FormEvent) {
    e.preventDefault();
    if (!arquivo) { setErro("Escolha a gravação."); return; }
    if (semitons === 0 && fator === 1) { setErro("Mude o tom ou a velocidade."); return; }
    setProcessando(true);
    setErro(null);
    try {
      const g = await importarAudio(arquivo);
      const nova = await manipularGravacao(g.wav, { semitons, fatorDuracao: fator, ...FAIXAS_F0[faixa] });
      if (atual.current) { URL.revokeObjectURL(atual.current.original); URL.revokeObjectURL(atual.current.nova); }
      const u = { original: URL.createObjectURL(g.wav), nova: URL.createObjectURL(nova) };
      atual.current = u;
      setUrls({ ...u, blob: nova });
    } catch (err) {
      setErro(friendlyError(err, "Não foi possível manipular a gravação."));
    } finally {
      setProcessando(false);
    }
  }

  const st = (v: number) => (v > 0 ? `+${v}` : String(v));
  return (
    <section className={PAINEL} aria-labelledby={`${id}-t`} data-testid="vc2-manipulacao">
      <h2 id={`${id}-t`} className="font-display text-lg font-semibold text-ink">Manipulação de tom e velocidade</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-muted">
        Como o “Manipulation” do Praat: a mesma voz mais aguda, mais grave, mais lenta ou mais rápida, sem mudar o timbre.
        Útil para o paciente ouvir um tom-alvo na própria voz. Nada é salvo.
      </p>
      {praat === false ? (
        <p className="mt-3 text-sm text-signal-warn" role="status" data-testid="vc2-manipulacao-sem-praat">
          Este servidor está sem o Praat; a manipulação fica disponível quando ele estiver instalado (o Docker da v2 já tem).
        </p>
      ) : null}
      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(e) => void aplicar(e)} noValidate>
        <div className="sm:col-span-2 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor={`${id}-arq`}>Gravação</Label>
            <input id={`${id}-arq`} type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg"
              className="mt-1 block max-w-full text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-canvas-raised file:px-3 file:py-2 file:text-sm file:text-ink"
              onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setUrls(null); setErro(null); }} data-testid="vc2-manipulacao-arquivo" />
          </div>
          <div>
            <Label htmlFor={`${id}-faixa`}>Tipo de voz</Label>
            <select id={`${id}-faixa`} className={SELECT} value={faixa} onChange={(e) => setFaixa(e.target.value as Faixa)}>
              {Object.entries(FAIXAS_F0).map(([k, f]) => <option key={k} value={k}>{f.rotulo}</option>)}
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor={`${id}-st`}>Tom: {st(semitons)} {Math.abs(semitons) === 1 ? "semitom" : "semitons"}</Label>
          <input id={`${id}-st`} type="range" min={-12} max={12} step={1} value={semitons} onChange={(e) => setSemitons(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--accent)]" data-testid="vc2-manipulacao-semitons" aria-valuetext={`${st(semitons)} semitons`} />
          <div className="flex justify-between text-xs text-ink-faint"><span>mais grave</span><span>mais agudo</span></div>
        </div>
        <div>
          <Label htmlFor={`${id}-dur`}>Velocidade: {fator === 1 ? "original" : fator > 1 ? `${fator.toLocaleString("pt-BR")}× mais lenta` : `${(1 / fator).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}× mais rápida`}</Label>
          <select id={`${id}-dur`} className={SELECT} value={fator} onChange={(e) => setFator(Number(e.target.value))} data-testid="vc2-manipulacao-fator">
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((f) => <option key={f} value={f}>{f === 1 ? "Original" : f > 1 ? `${f.toLocaleString("pt-BR")}× mais lenta` : `${(1 / f).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}× mais rápida`}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={processando || !arquivo || praat === false} data-testid="vc2-manipulacao-aplicar">
            {processando ? "Processando…" : "Aplicar"}
          </Button>
          {urls ? <Button type="button" variant="secondary" onClick={() => baixar(urls.blob, "voicecheck-manipulada.wav")}>Baixar WAV</Button> : null}
        </div>
      </form>
      {erro ? <p className="mt-2 text-sm text-signal-err" role="alert">{erro}</p> : null}
      {urls ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="vc2-manipulacao-resultado">
          <div><p className="text-xs text-ink-muted">Original</p><audio className="mt-1 w-full" src={urls.original} controls /></div>
          <div><p className="text-xs text-ink-muted">Manipulada ({st(semitons)} st, {fator === 1 ? "velocidade original" : `duração × ${fator.toLocaleString("pt-BR")}`})</p>
            <audio className="mt-1 w-full" src={urls.nova} controls data-testid="vc2-manipulacao-audio" /></div>
        </div>
      ) : null}
    </section>
  );
}

/** Ferramentas do Praat que não entram no prontuário: análise em lote e manipulação. */
export function FerramentasPraat() {
  return (
    <div className="space-y-5">
      <AnaliseLote />
      <ManipulacaoVoz />
    </div>
  );
}
