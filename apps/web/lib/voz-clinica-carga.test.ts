import { describe, expect, it } from "vitest";

import type { AmostraSessao } from "@/lib/voz-clinica-biofeedback";
import { alvoDaHabitual, resumirCarga } from "@/lib/voz-clinica-carga";

/** n segundos de amostras a cada 100 ms; f(t) devolve [hz|null, db]. */
function sessao(n: number, f: (t: number) => [number | null, number]): AmostraSessao[] {
  return Array.from({ length: n * 10 + 1 }, (_, i) => {
    const t = i / 10;
    const [hz, db] = f(t);
    return { t, hz, db };
  });
}

describe("resumirCarga", () => {
  it("F0 sobe e intensidade cai ao longo de 5 minutos", () => {
    // F0 de 200 a ~224 Hz (≈ +2 st), intensidade de -18 a -24 dBFS, pausa de 1 s a cada 10 s
    const a = sessao(300, (t) => [t % 10 < 1 ? null : 200 * 2 ** ((2 * t) / 300 / 12), -18 - (6 * t) / 300]);
    const r = resumirCarga(a, { min: -22, max: -14 }, 300);
    expect(r.duracao_s).toBe(300);
    expect(r.fonacao_s).toBeLessThanOrEqual(271);
    expect(r.variacao_f0_st! > 1.5 && r.variacao_f0_st! < 2).toBe(true);
    expect(r.variacao_db! < -4.5 && r.variacao_db! > -5.5).toBe(true);
    expect(r.minutos.length).toBe(5);
    expect(r.minutos[0]!.fonacao_pct).toBe(90);
    // dentro do alvo enquanto a intensidade ficou acima de -22 (≈ 2/3 da sessão)
    expect(Math.round(r.dentro_alvo_pct!)).toBe(67);
  });

  it("sessão curta não compara início e fim", () => {
    const r = resumirCarga(sessao(20, () => [180, -20]), { min: -24, max: -16 }, 300);
    expect(r.variacao_f0_st).toBeNull();
    expect(r.f0_inicio_hz).toBe(180);
  });

  it("sem voz", () => {
    const r = resumirCarga(sessao(10, () => [null, -60]), { min: -24, max: -16 }, 60);
    expect(r.dentro_alvo_pct).toBeNull();
    expect(r.fonacao_s).toBe(0);
  });
});

describe("alvoDaHabitual", () => {
  it("habitual + 6 a + 14 dB, sem passar de 0 dBFS", () => {
    expect(alvoDaHabitual(-30)).toEqual({ min: -24, max: -16 });
    expect(alvoDaHabitual(-8)).toEqual({ min: -2, max: 0 });
  });
});
