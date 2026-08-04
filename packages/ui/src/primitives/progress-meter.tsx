export type ProgressMeterProps = {
  value: number | null;
  label: string;
  explanation: string;
  size?: "compact" | "regular";
  className?: string;
};

export function ProgressMeter({
  value,
  label,
  explanation,
  size = "regular",
  className,
}: ProgressMeterProps): React.JSX.Element {
  const normalizedLabel = label.trim();
  const normalizedExplanation = explanation.trim();
  if (normalizedLabel.length === 0 || normalizedLabel.length > 200) {
    throw new Error("PROGRESS_METER_LABEL_INVALID");
  }
  if (
    normalizedExplanation.length === 0 ||
    normalizedExplanation.length > 1_000
  ) {
    throw new Error("PROGRESS_METER_EXPLANATION_INVALID");
  }
  if (
    value !== null &&
    (!Number.isFinite(value) || value < 0 || value > 100)
  ) {
    throw new Error("PROGRESS_METER_VALUE_INVALID");
  }

  const classes = ["progress-meter", `progress-meter--${size}`, className]
    .filter(Boolean)
    .join(" ");

  if (value === null) {
    return (
      <div className={classes} aria-label={normalizedLabel}>
        <strong>Progresso ainda não calculável</strong>
        <div className="progress-meter__indeterminate" aria-hidden="true" />
        <span>{normalizedExplanation}</span>
      </div>
    );
  }

  return (
    <div className={classes}>
      <progress aria-label={normalizedLabel} value={value} max={100} />
      <strong>{Number(value.toFixed(2))}%</strong>
      <span>{normalizedExplanation}</span>
    </div>
  );
}
