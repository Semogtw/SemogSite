import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { Button } from "@semogtw/ui";
import { useState, type FormEvent } from "react";
import { PrivateApiError } from "../../lib/private-api-client";
import { createPrivateDevosBrowserClient } from "../../lib/private-devos-browser-client";
import type {
  SessionHandoffResult,
  SessionHandoffTestsStatus,
} from "../../lib/private-session-handoff-commands";
import { parseCommitList } from "./session-handoff-input";

const privateDevos = createPrivateDevosBrowserClient({
  csrfCookieName: CSRF_COOKIE_NAME,
});

const validationMessages: Record<string, string> = {
  CONFIRMATION_REQUIRED: "Confirme conscientemente o registro do handoff.",
  TITLE_REQUIRED: "Informe um título.",
  TITLE_TOO_LONG: "O título deve ter no máximo 160 caracteres.",
  SESSION_DATE_INVALID: "A data da sessão não pôde ser validada.",
  BRANCH_TOO_LONG: "O nome da branch deve ter no máximo 255 caracteres.",
  COMMIT_INVALID: "Use somente SHAs Git de 7 a 40 caracteres hexadecimais.",
  COMPLETED_SUMMARY_REQUIRED: "Descreva o trabalho concluído.",
  COMPLETED_SUMMARY_TOO_LONG: "O resumo concluído está muito longo.",
  TESTS_SUMMARY_REQUIRED: "Descreva os testes executados ou por que não rodaram.",
  TESTS_SUMMARY_TOO_LONG: "O resumo de testes está muito longo.",
  BLOCKERS_TOO_LONG: "A descrição dos bloqueios está muito longa.",
  NEXT_STEP_REQUIRED: "Informe a próxima ação exata.",
  NEXT_STEP_TOO_LONG: "A próxima ação está muito longa.",
  REASON_REQUIRED: "Explique por que o handoff está sendo registrado.",
  REASON_TOO_LONG: "A razão deve ter no máximo 500 caracteres.",
};

function validationErrors(details: unknown): readonly string[] {
  return Array.isArray(details) && details.every((item) => typeof item === "string")
    ? details
    : [];
}

export function SessionHandoffForm() {
  const [title, setTitle] = useState("");
  const [branch, setBranch] = useState("");
  const [commitsText, setCommitsText] = useState("");
  const [completedSummary, setCompletedSummary] = useState("");
  const [testsStatus, setTestsStatus] = useState<SessionHandoffTestsStatus>("not_run");
  const [testsSummary, setTestsSummary] = useState("");
  const [blockers, setBlockers] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [result, setResult] = useState<SessionHandoffResult>("significant");
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
      setMessage("Confirme conscientemente o registro do handoff.");
      return;
    }

    setPending(true);
    setMessage(null);
    setErrors([]);
    setSaved(false);
    try {
      await privateDevos.handoffs.record({
        projectId: null,
        title,
        branch: branch.trim().length === 0 ? null : branch,
        commits: [...parseCommitList(commitsText)],
        completedSummary,
        testsStatus,
        testsSummary,
        blockers,
        nextStep,
        result,
        reason,
        confirmed: true,
      });

      setSaved(true);
      setMessage("Handoff registrado com auditoria.");
      setTitle("");
      setBranch("");
      setCommitsText("");
      setCompletedSummary("");
      setTestsStatus("not_run");
      setTestsSummary("");
      setBlockers("");
      setNextStep("");
      setResult("significant");
      setReason("");
      setConfirmed(false);
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
        setMessage("Não foi possível salvar este handoff.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="capture-form" onSubmit={submit}>
      <div className="capture-field-grid">
        <label>
          Título da sessão
          <input
            value={title}
            maxLength={160}
            required
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          Branch
          <input
            value={branch}
            maxLength={255}
            placeholder="develop/foundation-bootstrap"
            onChange={(event) => setBranch(event.target.value)}
          />
        </label>
      </div>

      <label>
        Commits
        <textarea
          value={commitsText}
          rows={3}
          placeholder="abcdef1, 1234567890abcdef"
          onChange={(event) => setCommitsText(event.target.value)}
        />
        <span className="capture-help">
          SHAs de 7 a 40 caracteres, separados por vírgula, espaço ou nova linha.
        </span>
      </label>

      <label>
        Trabalho concluído
        <textarea
          value={completedSummary}
          maxLength={5_000}
          rows={5}
          required
          onChange={(event) => setCompletedSummary(event.target.value)}
        />
      </label>

      <div className="capture-field-grid">
        <label>
          Estado dos testes
          <select
            value={testsStatus}
            onChange={(event) =>
              setTestsStatus(event.target.value as SessionHandoffTestsStatus)
            }
          >
            <option value="not_run">Não executados</option>
            <option value="partial">Parciais</option>
            <option value="passed">Aprovados</option>
            <option value="failed">Falharam</option>
            <option value="blocked">Bloqueados</option>
          </select>
        </label>
        <label>
          Resultado da sessão
          <select
            value={result}
            onChange={(event) => setResult(event.target.value as SessionHandoffResult)}
          >
            <option value="significant">Avanço significativo</option>
            <option value="partial">Avanço parcial</option>
            <option value="maintenance">Manutenção</option>
            <option value="no_change">Sem alteração</option>
            <option value="failed">Falha</option>
          </select>
        </label>
      </div>

      <label>
        Evidência dos testes
        <textarea
          value={testsSummary}
          maxLength={2_000}
          rows={4}
          required
          placeholder="Comandos e resultados observados, ou motivo exato do bloqueio."
          onChange={(event) => setTestsSummary(event.target.value)}
        />
      </label>

      <label>
        Bloqueios
        <textarea
          value={blockers}
          maxLength={2_000}
          rows={3}
          placeholder="Deixe vazio quando não houver bloqueios."
          onChange={(event) => setBlockers(event.target.value)}
        />
      </label>

      <label>
        Próxima ação exata
        <textarea
          value={nextStep}
          maxLength={1_000}
          rows={4}
          required
          onChange={(event) => setNextStep(event.target.value)}
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
          Confirmo que este handoff representa o estado observado da sessão e
          que nenhuma verificação foi marcada como aprovada sem evidência.
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
        {pending ? "Salvando…" : "Registrar handoff"}
      </Button>
    </form>
  );
}
