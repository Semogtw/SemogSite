import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { Button } from "@semogtw/ui";
import { useState, type FormEvent } from "react";
import { PrivateApiError } from "../../lib/private-api-client";
import { createPrivateDevosBrowserClient } from "../../lib/private-devos-browser-client";
import type {
  AttentionImpact,
  AttentionType,
} from "../../lib/private-attention-commands";

const privateDevos = createPrivateDevosBrowserClient({
  csrfCookieName: CSRF_COOKIE_NAME,
});

const validationMessages: Record<string, string> = {
  CONFIRMATION_REQUIRED: "Confirme conscientemente a criação do registro.",
  TITLE_REQUIRED: "Informe um título.",
  TITLE_TOO_LONG: "O título deve ter no máximo 160 caracteres.",
  NEXT_ACTION_REQUIRED: "Informe a próxima ação.",
  NEXT_ACTION_TOO_LONG: "A próxima ação deve ter no máximo 500 caracteres.",
  REASON_REQUIRED: "Explique por que o registro está sendo criado.",
  REASON_TOO_LONG: "A razão deve ter no máximo 500 caracteres.",
};

export function AttentionCaptureForm() {
  const [type, setType] = useState<AttentionType>("risk");
  const [impact, setImpact] = useState<AttentionImpact>("medium");
  const [title, setTitle] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!confirmed) {
      setSaved(false);
      setMessage("Confirme conscientemente a criação do registro.");
      return;
    }

    setPending(true);
    setMessage(null);
    setErrors([]);
    setSaved(false);
    try {
      await privateDevos.attention.capture({
        type,
        impact,
        title,
        nextAction,
        reason,
        confirmed: true,
      });
      setSaved(true);
      setMessage("Atenção registrada e auditada.");
      setTitle("");
      setNextAction("");
      setReason("");
      setConfirmed(false);
    } catch (error) {
      if (error instanceof PrivateApiError) {
        setMessage(error.message);
        setErrors(
          error.code === "VALIDATION_FAILED" && Array.isArray(error.details)
            ? error.details.filter((item): item is string => typeof item === "string")
            : [],
        );
      } else if (
        error instanceof Error &&
        error.message === "Private mutation requires a CSRF token."
      ) {
        setMessage("Não foi possível validar esta sessão.");
      } else {
        setMessage("Não foi possível salvar esta alteração.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="capture-form" onSubmit={submit}>
      <div className="capture-field-grid">
        <label>
          Tipo
          <select
            value={type}
            onChange={(event) => setType(event.target.value as AttentionType)}
          >
            <option value="risk">Risco</option>
            <option value="blocker">Bloqueio</option>
            <option value="decision">Decisão</option>
            <option value="external_dependency">Dependência externa</option>
            <option value="critical_test">Teste crítico</option>
          </select>
        </label>
        <label>
          Impacto
          <select
            value={impact}
            onChange={(event) =>
              setImpact(event.target.value as AttentionImpact)
            }
          >
            <option value="high">Alto</option>
            <option value="medium">Médio</option>
            <option value="low">Baixo</option>
          </select>
        </label>
      </div>

      <label>
        Título
        <input
          value={title}
          maxLength={160}
          required
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <label>
        Próxima ação
        <textarea
          value={nextAction}
          maxLength={500}
          required
          rows={4}
          onChange={(event) => setNextAction(event.target.value)}
        />
      </label>

      <label>
        Razão da alteração
        <textarea
          value={reason}
          maxLength={500}
          required
          rows={3}
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
          Confirmo que este registro deve ser persistido e auditado como uma
          entrada manual do proprietário.
        </span>
      </label>

      {message ? (
        <div
          className={`capture-feedback ${saved ? "capture-feedback--success" : "capture-feedback--error"}`}
          role={saved ? "status" : "alert"}
        >
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
        tone="primary"
        type="submit"
        disabled={pending || !confirmed}
      >
        {pending ? "Salvando…" : "Registrar atenção"}
      </Button>
    </form>
  );
}
