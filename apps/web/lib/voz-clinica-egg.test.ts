import { describe, expect, it } from "vitest";

import { analisarEgg } from "@/lib/voz-clinica-egg";

const TAXA = 20000;

/**
 * EGG sintético: por ciclo, um pulso trapezoidal de contato (sobe em `r` amostras, platô `p`,
 * desce em `r`), resto em zero. Largura no nível k: p + 2·(1 − k)·r.
 */
function eggTrapezio(f0: number, plato: number, rampa: number, dur = 1, inverter = false): Float32Array {
  const T = Math.round(TAXA / f0);
  const ciclo = new Float32Array(T);
  for (let i = 0; i < rampa; i++) ciclo[i] = i / rampa;
  for (let i = rampa; i < rampa + plato; i++) ciclo[i] = 1;
  for (let i = 0; i < rampa; i++) ciclo[rampa + plato + i] = 1 - i / rampa;
  const x = new Float32Array(Math.round(TAXA * dur));
  for (let i = 0; i < x.length; i++) x[i] = (inverter ? -1 : 1) * (ciclo[i % T]! - 0.3) + 0.5 * Math.sin((2 * Math.PI * 2 * i) / TAXA); // + deriva lenta de 2 Hz
  return x;
}

describe("eletroglotografia", () => {
  it("CQ pelo nível-critério igual ao do trapézio (200 Hz, T = 100 amostras)", () => {
    const plato = 30, rampa = 10; // nível 35 %: 30 + 2·0,65·10 = 43 amostras → CQ 43 %
    const r = analisarEgg(eggTrapezio(200, plato, rampa), TAXA, { limiar: 0.35 })!;
    expect(r.f0_media_hz).toBeCloseTo(200, 0);
    expect(Math.abs(r.cq_media_pct - 43) <= 2).toBe(true);
    expect(r.cq_dp_pct < 2).toBe(true);
    const r25 = analisarEgg(eggTrapezio(200, plato, rampa), TAXA, { limiar: 0.25 })!; // 30 + 15 = 45 %
    expect(Math.abs(r25.cq_media_pct - 45) <= 2).toBe(true);
  });

  it("polaridade invertida: com a opção, o mesmo CQ", () => {
    const r = analisarEgg(eggTrapezio(150, 40, 12, 1, true), TAXA, { limiar: 0.35, inverter: true })!;
    const T = Math.round(TAXA / 150);
    expect(Math.abs(r.cq_media_pct - (100 * (40 + 2 * 0.65 * 12)) / T) <= 2).toBe(true);
  });

  it("sem sinal ou curto demais devolve null", () => {
    expect(analisarEgg(new Float32Array(TAXA), TAXA)).toBeNull();
    expect(analisarEgg(eggTrapezio(200, 30, 10, 0.1), TAXA)).toBeNull();
  });
});
