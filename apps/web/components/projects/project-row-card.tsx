"use client";

import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CoverArt } from "@/components/library/cover-art";
import type { Project } from "@/lib/api";

type ProjectRowCardProps = {
  project: Project;
  onEdit: () => void;
  onDelete: () => void;
};

export function ProjectRowCard({ project, onEdit, onDelete }: ProjectRowCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function place() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 176;
      const left = Math.min(
        Math.max(8, r.right - width),
        window.innerWidth - width - 8,
      );
      // Abre para baixo; se não couber, sobe
      const preferTop = r.bottom + 8;
      const menuH = 260;
      const top =
        preferTop + menuH > window.innerHeight - 8
          ? Math.max(8, r.top - menuH - 8)
          : preferTop;
      setMenuPos({ top, left });
    }

    place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const meta = [project.bpm ? `${project.bpm} BPM` : null, project.musical_key || null].filter(Boolean).join(" · ");
  return (
    <article className="panel-glass group relative flex min-w-0 flex-col gap-4 rounded-xl p-4 transition-colors duration-ui hover:border-line">
      <div className="flex min-w-0 items-center gap-3 pr-10">
        <CoverArt seed={project.id} title={project.name} />
        <div className="min-w-0">
          {/* Link "esticado": o cartão inteiro abre a música; o menu fica acima dele */}
          <Link
            href={`/projects/${project.id}`}
            className="block truncate font-semibold text-ink after:absolute after:inset-0 after:rounded-xl after:content-[''] group-hover:text-accent focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent/70"
          >
            {project.name}
          </Link>
          <p className="truncate text-sm text-ink-muted">{project.description?.trim() || "Sem artista"}</p>
        </div>
      </div>

      <div className="absolute right-3 top-3 z-10">
        <button
          ref={triggerRef}
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-canvas-overlay hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-controls={menuId}
          aria-label={`Mais ações de ${project.name}`}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="mt-auto flex items-center gap-3 border-t border-line/60 pt-3 text-xs text-ink-muted">
        {meta ? <span className="text-data truncate">{meta}</span> : <span className="truncate">BPM e tom não definidos</span>}
        <time className="text-data ml-auto shrink-0 text-ink-faint" dateTime={project.updated_at}>
          {new Date(project.updated_at).toLocaleDateString("pt-BR")}
        </time>
      </div>

      {menuOpen && menuPos && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={menuRef}
              id={menuId}
              role="menu"
              style={{ top: menuPos.top, left: menuPos.left }}
              className="fixed z-[80] min-w-[11rem] rounded-xl border border-line bg-canvas-overlay py-1 shadow-[0_16px_40px_-12px_rgb(var(--c-sombra)/calc(0.7*var(--k-sombra)))]"
            >
              <li role="none">
                <Link
                  role="menuitem"
                  href={`/projects/${project.id}`}
                  className="block px-3 py-2 text-sm text-ink-muted hover:bg-canvas-overlay hover:text-ink"
                  onClick={() => setMenuOpen(false)}
                >
                  Abrir
                </Link>
              </li>
              <li role="none">
                <Link
                  role="menuitem"
                  href={`/projects/${project.id}/studio`}
                  className="block px-3 py-2 text-sm text-ink-muted hover:bg-canvas-overlay hover:text-ink"
                  onClick={() => setMenuOpen(false)}
                >
                  Estúdio
                </Link>
              </li>
              <li role="none">
                <Link
                  role="menuitem"
                  href={`/projects/${project.id}/practice`}
                  className="block px-3 py-2 text-sm text-ink-muted hover:bg-canvas-overlay hover:text-ink"
                  onClick={() => setMenuOpen(false)}
                >
                  Treino
                </Link>
              </li>
              <li role="none">
                <Link
                  role="menuitem"
                  href={`/projects/${project.id}/vocal-lab`}
                  className="block px-3 py-2 text-sm text-ink-muted hover:bg-canvas-overlay hover:text-ink"
                  onClick={() => setMenuOpen(false)}
                >
                  Laboratório vocal
                </Link>
              </li>
              <li role="separator" className="my-1 h-px bg-line/70" />
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-muted hover:bg-canvas-overlay hover:text-ink"
                  onClick={() => {
                    setMenuOpen(false);
                    triggerRef.current?.focus(); // o foco volta aqui quando a janela fechar
                    onEdit();
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Renomear
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-signal-err hover:bg-signal-err/10"
                  onClick={() => {
                    setMenuOpen(false);
                    triggerRef.current?.focus(); // o foco volta aqui quando a janela fechar
                    onDelete();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Excluir
                </button>
              </li>
            </ul>,
            document.body,
          )
        : null}
    </article>
  );
}
