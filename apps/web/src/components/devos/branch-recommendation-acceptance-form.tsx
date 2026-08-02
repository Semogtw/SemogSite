import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { Button } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { readCookie } from "../../client/cookies";
import { acceptBranchRecommendationFn } from "../../server/devos-branch-recommendation";

export function BranchRecommendationAcceptanceForm({
  repositoryId,
  recommendationId,
  expectedActiveBranch,
  recommendedBranch,
}: {
  repositoryId: string;
  recommendationId: string;
  expectedActiveBranch: string | null;
  recommendedBranch: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    success: boolean;
  } | null>(null);

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!confirmed || reason.trim().length === 0) {
      setFeedback({
        success: false,
        message: "Informe o motivo e confirme conscientemente a decisão.",
      });
      return;
    }

    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken === null) {
      setFeedback({
        success: false,
        message: "Não foi possível validar esta sessão.",
      });
      return;
    }

    setPending(true);
    setFeedback(null);
    try {
      const response = await acceptBranchRecommendationFn({
        data: {
          csrfToken,
          repositoryId,
          recommendationId,
          expectedActiveBranch,
          reason,
          confirmed: true,
        },
      });
      setFeedback({ message: response.message, success: response.ok });
      if (!response.ok) return;

      setReason("");
      setConfirmed(false);
      await router.invalidate();
    } catch {
      setFeedback({
        success: false,
        message:
          "A decisão não pôde ser confirmada. A branch ativa permaneceu inalterada.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="branch-acceptance">
      <summary>Aceitar como branch ativa</summary>
      <form className="branch-acceptance__form" onSubmit={accept}>
        <p>
          Esta ação altera somente o estado operacional do DevOS para{" "}
          <strong>{recommendedBranch}</strong>. Nenhuma escrita será enviada ao
          GitHub.
        </p>
        <label>
          Motivo da decisão
          <textarea
            rows={3}
            maxLength={500}
            required
            value={reason}
            placeholder="Por que esta observação representa a linha de desenvolvimento que deve ser continuada?"
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <label className="capture-confirmation">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={pending}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            Confirmo que revisei a recomendação e quero registrá-la como decisão
            manual auditada.
          </span>
        </label>
        <Button
          type="submit"
          tone="primary"
          disabled={pending || !confirmed || reason.trim().length === 0}
        >
          {pending ? "Confirmando…" : "Aceitar recomendação"}
        </Button>
        {feedback ? (
          <p
            className={
              feedback.success
                ? "branch-acceptance__feedback branch-acceptance__feedback--success"
                : "branch-acceptance__feedback branch-acceptance__feedback--error"
            }
            role="status"
          >
            {feedback.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}
