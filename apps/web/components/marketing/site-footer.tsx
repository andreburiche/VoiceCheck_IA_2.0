import Link from "next/link";

import { BRAND } from "@/lib/brand";

const LINKS = [
  { href: "#separacao", label: "Separação" },
  { href: "#estudio", label: "Estúdio" },
  { href: "#voicecheck", label: "VoiceCheck" },
  { href: "/privacidade", label: "Privacidade" },
  { href: "/login", label: "Entrar" },
  { href: "/register", label: "Criar conta" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-ink/5 bg-canvas-raised px-5 pb-10 pt-20 sm:px-8" aria-label="Rodapé">
      <div className="mx-auto max-w-content">
        <nav aria-label="Rodapé">
          <ul className="flex flex-wrap gap-x-8 gap-y-3">
            {LINKS.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className="text-base text-ink-muted transition-colors hover:text-ink">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p
          translate="no"
          className="mt-20 font-display text-[clamp(2.75rem,11vw,9.5rem)] font-bold leading-[0.85] tracking-[-0.05em] text-ink"
        >
          {BRAND.name}
        </p>

        <div className="mt-10 flex flex-wrap justify-between gap-x-8 gap-y-2 text-sm text-ink-muted">
          <p>
            © {new Date().getFullYear()} {BRAND.name} · {BRAND.slogan}
          </p>
          <p>Fotos: Unsplash</p>
        </div>
      </div>
    </footer>
  );
}
