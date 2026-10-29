import { describe, expect, it } from "vitest";

import { codificarWav, juntarBlocos } from "@/lib/voz-clinica-wav";
import { avisosDeFiltros, avisosDeNivel } from "@/lib/voz-clinica-gravador";

describe("codificarWav", () => {
  it("gera cabeçalho WAV PCM 16 bits mono", () => {
    const buf = codificarWav(new Float32Array(100), 48000);
    const v = new DataView(buf);
    const txt = (p: number, n: number) => String.fromCharCode(...new Uint8Array(buf, p, n));
    expect(txt(0, 4)).toBe("RIFF");
    expect(txt(8, 4)).toBe("WAVE");
    expect(txt(36, 4)).toBe("data");
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(200);
    expect(v.getUint32(4, true)).toBe(buf.byteLength - 8);
  });

  it("converte e satura as amostras", () => {
    const buf = codificarWav(new Float32Array([0, 1, -1, 0.5, 2, -2, Number.NaN]), 8000);
    const v = new DataView(buf);
    const amostras = [0, 1, 2, 3, 4, 5, 6].map((i) => v.getInt16(44 + 2 * i, true));
    expect(amostras).toEqual([0, 32767, -32768, 16383, 32767, -32768, 0]);
  });

  it("rejeita entradas inválidas", () => {
    expect(() => codificarWav([0, 1] as unknown as Float32Array, 8000)).toThrow(TypeError);
    expect(() => codificarWav(new Float32Array(1), 0)).toThrow(RangeError);
  });
});

describe("juntarBlocos", () => {
  it("preserva a ordem", () => {
    const r = juntarBlocos([new Float32Array([1, 2]), new Float32Array([3]), new Float32Array([])]);
    expect(Array.from(r)).toEqual([1, 2, 3]);
  });
});

describe("avisos do gravador", () => {
  it("avisa quando o navegador mantém filtros ligados", () => {
    const avisos = avisosDeFiltros({ echoCancellation: true, noiseSuppression: false, autoGainControl: true });
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toContain("cancelamento de eco");
    expect(avisos[1]).toContain("ganho automático");
    expect(avisosDeFiltros({ echoCancellation: false })).toEqual([]);
  });

  it("avisa saturação e sinal baixo", () => {
    expect(avisosDeNivel(1)[0]).toContain("saturou");
    expect(avisosDeNivel(0.01)[0]).toContain("baixo");
    expect(avisosDeNivel(0.5)).toEqual([]);
  });
});
