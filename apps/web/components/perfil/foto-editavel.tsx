"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, ImagePlus, LoaderCircle, Pencil, Trash2 } from "lucide-react";

import { EditorFoto } from "@/components/perfil/editor-foto";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/errors";
import { iniciais } from "@/lib/imagem-foto";
import { cn } from "@/lib/utils";

/**
 * Foto com câmera, escolha de arquivo e editor (profissional em Meu perfil, paciente no
 * cadastro). Toda foto passa pelo editor e sai como JPEG quadrado, sem metadados nem
 * localização.
 */
export function FotoEditavel({
  nome,
  rotulo,
  carregar,
  enviar,
  apagar,
  versao = 0,
  tamanho = "lg",
  testid,
}: {
  nome: string;
  rotulo: string;
  carregar: () => Promise<Blob | null>;
  enviar: (foto: Blob) => Promise<unknown>;
  apagar: () => Promise<unknown>;
  versao?: number;
  tamanho?: "md" | "lg";
  testid?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [atual, setAtual] = useState<Blob | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const [editor, setEditor] = useState<{ modo: "camera" | "editar"; arquivo: Blob | null } | null>(null);
  const temCamera = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    let vivo = true;
    let u: string | null = null;
    carregar()
      .then((b) => {
        if (!vivo) return;
        setAtual(b);
        u = b ? URL.createObjectURL(b) : null;
        setUrl(u);
      })
      .catch(() => { if (vivo) { setUrl(null); setAtual(null); } });
    return () => {
      vivo = false;
      if (u) URL.revokeObjectURL(u);
    };
    // carregar muda a cada render do pai; a foto só recarrega quando versão/rev mudam
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versao, rev]);

  function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setErro(null);
    if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) { setErro("Envie uma imagem JPG, PNG ou WebP."); return; }
    if (arquivo.size > 20 * 1024 * 1024) { setErro("Imagem muito grande (máximo 20 MB)."); return; }
    setEditor({ modo: "editar", arquivo });
  }

  async function salvarEditada(foto: Blob) {
    setOcupado(true);
    try {
      await enviar(foto);
      setRev((r) => r + 1);
    } catch (err) {
      throw new Error(friendlyError(err, "Não foi possível enviar a foto."));
    } finally {
      setOcupado(false);
    }
  }

  async function remover() {
    setErro(null);
    setOcupado(true);
    try {
      await apagar();
      setRev((r) => r + 1);
    } catch (err) {
      setErro(friendlyError(err, "Não foi possível remover a foto."));
    } finally {
      setOcupado(false);
    }
  }

  const lado = tamanho === "lg" ? "h-28 w-28 text-3xl" : "h-16 w-16 text-lg";
  return (
    <div className="flex flex-wrap items-center gap-4" data-testid={testid}>
      <div className={cn("relative shrink-0 overflow-hidden rounded-full bg-accent/15 ring-1 ring-inset ring-ink/10", lado)}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob local, não passa pelo otimizador
          <img src={url} alt={`${rotulo} de ${nome || "sem nome"}`} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-display font-semibold text-accent" aria-hidden>
            {iniciais(nome)}
          </span>
        )}
        {ocupado ? (
          <span className="absolute inset-0 flex items-center justify-center bg-canvas/60">
            <LoaderCircle className="h-6 w-6 animate-spin text-ink motion-reduce:animate-none" aria-hidden />
          </span>
        ) : null}
      </div>
      <div className="min-w-0 space-y-2">
        {/* no celular sem acesso direto à câmera, o seletor oferece "Câmera" (capture) */}
        <input id={`${id}-arq`} ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
          onChange={escolher} disabled={ocupado} tabIndex={-1} aria-hidden data-testid={testid ? `${testid}-arquivo` : undefined} />
        <div className="flex flex-wrap gap-2">
          {temCamera ? (
            <Button type="button" size="sm" variant="secondary" disabled={ocupado} onClick={() => { setErro(null); setEditor({ modo: "camera", arquivo: null }); }}
              data-testid={testid ? `${testid}-camera` : undefined}>
              <Camera className="h-4 w-4" aria-hidden /> Tirar foto
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="secondary" disabled={ocupado} onClick={() => input.current?.click()}>
            <ImagePlus className="h-4 w-4" aria-hidden /> {url ? "Trocar imagem" : "Escolher imagem"}
          </Button>
          {url && atual ? (
            <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={() => setEditor({ modo: "editar", arquivo: atual })}
              data-testid={testid ? `${testid}-editar` : undefined}>
              <Pencil className="h-4 w-4" aria-hidden /> Editar
            </Button>
          ) : null}
          {url ? (
            <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={() => void remover()}>
              <Trash2 className="h-4 w-4" aria-hidden /> Remover
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-ink-faint">Tire na hora ou escolha uma imagem; depois enquadre e ajuste. Enviada sem dados de localização.</p>
        {erro ? <p className="text-sm text-signal-err" role="alert">{erro}</p> : null}
      </div>

      <EditorFoto aberto={!!editor} modo={editor?.modo ?? "editar"} arquivo={editor?.arquivo ?? null} titulo={rotulo === "Foto" ? "Sua foto" : rotulo}
        aoFechar={() => setEditor(null)} aoSalvar={salvarEditada} />
    </div>
  );
}
