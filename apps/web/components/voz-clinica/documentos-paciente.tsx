"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Printer, RotateCcw, Save } from "lucide-react";

import { EditorDocumento, type EditorDocumentoRef } from "@/components/voz-clinica/editor-documento";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi, type User } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { printHtmlDocument } from "@/lib/voicecheck-report-shared";
import {
  emitirDocumento,
  listarAvaliacoes,
  obterCadastro,
  type Avaliacao,
  type CadastroPaciente,
  type DocumentoSalvo,
} from "@/lib/voz-clinica-api";
import {
  ESPECIALIDADES,
  LOGO_PAPEL,
  achados as listarAchados,
  MODELOS,
  PROFISSIONAL_VAZIO,
  gerarRascunho,
  htmlDocumento,
  pendencias,
  type Extras,
  type ModeloDocumento,
  type Profissional,
} from "@/lib/voz-clinica-documentos";

const PAINEL = "rounded-2xl bg-canvas-raised/60 p-5 ring-1 ring-inset ring-ink/10 sm:p-6";
const AREA =
  "mt-1 block w-full rounded-lg border border-line bg-canvas-raised px-3 py-2 text-sm leading-relaxed text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Quem assina, a partir de Meu perfil (cada documento grava os dados usados na emissão). */
export function profissionalDoPerfil(u: User | undefined): Profissional {
  if (!u) return PROFISSIONAL_VAZIO;
  const d = u.perfil_dados ?? {};
  return {
    nome: u.name ?? "",
    registro: d.registro ?? "",
    contato: [d.instituicao, d.endereco, d.telefone].map((v) => (v ?? "").trim()).filter(Boolean).join(" · "),
    cidade: d.cidade ?? "",
  };
}

/**
 * Aba Documentos: devolutiva, relatório, encaminhamentos, declaração, atestado, plano
 * terapêutico, orientações e termo de consentimento. O rascunho vem do prontuário; o
 * profissional revisa, emite (fica no histórico) e imprime ou salva em PDF.
 */
export function DocumentosPaciente({ paciente, versao, aoSalvar }: { paciente: string; versao: number; aoSalvar: () => void }) {
  const id = useId();
  const [prof, setProf] = useState<Profissional>(PROFISSIONAL_VAZIO);
  const [modelo, setModelo] = useState<ModeloDocumento>("devolutiva");
  const [extras, setExtras] = useState<Extras>({ inicio: hojeLocal(), dias: 1, especialidade: ESPECIALIDADES[0] });
  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [editado, setEditado] = useState(false);
  const [itens, setItens] = useState<Avaliacao[] | null>(null);
  const [cadastro, setCadastro] = useState<CadastroPaciente | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const pedido = useRef(0);
  const textoRef = useRef<EditorDocumentoRef>(null);

  const me = useQuery({ queryKey: ["me"], queryFn: () => authApi.me() });
  const [profEditado, setProfEditado] = useState(false);
  // vem de Meu perfil; ajustes aqui valem só para os documentos desta tela
  useEffect(() => { if (me.data && !profEditado) setProf(profissionalDoPerfil(me.data)); }, [me.data, profEditado]);
  function mudarProf(campo: keyof Profissional, valor: string) {
    setProfEditado(true);
    setProf((p) => ({ ...p, [campo]: valor }));
  }

  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
    try {
      const [lista, cad] = await Promise.all([listarAvaliacoes(paciente), obterCadastro(paciente).catch(() => null)]);
      if (meu !== pedido.current) return;
      setItens(lista.items);
      setCadastro(cad);
    } catch (e) {
      if (meu === pedido.current) { setItens([]); setErro(friendlyError(e, "Não foi possível carregar o prontuário.")); }
    }
  }, [paciente]);
  useEffect(() => { void carregar(); }, [carregar, versao]);

  const rascunho = useMemo(
    () => (itens ? gerarRascunho(modelo, { paciente, cadastro, itens, hoje: new Date(), extras }) : null),
    [modelo, paciente, cadastro, itens, extras],
  );
  // o rascunho acompanha modelo e campos até o profissional editar o texto à mão
  useEffect(() => {
    if (rascunho && !editado) { setTitulo(rascunho.titulo); setCorpo(rascunho.corpo); }
  }, [rascunho, editado]);

  function escolher(m: ModeloDocumento) {
    if (m === modelo) return;
    if (editado && !window.confirm("Trocar de modelo descarta as alterações feitas no texto. Continuar?")) return;
    setEditado(false);
    setModelo(m);
    setMsg(null);
    setErro(null);
  }

  function refazer() {
    setEditado(false);
    if (rascunho) { setTitulo(rascunho.titulo); setCorpo(rascunho.corpo); }
  }

  const faltando = pendencias(corpo);
  const achadosLista = useMemo(() => (itens ? listarAchados(itens) : []), [itens]);
  const emitidos = useMemo(
    () => (itens ?? []).filter((a) => a.tipo === "documento").sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
    [itens],
  );

  function imprimir(doc: DocumentoSalvo | null) {
    const d = doc ?? { modelo, titulo, corpo, profissional: { nome: prof.nome || "[profissional]", registro: prof.registro, contato: prof.contato, cidade: prof.cidade } };
    try {
      printHtmlDocument(htmlDocumento(d as Parameters<typeof htmlDocumento>[0], paciente, `${window.location.origin}${LOGO_PAPEL}`));
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível abrir a impressão."));
    }
  }

  async function emitir(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErro(null);
    if (!prof.nome.trim()) { setErro("Informe o nome do profissional que assina."); return; }
    if (!titulo.trim() || !corpo.trim()) { setErro("O documento está sem título ou sem texto."); return; }
    if (faltando.length && !window.confirm(`Ainda há ${faltando.length} ${faltando.length === 1 ? "trecho" : "trechos"} entre colchetes para completar. Emitir assim mesmo?`)) {
      textoRef.current?.focar();
      return;
    }
    setSalvando(true);
    try {
      const r = await emitirDocumento({ paciente, modelo, titulo: titulo.trim(), corpo: corpo.trim(), profissional: prof });
      setMsg("Documento emitido e guardado no prontuário. Abrindo a impressão…");
      imprimir(r.resultado);
      aoSalvar();
      await carregar();
    } catch (e2) {
      setErro(friendlyError(e2, "Não foi possível emitir o documento."));
    } finally {
      setSalvando(false);
    }
  }

  const precisaData = modelo === "comparecimento" || modelo === "atestado";

  return (
    <section className={cn(PAINEL, "mt-6")} aria-labelledby={`${id}-t`} data-testid="vc2-documentos">
      <h2 id={`${id}-t`} className="font-display text-lg font-semibold text-ink">Documentos para {paciente}</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-muted">
        Escolha o modelo: o texto já vem com os dados do prontuário. Revise, complete o que estiver entre colchetes e emita.
        O documento fica guardado no histórico e abre para imprimir ou salvar em PDF.
      </p>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-ink">Quem assina</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ["nome", "Nome", "ex.: Ana Souza", 120],
            ["registro", "Registro profissional", "ex.: CRFa 2-12345", 60],
            ["contato", "Consultório e contato", "endereço ou telefone", 200],
            ["cidade", "Cidade", "ex.: Recife", 80],
          ] as const).map(([campo, rotulo, dica, max]) => (
            <div key={campo}>
              <Label htmlFor={`${id}-${campo}`}>{rotulo}</Label>
              <Input id={`${id}-${campo}`} className="mt-1" value={prof[campo]} maxLength={max} placeholder={dica}
                onChange={(e) => mudarProf(campo, e.target.value)} data-testid={`vc2-doc-prof-${campo}`} />
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-faint">
          Vem de <Link href="/perfil" className="text-accent hover:underline">Meu perfil</Link>; mudanças aqui valem só para os documentos desta tela.
        </p>
      </fieldset>

      <fieldset className="mt-6">
        <legend className="text-sm font-medium text-ink">Modelo</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Modelo de documento">
          {MODELOS.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={modelo === m.id} onClick={() => escolher(m.id)}
              className={cn(
                "rounded-xl px-4 py-3 text-left ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                modelo === m.id ? "bg-accent/10 ring-accent" : "bg-canvas-raised ring-ink/10 hover:ring-ink/25",
              )}
              data-testid={`vc2-doc-modelo-${m.id}`}>
              <span className="block text-sm font-semibold text-ink">{m.titulo}</span>
              <span className="mt-0.5 block text-xs leading-snug text-ink-muted">{m.descricao}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {modelo === "encaminhamento" || precisaData || modelo === "plano" ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {modelo === "encaminhamento" ? (
            <div className="sm:col-span-2">
              <Label htmlFor={`${id}-esp`}>Avaliação</Label>
              <select id={`${id}-esp`} className={AREA} value={extras.especialidade} onChange={(e) => setExtras((x) => ({ ...x, especialidade: e.target.value }))}>
                {ESPECIALIDADES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          ) : null}
          {precisaData ? (
            <div>
              <Label htmlFor={`${id}-data`}>{modelo === "atestado" ? "A partir de" : "Data do atendimento"}</Label>
              <Input id={`${id}-data`} type="date" className="mt-1" value={extras.inicio ?? ""} onChange={(e) => setExtras((x) => ({ ...x, inicio: e.target.value }))} />
            </div>
          ) : null}
          {modelo === "comparecimento" ? (
            <>
              <div>
                <Label htmlFor={`${id}-hi`}>Início</Label>
                <Input id={`${id}-hi`} type="time" className="mt-1" value={extras.horaInicio ?? ""} onChange={(e) => setExtras((x) => ({ ...x, horaInicio: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor={`${id}-hf`}>Término</Label>
                <Input id={`${id}-hf`} type="time" className="mt-1" value={extras.horaFim ?? ""} onChange={(e) => setExtras((x) => ({ ...x, horaFim: e.target.value }))} />
              </div>
            </>
          ) : null}
          {modelo === "atestado" ? (
            <div>
              <Label htmlFor={`${id}-dias`}>Dias de afastamento</Label>
              <Input id={`${id}-dias`} type="number" min={1} max={90} className="mt-1" value={extras.dias ?? ""}
                onChange={(e) => setExtras((x) => ({ ...x, dias: Math.max(0, Math.min(90, Number(e.target.value) || 0)) }))} />
            </div>
          ) : null}
          {modelo === "plano" ? (
            <>
              <div>
                <Label htmlFor={`${id}-freq`}>Frequência</Label>
                <Input id={`${id}-freq`} className="mt-1" placeholder="1 sessão por semana" maxLength={60} value={extras.frequencia ?? ""} onChange={(e) => setExtras((x) => ({ ...x, frequencia: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor={`${id}-dur`}>Duração estimada</Label>
                <Input id={`${id}-dur`} className="mt-1" placeholder="12 sessões" maxLength={60} value={extras.duracao ?? ""} onChange={(e) => setExtras((x) => ({ ...x, duracao: e.target.value }))} />
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={(e) => void emitir(e)} className="mt-6">
        <Label htmlFor={`${id}-titulo`}>Título</Label>
        <Input id={`${id}-titulo`} className="mt-1" maxLength={120} value={titulo}
          onChange={(e) => { setTitulo(e.target.value); setEditado(true); }} data-testid="vc2-doc-titulo" />
        <div className="mt-4 flex items-end justify-between gap-3">
          <Label htmlFor={`${id}-corpo`}>Texto (revise antes de emitir)</Label>
          {editado ? (
            <button type="button" onClick={refazer} className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Refazer a partir do prontuário
            </button>
          ) : null}
        </div>
        <div className="mt-1">
          <EditorDocumento ref={textoRef} id={`${id}-corpo`} valor={corpo} paciente={paciente} modelo={modelo} achados={achadosLista}
            descricaoId={`${id}-pend`} aoMudar={(t) => { setCorpo(t); setEditado(true); }} />
        </div>
        <p id={`${id}-pend`} className={cn("mt-1.5 text-xs", faltando.length ? "text-signal-warn" : "text-ink-faint")} data-testid="vc2-doc-pendencias">
          {itens === null ? "Carregando o prontuário…"
            : faltando.length ? `Para completar: ${faltando.slice(0, 6).join(" · ")}${faltando.length > 6 ? " …" : ""}`
            : "Nada entre colchetes para completar."}
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="submit" disabled={salvando || itens === null} data-testid="vc2-doc-emitir">
            <Save className="h-4 w-4" aria-hidden /> {salvando ? "Emitindo…" : "Emitir e imprimir"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => imprimir(null)} disabled={!corpo.trim()} data-testid="vc2-doc-previa">
            <Printer className="h-4 w-4" aria-hidden /> Ver prévia
          </Button>
        </div>
        {msg ? <p className="mt-3 text-sm text-ink" role="status">{msg}</p> : null}
        {erro ? <p className="mt-3 text-sm text-signal-err" role="alert">{erro}</p> : null}
        <p className="mt-3 text-xs text-ink-faint">
          Os modelos são pontos de partida: confira atestados e declarações com as normas do seu conselho (CFFa/CRFa).
          Exames médicos, como a videolaringoscopia, ficam a critério do médico; o encaminhamento traz a justificativa fonoaudiológica.
        </p>
      </form>

      <div className="mt-8">
        <h3 className="font-display text-base font-semibold text-ink">Documentos emitidos</h3>
        {emitidos.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Nenhum documento emitido para este paciente ainda.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink/[0.07] overflow-hidden rounded-xl ring-1 ring-inset ring-ink/10" data-testid="vc2-doc-emitidos">
            {emitidos.map((a) => {
              const d = a.resultado as unknown as DocumentoSalvo;
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <FileText className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{d.titulo}</span>
                      <span className="block text-xs text-ink-muted">
                        {new Date(a.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {d.profissional?.nome}
                      </span>
                    </span>
                  </span>
                  <Button type="button" size="sm" variant="secondary" onClick={() => imprimir(d)} aria-label={`Imprimir de novo: ${d.titulo}, de ${new Date(a.criado_em).toLocaleDateString("pt-BR")}`}>
                    <Printer className="h-4 w-4" aria-hidden /> Imprimir
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
