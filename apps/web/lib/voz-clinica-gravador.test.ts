import { describe, expect, it } from "vitest";

import { GravadorClinico, abrirMicrofoneAoVivo } from "@/lib/voz-clinica-gravador";

/** Microfone e AudioContext falsos: contam o que ficou aberto. */
function ambiente(opcoes: { falhaContexto?: boolean; falhaWorklet?: boolean } = {}) {
  const estado = { trilhasParadas: 0, contextosFechados: 0 };
  const stream = { getTracks: () => [{ stop: () => void estado.trilhasParadas++ }] };
  // o Node 22 já tem um navigator global só de leitura
  Object.defineProperty(globalThis, "navigator", {
    value: { mediaDevices: { getUserMedia: async () => stream } },
    configurable: true,
    writable: true,
  });
  (globalThis as Record<string, unknown>).AudioContext = class {
    state = "running";
    constructor() {
      if (opcoes.falhaContexto) throw new Error("sem áudio");
    }
    async resume() {}
    async close() {
      estado.contextosFechados++;
    }
    createAnalyser() {
      return { fftSize: 0 };
    }
    createMediaStreamSource() {
      return { connect: () => undefined };
    }
    audioWorklet = {
      addModule: async () => {
        if (opcoes.falhaWorklet) throw new Error("sem worklet");
      },
    };
  };
  (globalThis as Record<string, unknown>).window = { isSecureContext: true };
  (globalThis as Record<string, unknown>).AudioWorkletNode = class {};
  (globalThis as Record<string, unknown>).URL = Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
  return estado;
}

describe("abrirMicrofoneAoVivo", () => {
  it("abre microfone e analisador", async () => {
    const e = ambiente();
    const m = await abrirMicrofoneAoVivo(() => true, 4096);
    expect(m?.analisador.fftSize).toBe(4096);
    expect(e.trilhasParadas).toBe(0);
  });
  it("a tela saiu enquanto pedia permissão: nada fica ligado", async () => {
    const e = ambiente();
    expect(await abrirMicrofoneAoVivo(() => false)).toBe(null);
    expect(e.trilhasParadas).toBe(1);
  });
  it("falha no meio: o microfone já aberto é desligado e o erro sobe", async () => {
    const e = ambiente({ falhaContexto: true });
    let erro: unknown = null;
    try {
      await abrirMicrofoneAoVivo(() => true);
    } catch (x) {
      erro = x;
    }
    expect(erro instanceof Error).toBe(true);
    expect(e.trilhasParadas).toBe(1);
  });
});

describe("GravadorClinico", () => {
  it("descartado enquanto pedia permissão: microfone e contexto ficam desligados", async () => {
    const e = ambiente();
    const g = new GravadorClinico({});
    const abrindo = g.iniciar();
    void g.descartar();
    let erro: unknown = null;
    try {
      await abrindo;
    } catch (x) {
      erro = x;
    }
    expect(erro instanceof DOMException && erro.name === "AbortError").toBe(true);
    expect(e.trilhasParadas).toBe(1);
    expect(g.gravando).toBe(false);
  });
  it("falha ao carregar o worklet: microfone desligado e contexto fechado", async () => {
    const e = ambiente({ falhaWorklet: true });
    const g = new GravadorClinico({});
    let erro: unknown = null;
    try {
      await g.iniciar();
    } catch (x) {
      erro = x;
    }
    expect((erro as Error).message).toBe("sem worklet");
    expect(e.trilhasParadas).toBe(1);
    expect(e.contextosFechados).toBe(1);
  });
});
