"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/errors";
import { enviarMidia } from "@/lib/voz-clinica-api";
import {
  FPS_PADRAO,
  VELOCIDADES,
  descricaoDoQuadro,
  estimarFps,
  nomeArquivoQuadro,
  numeroDoQuadro,
  tempoDoQuadro,
} from "@/lib/voz-clinica-video";

type VideoComQuadros = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (agora: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/**
 * Vídeo laríngeo com câmera lenta, quadro a quadro (botões ou ← →) e captura do quadro como
 * imagem do paciente — o que o módulo de vídeo do lingWAVES faz com o vídeo já gravado.
 */
export function RevisorVideo({ url, legenda, paciente, aoCapturar }: {
  url: string;
  legenda: string;
  paciente: string;
  aoCapturar: () => void;
}) {
  const id = useId();
  const video = useRef<VideoComQuadros>(null);
  const [velocidade, setVelocidade] = useState<number>(1);
  const [fps, setFps] = useState<number>(FPS_PADRAO);
  const [fpsEstimado, setFpsEstimado] = useState(false);
  const [tempo, setTempo] = useState(0);
  const [capturando, setCapturando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // quadros por segundo reais: medidos pelos quadros apresentados durante a reprodução
  useEffect(() => {
    const v = video.current;
    if (!v?.requestVideoFrameCallback) return;
    const tempos: number[] = [];
    let ident = 0;
    let ativo = true;
    const cb = (_: number, meta: { mediaTime: number }) => {
      if (!ativo) return;
      tempos.push(meta.mediaTime);
      if (tempos.length > 40) tempos.shift();
      const f = estimarFps(tempos);
      if (f) { setFps(f); setFpsEstimado(true); }
      ident = v.requestVideoFrameCallback!(cb);
    };
    ident = v.requestVideoFrameCallback(cb);
    return () => { ativo = false; v.cancelVideoFrameCallback?.(ident); };
  }, [url]);

  useEffect(() => {
    if (video.current) video.current.playbackRate = velocidade;
  }, [velocidade]);

  function andar(delta: number) {
    const v = video.current;
    if (!v) return;
    v.pause();
    v.currentTime = tempoDoQuadro(v.currentTime, fps, delta, v.duration);
  }

  // na fase de captura, antes do player nativo (que também anda com as setas e somaria um salto)
  function teclado(e: React.KeyboardEvent) {
    if (e.target !== video.current || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    e.stopPropagation();
    andar(e.key === "ArrowLeft" ? -1 : 1);
  }

  async function capturar() {
    const v = video.current;
    if (!v || !paciente || !v.videoWidth) return;
    setCapturando(true); setErro(null); setMsg(null);
    v.pause();
    try {
      const c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
      if (!blob) throw new Error("O navegador não conseguiu gerar a imagem do quadro.");
      const t = v.currentTime;
      await enviarMidia(paciente, new File([blob], nomeArquivoQuadro(t, fps), { type: "image/png" }), descricaoDoQuadro(t, fps, legenda));
      setMsg(`Quadro ${numeroDoQuadro(t, fps)} salvo nas mídias do paciente.`);
      aoCapturar();
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível salvar o quadro."));
    } finally {
      setCapturando(false);
    }
  }

  return (
    <div className="space-y-2" data-testid="vc2-revisor-video" onKeyDownCapture={teclado}>
      <video
        ref={video}
        src={url}
        controls
        className="aspect-video w-full bg-black"
        aria-label={`${legenda}. Setas esquerda e direita: quadro anterior e próximo.`}
        aria-describedby={`${id}-quadro`}
        onTimeUpdate={(e) => setTempo(e.currentTarget.currentTime)}
        onSeeked={(e) => setTempo(e.currentTarget.currentTime)}
        data-testid="vc2-midia-video"
      />
      <div className="flex flex-wrap items-center gap-2 px-3">
        <label className="text-xs text-ink-muted" htmlFor={`${id}-vel`}>Velocidade</label>
        <select id={`${id}-vel`} className="h-8 rounded-md border border-line bg-canvas-raised px-1 text-xs text-ink" value={velocidade}
          onChange={(e) => setVelocidade(Number(e.target.value))} data-testid="vc2-video-velocidade">
          {VELOCIDADES.map((v) => <option key={v} value={v}>{v === 1 ? "normal" : `${v.toLocaleString("pt-BR")}×`}</option>)}
        </select>
        <Button type="button" size="sm" variant="ghost" onClick={() => andar(-1)} aria-label="Quadro anterior" data-testid="vc2-video-anterior">◀ quadro</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => andar(1)} aria-label="Próximo quadro" data-testid="vc2-video-proximo">quadro ▶</Button>
        <span id={`${id}-quadro`} className="text-data text-xs text-ink-muted" aria-live="polite" data-testid="vc2-video-quadro">
          Quadro {numeroDoQuadro(tempo, fps)} · {fps} q/s{fpsEstimado ? "" : " (estimado ao reproduzir)"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3">
        <Button type="button" size="sm" variant="secondary" onClick={() => void capturar()} disabled={!paciente || capturando} data-testid="vc2-video-capturar">
          {capturando ? "Salvando…" : "Salvar este quadro como imagem"}
        </Button>
        {msg ? <span className="text-xs text-ink-muted" role="status">{msg}</span> : null}
        {erro ? <span className="text-xs text-signal-err" role="alert">{erro}</span> : null}
      </div>
    </div>
  );
}
