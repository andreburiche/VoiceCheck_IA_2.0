import { describe, expect, it } from "vitest";

import { abrirMicrofoneAoVivo } from "@/lib/voz-clinica-gravador";

/** Microfone e AudioContext falsos: contam o que ficou aberto. */
function ambiente(opcoes: { falhaContexto?: boolean } = {}) {
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
  };
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
