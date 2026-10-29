import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      maxWidth: {
        content: "80rem", // 1280px
        app: "110rem", // 1760px — páginas internas usam a largura disponível
      },
      colors: {
        canvas: {
          DEFAULT: "#070B14",
          raised: "#0B1120",
          overlay: "#111827",
          card: "#151D2E",
        },
        ink: {
          DEFAULT: "#F8FAFC",
          muted: "#94A3B8",
          faint: "#7B8AA0",
        },
        accent: {
          DEFAULT: "#20D9D2",
          soft: "#5EEAE4",
          deep: "#17BDB8",
        },
        brand: {
          blue: "#268BFF",
        },
        /** Laranja neon: só para "ao vivo", picos, destaques e alertas. Ações seguem em accent. */
        flare: {
          DEFAULT: "#FF7A1A",
          soft: "#FF9C55",
          deep: "#E5600A",
        },
        /** Legado: "violet" agora aponta para o Signal Blue (segunda cor de dados do DESIGN.md). */
        violet: {
          DEFAULT: "#268BFF",
          soft: "#5FA9FF",
          deep: "#1A6FD6",
        },
        signal: {
          ok: "#20D9D2",
          warn: "#E8B84A",
          err: "#E85D6F",
          meter: "#20D9D2",
        },
        stem: {
          vocals: "#20D9D2",
          drums: "#268BFF",
          bass: "#3DDB8A",
          other: "#94A3B8",
          guitar: "#F0A05A",
          keys: "#5FA9FF",
        },
        line: "#263247",
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
        glow: "0 0 0 1px rgba(32, 217, 210, 0.25)",
        "glow-violet": "0 8px 24px -12px rgba(0, 0, 0, 0.6)",
        panel: "0 10px 32px rgba(0, 0, 0, 0.4)",
        "panel-lift": "0 16px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(32, 217, 210, 0.08)",
        "glow-flare": "0 0 18px rgba(255, 122, 26, 0.45)",
        hud: "0 24px 60px -24px rgba(0, 0, 0, 0.75)",
      },
      backgroundImage: {
        "hero-grain":
          "radial-gradient(ellipse 85% 65% at 72% 18%, rgba(38,139,255,0.18), transparent 55%), radial-gradient(ellipse 55% 45% at 12% 78%, rgba(32,217,210,0.14), transparent 50%), linear-gradient(155deg, #0B1120 0%, #070B14 52%, #05080F 100%)",
        "panel-sheen": "linear-gradient(145deg, rgba(255,255,255,0.05), transparent 42%)",
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
  plugins: [],
};

export default config;
