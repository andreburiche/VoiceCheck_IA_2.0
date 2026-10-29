type PreviewWaveformProps = {
  peaks: number[];
  label?: string;
};

export function PreviewWaveform({ peaks, label = "Prévia da forma de onda" }: PreviewWaveformProps) {
  if (peaks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-ink-faint">
        Waveform indisponível para este arquivo (será analisado no servidor).
      </p>
    );
  }

  return (
    <div
      className="flex h-16 items-end gap-0.5 rounded-xl border border-line bg-canvas/60 px-2 py-2"
      role="img"
      aria-label={label}
    >
      {peaks.map((p, i) => (
        <span
          key={i}
          className="flex-1 rounded-t-sm bg-accent/70"
          style={{ height: `${Math.max(8, p * 100)}%` }}
        />
      ))}
    </div>
  );
}
