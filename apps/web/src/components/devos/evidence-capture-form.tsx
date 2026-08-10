import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { Button } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { PrivateApiError } from "../../lib/private-api-client";
import { createPrivateDevosBrowserClient } from "../../lib/private-devos-browser-client";
import type {
  EvidenceKind,
  EvidenceStatus,
} from "../../lib/private-evidence-commands";

const privateDevos = createPrivateDevosBrowserClient({
  csrfCookieName: CSRF_COOKIE_NAME,
});

type StageOption = {
  id: string;
  title: string;
};

const validationMessages: Record<string, string> = {
  CONFIRMATION_REQUIRED: "Confirme conscientemente o registro da evidência.",
  PROJECT_ID_REQUIRED: "O projeto não pôde ser identificado.",
  PROJECT_ID_TOO_LONG: "O identificador do projeto é inválido.",
  STAGE_ID_TOO_LONG: "O identificador da etapa é inválido.",
  KIND_INVALID: "Selecione um tipo de evidência permitido.",
  STATUS_INVALID: "Selecione um estado de evidência permitido.",
  TITLE_REQUIRED: "Informe um título.",
  TITLE_TOO_LONG: "O título deve ter no máximo 200 caracteres.",
  URL_INVALID: "Use uma URL HTTPS sem credenciais embutidas.",
  EXTERNAL_ID_TOO_LONG: "O identificador externo está muito longo.",
  SUMMARY_REQUIRED: "Descreva o que foi observado.",
  SUMMARY_TOO_LONG: "O resumo está muito longo.",
  OCCURRED_AT_INVALID: "O horário da evidência não pôde ser validado.",
  REASON_REQUIRED: "Explique por que a evidência está sendo registrada.",
  REASON_TOO_LONG: "A razão deve ter no máximo 500 caracteres.",
};

function validationErrors(details: unknown): readonly string[] {
  return Array.isArray(details) && details.every((item) => typeof item === "string")
    ? details
    : [];
}

export function EvidenceCaptureForm({
  projectId,
  stages,
}: {
  projectId: string;
  stages: readonly StageOption[];
}) {
  const router = useRouter();
  const [stageId, setStageId] = useState("");
  const [kind, setKind] = useState<EvidenceKind>("manual_note");
  const [status, setStatus] = useState<EvidenceStatus>("observed");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<readonly string[]>([]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!confirmed) {
      setSaved(false);
      setMessage("Confirme conscientemente o registro da evidência.");
      return;
    }

    setPending(true);
    setSaved(false);
    setMessage(null);
    setErrors([]);
    try {
      await privateDevos.evidence.record({
        projectId,
        stageId: stageId.length === 0 ? null : stageId,
        kind,
        title,
        url: url.trim().length === 0 ? null : url,
        externalId: null,
        status,
        summary,
        reason,
        confirmed: true,
      });

      setSaved(true);
      setMessage("Evidência registrada com auditoria.");
      setStageId("");
      setKind("manual_note");
      setStatus("observed");
      setTitle("");
      setUrl("");
      setSummary("");
      setReason("");
      setConfirmed(false);
      await router.invalidate();
    } catch (error) {
      if (error instanceof PrivateApiError) {
        setMessage(error.message);
        setErrors(validationErrors(error.details));
      } else if (
        error instanceof Error &&
        error.message === "Private mutation requires a CSRF token."
      ) {
        setMessage("Não foi possível validar esta sessão.");
      } else {
        setMessage("Não foi possível salvar esta evidência.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="evidence-capture">
      <summary>Adicionar evidência manual</summary>
      <form className="capture-form" onSubmit={submit}>
        <div className="capture-field-grid">
          <label>
            Tipo
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as EvidenceKind)}
            >
              <option value="manual_note">Nota manual</option>
              <option value="test">Teste</option>
              <option value="commit">Commit</option>
              <option value="pull_request">Pull request</option>
              <option value="issue">Issue</option>
              <option value="workflow_run">Workflow</option>
              <option value="document">Documento</option>
            </select>
          </label>
          <label>
            Estado observado
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as EvidenceStatus)
              }
            >
              <option value="observed">Observado</option>
              <option value="passed">Aprovado</option>
              <option value="failed">Falhou</option>
              <option value="pending">Pendente</option>
              <option value="superseded">Substituído</option>
            </select>
          </label>
        </div>

        <label>
          Etapa relacionada
          <select
            value={stageId}
            onChange={(event) => setStageId(event.target.value)}
          >
            <option value="">Projeto em geral</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.title}
              </option>
            ))}
          </select>
        </label>

        <label>
          Título
          <input
            value={title}
            maxLength={200}
            required
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label>
          URL HTTPS
          <input
            type="url"
            inputMode="url"
            value={url}
            maxLength={2_048}
            placeholder="https://..."
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>

        <label>
          Resumo observado
          <textarea
            value={summary}
            maxLength={5_000}
            rows={4}
            required
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>

        <label>
          Razão do registro
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
            Confirmo que o estado selecionado corresponde ao resultado
            observado e que a evidência deve ser persistida com auditoria.
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
          type="submit"
          tone="primary"
          disabled={pending || !confirmed}
        >
          {pending ? "Salvando…" : "Registrar evidência"}
        </Button>
      </form>
    </details>
  );
}
