"use client";

import { Suspense } from "react";

import { LibraryWorkspace } from "@/components/library/library-workspace";
import { PageSkeleton } from "@/components/ui/skeleton";

export default function LibraryPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Carregando biblioteca…" />}>
      <LibraryWorkspace />
    </Suspense>
  );
}
