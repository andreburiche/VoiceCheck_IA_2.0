import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  // tema claro/escuro por html[data-theme] (lib/tema.ts); "claro:" para ajustes pontuais
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      maxWidth: {
        content: "80rem", // 1280px
        app: "110rem", // 1760px — páginas internas usam a largura disponível
      },
      /**
       * Cores do tema: variáveis CSS em canais RGB (app/globals.css), com valores para o tema
       * escuro (padrão) e o claro (html[data-theme="light"]). O "/<alpha-value>" mantém as
       * opacidades do Tailwind (bg-accent/15, ring-ink/10...).
       */
      colors: {
        canvas: {
          DEFAULT: "rgb(var(--c-canvas) / <alpha-value>)",
          raised: "rgb(var(--c-canvas-raised) / <alpha-value>)",
          overlay: "rgb(var(--c-canvas-overlay) / <alpha-value>)",
          card: "rgb(var(--c-canvas-card) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--c-ink) / <alpha-value>)",
          muted: "rgb(var(--c-ink-muted) / <alpha-value>)",
          faint: "rgb(var(--c-ink-faint) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--c-accent) / <alpha-value>)",
          soft: "rgb(var(--c-accent-soft) / <alpha-value>)",
          deep: "rgb(var(--c-accent-deep) / <alpha-value>)",
        },
        brand: {
          blue: "rgb(var(--c-brand-blue) / <alpha-value>)",
        },
        /** Laranja neon: só para "ao vivo", picos, destaques e alertas. Ações seguem em accent. */
        flare: {
          DEFAULT: "rgb(var(--c-flare) / <alpha-value>)",
          soft: "rgb(var(--c-flare-soft) / <alpha-value>)",
          deep: "rgb(var(--c-flare-deep) / <alpha-value>)",
        },
        /** Legado: "violet" agora aponta para o Signal Blue (segunda cor de dados do DESIGN.md). */
        violet: {
          DEFAULT: "rgb(var(--c-brand-blue) / <alpha-value>)",
          soft: "rgb(var(--c-violet-soft) / <alpha-value>)",
          deep: "rgb(var(--c-violet-deep) / <alpha-value>)",
        },
        signal: {
          ok: "rgb(var(--c-accent) / <alpha-value>)",
          warn: "rgb(var(--c-warn) / <alpha-value>)",
          err: "rgb(var(--c-err) / <alpha-value>)",
          meter: "rgb(var(--c-accent) / <alpha-value>)",
        },
        stem: {
          vocals: "rgb(var(--c-accent) / <alpha-value>)",
          drums: "rgb(var(--c-brand-blue) / <alpha-value>)",
          bass: "#3DDB8A",
          other: "rgb(var(--c-ink-muted) / <alpha-value>)",
          guitar: "#F0A05A",
          keys: "rgb(var(--c-violet-soft) / <alpha-value>)",
        },
        line: "rgb(var(--c-line) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Manrope", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        "display-xl": ["3.75rem", { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-lg": ["3.25rem", { lineHeight: "1.08", letterSpacing: "-0.02em", fontWeight: "700" }],
        "title-lg": ["2.25rem", { lineHeight: "1.15", letterSpacing: "-0.015em", fontWeight: "650" }],
        "title-md": ["1.5rem", { lineHeight: "1.25", fontWeight: "600" }],
      },
      boxShadow: {
        /** Seleção: anel fino, sem halo (ver "No Glow Rule" no DESIGN.md). */
        glow: "0 0 0 1px rgb(var(--c-accent) / 0.25)",
        "glow-violet": "0 8px 24px -12px rgb(var(--c-sombra) / 0.6)",
        panel: "0 10px 32px rgb(var(--c-sombra) / 0.4)",
        "panel-lift": "0 16px 40px rgb(var(--c-sombra) / 0.5), 0 0 0 1px rgb(var(--c-accent) / 0.08)",
        "glow-flare": "0 0 18px rgba(255, 122, 26, 0.45)",
        hud: "0 24px 60px -24px rgb(var(--c-sombra) / 0.75)",
      },
      backgroundImage: {
        "hero-grain":
          "radial-gradient(ellipse 85% 65% at 72% 18%, rgba(38,139,255,0.18), transparent 55%), radial-gradient(ellipse 55% 45% at 12% 78%, rgba(32,217,210,0.14), transparent 50%), linear-gradient(155deg, rgb(var(--c-canvas-raised)) 0%, rgb(var(--c-canvas)) 52%, rgb(var(--c-canvas)) 100%)",
        "panel-sheen": "linear-gradient(145deg, rgb(var(--c-brilho) / 0.05), transparent 42%)",
        "wave-mesh":
          "radial-gradient(ellipse 70% 80% at 80% 40%, rgba(38,139,255,0.22), transparent 55%), radial-gradient(ellipse 50% 60% at 20% 70%, rgba(32,217,210,0.18), transparent 50%)",
        aurora:
          "conic-gradient(from 210deg at 50% 40%, rgba(32,217,210,0.14), transparent 28%, rgba(38,139,255,0.16), transparent 62%, rgba(32,217,210,0.1))",
        "cta-glow":
          "linear-gradient(135deg, rgba(32,217,210,0.18) 0%, rgba(38,139,255,0.12) 50%, rgba(32,217,210,0.08) 100%)",
      },
      transitionDuration: {
        ui: "200ms",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-meter": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        "wave-drift": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "soft-glow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.85" },
        },
        "orbit-spin": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "scan-line": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(200%)" },
        },
        "hero-drift": {
          "0%": { transform: "scale(1.04) translate3d(0, 0, 0)" },
          "100%": { transform: "scale(1.08) translate3d(-1%, -0.5%, 0)" },
        },
        "live-ping": {
          "0%": { transform: "scale(1)", opacity: "0.7" },
          "80%, 100%": { transform: "scale(2.4)", opacity: "0" },
        },
        "hud-sweep": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "draw-line": {
          from: { strokeDashoffset: "var(--len, 1000)" },
          to: { strokeDashoffset: "0" },
        },
        "scan-x": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.55s ease-out both",
        "fade-up-delay": "fade-up 0.55s ease-out 0.1s both",
        "pulse-meter": "pulse-meter 2.4s ease-in-out infinite",
        "wave-drift": "wave-drift 18s linear infinite",
        "soft-glow": "soft-glow 3.2s ease-in-out infinite",
        "orbit-spin": "orbit-spin 22s linear infinite",
        "scan-line": "scan-line 6s ease-in-out infinite",
        "hero-drift": "hero-drift 28s ease-in-out infinite alternate",
        "live-ping": "live-ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite",
        "hud-sweep": "hud-sweep 3.6s ease-in-out infinite",
        "draw-line": "draw-line 1.6s ease-out both",
        "scan-x": "scan-x 4.5s linear infinite",
      },
    },
  },
  plugins: [
    // claro:… aplica só no tema claro (ex.: claro:shadow-sm); o padrão é o escuro
    plugin(({ addVariant }) => {
      addVariant("claro", 'html[data-theme="light"] &');
      // toque:… só em telas de toque (celular/tablet): área mínima de 44 px sem inchar o desktop
      addVariant("toque", "@media (pointer: coarse)");
    }),
  ],
};

export default config;
