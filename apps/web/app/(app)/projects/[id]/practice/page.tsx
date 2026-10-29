"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { PracticeWorkspace } from "@/components/practice/practice-workspace";
import { projectsApi } from "@/lib/api";

export default function PracticePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const project = useQuery({ queryKey: ["project", id], queryFn: () => projectsApi.get(id) });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#letras") return;
    const t = window.setTimeout(() => {
      document.getElementById("letras")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
    return () => window.clearTimeout(t);
  }, [id, project.data?.id]);

  return (
    <div className="page-shell space-y-4">
      <PracticeWorkspace projectId={id} />
    </div>
  );
}
