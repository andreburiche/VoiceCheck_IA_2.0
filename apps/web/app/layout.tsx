import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Manrope } from "next/font/google";

import { Providers } from "@/components/providers";
import { BRAND } from "@/lib/brand";
import { SCRIPT_TEMA } from "@/lib/tema-script";

import "./globals.css";

const display = Manrope({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: BRAND.name,
    template: `%s · ${BRAND.name}`,
  },
  description: `${BRAND.name} — ${BRAND.slogan}. Separe as faixas, analise a voz nota por nota e treine em cima da música.`,
  icons: {
    icon: BRAND.markSrc,
    apple: BRAND.appleIconSrc,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme é definido pelo script antes da pintura (tema salvo neste navegador)
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="font-sans">
        <a
          href="#conteudo-principal"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-canvas"
        >
          Ir para o conteúdo
        </a>
        <Providers>
          <div id="conteudo-principal">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
