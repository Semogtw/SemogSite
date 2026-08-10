import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { Button } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { PrivateApiError } from "../../lib/private-api-client";
import { createPrivateDevosBrowserClient } from "../../lib/private-devos-browser-client";
import type { VerificationFailureClassification } from "../../lib/private-verification-obligation-commands";

const privateDevos = createPrivateDevosBrowserClient({
  csrfCookieName: CSRF_COOKIE_NAME,
});

type Outcome = "passed" | "failed" | "blocked";
type FailureClassification = VerificationFailureClassification;

function splitUrls(value: string): string[] {
  return [...new Set(value.split(/[\n,]/u).map((item) => item.trim()).filter(Boolean))];
}

export function VerificationObligationResultForm({
  obligationId,
  expectedVersion,
  initialNextAction,
}: {
  obligationId: string;
  expectedVersion: number;
  initialNextAction: string;
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>("passed");
  const [classification, setClassification] =
    useState<FailureClassification>("code_failure");
  const [summary, setSummary] = useState("");
  const [evidenceUrls, setEvidenceUrls] = useState("");
  const [nextAction, setNextAction] = useState(initialNextAction);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  function invalidateRetryIdentity() {
    idempotencyKey.current = null;
  }

  async function finishSuccess(message: string) {
    setFeedback({ success: true, message });
    idempotencyKey.current = null;
    setSummary("");
    setEvidenceUrls("");
    setConfirmed(false);
    await router.invalidate();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !confirmed) return;

    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      const result = await privateDevos.verification.recordResult({
        idempotencyKey: idempotencyKey.current,
        obligationId,
        expectedVersion,
        outcome,
        failureClassification: outcome === "passed" ? null : classification,
        resultSummary: summary,
        evidenceUrls: splitUrls(evidenceUrls),
        nextAction,
        confirmed: true,
      });
      await finishSuccess(
        result.gateExecuted === false
          ? "Resultado observado registrado. Nenhum gate foi executado por esta ação."
          : "Resultado observado registrado.",
      );
    } catch (error) {
      if (error instanceof PrivateApiError) {
        if (error.code === "DUPLICATE") {
          await finishSuccess("Este resultado já havia sido registrado.");
          return;
        }
        setFeedback({ success: false, message: error.message });
        if (
          error.code === "STALE_STATE" ||
          error.code === "TERMINAL_OBLIGATION" ||
          error.code === "NOT_FOUND" ||
          error.code === "PROJECT_NOT_FOUND" ||
          error.code === "REPOSITORY_NOT_FOUND" ||
          error.code === "RUN_NOT_FOUND" ||
          error.code === "STAGE_NOT_FOUND" ||
          error.code === "CONFLICT"
        ) {
          await router.invalidate();
        }
      } else if (
        error instanceof Error &&
        error.message === "Private mutation requires a CSRF token."
      ) {
        setFeedback({
          success: false,
          message: "Não foi possível validar esta sessão.",
        });
      } else {
        setFeedback({
          success: false,
          message: "O resultado falhou. A próxima tentativa preservará a identidade.",
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="run-command-form" onSubmit={submit}>
      <div className="run-command-form__grid">
        <label>
          Resultado observado
          <select
            value={outcome}
            disabled={pending}
            onChange={(event) => {
              setOutcome(event.target.value as Outcome);
              invalidateRetryIdentity();
            }}
          >
            <option value="passed">Aprovado</option>
            <option value="failed">Falhou</option>
            <option value="blocked">Bloqueado</option>
          </select>
        </label>
        {outcome === "passed" ? null : (
          <label>
            Classificação
            <select
              value={classification}
              disabled={pending}
              onChange={(event) => {
                setClassification(event.target.value as FailureClassification);
                invalidateRetryIdentity();
              }}
            >
              <option value="code_failure">Falha de código</option>
              <option value="environment_missing">Ambiente ausente</option>
              <option value="configuration">Configuração</option>
              <option value="external_dependency">Dependência externa</option>
              <option value="flaky">Flaky</option>
              <option value="timeout">Timeout</option>
              <option value="quota">Quota/limite</option>
              <option value="unknown">Ainda desconhecida</option>
            </select>
          </label>
        )}
      </div>
      <label>
        Resumo observado
        <textarea
          required
          rows={2}
          maxLength={2_000}
          value={summary}
          disabled={pending}
          onChange={(event) => {
            setSummary(event.target.value);
            invalidateRetryIdentity();
          }}
        />
      </label>
      <label>
        Evidências HTTPS opcionais
        <textarea
          rows={2}
          value={evidenceUrls}
          disabled={pending}
          placeholder="Uma URL por linha"
          onChange={(event) => {
            setEvidenceUrls(event.target.value);
            invalidateRetryIdentity();
          }}
        />
      </label>
      <label>
        Próxima ação
        <textarea
          required
          rows={2}
          maxLength={1_000}
          value={nextAction}
          disabled={pending}
          onChange={(event) => {
            setNextAction(event.target.value);
            invalidateRetryIdentity();
          }}
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
          Confirmo que este resultado foi realmente observado e que a classificação não foi inferida por conveniência.
        </span>
      </label>
      <Button
        type="submit"
        tone="neutral"
        disabled={
          pending ||
          !confirmed ||
          summary.trim().length === 0 ||
          nextAction.trim().length === 0
        }
      >
        {pending ? "Registrando…" : "Registrar resultado"}
      </Button>
      {feedback ? (
        <p
          className={
            feedback.success
              ? "run-command-form__feedback run-command-form__feedback--success"
              : "run-command-form__feedback run-command-form__feedback--error"
          }
          role="status"
        >
          {feedback.message}
        </p>
      ) : null}
    </form>
  );
}
