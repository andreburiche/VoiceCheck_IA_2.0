"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/errors";
import {
  ACEITA_MIDIA,
  LIMITES_MIDIA,
  baixarMidia,
  enviarMidia,
  excluirAvaliacao,
  listarAvaliacoes,
  tamanhoBR,
  type Avaliacao,
  type ResultadoMidia,
} from "@/lib/voz-clinica-api";

function dataHora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Cartão de uma mídia: imagem carrega sozinha; vídeo só quando pedido (pode ser grande). */
function CartaoMidia({ item, aoExcluir }: { item: Avaliacao; aoExcluir: (a: Avaliacao) => void }) {
  const r = item.resultado as ResultadoMidia;
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const urlRef = useRef<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const blob = await baixarMidia(item.id);
      const u = URL.createObjectURL(blob);
      urlRef.current = u;
      setUrl(u);
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível carregar."));
    } finally {
      setCarregando(false);
    }
  }, [item.id]);

  useEffect(() => {
    if (r.categoria === "imagem") void carregar();
    return () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); };
  }, [carregar, r.categoria]);

  const legenda = r.descricao || r.nome_original || (r.categoria === "video" ? "Vídeo" : "Imagem");
  return (
    <li className="overflow-hidden rounded-xl ring-1 ring-inset ring-ink/10" data-testid="vc2-midia">
      <div className="flex aspect-video items-center justify-center bg-canvas-raised/60">
        {r.categoria === "imagem" ? (
          url ? <img src={url} alt={legenda} className="h-full w-full object-contain" /> : <span className="text-xs text-ink-muted">{carregando ? "Carregando…" : erro ?? ""}</span>
        ) : url ? (
          <video src={url} controls className="h-full w-full" aria-label={legenda} data-testid="vc2-midia-video" />
        ) : (
          <Button type="button" size="sm" variant="secondary" onClick={() => void carregar()} disabled={carregando} data-testid="vc2-midia-abrir-video">
            {carregando ? "Carregando…" : `Abrir vídeo (${tamanhoBR(r.bytes)})`}
          </Button>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-medium text-ink" title={legenda}>{legenda}</p>
        <p className="text-xs text-ink-muted">{r.categoria === "video" ? "Vídeo" : "Imagem"} · {tamanhoBR(r.bytes)} · {dataHora(item.criado_em)}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {url ? (
            <a href={url} download={r.nome_original ?? `midia.${r.extensao}`} className="inline-flex min-h-[32px] items-center text-xs font-medium text-accent hover:underline">Baixar</a>
          ) : null}
          <button type="button" onClick={() => aoExcluir(item)} className="inline-flex min-h-[32px] items-center text-xs text-ink-muted hover:text-signal-err" data-testid="vc2-midia-excluir">
            Excluir
          </button>
        </div>
        {erro && r.categoria === "video" ? <p className="mt-1 text-xs text-signal-err" role="alert">{erro}</p> : null}
      </div>
    </li>
  );
}

/**
 * Mídias do paciente (como no iVox): fotos e vídeos de exames, de postura, da sessão.
 * O servidor confere o tipo pelo conteúdo; contam no espaço do plano e saem no ZIP da LGPD.
 */
export function MidiasPaciente({ paciente, versao, aoSalvar }: { paciente: string; versao: number; aoSalvar: () => void }) {
  const id = useId();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [itens, setItens] = useState<Avaliacao[] | null>(null);
  const [excluir, setExcluir] = useState<Avaliacao | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    if (!paciente) return;
    const meu = ++pedido.current;
    try {
      const lista = (await listarAvaliacoes(paciente)).items.filter((a) => a.tipo === "midia");
      if (meu === pedido.current) setItens(lista);
    } catch {
      if (meu === pedido.current) setItens([]);
    }
  }, [paciente]);
  useEffect(() => { void carregar(); }, [carregar, versao]);

  function escolher(f: File | null) {
    setMsg(null);
    setErro(null);
    if (!f) { setArquivo(null); return; }
    const video = f.type.startsWith("video/");
    if (!ACEITA_MIDIA.split(",").includes(f.type)) {
      setErro("Envie imagem (JPG, PNG, WebP) ou vídeo (MP4, MOV, WebM).");
      setArquivo(null);
      return;
    }
    const limite = video ? LIMITES_MIDIA.video : LIMITES_MIDIA.imagem;
    if (f.size > limite) {
      setErro(`${video ? "Vídeo" : "Imagem"} maior que ${tamanhoBR(limite)}.`);
      setArquivo(null);
      return;
    }
    setArquivo(f);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!arquivo) { setErro("Escolha a imagem ou o vídeo."); return; }
    setEnviando(true);
    setErro(null);
    try {
      await enviarMidia(paciente, arquivo, descricao);
      setMsg(`${arquivo.name} guardado.`);
      setArquivo(null);
      setDescricao("");
      if (entrada.current) entrada.current.value = "";
      aoSalvar();
      void carregar();
    } catch (err) {
      setErro(friendlyError(err, "Não foi possível guardar o arquivo."));
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarExclusao() {
    if (!excluir) return;
    setExcluindo(true);
    try {
      await excluirAvaliacao(excluir.id);
      setExcluir(null);
      aoSalvar();
      void carregar();
    } catch (err) {
      setErro(friendlyError(err, "Não foi possível excluir."));
    } finally {
      setExcluindo(false);
    }
  }

  if (!paciente) {
    return (
      <section className="rounded-2xl bg-canvas-card p-5 ring-1 ring-inset ring-ink/10">
        <p className="text-sm text-ink-muted">Preencha o nome do paciente para guardar imagens e vídeos.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-canvas-card p-5 ring-1 ring-inset ring-ink/10" aria-labelledby={`${id}-t`} data-testid="vc2-midias">
      <h2 id={`${id}-t`} className="font-display text-lg font-semibold text-ink">Mídias — {paciente}</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-muted">
        Imagens e vídeos do paciente (exames, postura, trechos de sessão). Imagem até {tamanhoBR(LIMITES_MIDIA.imagem)}, vídeo até {tamanhoBR(LIMITES_MIDIA.video)}; contam no espaço do plano.
      </p>
      <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => void enviar(e)} noValidate>
        <div>
          <Label htmlFor={`${id}-arq`}>Arquivo</Label>
          <input ref={entrada} id={`${id}-arq`} type="file" accept={ACEITA_MIDIA} className="mt-1 block max-w-full text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-canvas-raised file:px-3 file:py-2 file:text-sm file:text-ink"
            onChange={(e) => escolher(e.target.files?.[0] ?? null)} data-testid="vc2-midia-arquivo" />
        </div>
        <div className="min-w-[12rem] flex-1">
          <Label htmlFor={`${id}-desc`}>Descrição (opcional)</Label>
          <Input id={`${id}-desc`} className="mt-1" maxLength={200} placeholder="ex.: videolaringoscopia de 10/2026" value={descricao}
            onChange={(e) => setDescricao(e.target.value)} data-testid="vc2-midia-descricao" />
        </div>
        <Button type="submit" disabled={enviando || !arquivo} data-testid="vc2-midia-enviar">{enviando ? "Enviando…" : "Guardar"}</Button>
      </form>
      {msg ? <p className="mt-2 text-sm text-ink" role="status" data-testid="vc2-midia-msg">{msg}</p> : null}
      {erro ? <p className="mt-2 text-sm text-signal-err" role="alert">{erro}</p> : null}

      {itens === null ? <p className="mt-4 text-sm text-ink-muted">Carregando…</p> : null}
      {itens?.length === 0 ? <p className="mt-4 text-sm text-ink-muted">Nenhuma imagem ou vídeo guardado.</p> : null}
      {itens?.length ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="vc2-midias-lista">
          {itens.map((a) => <CartaoMidia key={a.id} item={a} aoExcluir={setExcluir} />)}
        </ul>
      ) : null}
      <ConfirmDialog
        open={excluir !== null}
        title="Excluir esta mídia?"
        description="O arquivo é apagado para sempre do armazenamento."
        confirmLabel="Excluir"
        danger
        busy={excluindo}
        onConfirm={() => void confirmarExclusao()}
        onCancel={() => setExcluir(null)}
      />
    </section>
  );
}
