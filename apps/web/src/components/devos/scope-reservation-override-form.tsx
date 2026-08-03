import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { Button } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { readCookie } from "../../client/cookies";
import { overrideScopeReservationFn } from "../../server/devos-scope-reservation-override";

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !confirmed || reason.trim().length === 0) return;
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken === null) {
      setFeedback({ success: false, message: "Não foi possível validar esta sessão." });
      return;
    }

    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      const response = await overrideScopeReservationFn({
        data: {
          csrfToken,
          idempotencyKey: idempotencyKey.current,
          reservationId,
          expectedVersion,
          reason,
          confirmed: true,
        },
      });
      setFeedback({ success: response.ok, message: response.message });
      if (!response.ok) return;
      idempotencyKey.current = null;
      setReason("");
      setConfirmed(false);
      await router.invalidate();
    } catch {
      setFeedback({
        success: false,
        message: "O encerramento falhou. A próxima tentativa preservará a identidade.",
      });
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
        tone="secondary"
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
