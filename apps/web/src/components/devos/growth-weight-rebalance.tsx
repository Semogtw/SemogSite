import type { CheckpointWeightProposal } from "@semogtw/domain/growth";
import { useState } from "react";

export type GrowthWeightRebalanceProps = {
  checkpointLabels: Readonly<Record<string, string>>;
  proposal: CheckpointWeightProposal;
  onApply(input: { confirmed: true }): Promise<
    | { ok: true }
    | { ok: false; code: "CONFLICT" | "WRITE_FAILED" }
  >;
};

const WEIGHT_MODE_LABELS = {
  automatic: "automático",
  custom: "personalizado",
} as const;

export function GrowthWeightRebalance({
  checkpointLabels,
  proposal,
  onApply,
}: GrowthWeightRebalanceProps): React.JSX.Element {
  const [confirmed, setConfirmed] = useState(!proposal.requiresConfirmation);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function apply(): Promise<void> {
    if (submitting || !confirmed) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await onApply({ confirmed: true });
      setMessage(
        result.ok
          ? "Pesos atualizados."
          : result.code === "CONFLICT"
            ? "Os checkpoints mudaram. Gere uma nova prévia antes de aplicar."
            : "Não foi possível atualizar os pesos agora.",
      );
    } catch {
      setMessage("Não foi possível atualizar os pesos agora.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="growth-progress-card" aria-labelledby="growth-weight-preview-title">
      <div className="growth-page__header">
        <h3 id="growth-weight-preview-title">Prévia da redistribuição</h3>
        <p>Total proposto: {proposal.total} pontos</p>
      </div>

      <ul className="growth-progress-explanation">
        {proposal.checkpoints.map((checkpoint) => (
          <li key={checkpoint.id}>
            <span>{checkpointLabels[checkpoint.id] ?? "Checkpoint"}</span>
            <span>
              {checkpoint.before ?? "—"} → {checkpoint.after} pontos ·{" "}
              {WEIGHT_MODE_LABELS[checkpoint.weightMode]}
            </span>
          </li>
        ))}
      </ul>

      {proposal.requiresConfirmation ? (
        <div className="growth-quick-create__field">
          <p>Esta redistribuição altera um peso personalizado.</p>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.currentTarget.checked)}
            />{" "}
            Confirmo a alteração dos pesos personalizados
          </label>
        </div>
      ) : null}

      <div className="growth-quick-create__actions">
        <button
          type="button"
          disabled={submitting || !confirmed}
          onClick={() => void apply()}
        >
          {submitting ? "Aplicando…" : "Aplicar redistribuição"}
        </button>
      </div>

      {message !== null ? (
        <p role={message === "Pesos atualizados." ? "status" : "alert"}>{message}</p>
      ) : null}
    </section>
  );
}
