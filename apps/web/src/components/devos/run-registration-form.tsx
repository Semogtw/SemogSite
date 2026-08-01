import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import type { RepositoryTargetProjectOption } from "@semogtw/database";
import type { CooperativeRunOrigin } from "@semogtw/domain";
import { Button } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { readCookie } from "../../client/cookies";
import { registerCooperativeRunFn } from "../../server/devos-run-registration";

const originOptions: ReadonlyArray<{
  value: CooperativeRunOrigin;
  label: string;
}> = [
  { value: "chatgpt", label: "ChatGPT" },
  { value: "codex", label: "Codex" },
  { value: "manual", label: "Registro manual" },
  { value: "automation", label: "Automação" },
  { value: "other", label: "Outro participante" },
];

const staleOptions = [
  { value: 15 * 60, label: "15 minutos" },
  { value: 30 * 60, label: "30 minutos" },
  { value: 60 * 60, label: "1 hora" },
  { value: 2 * 60 * 60, label: "2 horas" },
  { value: 6 * 60 * 60, label: "6 horas" },
  { value: 24 * 60 * 60, label: "24 horas" },
] as const;

export function RunRegistrationForm({
  projects,
}: {
  projects: readonly RepositoryTargetProjectOption[];
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [actorLabel, setActorLabel] = useState("ChatGPT");
  const [origin, setOrigin] = useState<CooperativeRunOrigin>("chatgpt");
  const [phase, setPhase] = useState("");
  const [branch, setBranch] = useState("");
  const [initialSummary, setInitialSummary] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [staleAfterSeconds, setStaleAfterSeconds] = useState(60 * 60);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    success: boolean;
  } | null>(null);

  function invalidateRetryIdentity() {
    idempotencyKey.current = null;
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!confirmed) {
      setFeedback({
        success: false,
        message: "Confirme que este é um relato cooperativo consciente.",
      });
      return;
    }

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
      const response = await registerCooperativeRunFn({
        data: {
          csrfToken,
          idempotencyKey: idempotencyKey.current,
          projectId: projectId.length === 0 ? null : projectId,
          title,
          actorLabel,
          origin,
          phase: phase.trim().length === 0 ? null : phase,
          branch: branch.trim().length === 0 ? null : branch,
          initialSummary,
          nextAction,
          staleAfterSeconds,
          confirmed: true,
        },
      });
      setFeedback({ message: response.message, success: response.ok });
      if (!response.ok) return;

      idempotencyKey.current = null;
      setTitle("");
      setPhase("");
      setInitialSummary("");
      setNextAction("");
      setConfirmed(false);
      await router.invalidate();
    } catch {
      setFeedback({
        success: false,
        message:
          "O registro falhou. A mesma chave será reutilizada na próxima tentativa.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="run-registration-form" onSubmit={register}>
      <div className="run-registration-form__grid">
        <label>
          Projeto opcional
          <select
            value={projectId}
            disabled={pending}
            onChange={(event) => {
              setProjectId(event.target.value);
              invalidateRetryIdentity();
            }}
          >
            <option value="">Sem projeto associado</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} · {project.slug}
              </option>
            ))}
          </select>
        </label>
        <label>
          Origem do relato
          <select
            value={origin}
            disabled={pending}
            onChange={(event) => {
              const value = event.target.value as CooperativeRunOrigin;
              setOrigin(value);
              if (value === "chatgpt") setActorLabel("ChatGPT");
              else if (value === "codex") setActorLabel("Codex");
              invalidateRetryIdentity();
            }}
          >
            {originOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Participante
          <input
            required
            maxLength={100}
            value={actorLabel}
            disabled={pending}
            onChange={(event) => {
              setActorLabel(event.target.value);
              invalidateRetryIdentity();
            }}
          />
        </label>
        <label>
          Freshness após
          <select
            value={staleAfterSeconds}
            disabled={pending}
            onChange={(event) => {
              setStaleAfterSeconds(Number(event.target.value));
              invalidateRetryIdentity();
            }}
          >
            {staleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Título da execução
        <input
          required
          maxLength={200}
          value={title}
          disabled={pending}
          placeholder="Ex.: Implementar ledger cooperativo"
          onChange={(event) => {
            setTitle(event.target.value);
            invalidateRetryIdentity();
          }}
        />
      </label>

      <div className="run-registration-form__grid">
        <label>
          Fase opcional
          <input
            maxLength={200}
            value={phase}
            disabled={pending}
            onChange={(event) => {
              setPhase(event.target.value);
              invalidateRetryIdentity();
            }}
          />
        </label>
        <label>
          Branch opcional
          <input
            maxLength={255}
            autoComplete="off"
            value={branch}
            disabled={pending}
            placeholder="develop/foundation-bootstrap"
            onChange={(event) => {
              setBranch(event.target.value);
              invalidateRetryIdentity();
            }}
          />
        </label>
      </div>

      <label>
        Estado inicial relatado
        <textarea
          rows={4}
          required
          maxLength={2_000}
          value={initialSummary}
          disabled={pending}
          onChange={(event) => {
            setInitialSummary(event.target.value);
            invalidateRetryIdentity();
          }}
        />
      </label>

      <label>
        Próxima ação segura
        <textarea
          rows={3}
          required
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
          Confirmo que estou registrando um relato cooperativo. O DevOS não
          inicia, observa ou controla uma conversa do ChatGPT por causa deste
          registro.
        </span>
      </label>

      <Button
        type="submit"
        tone="primary"
        disabled={
          pending ||
          !confirmed ||
          title.trim().length === 0 ||
          actorLabel.trim().length === 0 ||
          initialSummary.trim().length === 0 ||
          nextAction.trim().length === 0
        }
      >
        {pending ? "Registrando…" : "Registrar execução"}
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
