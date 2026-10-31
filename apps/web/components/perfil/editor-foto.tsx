"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Camera, FlipHorizontal2, RotateCcw, RotateCw, SwitchCamera, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AJUSTES_INICIAIS, ESTILOS, ZOOM_MAX, desenhar, limitarPosicao, type Ajustes } from "@/lib/editor-foto";
import { cn } from "@/lib/utils";

const QUADRO = 640; // lado da foto final (px)

type Fonte = { img: CanvasImageSource; w: number; h: number };

/**
 * Janela de foto: tira pela câmera (ou recebe uma imagem escolhida) e abre o editor —
 * enquadrar arrastando, zoom, girar, espelhar, brilho, contraste, saturação e estilos.
 * O resultado é um JPEG quadrado de 640 px, sem metadados (nem localização).
 */
export function EditorFoto({
  aberto,
  modo,
  arquivo,
  titulo,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  /** "camera" abre a câmera primeiro; "editar" usa o `arquivo` */
  modo: "camera" | "editar";
  arquivo: Blob | null;
  titulo: string;
  aoFechar: () => void;
  aoSalvar: (foto: Blob) => Promise<void>;
}) {
  const id = useId();
  const dialogo = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const arraste = useRef<{ x: number; y: number; ax: number; ay: number } | null>(null);
  const [fonte, setFonte] = useState<Fonte | null>(null);
  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_INICIAIS);
  const [camera, setCamera] = useState<"user" | "environment">("user");
  const [cameraLigada, setCameraLigada] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pararCamera = useCallback(() => {
    fluxo.current?.getTracks().forEach((t) => t.stop());
    fluxo.current = null;
    setCameraLigada(false);
  }, []);

  // abre/fecha como modal (Esc fecha; foco preso na janela)
  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
    if (!aberto) {
      pararCamera();
      setFonte(null);
      setAjustes(AJUSTES_INICIAIS);
      setErro(null);
    }
  }, [aberto, pararCamera]);

  // imagem escolhida (ou a foto atual, para reeditar)
  useEffect(() => {
    if (!aberto || modo !== "editar" || !arquivo) return;
    let vivo = true;
    createImageBitmap(arquivo, { imageOrientation: "from-image" } as ImageBitmapOptions)
      .then((b) => { if (vivo) { setFonte({ img: b, w: b.width, h: b.height }); setAjustes(AJUSTES_INICIAIS); } })
      .catch(() => vivo && setErro("Não foi possível abrir esta imagem. Use JPG, PNG ou WebP."));
    return () => { vivo = false; };
  }, [aberto, modo, arquivo]);

  const ligarCamera = useCallback(async (lado: "user" | "environment") => {
    setErro(null);
    pararCamera();
    if (!navigator.mediaDevices?.getUserMedia) {
      setErro("Este navegador não dá acesso à câmera. Use \"Escolher imagem\".");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: lado, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      fluxo.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => undefined);
      }
      setCameraLigada(true);
    } catch (e) {
      const nome = (e as { name?: string }).name;
      setErro(nome === "NotAllowedError"
        ? "A câmera foi bloqueada. Libere o acesso à câmera nas permissões do navegador e tente de novo."
        : nome === "NotFoundError" ? "Nenhuma câmera encontrada neste aparelho." : "Não foi possível ligar a câmera.");
    }
  }, [pararCamera]);

  useEffect(() => {
    if (aberto && modo === "camera" && !fonte) void ligarCamera(camera);
    // a troca de câmera chama ligarCamera direto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, modo]);

  useEffect(() => () => pararCamera(), [pararCamera]);

  function capturar() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // a prévia da câmera frontal é espelhada (como um espelho); a foto sai sem espelho,
    // como os outros veem a pessoa — o botão "Espelhar" do editor inverte, se preferir
    ctx.drawImage(v, 0, 0);
    pararCamera();
    setFonte({ img: c, w: c.width, h: c.height });
    setAjustes(AJUSTES_INICIAIS);
  }

  // redesenha a prévia a cada ajuste
  useEffect(() => {
    const c = tela.current;
    if (!c || !fonte) return;
    const ctx = c.getContext("2d");
    if (ctx) desenhar(ctx, fonte.img, fonte.w, fonte.h, ajustes, QUADRO);
  }, [fonte, ajustes]);

  function mudar(p: Partial<Ajustes>) {
    if (!fonte) return;
    setAjustes((a) => limitarPosicao({ ...a, ...p }, fonte.w, fonte.h, QUADRO));
  }

  function escalaTela(): number {
    const c = tela.current;
    return c ? QUADRO / c.getBoundingClientRect().width : 1;
  }

  function aoApertar(e: React.PointerEvent<HTMLCanvasElement>) {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    arraste.current = { x: e.clientX, y: e.clientY, ax: ajustes.x, ay: ajustes.y };
  }
  function aoMover(e: React.PointerEvent<HTMLCanvasElement>) {
    const a = arraste.current;
    if (!a) return;
    const k = escalaTela();
    mudar({ x: a.ax + (e.clientX - a.x) * k, y: a.ay + (e.clientY - a.y) * k });
  }
  function teclas(e: React.KeyboardEvent<HTMLCanvasElement>) {
    const passo = e.shiftKey ? 40 : 10;
    const mapa: Record<string, Partial<Ajustes>> = {
      ArrowLeft: { x: ajustes.x - passo }, ArrowRight: { x: ajustes.x + passo },
      ArrowUp: { y: ajustes.y - passo }, ArrowDown: { y: ajustes.y + passo },
      "+": { zoom: Math.min(ZOOM_MAX, ajustes.zoom + 0.1) }, "-": { zoom: Math.max(1, ajustes.zoom - 0.1) },
    };
    const p = mapa[e.key];
    if (p) { e.preventDefault(); mudar(p); }
  }
  function roda(e: React.WheelEvent<HTMLCanvasElement>) {
    mudar({ zoom: Math.max(1, Math.min(ZOOM_MAX, ajustes.zoom - e.deltaY * 0.002)) });
  }

  async function salvar() {
    const c = tela.current;
    if (!c || !fonte) return;
    setSalvando(true);
    setErro(null);
    try {
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.9));
      if (!blob) throw new Error("Não foi possível gerar a foto.");
      await aoSalvar(blob);
      aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a foto.");
    } finally {
      setSalvando(false);
    }
  }

  const deslizador = (rotulo: string, chave: "brilho" | "contraste" | "saturacao", min: number, max: number) => (
    <div>
      <div className="flex items-center justify-between text-xs">
        <label htmlFor={`${id}-${chave}`} className="font-medium text-ink">{rotulo}</label>
        <span className="text-data text-ink-muted">{ajustes[chave] > 0 ? "+" : ""}{ajustes[chave]}</span>
      </div>
      <input id={`${id}-${chave}`} type="range" min={min} max={max} step={1} value={ajustes[chave]}
        onChange={(e) => mudar({ [chave]: Number(e.target.value) })} className="mt-1 w-full accent-[var(--accent)]" />
    </div>
  );

  const botaoIcone = "inline-flex h-9 w-9 toque:h-11 toque:w-11 items-center justify-center rounded-lg text-ink-muted ring-1 ring-inset ring-ink/15 transition-colors hover:bg-canvas-overlay hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

  return (
    <dialog ref={dialogo} onClose={aoFechar} aria-labelledby={`${id}-t`}
      className="w-[min(56rem,calc(100vw-2rem))] max-w-none rounded-2xl bg-canvas-raised p-0 text-ink shadow-2xl ring-1 ring-ink/15 backdrop:bg-black/70"
      data-testid="editor-foto">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 id={`${id}-t`} className="font-display text-lg font-semibold">{fonte ? `Editar ${titulo.toLowerCase()}` : titulo}</h2>
        <button type="button" className={botaoIcone} onClick={aoFechar} aria-label="Fechar"><X className="h-4 w-4" aria-hidden /></button>
      </div>

      <div className="max-h-[calc(100dvh-8rem)] overflow-y-auto p-5">
        {!fonte ? (
          // câmera
          <div className="mx-auto max-w-md">
            <div className="relative aspect-square overflow-hidden rounded-xl bg-black">
              <video ref={video} playsInline muted className={cn("h-full w-full object-cover", camera === "user" && "-scale-x-100")} aria-label="Imagem da câmera" />
              <div className="pointer-events-none absolute inset-[8%] rounded-full ring-2 ring-white/70" aria-hidden />
              {!cameraLigada && !erro ? <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Ligando a câmera…</p> : null}
            </div>
            <p className="mt-2 text-center text-xs text-ink-muted">Centralize o rosto no círculo. Nada é gravado até você tirar a foto.</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <Button type="button" onClick={capturar} disabled={!cameraLigada} data-testid="editor-foto-capturar">
                <Camera className="h-4 w-4" aria-hidden /> Tirar foto
              </Button>
              <Button type="button" variant="secondary" disabled={!cameraLigada}
                onClick={() => { const lado = camera === "user" ? "environment" : "user"; setCamera(lado); void ligarCamera(lado); }}>
                <SwitchCamera className="h-4 w-4" aria-hidden /> Trocar câmera
              </Button>
            </div>
          </div>
        ) : (
          // editor
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
            <div>
              <div className="relative mx-auto aspect-square w-full max-w-[26rem] overflow-hidden rounded-xl bg-white">
                <canvas ref={tela} width={QUADRO} height={QUADRO} tabIndex={0}
                  className="h-full w-full cursor-grab touch-none active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                  onPointerDown={aoApertar} onPointerMove={aoMover} onPointerUp={() => { arraste.current = null; }} onPointerCancel={() => { arraste.current = null; }}
                  onKeyDown={teclas} onWheel={roda}
                  role="img" aria-label="Prévia da foto. Arraste ou use as setas para enquadrar; + e − para zoom." data-testid="editor-foto-tela" />
                {/* guia redonda: é como a foto aparece no avatar */}
                <div className="pointer-events-none absolute inset-0 rounded-full ring-[1.5px] ring-white/80 [box-shadow:0_0_0_9999px_rgba(7,11,20,0.35)]" aria-hidden />
              </div>
              <p className="mt-2 text-center text-xs text-ink-muted">Arraste para enquadrar. O círculo mostra como aparece no avatar.</p>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor={`${id}-zoom`} className="font-medium text-ink">Zoom</label>
                  <span className="text-data text-ink-muted">{ajustes.zoom.toFixed(1).replace(".", ",")}×</span>
                </div>
                <input id={`${id}-zoom`} type="range" min={1} max={ZOOM_MAX} step={0.05} value={ajustes.zoom}
                  onChange={(e) => mudar({ zoom: Number(e.target.value) })} className="mt-1 w-full accent-[var(--accent)]" data-testid="editor-foto-zoom" />
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Girar e espelhar">
                <button type="button" className={botaoIcone} title="Girar à esquerda" aria-label="Girar à esquerda"
                  onClick={() => mudar({ giro: ((ajustes.giro + 270) % 360) as Ajustes["giro"] })}><RotateCcw className="h-4 w-4" aria-hidden /></button>
                <button type="button" className={botaoIcone} title="Girar à direita" aria-label="Girar à direita"
                  onClick={() => mudar({ giro: ((ajustes.giro + 90) % 360) as Ajustes["giro"] })} data-testid="editor-foto-girar"><RotateCw className="h-4 w-4" aria-hidden /></button>
                <button type="button" className={cn(botaoIcone, ajustes.espelho && "bg-accent/15 text-ink")} title="Espelhar" aria-label="Espelhar"
                  aria-pressed={ajustes.espelho} onClick={() => mudar({ espelho: !ajustes.espelho })}><FlipHorizontal2 className="h-4 w-4" aria-hidden /></button>
                <button type="button" className={botaoIcone} title="Desfazer ajustes" aria-label="Desfazer ajustes"
                  onClick={() => setAjustes(AJUSTES_INICIAIS)}><Undo2 className="h-4 w-4" aria-hidden /></button>
              </div>
              {deslizador("Brilho", "brilho", -50, 50)}
              {deslizador("Contraste", "contraste", -50, 50)}
              {deslizador("Saturação", "saturacao", -100, 100)}
              <fieldset>
                <legend className="text-xs font-medium text-ink">Estilo</legend>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {ESTILOS.map((s) => (
                    <button key={s.id} type="button" aria-pressed={ajustes.estilo === s.id} onClick={() => mudar({ estilo: s.id })}
                      className={cn("rounded-full px-3 py-1 text-xs ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        ajustes.estilo === s.id ? "bg-accent text-canvas ring-accent" : "text-ink-muted ring-ink/15 hover:text-ink")}
                      data-testid={`editor-foto-estilo-${s.id}`}>
                      {s.rotulo}
                    </button>
                  ))}
                </div>
              </fieldset>
              {modo === "camera" ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => { setFonte(null); void ligarCamera(camera); }}>
                  <Camera className="h-4 w-4" aria-hidden /> Tirar outra
                </Button>
              ) : null}
            </div>
          </div>
        )}
        {erro ? <p className="mt-4 text-center text-sm text-signal-err" role="alert">{erro}</p> : null}
      </div>

      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button type="button" variant="ghost" onClick={aoFechar}>Cancelar</Button>
        <Button type="button" onClick={() => void salvar()} disabled={!fonte || salvando} data-testid="editor-foto-salvar">
          {salvando ? "Salvando…" : "Salvar foto"}
        </Button>
      </div>
    </dialog>
  );
}
