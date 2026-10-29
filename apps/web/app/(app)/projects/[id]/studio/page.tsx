"use client";

import { useParams } from "next/navigation";

import { StudioWorkspace } from "@/components/studio/studio-workspace";

export default function StudioPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  return (
    <div className="-mx-4 -mb-4 flex flex-col md:-mx-6 md:-mb-6 lg:-mx-8 lg:-mb-8">
      <StudioWorkspace projectId={id} />
    </div>
  );
}
