import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { Button, Status, Surface } from "@semogtw/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { readCookie } from "../client/cookies";
import { DevOSShell } from "../components/devos/devos-shell";
import { captureAttentionFn } from "../server/devos-capture";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/capture")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  head: () => ({
    meta: [
      { title: "Capturar — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: CapturePage,
});

type AttentionType =
  | "blocker"
  | "risk"
  | "decision"
  | "external_dependency"
  | "critical_test";
type AttentionImpact = "high" | "medium" | "low";

const validationMessages: Record<string, string> = {
  CONFIRMATION_REQUIRED: "Confirme conscientemente a criação do registro.",
  TITLE_REQUIRED: "Informe um título.",
  TITLE_TOO_LONG: "O título deve ter no máximo 160 caracteres.",
  NEXT_ACTION_REQUIRED: "Informe a próxima ação.",
  NEXT_ACTION_TOO_LONG: "A próxima ação deve ter no máximo 500 caracteres.",
  REASON_REQUIRED: "Explique por que o registro está sendo criado.",
  REASON_TOO_LONG: "A razão deve ter no máximo 500 caracteres.",
};

function CapturePage() {
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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken === null) {
      setSaved(false);
      setMessage("Não foi possível validar esta sessão.");
      return;
    }

    setPending(true);
    setMessage(null);
    setErrors([]);
    setSaved(false);
    try {
      const result = await captureAttentionFn({
        data: {
          csrfToken,
          type,
          impact,
          title,
          nextAction,
          reason,
          confirmed: confirmed as true,
        },
      });
      if (!result.ok) {
        setMessage(result.message);
        setErrors("errors" in result ? result.errors : []);
        return;
      }

      setSaved(true);
      setMessage(result.message);
      setTitle("");
      setNextAction("");
      setReason("");
      setConfirmed(false);
    } catch {
      setMessage("Não foi possível salvar esta alteração.");
    } finally {
      setPending(false);
    }
  }

  return (
    <DevOSShell activePath="/devos/more">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Entrada rápida</p>
          <h1>Capturar</h1>
        </div>
        <Status tone="info">Escrita auditada</Status>
      </header>

      <Surface className="capture-surface">
        <div className="capture-intro">
          <h2>Nova atenção</h2>
          <p>
            Registre um risco, bloqueio, decisão, dependência ou teste crítico.
            A criação exige confirmação e gera um evento de auditoria na mesma
            transação.
          </p>
        </div>

        <form className="capture-form" onSubmit={submit}>
          <div className="capture-field-grid">
            <label>
              Tipo
              <select
                value={type}
                onChange={(event) =>
                  setType(event.target.value as AttentionType)
                }
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
              Confirmo que este registro deve ser persistido e auditado como
              uma entrada manual do proprietário.
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
      </Surface>
    </DevOSShell>
  );
}
