import { describe, expect, it } from "vitest";

import {
  CHAVE_CALIBRACAO,
  apagarCalibracao,
  avisosDaCalibracao,
  carregarCalibracao,
  criarCalibracao,
  guardarCalibracao,
  medirReferencia,
  paraSpl,
} from "@/lib/voz-clinica-calibracao";

function memoria() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

const DT = 1 / 60;
const vogal = (db: number, s: number, ondula = 0) => Array.from({ length: Math.round(s / DT) }, (_, i) => db + ondula * Math.sin(i / 5));

describe("calibração dBFS → dB SPL", () => {
  it("mede a vogal estável pela média de energia, sem o ataque", () => {
    const leituras = [...vogal(-10, 0.5), ...vogal(-30, 3, 1)];
    const r = medirReferencia(leituras, DT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dbfs).toBeCloseTo(-29.75, 0);
      expect(r.variacao_db).toBeLessThan(2.5);
      expect(r.duracao_s).toBeCloseTo(3, 0);
    }
  });

  it("recusa pouco som, voz instável e saturação", () => {
    const curto = medirReferencia(vogal(-30, 1.5), DT);
    expect(curto.ok).toBe(false);
    const instavel = medirReferencia([...vogal(-30, 2), ...vogal(-45, 2)], DT);
    expect(!instavel.ok && instavel.erro).toMatch(/instável/);
    const saturado = medirReferencia(vogal(-0.5, 3), DT);
    expect(!saturado.ok && saturado.erro).toMatch(/saturou/);
    // silêncio não conta como som
    expect(medirReferencia(vogal(-80, 5), DT).ok).toBe(false);
  });

  it("converte com o deslocamento e guarda no navegador", () => {
    const c = criarCalibracao(-29.8, 75, "C", 30, "USB Mic", new Date("2026-10-30T12:00:00Z"));
    expect(c.deslocamento_db).toBe(104.8);
    expect(paraSpl(-40, c)).toBe(64.8);
    const g = memoria();
    expect(guardarCalibracao(c, g)).toBe(true);
    expect(carregarCalibracao(g)).toEqual(c);
    apagarCalibracao(g);
    expect(carregarCalibracao(g)).toBeNull();
  });

  it("ignora calibração corrompida ou absurda e armazenamento bloqueado", () => {
    const g = memoria();
    g.m.set(CHAVE_CALIBRACAO, "{não é json");
    expect(carregarCalibracao(g)).toBeNull();
    g.m.set(CHAVE_CALIBRACAO, JSON.stringify({ ...criarCalibracao(-30, 75, "C", 30, "x"), deslocamento_db: 500 }));
    expect(carregarCalibracao(g)).toBeNull();
    const bloqueado = { getItem: () => { throw new Error("SecurityError"); } };
    expect(carregarCalibracao(bloqueado)).toBeNull();
    expect(carregarCalibracao(null)).toBeNull();
  });

  it("avisa calibração velha, microfone trocado e ponderação A", () => {
    const c = criarCalibracao(-30, 75, "A", 30, "USB Mic", new Date("2026-08-01T12:00:00Z"));
    const avisos = avisosDaCalibracao(c, "Microfone do notebook", new Date("2026-10-30T12:00:00Z"));
    expect(avisos).toHaveLength(3);
    expect(avisos[0]).toMatch(/90 dias/);
    expect(avisos[1]).toMatch(/microfone mudou/);
    expect(avisosDaCalibracao({ ...c, ponderacao: "C", data: "2026-10-29T12:00:00Z" }, "USB Mic", new Date("2026-10-30T12:00:00Z"))).toEqual([]);
  });
});
