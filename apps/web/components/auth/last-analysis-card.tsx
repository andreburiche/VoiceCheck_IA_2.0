/**
 * Cartão compacto "Última análise" do login (canvas Claude Design).
 * Dados de exemplo — não é a análise real do usuário.
 */
const POINTS = "0,40 60,40 66,22 120,22 126,8 196,8 202,22 240,22 246,40 300,40 306,50 350,50 356,56 480,56";

export function LastAnalysisCard() {
  return (
    <div className="panel-glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">Última análise</p>
        <span className="text-data text-xs text-ink-muted">exemplo</span>
      </div>
      <ul className="mt-4 grid grid-cols-3 gap-3">
        <li>
          <p className="hud-label">No centro</p>
          <p className="text-data mt-1 text-2xl font-semibold text-ink">
            5<span className="text-sm text-ink-muted">/7</span>
          </p>
        </li>
        <li>
          <p className="hud-label">Desvio</p>
          <p className="text-data mt-1 text-2xl font-semibold text-ink">
            15<span className="text-sm text-ink-muted"> ¢</span>
          </p>
        </li>
        <li>
          <p className="hud-label">Alerta</p>
          <p className="text-data mt-1 text-2xl font-semibold text-flare-soft">Lá4</p>
        </li>
      </ul>
      <svg
        viewBox="0 0 480 60"
        role="img"
        aria-label="Curva de afinação de exemplo: 5 de 7 notas no centro, Lá4 abaixo"
        className="mt-4 block h-[60px] w-full"
      >
        <polyline points={POINTS} fill="none" stroke="#20D9D2" strokeWidth="2" />
        <polyline points="126,8 196,8" fill="none" stroke="#FF7A1A" strokeWidth="2.5" />
        <polyline points="306,50 350,50" fill="none" stroke="#FF7A1A" strokeWidth="2.5" />
      </svg>
    </div>
  );
}
