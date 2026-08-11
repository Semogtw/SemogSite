import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { Button } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { PrivateApiError } from "../../lib/private-api-client";
import { createPrivateDevosBrowserClient } from "../../lib/private-devos-browser-client";

const privateDevos = createPrivateDevosBrowserClient({
  csrfCookieName: CSRF_COOKIE_NAME,
});

type WorkflowRepositoryOption = {
  id: string;
  projectId: string | null;
  fullName: string;
  branch: string;
};

function splitValues(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,]/u)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function feedbackClass(success: boolean): string {
  return success
    ? "run-command-form__feedback run-command-form__feedback--success"
    : "run-command-form__feedback run-command-form__feedback--error";
}

export function ScopeReservationForm({
  repositories,
}: {
  repositories: readonly WorkflowRepositoryOption[];
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [repositoryId, setRepositoryId] = useState(repositories[0]?.id ?? "");
  const selectedRepository = repositories.find(
    (item) => item.id === repositoryId,
  );
  const [branch, setBranch] = useState(selectedRepository?.branch ?? "");
  const [kind, setKind] = useState<
    "repository" | "directory" | "files" | "issue" | "stage" | "custom"
  >("directory");
  const [patterns, setPatterns] = useState("");
  const [holderLabel, setHolderLabel] = useState("ChatGPT");
  const [purpose, setPurpose] = useState("");
  const [ttlSeconds, setTtlSeconds] = useState(60 * 60);
  const [acknowledgeOverlap, setAcknowledgeOverlap] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  function invalidateRetryIdentity() {
    idempotencyKey.current = null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !confirmed || selectedRepository === undefined) return;
    const normalizedPatterns =
      kind === "repository" ? ["**"] : splitValues(patterns);
    if (normalizedPatterns.length === 0) {
      setFeedback({
        success: false,
        message: "Informe ao menos um caminho ou identificador de escopo.",
      });
      return;
    }

    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      await privateDevos.scopes.acquire({
        idempotencyKey: idempotencyKey.current,
        projectId: selectedRepository.projectId,
        repositoryId: selectedRepository.id,
        runId: null,
        branch,
        kind,
        patterns: normalizedPatterns,
        holderLabel,
        purpose,
        ttlSeconds,
        acknowledgeOverlap,
        confirmed: true,
      });
      setFeedback({
        success: true,
        message: "Escopo reservado de forma cooperativa.",
      });
      idempotencyKey.current = null;
      setPatterns("");
      setPurpose("");
      setAcknowledgeOverlap(false);
      setConfirmed(false);
      await router.invalidate();
    } catch (error) {
      if (error instanceof PrivateApiError) {
        setFeedback({ success: false, message: error.message });
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
            "A reserva falhou. A próxima tentativa reutilizará a mesma identidade.",
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="run-registration-form" onSubmit={submit}>
      <div className="run-registration-form__grid">
        <label>
          Repositório
          <select
            required
            disabled={pending}
            value={repositoryId}
            onChange={(event) => {
              const nextId = event.target.value;
              const next = repositories.find((item) => item.id === nextId);
              setRepositoryId(nextId);
              setBranch(next?.branch ?? "");
              invalidateRetryIdentity();
            }}
          >
            {repositories.length === 0 ? (
              <option value="">Nenhum alvo ativo</option>
            ) : null}
            {repositories.map((repository) => (
              <option key={repository.id} value={repository.id}>
                {repository.fullName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Branch
          <input
            required
            maxLength={255}
            value={branch}
            disabled={pending}
            onChange={(event) => {
              setBranch(event.target.value);
              invalidateRetryIdentity();
            }}
          />
        </label>
        <label>
          Tipo de escopo
          <select
            value={kind}
            disabled={pending}
            onChange={(event) => {
              setKind(event.target.value as typeof kind);
              invalidateRetryIdentity();
            }}
          >
            <option value="directory">Diretórios</option>
            <option value="files">Arquivos</option>
            <option value="repository">Repositório inteiro</option>
            <option value="issue">Issue</option>
            <option value="stage">Etapa</option>
            <option value="custom">Identificador customizado</option>
          </select>
        </label>
        <label>
          Validade
          <select
            value={ttlSeconds}
            disabled={pending}
            onChange={(event) => {
              setTtlSeconds(Number(event.target.value));
              invalidateRetryIdentity();
            }}
          >
            <option value={30 * 60}>30 minutos</option>
            <option value={60 * 60}>1 hora</option>
            <option value={2 * 60 * 60}>2 horas</option>
            <option value={6 * 60 * 60}>6 horas</option>
            <option value={24 * 60 * 60}>24 horas</option>
          </select>
        </label>
      </div>

      {kind === "repository" ? null : (
        <label>
          Caminhos ou identificadores
          <textarea
            required
            rows={3}
            value={patterns}
            disabled={pending}
            placeholder={
              kind === "directory"
                ? "packages/domain/**\napps/web/src/routes/**"
                : "Um item por linha ou separado por vírgulas"
            }
            onChange={(event) => {
              setPatterns(event.target.value);
              invalidateRetryIdentity();
            }}
          />
        </label>
      )}

      <div className="run-registration-form__grid">
        <label>
          Participante
          <input
            required
            maxLength={100}
            value={holderLabel}
            disabled={pending}
            onChange={(event) => {
              setHolderLabel(event.target.value);
              invalidateRetryIdentity();
            }}
          />
        </label>
        <label>
          Finalidade
          <input
            required
            maxLength={1_000}
            value={purpose}
            disabled={pending}
            placeholder="Ex.: implementar a persistência dos gates"
            onChange={(event) => {
              setPurpose(event.target.value);
              invalidateRetryIdentity();
            }}
          />
        </label>
      </div>

      <label className="capture-confirmation">
        <input
          type="checkbox"
          checked={acknowledgeOverlap}
          disabled={pending}
          onChange={(event) => {
            setAcknowledgeOverlap(event.target.checked);
            invalidateRetryIdentity();
          }}
        />
        <span>
          Permitir sobreposição consciente quando outra reserva cobrir este
          escopo.
        </span>
      </label>
      <label className="capture-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={pending}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>
          Confirmo que esta é uma reserva cooperativa e não um lock do Git ou
          do sistema operacional.
        </span>
      </label>

      <Button
        type="submit"
        tone="primary"
        disabled={
          pending ||
          !confirmed ||
          selectedRepository === undefined ||
          branch.trim().length === 0 ||
          holderLabel.trim().length === 0 ||
          purpose.trim().length === 0
        }
      >
        {pending ? "Reservando…" : "Reservar escopo"}
      </Button>
      {feedback ? (
        <p className={feedbackClass(feedback.success)} role="status">
          {feedback.message}
        </p>
      ) : null}
    </form>
  );
}

export function VerificationObligationForm({
  repositories,
}: {
  repositories: readonly WorkflowRepositoryOption[];
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [repositoryId, setRepositoryId] = useState(repositories[0]?.id ?? "");
  const selectedRepository = repositories.find(
    (item) => item.id === repositoryId,
  );
  const [branch, setBranch] = useState(selectedRepository?.branch ?? "");
  const [targetCommitSha, setTargetCommitSha] = useState("");
  const [gateName, setGateName] = useState("");
  const [command, setCommand] = useState("");
  const [capabilities, setCapabilities] = useState("node-22, pnpm-10");
  const [responsibleActor, setResponsibleActor] = useState("ChatGPT");
  const [nextAction, setNextAction] = useState("");
  const [toolchainManifest, setToolchainManifest] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  function invalidateRetryIdentity() {
    idempotencyKey.current = null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !confirmed || selectedRepository === undefined) return;
    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      await privateDevos.verification.create({
        idempotencyKey: idempotencyKey.current,
        projectId: selectedRepository.projectId,
        repositoryId: selectedRepository.id,
        runId: null,
        stageId: null,
        branch,
        targetCommitSha: targetCommitSha.toLowerCase(),
        gateName,
        command,
        requiredCapabilities: splitValues(capabilities),
        responsibleActor,
        nextAction,
        toolchainManifest:
          toolchainManifest.trim().length === 0 ? null : toolchainManifest,
        confirmed: true,
      });
      setFeedback({
        success: true,
        message: "Gate pendente registrado para o commit exato.",
      });
      idempotencyKey.current = null;
      setTargetCommitSha("");
      setGateName("");
      setCommand("");
      setNextAction("");
      setConfirmed(false);
      await router.invalidate();
    } catch (error) {
      if (error instanceof PrivateApiError) {
        setFeedback({ success: false, message: error.message });
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
            "O gate falhou. A próxima tentativa reutilizará a mesma identidade.",
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="run-registration-form" onSubmit={submit}>
      <div className="run-registration-form__grid">
        <label>
          Repositório
          <select
            required
            disabled={pending}
            value={repositoryId}
            onChange={(event) => {
              const nextId = event.target.value;
              const next = repositories.find((item) => item.id === nextId);
              setRepositoryId(nextId);
              setBranch(next?.branch ?? "");
              invalidateRetryIdentity();
            }}
          >
            {repositories.length === 0 ? (
              <option value="">Nenhum alvo ativo</option>
            ) : null}
            {repositories.map((repository) => (
              <option key={repository.id} value={repository.id}>
                {repository.fullName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Branch
          <input
            required
            maxLength={255}
            value={branch}
            disabled={pending}
            onChange={(event) => {
              setBranch(event.target.value);
              invalidateRetryIdentity();
            }}
          />
        </label>
      </div>

      <label>
        Commit exato
        <input
          required
          minLength={40}
          maxLength={40}
          pattern="[0-9a-fA-F]{40}"
          autoComplete="off"
          value={targetCommitSha}
          disabled={pending}
          placeholder="40 caracteres hexadecimais"
          onChange={(event) => {
            setTargetCommitSha(event.target.value);
            invalidateRetryIdentity();
          }}
        />
      </label>

      <div className="run-registration-form__grid">
        <label>
          Nome do gate
          <input
            required
            maxLength={200}
            value={gateName}
            disabled={pending}
            onChange={(event) => {
              setGateName(event.target.value);
              invalidateRetryIdentity();
            }}
          />
        </label>
        <label>
          Responsável
          <input
            required
            maxLength={100}
            value={responsibleActor}
            disabled={pending}
            onChange={(event) => {
              setResponsibleActor(event.target.value);
              invalidateRetryIdentity();
            }}
          />
        </label>
      </div>

      <label>
        Comando exato
        <textarea
          required
          rows={2}
          maxLength={2_000}
          value={command}
          disabled={pending}
          onChange={(event) => {
            setCommand(event.target.value);
            invalidateRetryIdentity();
          }}
        />
      </label>
      <label>
        Capacidades exigidas
        <input
          required
          maxLength={1_000}
          value={capabilities}
          disabled={pending}
          placeholder="node-22, pnpm-10, android-sdk"
          onChange={(event) => {
            setCapabilities(event.target.value);
            invalidateRetryIdentity();
          }}
        />
      </label>
      <label>
        Próxima ação segura
        <textarea
          required
          rows={2}
          maxLength={1_000}
          value={nextAction}
          disabled={pending}
          onChange={(event) => {
            setNextAction(event.target.value);
            invalidateRetryIdentity();
          }}
        />
      </label>
      <label>
        Manifesto/toolchain opcional
        <input
          maxLength={500}
          value={toolchainManifest}
          disabled={pending}
          onChange={(event) => {
            setToolchainManifest(event.target.value);
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
          Confirmo que o status inicial é pendente e que nenhum teste será
          marcado como aprovado por este registro.
        </span>
      </label>

      <Button
        type="submit"
        tone="primary"
        disabled={
          pending ||
          !confirmed ||
          selectedRepository === undefined ||
          targetCommitSha.length !== 40 ||
          gateName.trim().length === 0 ||
          command.trim().length === 0 ||
          splitValues(capabilities).length === 0 ||
          nextAction.trim().length === 0
        }
      >
        {pending ? "Registrando…" : "Registrar gate pendente"}
      </Button>
      {feedback ? (
        <p className={feedbackClass(feedback.success)} role="status">
          {feedback.message}
        </p>
      ) : null}
    </form>
  );
}
