"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/api";

/**
 * Fonoaudiólogos esperando a conferência do registro (CRFa). Só depois da aprovação a conta entra na
 * avaliação clínica — músicos e professores de música nunca entram.
 */
export function ConferenciaCrfa() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "crfa"], queryFn: () => adminApi.verificacoesClinicas() });
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [notas, setNotas] = useState<Record<string, string>>({});

  async function decidir(id: string, aprovar: boolean) {
    setOcupado(id);
    setErro(null);
    try {
      await adminApi.decidirVerificacao(id, aprovar, notas[id]);
      await qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  const itens = q.data?.items ?? [];
  return (
    <section className="space-y-3" aria-labelledby="crfa-titulo" data-testid="admin-crfa">
      <h2 id="crfa-titulo" className="font-display text-lg text-ink">Conferência de CRFa ({q.isLoading ? "…" : itens.length})</h2>
      <p className="text-sm text-ink-muted">
        Confira o número no site do Conselho Regional de Fonoaudiologia antes de aprovar. Aprovado, o profissional passa a ver a
        avaliação clínica; recusado, ele vê o motivo em Meu perfil.
      </p>
      {erro ? <p role="alert" className="text-sm text-signal-err">{erro}</p> : null}
      {!q.isLoading && !itens.length ? <p className="text-sm text-ink-faint">Nenhum registro esperando conferência.</p> : null}
      <ul className="space-y-2">
        {itens.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-canvas-raised/60 p-3 ring-1 ring-inset ring-ink/10">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{u.nome} <span className="text-ink-faint">· {u.email}</span></p>
              <p className="font-mono text-sm text-ink">{u.registro ?? "sem registro"}{u.cidade ? <span className="font-sans text-ink-muted"> · {u.cidade}</span> : null}</p>
            </div>
            <input aria-label={`Motivo se recusar ${u.nome}`} placeholder="Motivo (se recusar)" maxLength={255}
              value={notas[u.id] ?? ""} onChange={(e) => setNotas((n) => ({ ...n, [u.id]: e.target.value }))}
              className="h-9 w-56 rounded-lg border border-line bg-canvas-overlay/60 px-2 text-sm text-ink" />
            <Button size="sm" disabled={ocupado === u.id} onClick={() => decidir(u.id, true)}>Aprovar</Button>
            <Button size="sm" variant="ghost" disabled={ocupado === u.id} onClick={() => decidir(u.id, false)}>Recusar</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
