"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authApi, perfilApi } from "@/lib/api";

/** Contas criadas antes do aceite registrado: pede o aceite da Política de Privacidade (LGPD art. 8º e 9º). */
export function AvisoPrivacidade() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => authApi.me() });
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!me.data || me.data.privacidade_aceita_em) return null;
  return (
    <div role="region" aria-label="Política de Privacidade" data-testid="aviso-privacidade"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-accent/10 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-accent/30">
      <ShieldCheck className="h-5 w-5 shrink-0 text-accent" aria-hidden />
      <p className="min-w-0 flex-1">
        Atualizamos os <Link href="/privacidade" target="_blank" className="font-medium text-accent hover:underline">Termos e a Política de Privacidade</Link>{" "}
        (LGPD): como guardamos os dados da sua conta e dos seus pacientes. Leia e confirme para registrar o aceite.
      </p>
      {erro ? <p role="alert" className="text-signal-err">{erro}</p> : null}
      <Button size="sm" disabled={salvando} onClick={async () => {
        setSalvando(true);
        try {
          const u = await perfilApi.aceitarPrivacidade();
          qc.setQueryData(["me"], u);
        } catch (e) {
          setErro((e as Error).message);
        } finally {
          setSalvando(false);
        }
      }}>Li e aceito</Button>
    </div>
  );
}
