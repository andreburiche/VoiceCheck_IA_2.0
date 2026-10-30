/**
 * VoiceCheck IA 2.0 — gravador da avaliação clínica.
 *
 * Diferente do gravador do Treino: pede o microfone SEM cancelamento de eco,
 * supressão de ruído e ganho automático, porque esses filtros alteram jitter,
 * shimmer e HNR. Captura o áudio cru por AudioWorklet e gera WAV 16 bits.
 */
import { codificarWav, juntarBlocos } from "@/lib/voz-clinica-wav";

export const RESTRICOES_CLINICAS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
};

/** Worklet carregado por Blob (mesmo padrão do live-voice-fx). */
const WORKLET_CAPTURA = `
class CapturaClinica extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bloco = new Float32Array(4096);
    this.pos = 0;
    this.port.onmessage = (e) => {
      if (e.data === "esvaziar") {
        this.port.postMessage(this.bloco.slice(0, this.pos));
        this.pos = 0;
      }
    };
  }
  process(entradas) {
    const canal = entradas[0] && entradas[0][0];
    if (!canal) return true;
    for (let i = 0; i < canal.length; i++) {
      this.bloco[this.pos++] = canal[i];
      if (this.pos === this.bloco.length) {
        this.port.postMessage(this.bloco.slice(0));
        this.pos = 0;
      }
    }
    return true;
  }
}
registerProcessor("captura-clinica", CapturaClinica);
`;

export type GravacaoClinica = {
  wav: Blob;
  duracao: number;
  taxa: number;
  avisos: string[];
};

export type OpcoesGravador = {
  aoNivel?: (pico: number) => void;
  aoLimite?: () => void;
  limiteSegundos?: number;
};

const NOMES_FILTROS: Record<string, string> = {
  echoCancellation: "cancelamento de eco",
  noiseSuppression: "supressão de ruído",
  autoGainControl: "ganho automático",
};

/** Avisa se o navegador manteve algum filtro ligado apesar do pedido. */
export function avisosDeFiltros(config: MediaTrackSettings | Record<string, unknown>): string[] {
  const cfg = config as Record<string, unknown>;
  return Object.entries(NOMES_FILTROS)
    .filter(([chave]) => cfg[chave] === true)
    .map(([, nome]) => `O navegador manteve o ${nome} ligado; as medidas podem sair alteradas.`);
}

/** Avisos de nível depois de gravar. */
export function avisosDeNivel(pico: number): string[] {
  if (pico >= 0.99) return ["A gravação saturou: afaste o microfone ou peça uma voz mais suave e grave de novo."];
  if (pico < 0.02) return ["O sinal ficou muito baixo: aproxime o microfone."];
  return [];
}

export function gravadorSuportado(): boolean {
  return (
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof AudioContext !== "undefined" &&
    typeof AudioWorkletNode !== "undefined"
  );
}

export class GravadorClinico {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private fonte: MediaStreamAudioSourceNode | null = null;
  private no: AudioWorkletNode | null = null;
  private mudo: GainNode | null = null;
  private blocos: Float32Array[] = [];
  private pico = 0;
  private avisosConfig: string[] = [];
  /** descartar() chamado enquanto o microfone abria (tela fechada, troca de aba). */
  private cancelado = false;
  gravando = false;

  constructor(private readonly opcoes: OpcoesGravador = {}) {}

  async iniciar(): Promise<void> {
    if (this.gravando) return;
    if (!gravadorSuportado()) {
      throw new Error("Este navegador não grava áudio. Use Chrome, Edge, Firefox ou Safari atualizados.");
    }
    if (!window.isSecureContext) {
      throw new Error("O microfone só funciona em https:// ou em http://localhost.");
    }
    // nada pode ficar ligado se a abertura falhar ou se a tela sair no meio (descartar)
    const abortar = async (erro?: unknown): Promise<never> => {
      this.stream?.getTracks().forEach((t) => t.stop());
      await this.ctx?.close().catch(() => undefined);
      this.stream = null;
      this.ctx = null;
      throw erro ?? new DOMException("Gravação cancelada.", "AbortError");
    };
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: RESTRICOES_CLINICAS, video: false });
    if (this.cancelado) return abortar();
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      this.ctx = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const url = URL.createObjectURL(new Blob([WORKLET_CAPTURA], { type: "application/javascript" }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      return abortar(e);
    }
    if (this.cancelado) return abortar();

    this.blocos = [];
    this.pico = 0;
    this.fonte = ctx.createMediaStreamSource(this.stream);
    this.no = new AudioWorkletNode(ctx, "captura-clinica");
    this.mudo = ctx.createGain();
    this.mudo.gain.value = 0; // o nó precisa chegar à saída para processar
    this.fonte.connect(this.no).connect(this.mudo).connect(ctx.destination);

    const limite = this.opcoes.limiteSegundos ?? 30;
    this.no.port.onmessage = (e: MessageEvent<Float32Array>) => this.receber(e.data, limite);
    this.avisosConfig = avisosDeFiltros(this.stream.getAudioTracks()[0]?.getSettings() ?? {});
    this.gravando = true;
  }

  private receber(bloco: Float32Array, limite: number) {
    this.blocos.push(bloco);
    let pico = 0;
    for (let i = 0; i < bloco.length; i++) pico = Math.max(pico, Math.abs(bloco[i] ?? 0));
    this.pico = Math.max(this.pico, pico);
    this.opcoes.aoNivel?.(pico);
    if (this.gravando && this.duracao() >= limite) this.opcoes.aoLimite?.();
  }

  duracao(): number {
    if (!this.ctx) return 0;
    return this.blocos.reduce((s, b) => s + b.length, 0) / this.ctx.sampleRate;
  }

  async parar(): Promise<GravacaoClinica> {
    if (!this.gravando || !this.ctx || !this.no) throw new Error("Nada está sendo gravado.");
    this.gravando = false;
    const no = this.no;

    // recolhe o pedaço que ainda estava no worklet
    await new Promise<void>((resolve) => {
      const anterior = no.port.onmessage;
      const prazo = window.setTimeout(resolve, 250);
      no.port.onmessage = (e: MessageEvent<Float32Array>) => {
        anterior?.call(no.port, e);
        window.clearTimeout(prazo);
        resolve();
      };
      no.port.postMessage("esvaziar");
    });

    this.fonte?.disconnect();
    no.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    const taxa = this.ctx.sampleRate;
    await this.ctx.close().catch(() => undefined);

    const amostras = juntarBlocos(this.blocos);
    return {
      wav: new Blob([codificarWav(amostras, taxa)], { type: "audio/wav" }),
      duracao: amostras.length / taxa,
      taxa,
      avisos: [...this.avisosConfig, ...avisosDeNivel(this.pico)],
    };
  }

  /** Cancela sem gerar arquivo (ex.: ao sair da página). */
  async descartar(): Promise<void> {
    this.cancelado = true;
    this.gravando = false;
    this.fonte?.disconnect();
    this.no?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => undefined);
  }
}

export type MicrofoneAoVivo = { ctx: AudioContext; stream: MediaStream; analisador: AnalyserNode };

/**
 * Abre o microfone sem filtros com um analisador (biofeedback, jogos, fonetograma, prática).
 * `ainda()` diz se a tela continua aberta: se ela saiu enquanto o navegador pedia
 * permissão, ou se algo falhar no meio, nada fica ligado e volta `null` (ou o erro sobe).
 */
export async function abrirMicrofoneAoVivo(ainda: () => boolean, fftSize = 2048): Promise<MicrofoneAoVivo | null> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: RESTRICOES_CLINICAS, video: false });
  let ctx: AudioContext | null = null;
  try {
    if (ainda()) {
      ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
    }
    if (!ctx || !ainda()) {
      stream.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => undefined);
      return null;
    }
    const analisador = ctx.createAnalyser();
    analisador.fftSize = fftSize;
    ctx.createMediaStreamSource(stream).connect(analisador);
    return { ctx, stream, analisador };
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    void ctx?.close().catch(() => undefined);
    throw e;
  }
}
