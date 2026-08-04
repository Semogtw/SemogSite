import type { GrowthProgressRead } from "@semogtw/database/growth";

export type GrowthProgressExplanationItem = {
  checkpointId: string;
  label: string;
  ratio: number;
  weightedContribution: number;
};

export type GrowthProgressProps = {
  title: string;
  progress: GrowthProgressRead;
  checkpointCount: number;
  completedCheckpointCount: number;
  explanation: readonly GrowthProgressExplanationItem[];
};

function validateProgress(props: GrowthProgressProps): void {
  if (
    !Number.isInteger(props.checkpointCount) ||
    props.checkpointCount < 0 ||
    !Number.isInteger(props.completedCheckpointCount) ||
    props.completedCheckpointCount < 0 ||
    props.completedCheckpointCount > props.checkpointCount
  ) {
    throw new Error("GROWTH_PROGRESS_COUNT_INVALID");
  }
  if (props.progress.measurable) {
    if (
      props.progress.percent === null ||
      !Number.isFinite(props.progress.percent) ||
      props.progress.percent < 0 ||
      props.progress.percent > 100
    ) {
      throw new Error("GROWTH_PROGRESS_PERCENT_INVALID");
    }
  } else if (props.progress.percent !== null) {
    throw new Error("GROWTH_PROGRESS_MEASURABILITY_INVALID");
  }
  for (const item of props.explanation) {
    if (
      item.checkpointId.trim().length === 0 ||
      item.label.trim().length === 0 ||
      !Number.isFinite(item.ratio) ||
      item.ratio < 0 ||
      item.ratio > 1 ||
      !Number.isFinite(item.weightedContribution) ||
      item.weightedContribution < 0 ||
      item.weightedContribution > 100
    ) {
      throw new Error("GROWTH_PROGRESS_EXPLANATION_INVALID");
    }
  }
}

function formatPoints(value: number): string {
  return `${Number(value.toFixed(2))} pontos`;
}

export function GrowthProgress(props: GrowthProgressProps): React.JSX.Element {
  validateProgress(props);

  if (!props.progress.measurable || props.progress.percent === null) {
    return (
      <section className="growth-progress-card" aria-label={`Progresso de ${props.title}`}>
        <div className="growth-progress-meter">
          <strong>Progresso ainda não calculável.</strong>
          <div
            className="growth-progress-meter__indeterminate"
            aria-hidden="true"
          />
          <span>Adicione checkpoints ou defina uma regra mensurável.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="growth-progress-card" aria-label={`Progresso de ${props.title}`}>
      <div className="growth-progress-meter">
        <progress
          aria-label={`Progresso de ${props.title}`}
          value={props.progress.percent}
          max={100}
        />
        <strong>
          {props.progress.percent}% — {props.completedCheckpointCount} de {props.checkpointCount}{" "}
          checkpoints concluídos, considerando os pesos atuais.
        </strong>
      </div>

      {props.explanation.length > 0 ? (
        <ul className="growth-progress-explanation" aria-label="Contribuições do progresso">
          {props.explanation.map((item) => (
            <li key={item.checkpointId}>
              <span>{item.label}</span>
              <span>{formatPoints(item.weightedContribution)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
