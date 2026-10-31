"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import {
  Bold,
  CalendarDays,
  Check,
  ClipboardList,
  Eye,
  Heading2,
  Italic,
  List,
  ListOrdered,
  LoaderCircle,
  PenLine,
  Redo2,
  Sparkles,
  Undo2,
  UserRound,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { ajudarTexto, statusIaTexto, type AcaoIaTexto, type StatusIaTexto } from "@/lib/voz-clinica-api";
import { anonimizar, corpoHtml } from "@/lib/voz-clinica-documentos";

const AREA =
  "block w-full rounded-b-xl border-0 bg-canvas-raised px-4 py-3 text-sm leading-relaxed text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60";

const ACOES_IA: { id: Exclude<AcaoIaTexto, "redigir">; rotulo: string; dica: string }[] = [
  { id: "melhorar", rotulo: "Melhorar", dica: "Mais claro e profissional, sem mudar o sentido" },
  { id: "corrigir", rotulo: "Corrigir português", dica: "Ortografia, gramática e pontuação" },
  { id: "formal", rotulo: "Mais técnico", dica: "Para outro profissional de saúde" },
  { id: "simples", rotulo: "Mais simples", dica: "Para o paciente entender" },
  { id: "resumir", rotulo: "Resumir", dica: "Mantém o essencial" },
];

type Sugestao = { texto: string; inicio: number; fim: number; sobreTudo: boolean; acao: string };

export type EditorDocumentoRef = { focar: () => void };

/**
 * Editor do texto dos documentos: barra de formatação (negrito, itálico, subtítulo, listas,
 * desfazer/refazer, inserir dados), prévia formatada e ajuda da IA (melhorar, corrigir,
 * mudar o tom, resumir, escrever a partir de um pedido). A IA trabalha no trecho selecionado
 * ou no texto todo; a sugestão só entra no documento quando o profissional aplica.
 *
 * O texto continua puro (marcação simples **negrito**, _itálico_, "## ", "• ", "1. "),
 * convertida em HTML só na impressão/prévia, depois de escapada.
 */
export const EditorDocumento = forwardRef<EditorDocumentoRef, {
  id: string;
  valor: string;
  aoMudar: (texto: string) => void;
  paciente: string;
  modelo: string;
  achados: string[];
  descricaoId?: string;
}>(function EditorDocumento({ id, valor, aoMudar, paciente, modelo, achados, descricaoId }, ref) {
  const base = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const [previa, setPrevia] = useState(false);
  const [ia, setIa] = useState<StatusIaTexto | null>(null);
  const [pedido, setPedido] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [sugestao, setSugestao] = useState<Sugestao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [inserir, setInserir] = useState(false);

  useImperativeHandle(ref, () => ({ focar: () => area.current?.focus() }), []);

  useEffect(() => {
    let vivo = true;
    statusIaTexto().then((s) => vivo && setIa(s)).catch(() => vivo && setIa({ disponivel: false, provedor: null, modelo: null }));
    return () => { vivo = false; };
  }, []);

  /** Troca o trecho [inicio, fim) por `novo` mantendo o desfazer do navegador (Ctrl+Z). */
  function substituir(inicio: number, fim: number, novo: string, selecionar?: [number, number]) {
    const el = area.current;
    if (!el) return;
    setPrevia(false);
    el.focus();
    el.setSelectionRange(inicio, fim);
    const ok = typeof document.execCommand === "function" && document.execCommand("insertText", false, novo);
    if (!ok) {
      el.setRangeText(novo, inicio, fim, "end");
      aoMudar(el.value);
    }
    if (selecionar) requestAnimationFrame(() => el.setSelectionRange(selecionar[0], selecionar[1]));
  }

  function envolver(marca: string, exemplo: string) {
    const el = area.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const sel = value.slice(a, b);
    const n = marca.length;
    // já marcado (seleção inclui as marcas ou elas estão logo em volta): tira
    if (sel.length > 2 * n && sel.startsWith(marca) && sel.endsWith(marca)) {
      substituir(a, b, sel.slice(n, -n), [a, b - 2 * n]);
      return;
    }
    if (value.slice(a - n, a) === marca && value.slice(b, b + n) === marca) {
      substituir(a - n, b + n, sel, [a - n, b - n]);
      return;
    }
    const texto = sel || exemplo;
    substituir(a, b, `${marca}${texto}${marca}`, [a + n, a + n + texto.length]);
  }

  /** Aplica (ou tira) um prefixo em todas as linhas da seleção. */
  function prefixar(tipo: "lista" | "numerada" | "titulo") {
    const el = area.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const ini = value.lastIndexOf("\n", a - 1) + 1;
    const fimLinha = value.indexOf("\n", Math.max(a, b - (b > a && value[b - 1] === "\n" ? 1 : 0)));
    const fim = fimLinha === -1 ? value.length : fimLinha;
    const linhas = value.slice(ini, fim).split("\n");
    const re = { lista: /^(•|-)\s/, numerada: /^\d+\.\s/, titulo: /^##\s+/ }[tipo];
    const todas = linhas.every((l) => !l.trim() || re.test(l));
    let k = 0;
    const novas = linhas.map((l) => {
      if (!l.trim()) return l;
      const limpa = l.replace(/^(•|-)\s|^\d+\.\s|^##\s+/, "");
      if (todas) return limpa;
      k += 1;
      return tipo === "lista" ? `• ${limpa}` : tipo === "numerada" ? `${k}. ${limpa}` : `## ${limpa}`;
    });
    const novo = novas.join("\n");
    substituir(ini, fim, novo, [ini, ini + novo.length]);
  }

  function inserirTexto(t: string) {
    const el = area.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    substituir(a, b, t, [a + t.length, a + t.length]);
    setInserir(false);
  }

  function comando(c: "undo" | "redo") {
    area.current?.focus();
    document.execCommand?.(c);
  }

  function teclas(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "b") { e.preventDefault(); envolver("**", "negrito"); }
    else if (k === "i") { e.preventDefault(); envolver("_", "itálico"); }
  }

  async function pedirIa(acao: AcaoIaTexto) {
    const el = area.current;
    if (!el || !ia?.disponivel) return;
    setErro(null);
    setSugestao(null);
    const { selectionStart: a, selectionEnd: b, value } = el;
    const temSelecao = b > a && value.slice(a, b).trim().length > 0;
    const [inicio, fim] = temSelecao ? [a, b] : [0, value.length];
    const trecho = value.slice(inicio, fim);
    if (acao !== "redigir" && !trecho.trim()) { setErro("Escreva ou selecione um texto para a IA trabalhar."); return; }
    if (acao === "redigir" && !pedido.trim()) { setErro("Diga o que a IA deve escrever."); return; }
    const anon = anonimizar(trecho, paciente);
    const pedidoAnon = anonimizar(pedido, paciente).texto;
    setOcupado(acao);
    try {
      const r = await ajudarTexto({ acao, texto: anon.texto, modelo, ...(pedido.trim() ? { pedido: pedidoAnon } : {}) });
      setSugestao({ texto: anon.restaurar(r.texto), inicio, fim, sobreTudo: !temSelecao, acao });
    } catch (e) {
      setErro(friendlyError(e, "A IA não conseguiu responder agora."));
    } finally {
      setOcupado(null);
    }
  }

  function aplicar(modo: "substituir" | "abaixo") {
    if (!sugestao) return;
    const atual = area.current?.value ?? "";
    if (modo === "substituir") {
      // o texto pode ter mudado desde o pedido: confere antes de trocar o mesmo trecho
      const fim = Math.min(sugestao.fim, atual.length);
      substituir(sugestao.inicio, fim, sugestao.texto, [sugestao.inicio, sugestao.inicio + sugestao.texto.length]);
    } else {
      const pos = Math.min(sugestao.fim, atual.length);
      const t = `\n\n${sugestao.texto}`;
      substituir(pos, pos, t, [pos + 2, pos + t.length]);
    }
    setSugestao(null);
    setPedido("");
  }

  const botao = "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-ink-muted transition-colors hover:bg-canvas-overlay hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40";
  const sep = <span className="mx-1 h-5 w-px bg-ink/10" aria-hidden />;
  const nomeProvedor = ia?.provedor === "anthropic" ? "Claude (Anthropic)" : ia?.provedor === "ollama" ? "o modelo local" : "";

  return (
    <div>
      <div className="overflow-hidden rounded-xl ring-1 ring-inset ring-line">
        <div role="toolbar" aria-label="Formatação do texto" aria-controls={id}
          className="flex flex-wrap items-center gap-0.5 border-b border-line bg-canvas-overlay/40 px-2 py-1.5">
          <button type="button" className={botao} onClick={() => envolver("**", "negrito")} title="Negrito (Ctrl+B)" aria-label="Negrito" disabled={previa}>
            <Bold className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={botao} onClick={() => envolver("_", "itálico")} title="Itálico (Ctrl+I)" aria-label="Itálico" disabled={previa}>
            <Italic className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={botao} onClick={() => prefixar("titulo")} title="Subtítulo" aria-label="Subtítulo" disabled={previa}>
            <Heading2 className="h-4 w-4" aria-hidden />
          </button>
          {sep}
          <button type="button" className={botao} onClick={() => prefixar("lista")} title="Lista com marcadores" aria-label="Lista com marcadores" disabled={previa}>
            <List className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={botao} onClick={() => prefixar("numerada")} title="Lista numerada" aria-label="Lista numerada" disabled={previa}>
            <ListOrdered className="h-4 w-4" aria-hidden />
          </button>
          {sep}
          <button type="button" className={botao} onClick={() => comando("undo")} title="Desfazer (Ctrl+Z)" aria-label="Desfazer" disabled={previa}>
            <Undo2 className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={botao} onClick={() => comando("redo")} title="Refazer (Ctrl+Y)" aria-label="Refazer" disabled={previa}>
            <Redo2 className="h-4 w-4" aria-hidden />
          </button>
          {sep}
          <div className="relative"
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setInserir(false); }}
            onKeyDown={(e) => { if (e.key === "Escape") setInserir(false); }}>
            <button type="button" className={botao} onClick={() => setInserir((v) => !v)} aria-expanded={inserir} aria-haspopup="menu" disabled={previa}>
              Inserir
            </button>
            {inserir ? (
              <div role="menu" className="absolute left-0 top-9 z-20 w-64 rounded-xl bg-canvas-card p-1 shadow-xl ring-1 ring-ink/15">
                <button type="button" role="menuitem" className={cn(botao, "w-full justify-start")} onClick={() => inserirTexto(paciente)}>
                  <UserRound className="h-4 w-4" aria-hidden /> Nome do paciente
                </button>
                <button type="button" role="menuitem" className={cn(botao, "w-full justify-start")} onClick={() => inserirTexto(new Date().toLocaleDateString("pt-BR"))}>
                  <CalendarDays className="h-4 w-4" aria-hidden /> Data de hoje
                </button>
                <button type="button" role="menuitem" className={cn(botao, "w-full justify-start")} disabled={!achados.length}
                  onClick={() => inserirTexto(achados.join("\n"))}>
                  <ClipboardList className="h-4 w-4" aria-hidden /> Medidas e protocolos do prontuário
                </button>
                <button type="button" role="menuitem" className={cn(botao, "w-full justify-start")} onClick={() => inserirTexto("[completar]")}>
                  <PenLine className="h-4 w-4" aria-hidden /> Campo para completar [ ]
                </button>
              </div>
            ) : null}
          </div>
          <span className="ml-auto" />
          <button type="button" className={cn(botao, previa && "bg-canvas-card text-ink")} onClick={() => setPrevia((v) => !v)} aria-pressed={previa}>
            <Eye className="h-4 w-4" aria-hidden /> Prévia
          </button>
        </div>

        <textarea id={id} ref={area} className={cn(AREA, "min-h-[22rem]", previa && "hidden")} maxLength={20000} value={valor}
          onChange={(e) => aoMudar(e.target.value)} onKeyDown={teclas} aria-describedby={descricaoId} spellCheck lang="pt-BR"
          data-testid="vc2-doc-corpo" />
        {previa ? (
          // HTML montado por corpoHtml: o texto é escapado antes; só entram <p>, <h2>, listas, <strong> e <em>
          <div className="doc-previa min-h-[22rem] bg-white px-8 py-6 text-[0.95rem] leading-relaxed text-[#0E1A24] [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:font-semibold [&_li]:mb-1 [&_ol]:mb-3 [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:ml-5 [&_ul]:list-disc"
            data-testid="vc2-doc-previa-texto" dangerouslySetInnerHTML={{ __html: corpoHtml(valor) }} />
        ) : null}
      </div>
      <p className="mt-1 text-right text-xs text-ink-faint">{valor.length.toLocaleString("pt-BR")} / 20.000</p>

      <section className="mt-3 rounded-xl bg-canvas-overlay/40 p-4 ring-1 ring-inset ring-ink/10" aria-labelledby={`${base}-ia`} data-testid="vc2-doc-ia">
        <h3 id={`${base}-ia`} className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden /> Ajuda da IA
        </h3>
        {ia === null ? (
          <p className="mt-1 text-xs text-ink-muted">Verificando…</p>
        ) : !ia.disponivel ? (
          <p className="mt-1 text-xs text-ink-muted" data-testid="vc2-doc-ia-desligada">
            A IA de texto está desligada nesta instalação. Para ligar, configure na API <code className="text-data">IA_TEXTO_PROVEDOR</code>{" "}
            (<code className="text-data">anthropic</code> com <code className="text-data">ANTHROPIC_API_KEY</code>, ou <code className="text-data">ollama</code> para um modelo local).
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-ink-muted">
              Trabalha no trecho selecionado ou, sem seleção, no texto todo. O texto vai para {nomeProvedor} sem o nome do paciente.
              Revise sempre a sugestão: a IA pode errar.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ACOES_IA.map((a) => (
                <Button key={a.id} type="button" size="sm" variant="secondary" title={a.dica} disabled={!!ocupado}
                  onClick={() => void pedirIa(a.id)} data-testid={`vc2-doc-ia-${a.id}`}>
                  {ocupado === a.id ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                  {a.rotulo}
                </Button>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <label htmlFor={`${base}-pedido`} className="sr-only">Pedido para a IA</label>
              <input id={`${base}-pedido`} value={pedido} maxLength={1000} onChange={(e) => setPedido(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void pedirIa("redigir"); } }}
                placeholder="Peça à IA: ex.: acrescente que serão 8 sessões semanais e reavaliação em 2 meses"
                className="h-9 flex-1 rounded-lg border border-line bg-canvas-raised px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                data-testid="vc2-doc-ia-pedido" />
              <Button type="button" size="sm" disabled={!!ocupado || !pedido.trim()} onClick={() => void pedirIa("redigir")} data-testid="vc2-doc-ia-redigir">
                {ocupado === "redigir" ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
                Escrever com IA
              </Button>
            </div>
          </>
        )}
        {erro ? <p className="mt-2 text-sm text-signal-err" role="alert">{erro}</p> : null}

        {sugestao ? (
          <div className="mt-4 rounded-lg bg-canvas-raised p-3 ring-1 ring-inset ring-accent/40" role="region" aria-label="Sugestão da IA" data-testid="vc2-doc-ia-sugestao">
            <p className="text-xs font-medium text-ink-muted">
              Sugestão para {sugestao.sobreTudo ? "o texto todo" : "o trecho selecionado"}
            </p>
            <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-ink">{sugestao.texto}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => aplicar("substituir")} data-testid="vc2-doc-ia-aplicar">
                <Check className="h-4 w-4" aria-hidden /> {sugestao.sobreTudo ? "Substituir o texto" : "Substituir o trecho"}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => aplicar("abaixo")}>Inserir abaixo</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSugestao(null)}>
                <X className="h-4 w-4" aria-hidden /> Descartar
              </Button>
            </div>
            <p className="mt-2 text-xs text-ink-faint">Depois de aplicar, Ctrl+Z desfaz.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
});
