import type { StemChannelConfig } from "@/lib/audio-engine";

export type PracticeProfileId =
  | "singer"
  | "drums"
  | "bass"
  | "guitar"
  | "acoustic"
  | "keys"
  | "general";

export type PracticeProfile = {
  id: PracticeProfileId;
  label: string;
  /** Instrução contextual na Sala de Treino */
  instruction: string;
  description: string;
  /** Stem Demucs silenciado para o músico tocar a parte */
  mute: string[];
  /**
   * true quando o instrumento tem stem dedicado (vocals/drums/bass).
   * Guitarra/violão/teclado usam "other" — limitação informada, sem simular stem.
   */
  isolated: boolean;
  limitation?: string;
};

export const PRACTICE_PROFILES: PracticeProfile[] = [
  {
    id: "singer",
    label: "Voz",
    description: "Mute da faixa de voz",
    instruction:
      "A voz fica silenciosa. Cante por cima da base e use o loop A–B nos trechos difíceis.",
    mute: ["vocals"],
    isolated: true,
  },
  {
    id: "drums",
    label: "Bateria",
    description: "Mute da bateria",
    instruction:
      "A bateria fica silenciosa. Toque no metrônomo e reduza a velocidade se precisar.",
    mute: ["drums"],
    isolated: true,
  },
  {
    id: "bass",
    label: "Baixo",
    description: "Mute do baixo",
    instruction: "O baixo fica silencioso. Pratique encaixes e notas com a base restante.",
    mute: ["bass"],
    isolated: true,
  },
  {
    id: "guitar",
    label: "Guitarra",
    description: "Mute de other (proxy)",
    instruction:
      "Silenciamos a trilha “other”, onde costuma ficar a guitarra no Demucs 4 stems.",
    mute: ["other"],
    isolated: false,
    limitation:
      "Não há stem dedicado de guitarra neste modelo (4 fontes). “Other” pode misturar guitarra, teclas e outros.",
  },
  {
    id: "acoustic",
    label: "Violão",
    description: "Mute de other (proxy)",
    instruction:
      "Mesmo proxy de “other” do Demucs 4 stems — útil para estudar, sem isolamento perfeito.",
    mute: ["other"],
    isolated: false,
    limitation:
      "Violão não é separado pelo modelo instalado. Usamos “other” como aproximação; não simula stem de violão.",
  },
  {
    id: "keys",
    label: "Teclado",
    description: "Mute de other (proxy)",
    instruction: "Silenciamos “other” para você tocar harmonia/teclas sobre a base.",
    mute: ["other"],
    isolated: false,
    limitation:
      "Teclado/piano não têm stem próprio no Demucs 4 stems. O mute de “other” é aproximação.",
  },
  {
    id: "general",
    label: "Geral",
    description: "Todos audíveis",
    instruction:
      "Todas as trilhas tocam. Use Mute manual no estúdio se quiser mixes livres, ou escolha um instrumento acima.",
    mute: [],
    isolated: true,
  },
];

export function getPracticeProfile(id: PracticeProfileId): PracticeProfile {
  return PRACTICE_PROFILES.find((p) => p.id === id) ?? PRACTICE_PROFILES[PRACTICE_PROFILES.length - 1]!;
}

export function mixForProfile(profileId: PracticeProfileId): Record<string, StemChannelConfig> {
  const profile = getPracticeProfile(profileId);
  const stems = ["vocals", "drums", "bass", "other"];
  const out: Record<string, StemChannelConfig> = {};
  for (const s of stems) {
    out[s] = {
      volume: 1,
      mute: profile.mute.includes(s),
      solo: false,
      pan: 0,
    };
  }
  return out;
}

/** Stem principal silenciado pelo perfil (para o botão “Silenciar meu instrumento”). */
export function mutedStemForProfile(profileId: PracticeProfileId): string | null {
  const profile = getPracticeProfile(profileId);
  return profile.mute[0] ?? null;
}
