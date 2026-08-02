import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import type { CooperativeRunCommandKind } from "@semogtw/domain";
import { Button } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { readCookie } from "../../client/cookies";
import { queueCooperativeRunCommandFn } from "../../server/devos-run-commands";

const commandOptions: ReadonlyArray<{
  value: CooperativeRunCommandKind;
  label: string;
}> = [
  { value: "continue", label: "Continuar" },
  { value: "pause", label: "Pausar cooperativamente" },
  { value: "cancel", label: "Cancelar cooperativamente" },
  { value: "reprioritize", label: "Repriorizar" },
  { value: "request_checkpoint", label: "Solicitar checkpoint" },
  { value: "provide_context", label: "Fornecer contexto" },
];

const checkpointOptions = [
  { value: "commits", label: "Commits" },
  { value: "tests", label: "Testes" },
  { value: "blockers", label: "Bloqueios" },
  { value: "next_step", label: "Próximo passo" },
] as const;

type CheckpointSection = (typeof checkpointOptions)[number]["value"];

export function RunCommandQueueForm({ runId }: { runId: string }) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [kind, setKind] =
    useState<CooperativeRunCommandKind>("request_checkpoint");
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high">(
    "normal",
  );
  const [include, setInclude] = useState<CheckpointSection[]>([
    "commits",
    "tests",
    "blockers",
    "next_step",
  ]);
  const [expiresAt, setExpiresAt] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    success: boolean;
  } | null>(null);

  function toggleCheckpointSection(section: CheckpointSection) {
    setInclude((current) =>
      current.includes(section)
        ? current.filter((item) => item !== section)
        : [...current, section],
    );
  }

  async function queue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!confirmed || summary.trim().length === 0) {
      setFeedback({
        success: false,
        message: "Informe um resumo e confirme conscientemente o comando.",
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

    let normalizedExpiry: string | null = null;
    if (expiresAt.length > 0) {
      const parsed = new Date(expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        setFeedback({ success: false, message: "A expiração é inválida." });
        return;
      }
      normalizedExpiry = parsed.toISOString();
    }

    idempotencyKey.current ??= crypto.randomUUID();
    const common = {
      csrfToken,
      runId,
      summary: summary.trim(),
      expiresAt: normalizedExpiry,
      idempotencyKey: idempotencyKey.current,
      confirmed: true as const,
    };

    setPending(true);
    setFeedback(null);
    try {
      const response =
        kind === "continue"
          ? await queueCooperativeRunCommandFn({
              data: {
                ...common,
                kind,
                note: detail.trim().length === 0 ? null : detail.trim(),
              },
            })
          : kind === "pause" || kind === "cancel"
            ? await queueCooperativeRunCommandFn({
                data: {
                  ...common,
                  kind,
                  reason: detail.trim(),
                },
              })
            : kind === "reprioritize"
              ? await queueCooperativeRunCommandFn({
                  data: {
                    ...common,
                    kind,
                    priority,
                    note: detail.trim().length === 0 ? null : detail.trim(),
                  },
                })
              : kind === "request_checkpoint"
                ? await queueCooperativeRunCommandFn({
                    data: { ...common, kind, include },
                  })
                : await queueCooperativeRunCommandFn({
                    data: {
                      ...common,
                      kind,
                      context: detail.trim(),
                    },
                  });

      setFeedback({ message: response.message, success: response.ok });
      if (!response.ok) return;

      idempotencyKey.current = null;
      setSummary("");
      setDetail("");
      setExpiresAt("");
      setConfirmed(false);
      await router.invalidate();
    } catch {
      setFeedback({
        success: false,
        message:
          "O comando não pôde ser enfileirado. A mesma chave será reutilizada na próxima tentativa.",
      });
    } finally {
      setPending(false);
    }
  }

  const detailRequired =
    kind === "pause" || kind === "cancel" || kind === "provide_context";
  const detailLabel =
    kind === "pause" || kind === "cancel"
      ? "Motivo"
      : kind === "provide_context"
        ? "Contexto autorizado"
        : "Nota opcional";
  const detailMaxLength =
    kind === "provide_context"
      ? 4_000
      : kind === "pause" || kind === "cancel"
        ? 2_000
        : 1_000;

  return (
    <form className="run-command-form" onSubmit={queue}>
      <div className="run-command-form__grid">
        <label>
          Tipo
          <select
            value={kind}
            disabled={pending}
            onChange={(event) => {
              setKind(event.target.value as CooperativeRunCommandKind);
              setDetail("");
              idempotencyKey.current = null;
            }}
          >
            {commandOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Expira em (opcional)
          <input
            type="datetime-local"
            value={expiresAt}
            disabled={pending}
            onChange={(event) => {
              setExpiresAt(event.target.value);
              idempotencyKey.current = null;
            }}
          />
        </label>
      </div>

      <label>
        Resumo do comando
        <input
          required
          maxLength={1_000}
          value={summary}
          disabled={pending}
          placeholder="O que o agente deve saber ao consultar a fila?"
          onChange={(event) => {
            setSummary(event.target.value);
            idempotencyKey.current = null;
          }}
        />
      </label>

      {kind === "reprioritize" ? (
        <label>
          Prioridade
          <select
            value={priority}
            disabled={pending}
            onChange={(event) => {
              setPriority(event.target.value as "low" | "normal" | "high");
              idempotencyKey.current = null;
            }}
          >
            <option value="low">Baixa</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
          </select>
        </label>
      ) : null}

      {kind === "request_checkpoint" ? (
        <fieldset className="run-command-form__checks">
          <legend>Incluir no checkpoint</legend>
          {checkpointOptions.map((option) => (
            <label key={option.value}>
              <input
                type="checkbox"
                checked={include.includes(option.value)}
                disabled={pending}
                onChange={() => {
                  toggleCheckpointSection(option.value);
                  idempotencyKey.current = null;
                }}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {kind !== "request_checkpoint" ? (
        <label>
          {detailLabel}
          <textarea
            rows={4}
            required={detailRequired}
            maxLength={detailMaxLength}
            value={detail}
            disabled={pending}
            placeholder={
              kind === "provide_context"
                ? "Somente contexto necessário; nunca cole tokens, senhas ou cookies."
                : undefined
            }
            onChange={(event) => {
              setDetail(event.target.value);
              idempotencyKey.current = null;
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
          Confirmo este comando privado e entendo que ele só será recebido
          quando um agente autorizado consultar a fila; não é uma mensagem
          instantânea enviada ao ChatGPT.
        </span>
      </label>

      <Button
        type="submit"
        tone="primary"
        disabled={
          pending ||
          !confirmed ||
          summary.trim().length === 0 ||
          (detailRequired && detail.trim().length === 0)
        }
      >
        {pending ? "Enfileirando…" : "Enfileirar comando"}
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
