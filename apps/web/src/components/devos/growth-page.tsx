import type {
  LearningGoalTemplateId,
  MaterializedLearningGoalTemplate,
} from "@semogtw/domain/growth";
import type { GrowthOverviewRead } from "@semogtw/database/growth";
import {
  GrowthQuickCreate,
  type GrowthQuickCreateSubmitInput,
  type GrowthQuickCreateSubmitResult,
  type GrowthTemplateOption,
} from "./growth-quick-create";
import { GrowthOverview } from "./growth-overview";

export type GrowthPageProps = {
  csrfToken: string;
  overview: GrowthOverviewRead;
  templates: readonly GrowthTemplateOption[];
  goalHref(goalId: string): string;
  onPreview(
    templateId: LearningGoalTemplateId,
  ): Promise<MaterializedLearningGoalTemplate>;
  onSubmit(
    input: GrowthQuickCreateSubmitInput,
  ): Promise<GrowthQuickCreateSubmitResult>;
  createIdempotencyKey?: () => string;
};

export function GrowthPage({
  csrfToken,
  overview,
  templates,
  goalHref,
  onPreview,
  onSubmit,
  createIdempotencyKey,
}: GrowthPageProps): React.JSX.Element {
  return (
    <div className="growth-page">
      <header className="growth-page__header">
        <h1>Growth</h1>
        <p>
          Crie metas simples, acompanhe checkpoints e entenda como o progresso foi calculado.
        </p>
      </header>

      <section aria-labelledby="growth-create-title">
        <div className="growth-page__header">
          <h2 id="growth-create-title">Criar uma meta</h2>
          <p>Título é o único campo obrigatório. Uma estrutura pronta é opcional.</p>
        </div>
        <GrowthQuickCreate
          csrfToken={csrfToken}
          templates={templates}
          onPreview={onPreview}
          onSubmit={onSubmit}
          createIdempotencyKey={createIdempotencyKey}
        />
      </section>

      <GrowthOverview overview={overview} goalHref={goalHref} />
    </div>
  );
}
