import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import type { CooperativeRunStatus } from "@semogtw/domain";
import { Button } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { PrivateApiError } from "../../lib/private-api-client";
import { createPrivateDevosBrowserClient } from "../../lib/private-devos-browser-client";

const privateDevos = createPrivateDevosBrowserClient({
  csrfCookieName: CSRF_COOKIE_NAME,
});

type TransitionKind =
  | "heartbeat"
  | "block"
  | "resume"
  | "complete"
  | "fail"
  | "cancel";

type TransitionOption = { value: TransitionKind; label: string };

const runningOptions: readonly TransitionOption[] = [
  { value: "heartbeat", label: "Atualizar heartbeat" },
  { value: "block", label: "Marcar bloqueio" },
  { value: "complete", label: "Concluir" },
  { value: "fail", label: "Marcar falha" },
  { value: "cancel", label: "Cancelar" },
];
const blockedOptions: readonly TransitionOption[] = [
  { value: "heartbeat", label: "Atualizar heartbeat" },
  { value: "resume", label: "Retomar" },
  { value: "fail", label: "Marcar falha" },
  { value: "cancel", label: "Cancelar" },
];

export function RunTransitionForm({
  run,
}: {
  run: {
    id: string;
    status: CooperativeRunStatus;
    progress: number;
    phase: string | null;
    branch: string | null;
    nextAction: string | null;
    updatedAt: string;
  };
}) {
  const router = useRouter();
  const options = run.status === "blocked" ? blockedOptions : runningOptions;
  const idempotencyKey = useRef<string | null>(null);
  const [kind, setKind] = useState<TransitionKind>(options[0]?.value ?? "heartbeat");
  const [progress, setProgress] = useState(run.progress);
  const [summary, setSummary] = useState("");
  const [phase, setPhase] = useState(run.phase ?? "");
  const [branch, setBranch] = useState(run.branch ?? "");
  const [nextAction, setNextAction] = useState(run.nextAction ?? "");
  const [blocker, setBlocker] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    success: boolean;
  } | null>(null);

  function changed() {
    idempotencyKey.current = null;
  }

  async function finishSuccess(message: string) {
    setFeedback({ message, success: true });
    idempotencyKey.current = null;
    setSummary("");
    setBlocker("");
    setReason("");
    setConfirmed(false);
    await router.invalidate();
  }

  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !confirmed) return;

    idempotencyKey.current ??= crypto.randomUUID();
    const common = {
      runId: run.id,
      expectedUpdatedAt: run.updatedAt,
      idempotencyKey: idempotencyKey.current,
      confirmed: true as const,
    };

    setPending(true);
    setFeedback(null);
    try {
      const result =
        kind === "heartbeat"
          ? await privateDevos.runs.transition({
              ...common,
              kind,
              summary: summary.trim().length === 0 ? null : summary.trim(),
              phase: phase.trim().length === 0 ? null : phase.trim(),
              branch: branch.trim().length === 0 ? null : branch.trim(),
              nextAction:
                nextAction.trim().length === 0 ? null : nextAction.trim(),
            })
          : kind === "block"
            ? await privateDevos.runs.transition({
                ...common,
                kind,
                progress,
                blocker: blocker.trim(),
                nextAction: nextAction.trim(),
                summary:
                  summary.trim().length === 0 ? null : summary.trim(),
              })
            : kind === "resume"
              ? await privateDevos.runs.transition({
                  ...common,
                  kind,
                  progress,
                  summary: summary.trim(),
                  phase: phase.trim().length === 0 ? null : phase.trim(),
                  branch: branch.trim().length === 0 ? null : branch.trim(),
                  nextAction: nextAction.trim(),
                })
              : kind === "complete"
                ? await privateDevos.runs.transition({
                    ...common,
                    kind,
                    progress: 100,
                    summary: summary.trim(),
                  })
                : kind === "fail"
                  ? await privateDevos.runs.transition({
                      ...common,
                      kind,
                      reason: reason.trim(),
                      summary: summary.trim(),
                    })
                  : await privateDevos.runs.transition({
                      ...common,
                      kind,
                      reason: reason.trim(),
                      summary:
                        summary.trim().length === 0 ? null : summary.trim(),
                    });

      await finishSuccess(
        result.status === "completed"
          ? "Execução concluída e registrada no ledger."
          : result.status === "failed"
            ? "Falha registrada no ledger da execução."
            : result.status === "cancelled"
              ? "Cancelamento registrado no ledger da execução."
              : "Transição registrada no estado canônico.",
      );
    } catch (error) {
      if (error instanceof PrivateApiError) {
        if (error.code === "DUPLICATE") {
          await finishSuccess("Esta transição já havia sido registrada.");
          return;
        }
        setFeedback({ success: false, message: error.message });
        if (
          error.code === "STALE_STATE" ||
          error.code === "TERMINAL_RUN" ||
          error.code === "RUN_NOT_FOUND" ||
          error.code === "INVALID_CURRENT_STATE" ||
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
          message:
            "A transição falhou. A mesma chave será reutilizada na próxima tentativa.",
        });
      }
    } finally {
      setPending(false);
    }
  }

  const needsProgress = kind === "block" || kind === "resume";
  const needsSummary =
    kind === "resume" || kind === "complete" || kind === "fail";
  const needsNextAction = kind === "block" || kind === "resume";
  const showsPhase = kind === "heartbeat" || kind === "resume";
  const destructive = kind === "complete" || kind === "fail" || kind === "cancel";

  return (
    <form className="run-transition-form" onSubmit={transition}>
      <div className="run-registration-form__grid">
        <label>
          Transição
          <select
            value={kind}
            disabled={pending}
            onChange={(event) => {
              setKind(event.target.value as TransitionKind);
              changed();
            }}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {needsProgress ? (
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
        ) : null}
      </div>

      <label>
        Resumo {needsSummary ? "obrigatório" : "opcional"}
        <textarea
          rows={3}
          required={needsSummary}
          maxLength={2_000}
          value={summary}
          disabled={pending}
          onChange={(event) => {
            setSummary(event.target.value);
            changed();
          }}
        />
      </label>

      {showsPhase ? (
        <div className="run-registration-form__grid">
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
      ) : null}

      {needsNextAction || kind === "heartbeat" ? (
        <label>
          Próxima ação {needsNextAction ? "obrigatória" : "opcional"}
          <textarea
            rows={2}
            required={needsNextAction}
            maxLength={1_000}
            value={nextAction}
            disabled={pending}
            onChange={(event) => {
              setNextAction(event.target.value);
              changed();
            }}
          />
        </label>
      ) : null}

      {kind === "block" ? (
        <label>
          Bloqueio
          <textarea
            rows={3}
            required
            maxLength={2_000}
            value={blocker}
            disabled={pending}
            onChange={(event) => {
              setBlocker(event.target.value);
              changed();
            }}
          />
        </label>
      ) : null}

      {kind === "fail" || kind === "cancel" ? (
        <label>
          Motivo
          <textarea
            rows={3}
            required
            maxLength={2_000}
            value={reason}
            disabled={pending}
            onChange={(event) => {
              setReason(event.target.value);
              changed();
            }}
          />
        </label>
      ) : null}

      <label className="capture-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={pending}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>
          Confirmo que esta transição descreve o estado cooperativamente
          relatado{destructive ? " e pode tornar o run terminal" : ""}.
        </span>
      </label>

      <Button
        type="submit"
        tone={destructive ? "danger" : "primary"}
        disabled={
          pending ||
          !confirmed ||
          (needsSummary && summary.trim().length === 0) ||
          (needsNextAction && nextAction.trim().length === 0) ||
          (kind === "block" && blocker.trim().length === 0) ||
          ((kind === "fail" || kind === "cancel") && reason.trim().length === 0)
        }
      >
        {pending ? "Registrando…" : "Registrar transição"}
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
