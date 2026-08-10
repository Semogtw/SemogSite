import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { Button } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { PrivateApiError } from "../../lib/private-api-client";
import { createPrivateDevosBrowserClient } from "../../lib/private-devos-browser-client";

const privateDevos = createPrivateDevosBrowserClient({
  csrfCookieName: CSRF_COOKIE_NAME,
});

export function ScopeReservationOverrideForm({
  reservationId,
  expectedVersion,
}: {
  reservationId: string;
  expectedVersion: number;
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  async function finishSuccess(message: string) {
    setFeedback({ success: true, message });
    idempotencyKey.current = null;
    setReason("");
    setConfirmed(false);
    await router.invalidate();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !confirmed || reason.trim().length === 0) return;

    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      await privateDevos.scopes.override({
        idempotencyKey: idempotencyKey.current,
        reservationId,
        expectedVersion,
        reason,
        confirmed: true,
      });
      await finishSuccess("Reserva encerrada com histórico preservado.");
    } catch (error) {
      if (error instanceof PrivateApiError) {
        if (error.code === "DUPLICATE") {
          await finishSuccess("Este encerramento já havia sido registrado.");
          return;
        }
        setFeedback({ success: false, message: error.message });
        if (
          error.code === "STALE_STATE" ||
          error.code === "NOT_FOUND" ||
          error.code === "INACTIVE"
        ) {
          await router.invalidate();
        }
      } else if (
        error instanceof Error &&
        error.message === "Private mutation requires a CSRF token."
      ) {
        setFeedback({ success: false, message: "Não foi possível validar esta sessão." });
      } else {
        setFeedback({
          success: false,
          message: "O encerramento falhou. A próxima tentativa preservará a identidade.",
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="run-command-form" onSubmit={submit}>
      <label>
        Motivo do encerramento
        <input
          required
          maxLength={500}
          value={reason}
          disabled={pending}
          placeholder="Ex.: sessão anterior expirou e o escopo será retomado"
          onChange={(event) => {
            setReason(event.target.value);
            idempotencyKey.current = null;
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
          Confirmo o encerramento explícito desta reserva e a preservação do histórico.
        </span>
      </label>
      <Button
        type="submit"
        tone="neutral"
        disabled={pending || !confirmed || reason.trim().length === 0}
      >
        {pending ? "Encerrando…" : "Encerrar reserva"}
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
