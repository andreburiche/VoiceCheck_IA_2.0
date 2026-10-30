/** Identidade de marca — fonte única para nome, slogan e assets. */
export const BRAND = {
  name: "VoiceCheck IA",
  shortName: "VoiceCheck",
  slogan: "Análise vocal inteligente",
  productLine: "Estúdio musical inteligente",
  /**
   * Lockup oficial v3 (mesmo arquivo em Home, Login, Header, Sidebar).
   * Recortado sem margem transparente. Proporção: 2000×420 (≈4,8:1).
   */
  /** PNG transparente (sem fundo preto) — Home/Login/Header */
  logoSrc: "/brand/voicecheck-lockup-v3.png",
  /** PNG com o fundo escuro da aplicação — impressão / tema claro */
  logoSrcDark: "/brand/voicecheck-lockup-v3-dark.png",
  /** Emblema isolado transparente */
  markSrc: "/brand/voicecheck-mark-v3.png",
  /** Ícone para iOS (180×180) */
  appleIconSrc: "/brand/apple-touch-icon-v3.png",
  /** Dimensões intrínsecas do lockup (evita distorção no next/image) */
  logoWidth: 2000,
  logoHeight: 420,
} as const;
