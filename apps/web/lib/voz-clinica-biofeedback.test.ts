import { describe, expect, it } from "vitest";

import {
  medianaDe3,
  nivelDbfs,
  pitchYin,
  posicaoNaFaixa,
  resumirSessao,
  rotuloNota,
  type AmostraSessao,
} from "@/lib/voz-clinica-biofeedback";

const TAXA = 48000;

/** Voz sintética: harmônicos decrescentes (o fundamental nem sempre é o mais forte). */
function vogal(hz: number, amp = 0.3, ms = 43, fundamental = 1): Float32Array {
  const n = Math.round((TAXA * ms) / 1000);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    let s = fundamental * Math.sin(2 * Math.PI * hz * t);
    for (let h = 2; h <= 8; h++) s += Math.sin(2 * Math.PI * hz * h * t) / h;
    x[i] = (amp * s) / 2;
  }
  return x;
}

function ruido(amp: number, n = 2048, semente = 7): Float32Array {
  let s = semente;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    x[i] = amp * ((s / 2147483648) * 2 - 1);
  }
  return x;
}

describe("pitchYin", () => {
  for (const hz of [82, 110, 196, 261.6, 440, 880]) {
    it(`acha ${hz} Hz com erro abaixo de 0,5%`, () => {
      const r = pitchYin(vogal(hz), TAXA, 60, 1000);
      expect(r !== null).toBe(true);
      expect(Math.abs(r!.hz - hz) / hz < 0.005).toBe(true);
      expect(r!.clareza > 0.8).toBe(true);
    });
  }

  it("não erra a oitava com fundamental fraco", () => {
    const r = pitchYin(vogal(150, 0.3, 43, 0.3), TAXA, 60, 1000);
    expect(Math.abs(r!.hz - 150) < 2).toBe(true);
  });

  it("silêncio e ruído não viram pitch", () => {
    expect(pitchYin(new Float32Array(2048), TAXA)).toBe(null);
    expect(pitchYin(ruido(0.3), TAXA)).toBe(null);
  });

  it("respeita a faixa pedida", () => {
    expect(pitchYin(vogal(500), TAXA, 60, 400)).toBe(null);
  });
});

describe("nivelDbfs", () => {
  it("seno de amplitude 1 ≈ −3 dBFS; 0,1 ≈ −23 dBFS", () => {
    const seno = (a: number) => Float32Array.from({ length: 4800 }, (_, i) => a * Math.sin((2 * Math.PI * 200 * i) / TAXA));
    expect(Math.abs(nivelDbfs(seno(1)) - -3.01) < 0.05).toBe(true);
    expect(Math.abs(nivelDbfs(seno(0.1)) - -23.01) < 0.05).toBe(true);
    expect(nivelDbfs(new Float32Array(10))).toBe(-120);
  });
});

describe("posição e rótulo", () => {
  it("classifica em relação à faixa (bordas contam como dentro)", () => {
    const f = { min: 180, max: 220 };
    expect(posicaoNaFaixa(170, f)).toBe("abaixo");
    expect(posicaoNaFaixa(180, f)).toBe("dentro");
    expect(posicaoNaFaixa(221, f)).toBe("acima");
  });
  it("nota", () => {
    expect(rotuloNota(440)).toBe("A4 · 440 Hz");
    expect(rotuloNota(220.4)).toBe("A3 · 220 Hz");
  });
});

describe("resumirSessao", () => {
  it("mede o tempo com voz dentro das faixas", () => {
    const a: AmostraSessao[] = [];
    // 2 s a 200 Hz (dentro), 1 s a 260 Hz (acima), 1 s de silêncio; leituras a cada 0,1 s
    for (let i = 0; i < 20; i++) a.push({ t: i * 0.1, hz: 200, db: -20 });
    for (let i = 20; i < 30; i++) a.push({ t: i * 0.1, hz: 260, db: -35 });
    for (let i = 30; i <= 40; i++) a.push({ t: i * 0.1, hz: null, db: -70 });
    const r = resumirSessao(a, { min: 180, max: 220 }, { min: -30, max: -10 });
    expect(r.duracao_s).toBe(4);
    expect(r.fonacao_s).toBe(3);
    expect(r.dentro_pitch_pct).toBe(66.7);
    expect(r.dentro_volume_pct).toBe(66.7);
    expect(r.f0_mediana_hz).toBe(200);
  });

  it("sem voz não inventa porcentagens", () => {
    const r = resumirSessao([{ t: 0, hz: null, db: -80 }, { t: 1, hz: null, db: -80 }], { min: 100, max: 200 }, { min: -30, max: -10 });
    expect(r.dentro_pitch_pct).toBe(null);
    expect(r.f0_mediana_hz).toBe(null);
  });

  it("uma pausa longa entre leituras não conta como fonação", () => {
    const r = resumirSessao([{ t: 0, hz: 200, db: -20 }, { t: 5, hz: 200, db: -20 }], { min: 100, max: 300 }, { min: -30, max: -10 });
    expect(r.fonacao_s).toBe(0.3); // teto de 0,25 s por leitura → 0,25 arredondado
  });
});

describe("medianaDe3", () => {
  it("remove um valor isolado", () => {
    expect(medianaDe3([200, 140, 200])).toBe(200);
    expect(medianaDe3([200, 200, 410])).toBe(200);
  });
  it("acompanha uma mudança real de nota", () => {
    expect(medianaDe3([200, 260, 260])).toBe(260);
  });
  it("sem 3 leituras válidas, usa a atual", () => {
    expect(medianaDe3([null, 200, 210])).toBe(210);
    expect(medianaDe3([210])).toBe(210);
    expect(medianaDe3([200, 200, null])).toBe(null);
  });
});
