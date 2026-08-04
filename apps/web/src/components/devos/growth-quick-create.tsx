import { useState } from "react";
import type {
  LearningGoalTemplateId,
  MaterializedLearningGoalTemplate,
} from "@semogtw/domain/growth";

export type GrowthTemplateOption = {
  id: LearningGoalTemplateId;
  label: string;
  description: string;
};

export type GrowthQuickCreateSubmitInput = {
  csrfToken: string;
  idempotencyKey: string;
  title: string;
  targetDate: string | null;
  motivation: string | null;
  templateId: LearningGoalTemplateId | null;
};

export type GrowthQuickCreateSubmitResult =
  | { ok: true; goalId: string; replayed: boolean }
  | {
      ok: false;
      code:
        | "UNAUTHORIZED"
        | "CSRF_INVALID"
        | "VALIDATION_FAILED"
        | "CONFLICT"
        | "WRITE_FAILED";
      error?: string;
    };

export type GrowthQuickCreateProps = {
  csrfToken: string;
  templates: readonly GrowthTemplateOption[];
  onPreview(
    templateId: LearningGoalTemplateId,
  ): Promise<MaterializedLearningGoalTemplate>;
  onSubmit(
    input: GrowthQuickCreateSubmitInput,
  ): Promise<GrowthQuickCreateSubmitResult>;
  createIdempotencyKey?: () => string;
};

function defaultIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("RANDOM_UUID_UNAVAILABLE");
  }
  return globalThis.crypto.randomUUID();
}

function errorMessage(result: Extract<GrowthQuickCreateSubmitResult, { ok: false }>): string {
  switch (result.code) {
    case "UNAUTHORIZED":
      return "A sessão expirou. Entre novamente para criar a meta.";
    case "CSRF_INVALID":
      return "A página ficou desatualizada. Recarregue antes de tentar novamente.";
    case "CONFLICT":
      return "A meta mudou ou já foi criada. Atualize e tente novamente.";
    case "WRITE_FAILED":
      return "Não foi possível salvar a meta agora.";
    case "VALIDATION_FAILED":
      return result.error === "LEARNING_GOAL_TITLE_REQUIRED"
        ? "Informe o que deseja alcançar."
        : "Revise os dados da meta e tente novamente.";
  }
}

export function GrowthQuickCreate({
  csrfToken,
  templates,
  onPreview,
  onSubmit,
  createIdempotencyKey = defaultIdempotencyKey,
}: GrowthQuickCreateProps): React.JSX.Element {
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [motivation, setMotivation] = useState("");
  const [templateId, setTemplateId] =
    useState<LearningGoalTemplateId | null>(null);
  const [preview, setPreview] =
    useState<MaterializedLearningGoalTemplate | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function selectTemplate(value: string): Promise<void> {
    setPreview(null);
    setPreviewError(null);
    if (value.length === 0) {
      setTemplateId(null);
      return;
    }
    const selected = value as LearningGoalTemplateId;
    setTemplateId(selected);
    try {
      setPreview(await onPreview(selected));
    } catch {
      setPreviewError("Não foi possível carregar a estrutura agora.");
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await onSubmit({
        csrfToken,
        idempotencyKey: createIdempotencyKey(),
        title: title.trim(),
        targetDate: targetDate.length === 0 ? null : targetDate,
        motivation: motivation.trim().length === 0 ? null : motivation.trim(),
        templateId,
      });
      setMessage(
        result.ok
          ? result.replayed
            ? "A meta já havia sido criada."
            : "Meta criada com sucesso."
          : errorMessage(result),
      );
    } catch {
      setMessage("Não foi possível salvar a meta agora.");
    } finally {
      setSubmitting(false);
    }
  }

  const automaticTotal =
    preview?.checkpoints.reduce(
      (total, checkpoint) => total + checkpoint.weight,
      0,
    ) ?? 0;

  return (
    <form className="growth-quick-create" onSubmit={submit} noValidate>
      <div className="growth-quick-create__field">
        <label htmlFor="growth-goal-title">O que deseja alcançar?</label>
        <input
          id="growth-goal-title"
          name="title"
          type="text"
          required
          maxLength={160}
          autoComplete="off"
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
      </div>

      <div className="growth-quick-create__field">
        <label htmlFor="growth-goal-target-date">Até quando?</label>
        <input
          id="growth-goal-target-date"
          name="targetDate"
          type="date"
          value={targetDate}
          onChange={(event) => setTargetDate(event.currentTarget.value)}
        />
      </div>

      <div className="growth-quick-create__field">
        <label htmlFor="growth-goal-motivation">Por que isso importa?</label>
        <textarea
          id="growth-goal-motivation"
          name="motivation"
          maxLength={1_000}
          rows={4}
          value={motivation}
          onChange={(event) => setMotivation(event.currentTarget.value)}
        />
      </div>

      <div className="growth-quick-create__field">
        <label htmlFor="growth-goal-template">Usar uma estrutura pronta?</label>
        <select
          id="growth-goal-template"
          name="templateId"
          value={templateId ?? ""}
          onChange={(event) => void selectTemplate(event.currentTarget.value)}
        >
          <option value="">Começar sem estrutura</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.label}
            </option>
          ))}
        </select>
      </div>

      {previewError !== null ? (
        <p className="growth-quick-create__message" role="alert">
          {previewError}
        </p>
      ) : null}

      {preview !== null ? (
        <section
          className="growth-template-preview"
          aria-label="Prévia da estrutura"
        >
          <div className="growth-template-preview__heading">
            <div>
              <p className="growth-template-preview__source">
                Estrutura de modelo
              </p>
              <h3>{preview.label}</h3>
            </div>
            <p>Total automático: {automaticTotal}%</p>
          </div>
          <p>{preview.description}</p>
          <ol>
            {preview.checkpoints.map((checkpoint) => (
              <li key={checkpoint.key}>
                <strong>{checkpoint.title}</strong>
                {checkpoint.description.length > 0 ? (
                  <span>{checkpoint.description}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="growth-quick-create__actions">
        <button type="submit" disabled={submitting || title.trim().length === 0}>
          {submitting ? "Criando…" : "Criar meta"}
        </button>
      </div>

      {message !== null ? (
        <p
          className="growth-quick-create__message"
          role={message.includes("sucesso") ? "status" : "alert"}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
