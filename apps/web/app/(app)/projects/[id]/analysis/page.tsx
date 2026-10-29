"use client";

import { useParams } from "next/navigation";

import { AnalysisWorkspace } from "@/components/analysis/analysis-workspace";

export default function AnalysisPage() {
  const params = useParams<{ id: string }>();
  return <AnalysisWorkspace projectId={params.id} />;
}
