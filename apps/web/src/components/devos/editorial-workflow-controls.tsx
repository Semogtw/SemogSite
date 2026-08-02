import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import type { EditorialSensitiveReviewChecks } from "@semogtw/domain";
import { Button } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { readCookie } from "../../client/cookies";
import {
  approveEditorialRevisionFn,
  submitEditorialForReviewFn,
} from "../../server/devos-editorial";

type EditorialWorkflowControlsProps = {
  documentId: string;
  revisionId: string;
  expectedUpdatedAt: string;
  workflowStatus: "draft" | "in_review" | "approved";
};

type Feedback = {
  success: boolean;
  message: string;
};

const emptyChecks: EditorialSensitiveReviewChecks = {
  credentials: false,
  personalData: false,
  operationalMetadata: false,
  externalLinks: false,
  legalAttribution: false,
  factualClaims: false,
  markdownSafety: false,
};

const checkItems: readonly {
  key: keyof EditorialSensitiveReviewChecks;
  label: string;
}[] = [
  {
    key: "credentials",
    label: "Nenhuma credencial, token, segredo ou chave aparece no conteúdo.",
  },
  {
    key: "personalData",
    label: "Dados pessoais e identificadores foram removidos ou autorizados.",
  },
  {
    key: "operationalMetadata",
    label: "Metadados internos, infraestrutura e detalhes operacionais são seguros.",
  },
  {
    key: "externalLinks",
    label: "Links externos foram verificados e apontam para destinos esperados.",
  },
  {
    key: "legalAttribution",
    label: "Licenças, autoria e atribuições legais estão corretas.",
  },
  {
    key: "factualClaims",
    label: "Afirmações factuais foram conferidas contra fontes confiáveis.",
  },
  {
    key: "markdownSafety",
    label: "Markdown e mídia incorporada não contêm HTML bruto ou payload ativo.",
  },
];

function readCsrfToken(): string | null {
  return readCookie(CSRF_COOKIE_NAME);
}

export function EditorialWorkflowControls({
  documentId,
  revisionId,
  expectedUpdatedAt,
  workflowStatus,
}: EditorialWorkflowControlsProps) {
  const router = useRouter();
  const submissionIdempotencyKey = useRef<string | null>(null);
  const approvalIdempotencyKey = useRef<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [checks, setChecks] = useState<EditorialSensitiveReviewChecks>({
    ...emptyChecks,
  });
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const allChecksComplete = Object.values(checks).every(Boolean);

  function resetApprovalAttempt() {
    approvalIdempotencyKey.current = null;
    setFeedback(null);
  }

  async function submitForReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!confirmed) {
      setFeedback({
        success: false,
        message: "Confirme conscientemente o envio da revisão atual.",
      });
      return;
    }

    const csrfToken = readCsrfToken();
    if (csrfToken === null) {
      setFeedback({
        success: false,
        message: "A sessão owner não pôde ser validada.",
      });
      return;
    }

    submissionIdempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      const response = await submitEditorialForReviewFn({
        data: {
          csrfToken,
          idempotencyKey: submissionIdempotencyKey.current,
          documentId,
          expectedUpdatedAt,
          confirmed: true,
        },
      });
      setFeedback({ success: response.ok, message: response.message });
      if (!response.ok) return;

      submissionIdempotencyKey.current = null;
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

  async function approveRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!allChecksComplete || !approvalConfirmed || reason.trim().length === 0) {
      setFeedback({
        success: false,
        message:
          "Conclua todo o checklist, informe o motivo e confirme a aprovação consciente.",
      });
      return;
    }

    const csrfToken = readCsrfToken();
    if (csrfToken === null) {
      setFeedback({
        success: false,
        message: "A sessão owner não pôde ser validada.",
      });
      return;
    }

    approvalIdempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      const response = await approveEditorialRevisionFn({
        data: {
          csrfToken,
          idempotencyKey: approvalIdempotencyKey.current,
          documentId,
          revisionId,
          expectedUpdatedAt,
          reason,
          notes,
          checks: {
            credentials: true,
            personalData: true,
            operationalMetadata: true,
            externalLinks: true,
            legalAttribution: true,
            factualClaims: true,
            markdownSafety: true,
          },
          confirmed: true,
        },
      });
      setFeedback({ success: response.ok, message: response.message });
      if (!response.ok) return;

      approvalIdempotencyKey.current = null;
      setApprovalConfirmed(false);
      await router.invalidate();
    } catch {
      setFeedback({
        success: false,
        message:
          "A aprovação falhou. A identidade da tentativa será reutilizada no próximo envio.",
      });
    } finally {
      setPending(false);
    }
  }

  if (workflowStatus === "in_review") {
    return (
      <form
        className="editorial-form editorial-workflow-control"
        onSubmit={approveRevision}
      >
        <p className="editorial-safety-note">
          A aprovação fica vinculada à revisão e ao hash exibidos no preview.
          Ela não publica o conteúdo.
        </p>
        <fieldset className="editorial-review-checklist">
          <legend>Checklist sensível obrigatório</legend>
          {checkItems.map((item) => (
            <label className="capture-confirmation" key={item.key}>
              <input
                type="checkbox"
                checked={checks[item.key]}
                disabled={pending}
                onChange={(event) => {
                  resetApprovalAttempt();
                  setChecks((current) => ({
                    ...current,
                    [item.key]: event.target.checked,
                  }));
                }}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </fieldset>
        <label>
          Motivo da aprovação
          <textarea
            value={reason}
            maxLength={2_000}
            rows={3}
            disabled={pending}
            required
            onChange={(event) => {
              resetApprovalAttempt();
              setReason(event.target.value);
            }}
          />
        </label>
        <label>
          Notas de revisão <span className="muted-copy">(opcional)</span>
          <textarea
            value={notes}
            maxLength={4_000}
            rows={4}
            disabled={pending}
            onChange={(event) => {
              resetApprovalAttempt();
              setNotes(event.target.value);
            }}
          />
        </label>
        <label className="capture-confirmation">
          <input
            type="checkbox"
            checked={approvalConfirmed}
            disabled={pending}
            onChange={(event) => {
              resetApprovalAttempt();
              setApprovalConfirmed(event.target.checked);
            }}
          />
          <span>
            Confirmo que analisei esta revisão exata e assumo a aprovação
            registrada no histórico owner-only.
          </span>
        </label>
        <Button
          type="submit"
          tone="primary"
          disabled={
            pending ||
            !allChecksComplete ||
            !approvalConfirmed ||
            reason.trim().length === 0
          }
        >
          {pending ? "Aprovando…" : "Aprovar revisão analisada"}
        </Button>
        {feedback ? <WorkflowFeedback feedback={feedback} /> : null}
      </form>
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
    <form
      className="editorial-form editorial-workflow-control"
      onSubmit={submitForReview}
    >
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
      {feedback ? <WorkflowFeedback feedback={feedback} /> : null}
    </form>
  );
}

function WorkflowFeedback({ feedback }: { feedback: Feedback }) {
  return (
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
  );
}
