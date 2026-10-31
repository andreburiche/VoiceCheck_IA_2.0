import { cn } from "@/lib/utils";

/** Mini-gráfico de linha. `values` em qualquer escala; normaliza internamente. */
export function Sparkline({
  values,
  className,
  color = "rgb(var(--c-accent))",
  fill = true,
  height = 36,
  highlightLast = true,
  label,
}: {
  values: number[];
  className?: string;
  color?: string;
  fill?: boolean;
  height?: number;
  highlightLast?: boolean;
  /** Descrição acessível; sem ela o gráfico é decorativo. */
  label?: string;
}) {
  const W = 120;
  const H = height;
  if (values.length < 2) {
    return <div className={cn("h-9", className)} aria-hidden />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - 3 - ((v - min) / span) * (H - 6);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as const;
  });
  const line = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const [lx, ly] = pts[pts.length - 1] ?? [0, 0];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn("block h-9 w-full overflow-visible", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {fill ? (
        <polygon points={`0,${H} ${line} ${W},${H}`} fill={color} fillOpacity={0.12} />
      ) : null}
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {highlightLast ? <circle cx={lx} cy={ly} r={2.5} fill={color} /> : null}
    </svg>
  );
}
