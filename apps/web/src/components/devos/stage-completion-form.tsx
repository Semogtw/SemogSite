import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { Button } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { readCookie } from "../../client/cookies";
import { completeStageFn } from "../../server/devos-stage-completion";

const validationMessages: Record<string, string> = {
  CONFIRMATION_REQUIRED: "Confirme conscientemente a conclusão da etapa.",
  STAGE_ID_REQUIRED: "A etapa não pôde ser identificada.",
  REASON_REQUIRED: "Explique por que a etapa está sendo concluída.",
  REASON_TOO_LONG: "A razão deve ter no máximo 500 caracteres.",
  EVIDENCE_REQUIRED:
    "Anexe ao menos uma evidência observada ou aprovada antes de concluir.",
  PROGRESS_NOT_COMPLETE: "A etapa ainda não atingiu 100%.",
  DONE_FLAG_REQUIRED: "A etapa ainda não está marcada como concluída.",
  PROGRESS_OUT_OF_RANGE: "O progresso persistido é inválido.",
  DONE_FLAG_INCONSISTENT: "O estado persistido de conclusão é inconsistente.",
  BLOCKER_REQUIRED: "A etapa bloqueada não possui bloqueio registrado.",
  NEXT_STEP_REQUIRED: "A etapa não possui próxima ação válida.",
};

export function StageCompletionForm({ stageId }: { stageId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<readonly string[]>([]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!confirmed) {
      setMessage("Confirme conscientemente a conclusão da etapa.");
      return;
    }

    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken === null) {
      setMessage("Não foi possível validar esta sessão.");
      return;
    }

    setPending(true);
    setMessage(null);
    setErrors([]);
    try {
      const response = await completeStageFn({
        data: {
          csrfToken,
          stageId,
          reason,
          confirmed: true,
        },
      });
      if (!response.ok) {
        setMessage(response.message);
        setErrors("errors" in response ? response.errors : []);
        return;
      }

      setReason("");
      setConfirmed(false);
      await router.invalidate();
    } catch {
      setMessage("Não foi possível concluir esta etapa.");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="stage-completion">
      <summary>Concluir etapa</summary>
      <form className="capture-form" onSubmit={submit}>
        <label>
          Razão da conclusão
          <textarea
            value={reason}
            maxLength={500}
            rows={3}
            required
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <label className="capture-confirmation">
          <input
            type="checkbox"
            checked={confirmed}
            required
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            Confirmo que a etapa possui evidência válida e deve ser alterada
            para 100% concluída com bloqueio manual contra sobrescrita.
          </span>
        </label>
        {message ? (
          <div className="capture-feedback capture-feedback--error" role="alert">
            <strong>{message}</strong>
            {errors.length > 0 ? (
              <ul>
                {errors.map((error) => (
                  <li key={error}>{validationMessages[error] ?? error}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <Button
          type="submit"
          tone="primary"
          disabled={pending || !confirmed}
        >
          {pending ? "Concluindo…" : "Confirmar conclusão"}
        </Button>
      </form>
    </details>
  );
}
