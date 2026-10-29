"use client";

import { useParams } from "next/navigation";

import { ExportWizard } from "@/components/export/export-wizard";

export default function ExportPage() {
  const params = useParams<{ id: string }>();
  return <ExportWizard projectId={params.id} />;
}
