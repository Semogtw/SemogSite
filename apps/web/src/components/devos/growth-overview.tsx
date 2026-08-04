import type { GrowthOverviewRead } from "@semogtw/database/growth";

export type GrowthOverviewProps = {
  overview: GrowthOverviewRead;
  goalHref(goalId: string): string;
};

const PRIORITY_LABELS = {
  critical: "Crítica",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
} as const;

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function GrowthOverview({
  overview,
  goalHref,
}: GrowthOverviewProps): React.JSX.Element {
  return (
    <div className="growth-overview">
      <section aria-labelledby="growth-active-goals-title">
        <div className="growth-page__header">
          <h2 id="growth-active-goals-title">Metas ativas</h2>
          <p>Acompanhe o que está em andamento e o próximo passo de cada meta.</p>
        </div>

        {overview.activeGoals.length === 0 ? (
          <p>Nenhuma meta ativa ainda.</p>
        ) : (
          <div className="growth-overview-grid">
            {overview.activeGoals.map((goal) => (
              <article className="growth-goal-card" key={goal.id}>
                <div>
                  <a href={goalHref(goal.id)}>{goal.title}</a>
                  <p>Prioridade {PRIORITY_LABELS[goal.priority]}</p>
                </div>

                {goal.progress.measurable && goal.progress.percent !== null ? (
                  <div className="growth-progress-meter">
                    <progress
                      aria-label={`Progresso de ${goal.title}`}
                      value={goal.progress.percent}
                      max={100}
                    />
                    <strong>{goal.progress.percent}% concluído</strong>
                  </div>
                ) : (
                  <div className="growth-progress-meter">
                    <strong>Progresso ainda não calculável</strong>
                    <span>Adicione checkpoints ou uma regra mensurável.</span>
                  </div>
                )}

                {goal.nextCheckpoint === null ? (
                  <p>Nenhum próximo checkpoint definido.</p>
                ) : (
                  <p>Próximo: {goal.nextCheckpoint.title}</p>
                )}

                {goal.targetDate === null ? null : (
                  <p>Prazo da meta: {formatDate(goal.targetDate)}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="growth-due-checkpoints-title">
        <div className="growth-page__header">
          <h2 id="growth-due-checkpoints-title">Próximos checkpoints</h2>
          <p>Prazos pendentes e em andamento, ordenados por data.</p>
        </div>

        {overview.dueCheckpoints.length === 0 ? (
          <p>Nenhum checkpoint com prazo próximo.</p>
        ) : (
          <div className="growth-overview-grid">
            {overview.dueCheckpoints.map((checkpoint) => (
              <article className="growth-checkpoint-card" key={checkpoint.id}>
                <strong>{checkpoint.title}</strong>
                <span>{checkpoint.goalTitle}</span>
                <span>{formatDate(checkpoint.dueDate)}</span>
                <span>{checkpoint.required ? "Obrigatório" : "Opcional"}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="growth-skills-title">
        <div className="growth-page__header">
          <h2 id="growth-skills-title">Skills</h2>
          <p>Competências canônicas relacionadas às metas de aprendizado.</p>
        </div>

        {overview.skillSummaries.length === 0 ? (
          <p>Nenhuma skill registrada ainda.</p>
        ) : (
          <div className="growth-overview-grid">
            {overview.skillSummaries.map((skill) => (
              <article className="growth-goal-card" key={skill.id}>
                <strong>{skill.name}</strong>
                {skill.description.length > 0 ? <p>{skill.description}</p> : null}
                {skill.aliases.length > 1 ? (
                  <p>Também conhecida como: {skill.aliases.join(", ")}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
