"use client";

import { useParams } from "next/navigation";

import { VocalLabWorkspace } from "@/components/vocal-lab/vocal-lab-workspace";

export default function VocalLabPage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="pb-8">
      <VocalLabWorkspace projectId={params.id} />
    </div>
  );
}
