"use client";

import { AvaliacaoClinica } from "@/components/voz-clinica/avaliacao-clinica";
import { PortaoClinico } from "@/components/voz-clinica/portao-clinico";

export default function AvaliacaoClinicaPage() {
  return (
    <PortaoClinico>
      <AvaliacaoClinica />
    </PortaoClinico>
  );
}
