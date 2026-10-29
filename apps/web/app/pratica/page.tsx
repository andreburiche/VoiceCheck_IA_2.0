import type { Metadata, Viewport } from "next";

import { PraticaCelular } from "@/components/pratica/pratica-celular";

/**
 * Página pública do paciente (fora do grupo (app): não exige login).
 * O acesso vem do segredo no link (/pratica#t=...), lido no navegador.
 */
export const metadata: Metadata = {
  title: "Prática em casa",
  description: "Exercícios de voz combinados com o seu fonoaudiólogo.",
  manifest: "/pratica.webmanifest",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  appleWebApp: { capable: true, title: "Prática de voz", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#070B14",
  width: "device-width",
  initialScale: 1,
};

export default function PaginaPratica() {
  return (
    <div className="min-h-[100dvh] bg-canvas text-ink">
      <PraticaCelular />
    </div>
  );
}
