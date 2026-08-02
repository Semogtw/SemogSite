import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { Button } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { readCookie } from "../../client/cookies";
import { changeRepositoryTargetLifecycleFn } from "../../server/devos-repository-target-lifecycle";

export function RepositoryTargetLifecycleForm({
  repositoryId,
  fullName,
  syncEnabled,
  updatedAt,
}: {
  repositoryId: string;
  fullName: string;
  syncEnabled: boolean;
  updatedAt: string;
}) {
  const router = useRouter();
  const desiredSyncEnabled = !syncEnabled;
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    success: boolean;
  } | null>(null);

  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!confirmed || reason.trim().length === 0) {
      setFeedback({
        success: false,
        message: "Informe o motivo e confirme conscientemente a alteração.",
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
      const response = await changeRepositoryTargetLifecycleFn({
        data: {
          csrfToken,
          repositoryId,
          desiredSyncEnabled,
          expectedSyncEnabled: syncEnabled,
          expectedUpdatedAt: updatedAt,
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
          "O estado do alvo não pôde ser alterado. O valor anterior foi preservado.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="repository-target-lifecycle">
      <summary>{syncEnabled ? "Pausar sincronização" : "Reativar sincronização"}</summary>
      <form className="repository-target-lifecycle__form" onSubmit={change}>
        <p>
          {syncEnabled
            ? `${fullName} deixará de entrar em novas rodadas. Observações e decisões históricas serão preservadas.`
            : `${fullName} voltará a entrar nas próximas rodadas de leitura confirmadas.`}
        </p>
        <label>
          Motivo da alteração
          <textarea
            rows={3}
            maxLength={500}
            required
            value={reason}
            placeholder={
              syncEnabled
                ? "Por que este alvo deve ser pausado agora?"
                : "Por que este alvo deve voltar a ser observado?"
            }
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
            Confirmo a alteração local auditada e entendo que nenhum histórico
            será apagado.
          </span>
        </label>
        <Button
          type="submit"
          tone={syncEnabled ? "danger" : "primary"}
          disabled={pending || !confirmed || reason.trim().length === 0}
        >
          {pending
            ? "Confirmando…"
            : syncEnabled
              ? "Pausar alvo"
              : "Reativar alvo"}
        </Button>
        {feedback ? (
          <p
            className={
              feedback.success
                ? "repository-target-lifecycle__feedback repository-target-lifecycle__feedback--success"
                : "repository-target-lifecycle__feedback repository-target-lifecycle__feedback--error"
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
