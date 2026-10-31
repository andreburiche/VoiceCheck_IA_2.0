"use client";

import { AgendaClinica } from "@/components/voz-clinica/agenda-clinica";
import { PortaoClinico } from "@/components/voz-clinica/portao-clinico";

export default function AgendaPage() {
  return (
    <PortaoClinico>
      <AgendaClinica />
    </PortaoClinico>
  );
}
