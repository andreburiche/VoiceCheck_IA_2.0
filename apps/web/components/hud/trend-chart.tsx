import { cn } from "@/lib/utils";

export type TrendPoint = { label: string; value: number };

/**
 * Gráfico de evolução (área + linha) com eixo Y, rótulos e destaque no último ponto.
 * Valores arredondados para não divergir entre servidor e navegador.
 */
export function TrendChart({
  points,
  min = 0,
  max = 100,
  unit = "",
  color = "#20D9D2",
  height = 180,
  className,
  title,
}: {
  points: TrendPoint[];
  min?: number;
  max?: number;
  unit?: string;
  color?: string;
  height?: number;
  className?: string;
  /** Descrição acessível do gráfico */
  title: string;
}) {
  const W = 600;
  const H = height;
  const PL = 34;
  const PR = 14;
  const PT = 12;
  const PB = 26;
  const span = max - min || 1;
  const x = (i: number) =>
    points.length > 1 ? PL + (i / (points.length - 1)) * (W - PL - PR) : PL + (W - PL - PR) / 2;
  const y = (v: number) => PT + (1 - (Math.max(min, Math.min(max, v)) - min) / span) * (H - PT - PB);
  const r = (n: number) => Math.round(n * 10) / 10;
  const pts = points.map((p, i) => [r(x(i)), r(y(p.value))] as const);
  const line = pts.map(([a, b]) => `${a},${b}`).join(" ");
  const ticks = [min, min + span / 2, max].map((t) => Math.round(t));
  const last = pts[pts.length - 1];
  const lastPoint = points[points.length - 1];
  // Destaque laranja só quando há valor; zero fica neutro (não é alerta).
  const hot = (lastPoint?.value ?? 0) > 0;
  const first = pts[0];
  const step = Math.max(1, Math.ceil(points.length / 6));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("block h-auto w-full", className)} role="img" aria-label={title}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PL} x2={W - PR} y1={r(y(t))} y2={r(y(t))} stroke="rgba(148,163,184,0.12)" strokeDasharray="3 5" />
          <text x={PL - 8} y={r(y(t)) + 4} textAnchor="end" fontSize={12} fill="#94A3B8" fontFamily="var(--font-mono)">
            {t}
          </text>
        </g>
      ))}
      {first && last && pts.length > 1 ? (
        <>
          <polygon points={`${first[0]},${H - PB} ${line} ${last[0]},${H - PB}`} fill={color} fillOpacity={0.1} />
          <polyline
            points={line}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={1000}
            strokeDasharray={1000}
            className="animate-draw-line"
          />
        </>
      ) : null}
      {pts.map(([a, b], i) => (
        <circle key={i} cx={a} cy={b} r={i === pts.length - 1 ? 4.5 : 2.5} fill={i === pts.length - 1 && hot ? "#FF7A1A" : color} />
      ))}
      {last && lastPoint ? (
        <text x={last[0]} y={last[1] - 12} textAnchor="end" fontSize={12} fontWeight={600} fill={hot ? "#FF9C55" : "#94A3B8"} fontFamily="var(--font-mono)">
          {lastPoint.value}
          {unit}
        </text>
      ) : null}
      {points.map((p, i) =>
        (i % step === 0 || i === points.length - 1) && pts[i] ? (
          <text key={i} x={pts[i]![0]} y={H - 6} textAnchor="middle" fontSize={12} fill="#94A3B8" fontFamily="var(--font-mono)">
            {p.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}
