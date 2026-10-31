"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { PainelConformidade } from "@/components/admin/painel-conformidade";
import { adminApi, authApi } from "@/lib/api";

export default function AdminPage() {
  const router = useRouter();
  const me = useQuery({ queryKey: ["me"], queryFn: () => authApi.me() });

  useEffect(() => {
    if (me.data && me.data.role !== "admin") router.replace("/dashboard");
  }, [me.data, router]);

  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => adminApi.users(),
    enabled: me.data?.role === "admin",
  });
  const jobs = useQuery({
    queryKey: ["admin", "jobs"],
    queryFn: () => adminApi.jobs(),
    enabled: me.data?.role === "admin",
  });
  const audits = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () => adminApi.auditLogs(),
    enabled: me.data?.role === "admin",
  });

  if (!me.data || me.data.role !== "admin") {
    return <p className="text-sm text-ink-muted">Verificando permissão…</p>;
  }

  return (
    <div className="page-shell space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">Administração</h1>
        <p className="mt-2 text-base text-ink-muted">Usuários, processamentos e registro de auditoria.</p>
      </div>

      <PainelConformidade />

      <section className="space-y-2">
        <h2 className="font-display text-lg text-ink">Usuários ({users.data?.total ?? "…"})</h2>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas-raised text-ink-faint">
              <tr>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">E-mail</th>
                <th className="px-3 py-2 font-medium">Perfil</th>
              </tr>
            </thead>
            <tbody>
              {users.data?.items.map((u) => (
                <tr key={u.id} className="border-b border-line/70">
                  <td className="px-3 py-2 text-ink">{u.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-muted">{u.email}</td>
                  <td className="px-3 py-2 font-mono text-xs">{u.role}</td>
                </tr>
              )) ?? (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-ink-faint">
                    Carregando…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg text-ink">Processamentos recentes ({jobs.data?.total ?? "…"})</h2>
        <ul className="divide-y divide-line rounded-lg border border-line text-sm">
          {jobs.data?.items.map((j) => (
            <li key={j.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
              <span className="font-mono text-xs text-ink">{j.id.slice(0, 8)}…</span>
              <span className="text-ink-muted">{j.status}</span>
              <span className="font-mono text-xs text-ink-faint">
                {new Date(j.created_at).toLocaleString("pt-BR")}
              </span>
            </li>
          )) ?? <li className="px-3 py-4 text-ink-faint">Carregando…</li>}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg text-ink">Registro de auditoria ({audits.data?.total ?? "…"})</h2>
        <ul className="divide-y divide-line rounded-lg border border-line text-sm">
          {audits.data?.items.map((a) => (
            <li key={a.id} className="px-3 py-2">
              <span className="font-mono text-xs text-accent">{a.action}</span>
              <span className="ml-2 text-ink-muted">
                {a.resource_type}
                {a.resource_id ? ` · ${a.resource_id.slice(0, 8)}…` : ""}
              </span>
              <span className="mt-0.5 block font-mono text-xs text-ink-faint">
                {new Date(a.created_at).toLocaleString("pt-BR")}
              </span>
            </li>
          )) ?? <li className="px-3 py-4 text-ink-faint">Carregando…</li>}
        </ul>
      </section>
    </div>
  );
}
