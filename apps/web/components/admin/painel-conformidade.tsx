"use client";

import { useQuery } from "@tanstack/react-query";

import { adminApi } from "@/lib/api";

const ROTULOS: Record<string, string> = {
  logins_com_falha_7d: "Logins com falha (7 dias)",
  acessos_clinicos_registrados_7d: "Acessos clínicos registrados (7 dias)",
  exportacoes_de_paciente_30d: "Exportações de paciente (30 dias)",
  exclusoes_de_paciente_30d: "Exclusões de paciente (30 dias)",
  usuarios: "Contas ativas",
  sem_aceite_da_politica: "Sem aceite da Política de Privacidade",
  fonoaudiologos: "Fonoaudiólogos",
  fonoaudiologos_aguardando_conferencia_do_crfa: "Aguardando conferência do CRFa",
  fonoaudiologos_sem_email_verificado: "Fonoaudiólogos sem e-mail verificado",
  pacientes_com_registros: "Pacientes com registros",
  cadastros: "Cadastros de paciente",
  sem_registro_ha_mais_de_5_anos: "Sem registro há mais de 5 anos (revisar guarda)",
  links_de_pratica_ativos: "Links de prática ativos",
  links_de_pratica_ativos_ha_mais_de_90_dias: "Links ativos há mais de 90 dias",
  arquivos_aguardando_exclusao: "Arquivos aguardando exclusão",
  exclusao_pendente_mais_antiga: "Exclusão pendente mais antiga",
};
const GRUPOS: Record<string, string> = { acesso: "Acesso e auditoria", contas: "Contas", dados_de_pacientes: "Dados de pacientes" };
/** Valores que pedem atenção quando passam de zero. */
const ALERTA = new Set(["fonoaudiologos_aguardando_conferencia_do_crfa", "sem_aceite_da_politica", "sem_registro_ha_mais_de_5_anos", "links_de_pratica_ativos_ha_mais_de_90_dias", "arquivos_aguardando_exclusao"]);

/** Métricas de segurança e LGPD (só contagens; nenhum dado de paciente). */
export function PainelConformidade() {
  const q = useQuery({ queryKey: ["admin", "conformidade"], queryFn: () => adminApi.conformidade() });
  return (
    <section className="space-y-3" aria-labelledby="conformidade-titulo">
      <h2 id="conformidade-titulo" className="font-display text-lg text-ink">Segurança e LGPD</h2>
      {q.error ? <p role="alert" className="text-sm text-signal-err">{(q.error as Error).message}</p> : null}
      <div className="grid gap-3 md:grid-cols-3">
        {q.data
          ? Object.entries(GRUPOS).map(([chave, titulo]) => (
              <dl key={chave} className="rounded-xl bg-canvas-raised/60 p-4 ring-1 ring-inset ring-ink/10">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{titulo}</p>
                {Object.entries((q.data as Record<string, Record<string, number | string | null>>)[chave] ?? {}).map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3 border-t border-line/60 py-1.5 text-sm first:border-t-0">
                    <dt className="text-ink-muted">{ROTULOS[k] ?? k}</dt>
                    <dd className={`font-mono font-semibold ${ALERTA.has(k) && typeof v === "number" && v > 0 ? "text-flare" : "text-ink"}`}>
                      {v === null ? "—" : typeof v === "string" ? new Date(v).toLocaleDateString("pt-BR") : v}
                    </dd>
                  </div>
                ))}
              </dl>
            ))
          : <p className="text-sm text-ink-muted">Calculando…</p>}
      </div>
    </section>
  );
}
