/** Identidade de marca — fonte única para nome, slogan e assets. */
export const BRAND = {
  name: "VoiceCheck IA",
  shortName: "VoiceCheck",
  slogan: "Análise vocal inteligente",
  productLine: "Estúdio musical inteligente",
  /**
   * Lockup oficial v2 (mesmo arquivo em Home, Login, Header, Sidebar).
   * Recortado sem margem transparente. Proporção: 2064×459 (≈4,5:1).
   */
  /** PNG transparente (sem fundo preto) — Home/Login/Header */
  logoSrc: "/brand/voicecheck-lockup-v2.png",
  /** PNG original com fundo preto — impressão / tema claro */
  logoSrcDark: "/brand/voicecheck-lockup-v2-dark.png",
  /** Emblema isolado transparente */
  markSrc: "/brand/voicecheck-mark-v2.png",
  /** Ícone para iOS (180×180) */
  appleIconSrc: "/brand/apple-touch-icon.png",
  /** Dimensões intrínsecas do lockup (evita distorção no next/image) */
  logoWidth: 2064,
  logoHeight: 459,
} as const;
