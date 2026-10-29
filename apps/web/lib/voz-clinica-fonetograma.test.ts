import { describe, expect, it } from "vitest";

import { midiToHz } from "@/lib/pitch-math";
import { pontosDoCampo, registrar, resumirCampo, type MapaCampo } from "@/lib/voz-clinica-fonetograma";

/** Simula um glissando de `de` a `ate` (MIDI) a 60 leituras/s, com intensidade fixa. */
function glissando(mapa: MapaCampo, de: number, ate: number, db: number, porSemitom_s = 0.4) {
  const passo = 1 / 60;
  const total = Math.abs(ate - de) * porSemitom_s;
  for (let t = 0; t <= total; t += passo) {
    const midi = de + ((ate - de) * t) / total;
    registrar(mapa, midiToHz(midi), db, passo);
  }
}

describe("fonetograma", () => {
  it("monta o campo com mínimo e máximo por semitom", () => {
    const mapa: MapaCampo = new Map();
    glissando(mapa, 48, 67, -40); // C3 → G4, voz fraca
    glissando(mapa, 67, 48, -12); // de volta, voz forte
    const pontos = pontosDoCampo(mapa);
    const r = resumirCampo(pontos);
    expect(r.nota_grave).toBe("C3");
    expect(r.nota_aguda).toBe("G4");
    expect(r.extensao_st).toBe(19);
    expect(r.db_min).toBe(-40);
    expect(r.db_max).toBe(-12);
    expect(r.faixa_dinamica_media_db).toBe(28);
    expect(r.area_st_db).toBe(28 * r.semitons_alcancados);
  });

  it("passagens rápidas não contam como nota alcançada", () => {
    const mapa: MapaCampo = new Map();
    glissando(mapa, 50, 55, -20, 0.4);
    registrar(mapa, midiToHz(80), -20, 1 / 60); // um quadro isolado (erro de leitura)
    const r = resumirCampo(pontosDoCampo(mapa));
    expect(r.nota_aguda).toBe("G3");
  });

  it("pico no ataque não vira o máximo da nota", () => {
    const mapa: MapaCampo = new Map();
    registrar(mapa, 220, -3, 1 / 60); // ataque
    for (let i = 0; i < 30; i++) registrar(mapa, 220, -20, 1 / 60);
    const [p] = pontosDoCampo(mapa);
    expect(p!.max_db).toBe(-20); // o ataque (primeiros 50 ms) não conta…
    const mapa2: MapaCampo = new Map();
    for (let i = 0; i < 30; i++) registrar(mapa2, 220, -20, 1 / 60);
    registrar(mapa2, 220, -3, 1 / 60); // …mas um pico depois do início conta
    expect(pontosDoCampo(mapa2)[0]!.max_db).toBe(-3);
  });

  it("ignora leituras inválidas e fora da faixa", () => {
    const mapa: MapaCampo = new Map();
    registrar(mapa, 0, -20, 0.1);
    registrar(mapa, 20, -20, 0.1); // abaixo de C1
    registrar(mapa, 5000, -20, 0.1); // acima de C8
    registrar(mapa, 220, Number.NaN, 0.1);
    expect(mapa.size).toBe(0);
    expect(resumirCampo([]).extensao_st).toBe(0);
  });
});
