/** Lado esquerdo do cadastro: o que acontece depois de criar a conta, em três passos reais. */
const PASSOS = [
  { titulo: "Cadastre o paciente ou o aluno", texto: "Anamnese, protocolos e gravações ficam num só prontuário." },
  { titulo: "Grave e meça", texto: "Jitter, shimmer, HNR, CPPS, fonetograma e AVQI, conferidos com o Praat." },
  { titulo: "Acompanhe e entregue", texto: "Compare sessões, envie exercícios para casa e gere o relatório em PDF ou Word." },
] as const;

export function PassosCadastro() {
  return (
    <ol className="divide-y divide-line/70 border-y border-line/70">
      {PASSOS.map((p, i) => (
        <li
          key={p.titulo}
          className="flex gap-5 py-5 motion-safe:animate-fade-up"
          style={{ animationDelay: `${120 + i * 90}ms` }}
        >
          <span className="text-data w-7 shrink-0 pt-0.5 text-sm text-accent">{String(i + 1).padStart(2, "0")}</span>
          <div>
            <p className="font-display text-lg font-semibold text-ink">{p.titulo}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{p.texto}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
