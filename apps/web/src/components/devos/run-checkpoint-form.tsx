import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import type { CooperativeRunCheckpointTestsStatus } from "@semogtw/domain";
import { Button } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { readCookie } from "../../client/cookies";
import { recordCooperativeRunCheckpointFn } from "../../server/devos-run-checkpoints";

const testsStatusOptions: ReadonlyArray<{
  value: CooperativeRunCheckpointTestsStatus;
  label: string;
}> = [
  { value: "not_run", label: "Não executados" },
  { value: "partial", label: "Parciais" },
  { value: "passed", label: "Aprovados" },
  { value: "failed", label: "Falharam" },
  { value: "blocked", label: "Bloqueados" },
];

function parseCommits(value: string): string[] {
  return value
    .split(/[\s,;]+/u)
    .map((commit) => commit.trim().toLowerCase())
    .filter((commit, index, values) => commit.length > 0 && values.indexOf(commit) === index);
}

export function RunCheckpointForm({
  run,
}: {
  run: {
    id: string;
    progress: number;
    phase: string | null;
    branch: string | null;
    nextAction: string | null;
    updatedAt: string;
  };
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [progress, setProgress] = useState(run.progress);
  const [phase, setPhase] = useState(run.phase ?? "");
  const [branch, setBranch] = useState(run.branch ?? "");
  const [summary, setSummary] = useState("");
  const [commitsText, setCommitsText] = useState("");
  const [testsStatus, setTestsStatus] =
    useState<CooperativeRunCheckpointTestsStatus>("not_run");
  const [testsSummary, setTestsSummary] = useState("Não executados.");
  const [blockers, setBlockers] = useState("");
  const [nextStep, setNextStep] = useState(run.nextAction ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    success: boolean;
  } | null>(null);

  function changed() {
    idempotencyKey.current = null;
  }

  async function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !confirmed) return;

    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken === null) {
      setFeedback({
        success: false,
        message: "Não foi possível validar esta sessão.",
      });
      return;
    }

    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      const response = await recordCooperativeRunCheckpointFn({
        data: {
          csrfToken,
          runId: run.id,
          expectedUpdatedAt: run.updatedAt,
          idempotencyKey: idempotencyKey.current,
          progress,
          phase: phase.trim().length === 0 ? null : phase.trim(),
          branch: branch.trim().length === 0 ? null : branch.trim(),
          summary: summary.trim(),
          commits: parseCommits(commitsText),
          testsStatus,
          testsSummary: testsSummary.trim(),
          blockers: blockers.trim(),
          nextStep: nextStep.trim(),
          confirmed: true,
        },
      });

      setFeedback({ message: response.message, success: response.ok });
      if (!response.ok) return;

      idempotencyKey.current = null;
      setSummary("");
      setCommitsText("");
      setBlockers("");
      setConfirmed(false);
      await router.invalidate();
    } catch {
      setFeedback({
        success: false,
        message:
          "O checkpoint falhou. A mesma chave será reutilizada na próxima tentativa.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="run-checkpoint-form" onSubmit={record}>
      <div className="run-registration-form__grid">
        <label>
          Progresso relatado
          <input
            type="number"
            min={run.progress}
            max={100}
            step={1}
            value={progress}
            disabled={pending}
            onChange={(event) => {
              setProgress(Number(event.target.value));
              changed();
            }}
          />
        </label>
        <label>
          Status dos testes
          <select
            value={testsStatus}
            disabled={pending}
            onChange={(event) => {
              const value = event.target.value as CooperativeRunCheckpointTestsStatus;
              setTestsStatus(value);
              if (value === "not_run") setTestsSummary("Não executados.");
              changed();
            }}
          >
            {testsStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fase
          <input
            maxLength={200}
            value={phase}
            disabled={pending}
            onChange={(event) => {
              setPhase(event.target.value);
              changed();
            }}
          />
        </label>
        <label>
          Branch
          <input
            maxLength={255}
            value={branch}
            disabled={pending}
            onChange={(event) => {
              setBranch(event.target.value);
              changed();
            }}
          />
        </label>
      </div>

      <label>
        Entrega concluída neste checkpoint
        <textarea
          rows={4}
          required
          maxLength={2_000}
          value={summary}
          disabled={pending}
          onChange={(event) => {
            setSummary(event.target.value);
            changed();
          }}
        />
      </label>

      <label>
        Commits observados
        <textarea
          rows={2}
          maxLength={6_500}
          value={commitsText}
          disabled={pending}
          placeholder="Um SHA por linha ou separados por vírgula"
          onChange={(event) => {
            setCommitsText(event.target.value);
            changed();
          }}
        />
      </label>

      <label>
        Resultado real dos testes
        <textarea
          rows={3}
          required
          maxLength={2_000}
          value={testsSummary}
          disabled={pending}
          onChange={(event) => {
            setTestsSummary(event.target.value);
            changed();
          }}
        />
      </label>

      <label>
        Bloqueios atuais
        <textarea
          rows={3}
          maxLength={2_000}
          value={blockers}
          disabled={pending}
          onChange={(event) => {
            setBlockers(event.target.value);
            changed();
          }}
        />
      </label>

      <label>
        Próximo passo
        <textarea
          rows={3}
          required
          maxLength={1_000}
          value={nextStep}
          disabled={pending}
          onChange={(event) => {
            setNextStep(event.target.value);
            changed();
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
          Confirmo que commits e testes acima são evidência observada; valores
          não executados estão marcados explicitamente como tal.
        </span>
      </label>

      <Button
        type="submit"
        tone="primary"
        disabled={
          pending ||
          !confirmed ||
          summary.trim().length === 0 ||
          testsSummary.trim().length === 0 ||
          nextStep.trim().length === 0
        }
      >
        {pending ? "Registrando…" : "Registrar checkpoint com evidência"}
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
