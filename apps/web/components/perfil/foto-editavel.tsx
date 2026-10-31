"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, LoaderCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/errors";
import { iniciais, prepararFoto } from "@/lib/imagem-foto";
import { cn } from "@/lib/utils";

/**
 * Foto com troca e remoção (profissional em Meu perfil, paciente no cadastro). A imagem é
 * reduzida e regravada no navegador antes do envio (sem metadados nem localização).
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
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let vivo = true;
    let atual: string | null = null;
    carregar()
      .then((b) => {
        if (!vivo) return;
        atual = b ? URL.createObjectURL(b) : null;
        setUrl(atual);
      })
      .catch(() => vivo && setUrl(null));
    return () => {
      vivo = false;
      if (atual) URL.revokeObjectURL(atual);
    };
    // carregar muda a cada render do pai; a foto só recarrega quando versão/rev mudam
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versao, rev]);

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setErro(null);
    setOcupado(true);
    try {
      await enviar(await prepararFoto(arquivo));
      setRev((r) => r + 1);
    } catch (err) {
      setErro(friendlyError(err, "Não foi possível enviar a foto."));
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
    <div className="flex items-center gap-4" data-testid={testid}>
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
      <div className="space-y-2">
        <input id={`${id}-arq`} ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
          onChange={(e) => void escolher(e)} disabled={ocupado} data-testid={testid ? `${testid}-arquivo` : undefined} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={ocupado} onClick={() => input.current?.click()}>
            <Camera className="h-4 w-4" aria-hidden /> {url ? "Trocar foto" : "Adicionar foto"}
          </Button>
          {url ? (
            <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={() => void remover()}>
              <Trash2 className="h-4 w-4" aria-hidden /> Remover
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-ink-faint">JPG, PNG ou WebP. A imagem é reduzida e enviada sem dados de localização.</p>
        {erro ? <p className="text-sm text-signal-err" role="alert">{erro}</p> : null}
      </div>
    </div>
  );
}
