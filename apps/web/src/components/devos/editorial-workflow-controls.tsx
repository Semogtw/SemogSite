import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import type { EditorialSensitiveReviewChecks } from "@semogtw/domain";
import { Button } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { readCookie } from "../../client/cookies";
import {
  approveEditorialRevisionFn,
  publishEditorialRevisionFn,
  reopenEditorialDraftFn,
  rollbackEditorialPublicationFn,
  submitEditorialForReviewFn,
  withdrawEditorialPublicationFn,
} from "../../server/devos-editorial";

type RollbackCandidate = {
  id: string;
  sequence: number;
  title: string;
  contentHash: string;
};

type EditorialWorkflowControlsProps = {
  documentId: string;
  revisionId: string;
  expectedUpdatedAt: string;
  workflowStatus: "draft" | "in_review" | "approved";
  publicationStatus: "unpublished" | "published" | "withdrawn";
  publishedRevisionId: string | null;
  rollbackCandidates: readonly RollbackCandidate[];
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
  publicationStatus,
  publishedRevisionId,
  rollbackCandidates,
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
  const publicationManagement = (
    <PublicationManagement
      documentId={documentId}
      revisionId={revisionId}
      expectedUpdatedAt={expectedUpdatedAt}
      workflowStatus={workflowStatus}
      publicationStatus={publicationStatus}
      publishedRevisionId={publishedRevisionId}
      rollbackCandidates={rollbackCandidates}
    />
  );

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
      <div className="editorial-workflow-stack">
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
        <ReopenDraftForm
          documentId={documentId}
          expectedUpdatedAt={expectedUpdatedAt}
        />
        {publicationManagement}
      </div>
    );
  }

  if (workflowStatus === "approved") {
    return (
      <div className="editorial-workflow-stack">
        <p className="editorial-safety-note">
          A revisão aprovada está vinculada ao hash exibido no preview.
          Publicação continua sendo uma ação separada.
        </p>
        <ReopenDraftForm
          documentId={documentId}
          expectedUpdatedAt={expectedUpdatedAt}
        />
        {publicationManagement}
      </div>
    );
  }

  return (
    <div className="editorial-workflow-stack">
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
      {publicationManagement}
    </div>
  );
}

function PublicationManagement({
  documentId,
  revisionId,
  expectedUpdatedAt,
  workflowStatus,
  publicationStatus,
  publishedRevisionId,
  rollbackCandidates,
}: EditorialWorkflowControlsProps) {
  const canPublish =
    workflowStatus === "approved" && publishedRevisionId !== revisionId;
  const canWithdraw = publicationStatus === "published";

  if (!canPublish && !canWithdraw && rollbackCandidates.length === 0) {
    return null;
  }

  return (
    <div className="editorial-workflow-stack">
      {canPublish ? (
        <PublishRevisionForm
          documentId={documentId}
          revisionId={revisionId}
          expectedUpdatedAt={expectedUpdatedAt}
        />
      ) : null}
      {canWithdraw ? (
        <WithdrawPublicationForm
          documentId={documentId}
          expectedUpdatedAt={expectedUpdatedAt}
        />
      ) : null}
      {rollbackCandidates.length > 0 ? (
        <RollbackPublicationForm
          documentId={documentId}
          expectedUpdatedAt={expectedUpdatedAt}
          candidates={rollbackCandidates}
        />
      ) : null}
    </div>
  );
}

function PublishRevisionForm({
  documentId,
  revisionId,
  expectedUpdatedAt,
}: {
  documentId: string;
  revisionId: string;
  expectedUpdatedAt: string;
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!confirmed) {
      setFeedback({
        success: false,
        message: "Confirme conscientemente a publicação desta revisão exata.",
      });
      return;
    }
    const csrfToken = readCsrfToken();
    if (csrfToken === null) {
      setFeedback({ success: false, message: "A sessão owner não pôde ser validada." });
      return;
    }

    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      const response = await publishEditorialRevisionFn({
        data: {
          csrfToken,
          idempotencyKey: idempotencyKey.current,
          documentId,
          revisionId,
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
          "A publicação falhou. A identidade da tentativa será reutilizada no próximo envio.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="editorial-form editorial-workflow-control" onSubmit={publish}>
      <p className="muted-copy">
        A publicação projeta somente a revisão e a aprovação vinculadas ao hash
        analisado. Ela não altera o histórico imutável.
      </p>
      <label className="capture-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={pending}
          onChange={(event) => {
            idempotencyKey.current = null;
            setFeedback(null);
            setConfirmed(event.target.checked);
          }}
        />
        <span>
          Confirmo que esta revisão aprovada pode se tornar a projeção pública.
        </span>
      </label>
      <Button type="submit" tone="primary" disabled={pending || !confirmed}>
        {pending ? "Publicando…" : "Publicar revisão aprovada"}
      </Button>
      {feedback ? <WorkflowFeedback feedback={feedback} /> : null}
    </form>
  );
}

function WithdrawPublicationForm({
  documentId,
  expectedUpdatedAt,
}: {
  documentId: string;
  expectedUpdatedAt: string;
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function resetAttempt() {
    idempotencyKey.current = null;
    setFeedback(null);
  }

  async function withdraw(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!confirmed || reason.trim().length === 0) {
      setFeedback({
        success: false,
        message: "Informe o motivo e confirme conscientemente a retirada.",
      });
      return;
    }
    const csrfToken = readCsrfToken();
    if (csrfToken === null) {
      setFeedback({ success: false, message: "A sessão owner não pôde ser validada." });
      return;
    }

    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      const response = await withdrawEditorialPublicationFn({
        data: {
          csrfToken,
          idempotencyKey: idempotencyKey.current,
          documentId,
          expectedUpdatedAt,
          reason,
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
          "A retirada falhou. A identidade da tentativa será reutilizada no próximo envio.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="editorial-form editorial-workflow-control" onSubmit={withdraw}>
      <p className="editorial-safety-note">
        A retirada remove a projeção pública, mas preserva revisões, aprovação e
        o último apontador publicado para auditoria.
      </p>
      <label>
        Motivo da retirada
        <textarea
          value={reason}
          maxLength={2_000}
          rows={3}
          disabled={pending}
          required
          onChange={(event) => {
            resetAttempt();
            setReason(event.target.value);
          }}
        />
      </label>
      <label className="capture-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={pending}
          onChange={(event) => {
            resetAttempt();
            setConfirmed(event.target.checked);
          }}
        />
        <span>Confirmo a retirada imediata desta projeção pública.</span>
      </label>
      <Button
        type="submit"
        tone="danger"
        disabled={pending || !confirmed || reason.trim().length === 0}
      >
        {pending ? "Retirando…" : "Retirar projeção pública"}
      </Button>
      {feedback ? <WorkflowFeedback feedback={feedback} /> : null}
    </form>
  );
}

function RollbackPublicationForm({
  documentId,
  expectedUpdatedAt,
  candidates,
}: {
  documentId: string;
  expectedUpdatedAt: string;
  candidates: readonly RollbackCandidate[];
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [revisionId, setRevisionId] = useState(candidates[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function resetAttempt() {
    idempotencyKey.current = null;
    setFeedback(null);
  }

  async function rollback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!confirmed || revisionId.length === 0 || reason.trim().length === 0) {
      setFeedback({
        success: false,
        message:
          "Selecione uma revisão, informe o motivo e confirme conscientemente o rollback.",
      });
      return;
    }
    const csrfToken = readCsrfToken();
    if (csrfToken === null) {
      setFeedback({ success: false, message: "A sessão owner não pôde ser validada." });
      return;
    }

    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      const response = await rollbackEditorialPublicationFn({
        data: {
          csrfToken,
          idempotencyKey: idempotencyKey.current,
          documentId,
          revisionId,
          expectedUpdatedAt,
          reason,
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
          "O rollback falhou. A identidade da tentativa será reutilizada no próximo envio.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="editorial-form editorial-workflow-control" onSubmit={rollback}>
      <p className="muted-copy">
        Somente revisões históricas com checklist completo e aprovação para o
        mesmo hash aparecem nesta lista.
      </p>
      <label>
        Revisão aprovada para restaurar
        <select
          value={revisionId}
          disabled={pending}
          required
          onChange={(event) => {
            resetAttempt();
            setRevisionId(event.target.value);
          }}
        >
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              r{candidate.sequence} · {candidate.title} · {candidate.contentHash.slice(0, 12)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Motivo do rollback
        <textarea
          value={reason}
          maxLength={2_000}
          rows={3}
          disabled={pending}
          required
          onChange={(event) => {
            resetAttempt();
            setReason(event.target.value);
          }}
        />
      </label>
      <label className="capture-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={pending}
          onChange={(event) => {
            resetAttempt();
            setConfirmed(event.target.checked);
          }}
        />
        <span>
          Confirmo que a revisão histórica selecionada deve substituir apenas a
          projeção pública, preservando a revisão de trabalho atual.
        </span>
      </label>
      <Button
        type="submit"
        disabled={
          pending ||
          !confirmed ||
          revisionId.length === 0 ||
          reason.trim().length === 0
        }
      >
        {pending ? "Restaurando…" : "Restaurar revisão aprovada"}
      </Button>
      {feedback ? <WorkflowFeedback feedback={feedback} /> : null}
    </form>
  );
}

function ReopenDraftForm({
  documentId,
  expectedUpdatedAt,
}: {
  documentId: string;
  expectedUpdatedAt: string;
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function resetAttempt() {
    idempotencyKey.current = null;
    setFeedback(null);
  }

  async function reopen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!confirmed || reason.trim().length === 0) {
      setFeedback({
        success: false,
        message: "Informe o motivo e confirme conscientemente a reabertura.",
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

    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      const response = await reopenEditorialDraftFn({
        data: {
          csrfToken,
          idempotencyKey: idempotencyKey.current,
          documentId,
          expectedUpdatedAt,
          reason,
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
          "A reabertura falhou. A identidade da tentativa será reutilizada no próximo envio.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="editorial-form editorial-workflow-control" onSubmit={reopen}>
      <p className="muted-copy">
        Reabrir remove o apontador de aprovação ativa e libera a criação de uma
        nova revisão imutável. O histórico anterior permanece preservado.
      </p>
      <label>
        Motivo da reabertura
        <textarea
          value={reason}
          maxLength={2_000}
          rows={3}
          disabled={pending}
          required
          onChange={(event) => {
            resetAttempt();
            setReason(event.target.value);
          }}
        />
      </label>
      <label className="capture-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={pending}
          onChange={(event) => {
            resetAttempt();
            setConfirmed(event.target.checked);
          }}
        />
        <span>
          Confirmo que esta revisão precisa voltar ao estado editável e que o
          motivo ficará registrado na auditoria.
        </span>
      </label>
      <Button
        type="submit"
        disabled={pending || !confirmed || reason.trim().length === 0}
      >
        {pending ? "Reabrindo…" : "Reabrir como rascunho"}
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
