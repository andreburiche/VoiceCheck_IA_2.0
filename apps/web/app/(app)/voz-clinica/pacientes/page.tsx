"use client";

import { PacientesClinica } from "@/components/voz-clinica/pacientes-clinica";
import { PortaoClinico } from "@/components/voz-clinica/portao-clinico";

export default function PacientesPage() {
  return (
    <PortaoClinico>
      <PacientesClinica />
    </PortaoClinico>
  );
}
