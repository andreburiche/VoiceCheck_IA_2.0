/**
 * VoiceCheck IA 2.0 — fonetograma (campo vocal / voice range profile).
 *
 * Para cada semitom alcançado, guarda a menor e a maior intensidade
 * sustentadas. Intensidade em dBFS (relativa): sem microfone calibrado não há
 * dB SPL, então a forma do campo e a extensão em semitons são comparáveis entre
 * sessões do mesmo equipamento, mas os dB não são comparáveis com normas.
 */
import { hzToMidiFloat, midiToHz, midiToNoteName } from "@/lib/pitch-math";

/** Uma célula por semitom (número MIDI). */
export type Celula = { min_db: number; max_db: number; tempo_s: number };
export type MapaCampo = Map<number, Celula>;

/** Tempo mínimo em um semitom para ele contar (descarta passagens rápidas). */
export const TEMPO_MINIMO_S = 0.15;
/** Faixa aceita: C1 (32,7 Hz) a C8 (4186 Hz). */
const MIDI_MIN = 24;
const MIDI_MAX = 108;

/**
 * Registra uma leitura. A intensidade só é aceita depois que o semitom já tem
 * algum tempo acumulado: picos de ataque não viram o "máximo" da nota.
 */
export function registrar(mapa: MapaCampo, hz: number, db: number, dt: number): void {
  if (!(hz > 0) || !Number.isFinite(db) || dt <= 0) return;
  const midi = Math.round(hzToMidiFloat(hz));
  if (midi < MIDI_MIN || midi > MIDI_MAX) return;
  let c = mapa.get(midi);
  if (!c) {
    // começa vazia: a intensidade só passa a contar após 50 ms na nota
    c = { min_db: Infinity, max_db: -Infinity, tempo_s: 0 };
    mapa.set(midi, c);
  }
  c.tempo_s += dt;
  if (c.tempo_s > 0.05) {
    c.min_db = Math.min(c.min_db, db);
    c.max_db = Math.max(c.max_db, db);
  }
}

export type PontoCampo = { midi: number; nota: string; hz: number; min_db: number; max_db: number; tempo_s: number };

/** Semitons com tempo suficiente, do grave ao agudo. */
export function pontosDoCampo(mapa: MapaCampo, tempoMinimo = TEMPO_MINIMO_S): PontoCampo[] {
  return [...mapa.entries()]
    .filter(([, c]) => c.tempo_s >= tempoMinimo && Number.isFinite(c.min_db))
    .sort(([a], [b]) => a - b)
    .map(([midi, c]) => ({
      midi,
      nota: midiToNoteName(midi),
      hz: Math.round(midiToHz(midi) * 10) / 10,
      min_db: Math.round(c.min_db * 10) / 10,
      max_db: Math.round(c.max_db * 10) / 10,
      tempo_s: Math.round(c.tempo_s * 100) / 100,
    }));
}

export type ResumoCampo = {
  nota_grave: string | null;
  nota_aguda: string | null;
  hz_grave: number | null;
  hz_agudo: number | null;
  /** Do semitom mais grave ao mais agudo alcançado. */
  extensao_st: number;
  /** Semitons de fato alcançados (pode haver falhas no meio). */
  semitons_alcancados: number;
  db_min: number | null;
  db_max: number | null;
  /** Média, por semitom, de (máximo − mínimo). */
  faixa_dinamica_media_db: number | null;
  /** Soma de (máximo − mínimo) em todos os semitons: semitons × dB. */
  area_st_db: number;
};

export function resumirCampo(pontos: PontoCampo[]): ResumoCampo {
  if (!pontos.length) {
    return { nota_grave: null, nota_aguda: null, hz_grave: null, hz_agudo: null, extensao_st: 0, semitons_alcancados: 0,
             db_min: null, db_max: null, faixa_dinamica_media_db: null, area_st_db: 0 };
  }
  const grave = pontos[0]!;
  const agudo = pontos[pontos.length - 1]!;
  const faixas = pontos.map((p) => p.max_db - p.min_db);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    nota_grave: grave.nota,
    nota_aguda: agudo.nota,
    hz_grave: grave.hz,
    hz_agudo: agudo.hz,
    extensao_st: agudo.midi - grave.midi,
    semitons_alcancados: pontos.length,
    db_min: r1(Math.min(...pontos.map((p) => p.min_db))),
    db_max: r1(Math.max(...pontos.map((p) => p.max_db))),
    faixa_dinamica_media_db: r1(faixas.reduce((s, v) => s + v, 0) / faixas.length),
    area_st_db: r1(faixas.reduce((s, v) => s + v, 0)),
  };
}
