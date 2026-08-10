import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import type {
  EditorialDocumentKind,
  EditorialPublicationStatus,
  EditorialRedirectEventSnapshot,
} from "@semogtw/domain";
import { Button, Status, Surface } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { PrivateApiError } from "../../lib/private-api-client";
import { createPrivateDevosBrowserClient } from "../../lib/private-devos-browser-client";

const privateDevos = createPrivateDevosBrowserClient({
  csrfCookieName: CSRF_COOKIE_NAME,
});

type Props = {
  documentId: string;
  kind: EditorialDocumentKind;
  canonicalSlug: string;
  publicationStatus: EditorialPublicationStatus;
  redirects: readonly EditorialRedirectEventSnapshot[];
};

type Feedback = { success: boolean; message: string };

function latestBySlug(
  events: readonly EditorialRedirectEventSnapshot[],
): readonly EditorialRedirectEventSnapshot[] {
  const seen = new Set<string>();
  const latest: EditorialRedirectEventSnapshot[] = [];
  for (const event of events) {
    if (seen.has(event.sourceSlug)) continue;
    seen.add(event.sourceSlug);
    latest.push(event);
  }
  return latest;
}

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  return (
    <p role={feedback.success ? "status" : "alert"} className="editorial-safety-note">
      {feedback.message}
    </p>
  );
}

async function refreshAfterCanonicalConflict(
  error: PrivateApiError,
  invalidate: () => Promise<void>,
) {
  if (
    error.code === "TARGET_NOT_PUBLISHED" ||
    error.code === "REDIRECT_NOT_ACTIVE" ||
    error.code === "CANONICAL_CONFLICT" ||
    error.code === "CONFLICT"
  ) {
    await invalidate();
  }
}

function RevokeAliasForm({
  event,
  documentId,
  kind,
}: {
  event: EditorialRedirectEventSnapshot;
  documentId: string;
  kind: EditorialDocumentKind;
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function finishSuccess(message: string) {
    setFeedback({ success: true, message });
    idempotencyKey.current = null;
    setReason("");
    setConfirmed(false);
    await router.invalidate();
  }

  async function revoke(eventSubmit: FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault();
    if (pending || reason.trim().length === 0 || !confirmed) return;
    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      const response = await privateDevos.editorial.revokeRedirect({
        idempotencyKey: idempotencyKey.current,
        targetDocumentId: documentId,
        kind,
        sourceSlug: event.sourceSlug,
        reason,
        confirmed: true,
      });
      await finishSuccess(
        response.duplicate
          ? "Esta revogação já havia sido registrada."
          : "Alias revogado com evento auditado.",
      );
    } catch (error) {
      if (error instanceof PrivateApiError) {
        setFeedback({ success: false, message: error.message });
        await refreshAfterCanonicalConflict(error, () => router.invalidate());
      } else if (
        error instanceof Error &&
        error.message === "Private mutation requires a CSRF token."
      ) {
        setFeedback({ success: false, message: "A sessão owner não pôde ser validada." });
      } else {
        setFeedback({
          success: false,
          message: "A revogação falhou. A identidade da tentativa será reutilizada.",
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="editorial-form editorial-workflow-control" onSubmit={revoke}>
      <strong>/{event.sourceSlug}</strong>
      <label>
        Motivo da revogação
        <textarea
          rows={2}
          maxLength={2_000}
          value={reason}
          disabled={pending}
          required
          onChange={(change) => {
            idempotencyKey.current = null;
            setReason(change.target.value);
          }}
        />
      </label>
      <label className="capture-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={pending}
          onChange={(change) => {
            idempotencyKey.current = null;
            setConfirmed(change.target.checked);
          }}
        />
        <span>Confirmo que esta URL antiga deve deixar de redirecionar.</span>
      </label>
      <Button type="submit" tone="danger" disabled={pending || !confirmed || reason.trim().length === 0}>
        {pending ? "Revogando…" : "Revogar alias"}
      </Button>
      {feedback ? <FeedbackMessage feedback={feedback} /> : null}
    </form>
  );
}

export function EditorialRedirectControls({
  documentId,
  kind,
  canonicalSlug,
  publicationStatus,
  redirects,
}: Props) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [sourceSlug, setSourceSlug] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const latest = useMemo(() => latestBySlug(redirects), [redirects]);
  const active = latest.filter((event) => event.action === "created");

  async function finishSuccess(message: string) {
    setFeedback({ success: true, message });
    idempotencyKey.current = null;
    setSourceSlug("");
    setReason("");
    setConfirmed(false);
    await router.invalidate();
  }

  async function create(eventSubmit: FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault();
    if (pending || sourceSlug.trim().length === 0 || reason.trim().length === 0 || !confirmed) return;
    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      const response = await privateDevos.editorial.createRedirect({
        idempotencyKey: idempotencyKey.current,
        targetDocumentId: documentId,
        kind,
        sourceSlug,
        reason,
        confirmed: true,
      });
      await finishSuccess(
        response.duplicate
          ? "Este alias já havia sido registrado."
          : "Alias criado com evento auditado.",
      );
    } catch (error) {
      if (error instanceof PrivateApiError) {
        setFeedback({ success: false, message: error.message });
        await refreshAfterCanonicalConflict(error, () => router.invalidate());
      } else if (
        error instanceof Error &&
        error.message === "Private mutation requires a CSRF token."
      ) {
        setFeedback({ success: false, message: "A sessão owner não pôde ser validada." });
      } else {
        setFeedback({
          success: false,
          message: "A criação falhou. A identidade da tentativa será reutilizada.",
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface className="editorial-section">
      <div className="surface-heading-row">
        <div>
          <p className="eyebrow">URLs históricas</p>
          <h2>Aliases editoriais auditados</h2>
          <p className="muted-copy">
            O slug canônico permanece /{canonicalSlug}. Cada criação ou revogação adiciona um evento imutável.
          </p>
        </div>
        <Status tone={active.length > 0 ? "info" : "neutral"}>{active.length} ativos</Status>
      </div>

      {publicationStatus === "published" ? (
        <form className="editorial-form editorial-workflow-control" onSubmit={create}>
          <h3>Criar alias auditado</h3>
          <label>
            Slug antigo
            <input
              value={sourceSlug}
              maxLength={120}
              pattern="[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?"
              required
              disabled={pending}
              onChange={(change) => {
                idempotencyKey.current = null;
                setSourceSlug(change.target.value);
              }}
            />
          </label>
          <label>
            Motivo auditável
            <textarea
              rows={3}
              maxLength={2_000}
              value={reason}
              required
              disabled={pending}
              onChange={(change) => {
                idempotencyKey.current = null;
                setReason(change.target.value);
              }}
            />
          </label>
          <label className="capture-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={pending}
              onChange={(change) => {
                idempotencyKey.current = null;
                setConfirmed(change.target.checked);
              }}
            />
            <span>Confirmo que esta URL antiga deve redirecionar permanentemente para a publicação canônica atual.</span>
          </label>
          <Button type="submit" tone="primary" disabled={pending || !confirmed || sourceSlug.trim().length === 0 || reason.trim().length === 0}>
            {pending ? "Criando…" : "Criar alias auditado"}
          </Button>
          {feedback ? <FeedbackMessage feedback={feedback} /> : null}
        </form>
      ) : (
        <p className="editorial-safety-note">Novos aliases só podem ser criados enquanto o destino está publicado.</p>
      )}

      {active.length > 0 ? (
        <div className="editorial-workflow-stack">
          <h3>Aliases ativos</h3>
          {active.map((event) => (
            <RevokeAliasForm key={event.id} event={event} documentId={documentId} kind={kind} />
          ))}
        </div>
      ) : null}

      <div>
        <h3>Histórico de aliases</h3>
        {redirects.length === 0 ? (
          <p className="muted-copy">Nenhum alias foi registrado para este documento.</p>
        ) : (
          <ol className="editorial-history-list">
            {redirects.map((event) => (
              <li key={event.id}>
                <div>
                  <strong>/{event.sourceSlug} · {event.action === "created" ? "criado" : "revogado"}</strong>
                  <p>{event.reason}</p>
                </div>
                <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString("pt-BR", { timeZone: "America/Bahia" })}</time>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Surface>
  );
}
