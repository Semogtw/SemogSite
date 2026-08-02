import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { Button } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { readCookie } from "../../client/cookies";
import { submitEditorialForReviewFn } from "../../server/devos-editorial";

type EditorialWorkflowControlsProps = {
  documentId: string;
  expectedUpdatedAt: string;
  workflowStatus: "draft" | "in_review" | "approved";
};

export function EditorialWorkflowControls({
  documentId,
  expectedUpdatedAt,
  workflowStatus,
}: EditorialWorkflowControlsProps) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!confirmed) {
      setFeedback({
        success: false,
        message: "Confirme conscientemente o envio da revisão atual.",
      });
      return;
    }

    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken === null) {
      setFeedback({
        success: false,
        message: "A sessão owner não pôde ser validada.",
      });
      return;
    }

    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      const response = await submitEditorialForReviewFn({
        data: {
          csrfToken,
          idempotencyKey: idempotencyKey.current,
          documentId,
          expectedUpdatedAt,
          confirmed: true,
        },
      });
      setFeedback({ success: response.ok, message: response.message });
      if (!response.ok) return;

      idempotencyKey.current = null;
      setConfirmed(false);
      await router.invalidate();
    } catch {
      setFeedback({
        success: false,
        message:
          "O envio falhou. A identidade da tentativa será reutilizada no próximo envio.",
      });
    } finally {
      setPending(false);
    }
  }

  if (workflowStatus === "in_review") {
    return (
      <p className="editorial-safety-note">
        A revisão de trabalho está bloqueada para análise sensível. Conclua o
        checklist antes de aprovar ou reabra como rascunho para editar.
      </p>
    );
  }

  if (workflowStatus === "approved") {
    return (
      <p className="editorial-safety-note">
        A revisão aprovada está vinculada ao hash exibido no preview. Publicação
        continua sendo uma ação separada.
      </p>
    );
  }

  return (
    <form className="editorial-form editorial-workflow-control" onSubmit={submit}>
      <p className="muted-copy">
        O envio congela a revisão de trabalho para análise. Nada será publicado,
        e qualquer mudança posterior exigirá reabertura explícita como rascunho.
      </p>
      <label className="capture-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={pending}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>
          Confirmo que esta revisão está pronta para o checklist de dados
          sensíveis, links, atribuição, fatos e segurança do Markdown.
        </span>
      </label>
      <Button type="submit" tone="primary" disabled={pending || !confirmed}>
        {pending ? "Enviando…" : "Enviar para revisão"}
      </Button>
      {feedback ? (
        <p
          className={
            feedback.success
              ? "editorial-form__feedback editorial-form__feedback--success"
              : "editorial-form__feedback editorial-form__feedback--error"
          }
          role="status"
        >
          {feedback.message}
        </p>
      ) : null}
    </form>
  );
}
