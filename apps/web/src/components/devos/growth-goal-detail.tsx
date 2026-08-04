import type {
  LearningCheckpointRead,
  LearningGoalDetailRead,
} from "@semogtw/database/growth";
import { GrowthProgress } from "./growth-progress";

const STATUS_LABELS = {
  pending: "Pendente",
  in_progress: "Em andamento",
  completed: "Concluído",
  waived: "Dispensado",
  cancelled: "Cancelado",
} as const;

const STAGE_LABELS = {
  introduced: "introduzido",
  practicing: "em prática",
  applied: "aplicado",
  demonstrated: "demonstrado",
} as const;

function completionLabel(checkpoint: LearningCheckpointRead): string {
  if (checkpoint.completionMode.kind === "binary") {
    return "Conclusão simples";
  }
  const current = checkpoint.acceptedValue ?? 0;
  return `${Number(current.toFixed(2))} de ${Number(
    checkpoint.completionMode.target.toFixed(2),
  )} ${checkpoint.completionMode.unit}`;
}

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match === null ? value : `${match[3]}/${match[2]}/${match[1]}`;
}

export function GrowthGoalDetail({
  goal,
}: {
  goal: LearningGoalDetailRead;
}): React.JSX.Element {
  const checkpointLabels = new Map(
    goal.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint.title]),
  );
  const completedCheckpointCount = goal.checkpoints.filter(
    (checkpoint) =>
      checkpoint.status === "completed" || checkpoint.status === "waived",
  ).length;

  return (
    <main className="growth-page">
      <header className="growth-page__header">
        <h1>{goal.title}</h1>
        {goal.description.length > 0 ? <p>{goal.description}</p> : null}
        {goal.motivation === null ? null : <p>{goal.motivation}</p>}
        {goal.targetDate === null ? null : (
          <p>Prazo: {formatDate(goal.targetDate)}</p>
        )}
      </header>

      <GrowthProgress
        title={goal.title}
        progress={goal.progress}
        checkpointCount={goal.checkpointCount}
        completedCheckpointCount={completedCheckpointCount}
        explanation={goal.progressExplanation.map((item) => ({
          ...item,
          label: checkpointLabels.get(item.checkpointId) ?? "Checkpoint",
        }))}
      />

      <section aria-labelledby="growth-checkpoints-title">
        <div className="growth-page__header">
          <h2 id="growth-checkpoints-title">Checkpoints</h2>
          <p>O progresso é derivado destes estados e pesos.</p>
        </div>
        <div className="growth-overview-grid">
          {goal.checkpoints.map((checkpoint) => (
            <article className="growth-checkpoint-card" key={checkpoint.id}>
              <div>
                <strong>{checkpoint.title}</strong>
                <p>{STATUS_LABELS[checkpoint.status]}</p>
              </div>
              {checkpoint.description.length > 0 ? (
                <p>{checkpoint.description}</p>
              ) : null}
              <p>{completionLabel(checkpoint)}</p>
              <p>{checkpoint.required ? "Obrigatório" : "Opcional"}</p>
              {checkpoint.dueDate === null ? null : (
                <p>Prazo: {formatDate(checkpoint.dueDate)}</p>
              )}

              <details>
                <summary>Configurações avançadas</summary>
                <dl>
                  <div>
                    <dt>Peso</dt>
                    <dd>Peso: {checkpoint.weight} pontos</dd>
                  </div>
                  <div>
                    <dt>Ordem</dt>
                    <dd>{checkpoint.sequence}</dd>
                  </div>
                  <div>
                    <dt>Versão</dt>
                    <dd>Versão: {checkpoint.version}</dd>
                  </div>
                </dl>
              </details>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="growth-related-skills-title">
        <div className="growth-page__header">
          <h2 id="growth-related-skills-title">Skills relacionadas</h2>
        </div>
        {goal.skills.length === 0 ? (
          <p>Nenhuma skill relacionada.</p>
        ) : (
          <ul>
            {goal.skills.map((skill) => (
              <li key={`${skill.skillId}:${skill.desiredStage}`}>
                {skill.name} — nível desejado: {STAGE_LABELS[skill.desiredStage]}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
