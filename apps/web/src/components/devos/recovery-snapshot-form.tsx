import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { Button } from "@semogtw/ui";
import { useRef, useState, type FormEvent } from "react";
import { readCookie } from "../../client/cookies";
import { createRecoverySnapshotFn } from "../../server/devos-recovery-snapshot";

type WorkflowRepositoryOption = {
  id: string;
  projectId: string | null;
  fullName: string;
  branch: string;
};

function splitValues(value: string): string[] {
  return [...new Set(value.split(/[\n,]/u).map((item) => item.trim()).filter(Boolean))];
}

export function RecoverySnapshotForm({
  repositories,
}: {
  repositories: readonly WorkflowRepositoryOption[];
}) {
  const idempotencyKey = useRef<string | null>(null);
  const [repositoryId, setRepositoryId] = useState(repositories[0]?.id ?? "");
  const selectedRepository = repositories.find((item) => item.id === repositoryId);
  const [nextAction, setNextAction] = useState("");
  const [continuationPrompt, setContinuationPrompt] = useState(
    "Continue o desenvolvimento a partir da branch e do SHA exatos deste snapshot. Leia os documentos obrigatórios, preserve as decisões registradas, execute os gates possíveis no ambiente atual e continue outras etapas seguras quando um gate depender de ambiente indisponível. Faça commits e pushes frequentes.",
  );
  const [runtimeLabel, setRuntimeLabel] = useState("ChatGPT com GitHub");
  const [runtimeCapabilities, setRuntimeCapabilities] = useState(
    "github-read, github-write",
  );
  const [toolchainManifest, setToolchainManifest] = useState("");
  const [planPath, setPlanPath] = useState(
    "docs/superpowers/plans/2026-08-03-workflow-orchestration-core.md",
  );
  const [planSection, setPlanSection] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [snapshot, setSnapshot] = useState<{
    id: string;
    hash: string;
    markdown: string;
    confidence: string;
    sourceObservedAt: string;
  } | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  function invalidateRetryIdentity() {
    idempotencyKey.current = null;
    setSnapshot(null);
    setCopyStatus(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !confirmed || selectedRepository === undefined) return;
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken === null) {
      setFeedback({ success: false, message: "Não foi possível validar esta sessão." });
      return;
    }

    const capabilities = splitValues(runtimeCapabilities);
    if (capabilities.length === 0) {
      setFeedback({
        success: false,
        message: "Registre ao menos uma capacidade do runtime atual.",
      });
      return;
    }
    const normalizedPlanPath = planPath.trim().length === 0 ? null : planPath.trim();
    const normalizedPlanSection =
      planSection.trim().length === 0 ? null : planSection.trim();
    if (
      (normalizedPlanPath === null) !== (normalizedPlanSection === null)
    ) {
      setFeedback({
        success: false,
        message: "Caminho e seção do plano devem ser informados juntos.",
      });
      return;
    }

    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    setSnapshot(null);
    setCopyStatus(null);
    try {
      const response = await createRecoverySnapshotFn({
        data: {
          csrfToken,
          idempotencyKey: idempotencyKey.current,
          repositoryId: selectedRepository.id,
          nextAction,
          continuationPrompt,
          runtimeLabel,
          runtimeCapabilities: capabilities,
          toolchainManifest:
            toolchainManifest.trim().length === 0
              ? null
              : toolchainManifest.trim(),
          planPath: normalizedPlanPath,
          planSection: normalizedPlanSection,
          confirmed: true,
        },
      });
      setFeedback({ success: response.ok, message: response.message });
      if (!response.ok) return;
      setSnapshot({
        id: response.snapshotId,
        hash: response.canonicalHash,
        markdown: response.markdown,
        confidence: response.confidence,
        sourceObservedAt: response.sourceObservedAt,
      });
      idempotencyKey.current = null;
      setConfirmed(false);
    } catch {
      setFeedback({
        success: false,
        message: "A geração falhou. A próxima tentativa preservará a identidade.",
      });
    } finally {
      setPending(false);
    }
  }

  async function copySnapshot() {
    if (snapshot === null) return;
    try {
      await navigator.clipboard.writeText(snapshot.markdown);
      setCopyStatus("Snapshot copiado.");
    } catch {
      setCopyStatus(
        "O navegador negou o clipboard. Selecione manualmente o conteúdo abaixo.",
      );
    }
  }

  return (
    <div className="operations-stack">
      <form className="run-registration-form" onSubmit={submit}>
        <div className="run-registration-form__grid">
          <label>
            Repositório
            <select
              required
              disabled={pending}
              value={repositoryId}
              onChange={(event) => {
                setRepositoryId(event.target.value);
                invalidateRetryIdentity();
              }}
            >
              {repositories.length === 0 ? (
                <option value="">Nenhum alvo ativo</option>
              ) : null}
              {repositories.map((repository) => (
                <option key={repository.id} value={repository.id}>
                  {repository.fullName} · {repository.branch}
                </option>
              ))}
            </select>
          </label>
          <label>
            Runtime atual
            <input
              required
              maxLength={200}
              value={runtimeLabel}
              disabled={pending}
              onChange={(event) => {
                setRuntimeLabel(event.target.value);
                invalidateRetryIdentity();
              }}
            />
          </label>
        </div>

        <label>
          Próxima ação exata
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
          Prompt de continuação
          <textarea
            required
            rows={5}
            maxLength={8_000}
            value={continuationPrompt}
            disabled={pending}
            onChange={(event) => {
              setContinuationPrompt(event.target.value);
              invalidateRetryIdentity();
            }}
          />
        </label>
        <label>
          Capacidades observadas do runtime
          <input
            required
            maxLength={1_000}
            value={runtimeCapabilities}
            disabled={pending}
            placeholder="github-read, github-write, node-22"
            onChange={(event) => {
              setRuntimeCapabilities(event.target.value);
              invalidateRetryIdentity();
            }}
          />
        </label>
        <div className="run-registration-form__grid">
          <label>
            Caminho do plano opcional
            <input
              maxLength={500}
              value={planPath}
              disabled={pending}
              onChange={(event) => {
                setPlanPath(event.target.value);
                invalidateRetryIdentity();
              }}
            />
          </label>
          <label>
            Seção do plano opcional
            <input
              maxLength={200}
              value={planSection}
              disabled={pending}
              placeholder="Ex.: Task 6"
              onChange={(event) => {
                setPlanSection(event.target.value);
                invalidateRetryIdentity();
              }}
            />
          </label>
        </div>
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
            Confirmo que o snapshot poderá incluir nomes privados de repositório,
            branch, gates e bloqueios e será mantido apenas na superfície privada.
          </span>
        </label>

        <Button
          type="submit"
          tone="primary"
          disabled={
            pending ||
            !confirmed ||
            selectedRepository === undefined ||
            nextAction.trim().length === 0 ||
            continuationPrompt.trim().length === 0 ||
            runtimeLabel.trim().length === 0 ||
            splitValues(runtimeCapabilities).length === 0
          }
        >
          {pending ? "Gerando…" : "Gerar snapshot de recuperação"}
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

      {snapshot === null ? null : (
        <div className="devos-record devos-record--stacked">
          <div className="devos-record__main">
            <div>
              <h3>Snapshot preservado</h3>
              <p>
                {snapshot.id} · confiança {snapshot.confidence}
              </p>
            </div>
            <Button type="button" tone="neutral" onClick={copySnapshot}>
              Copiar handoff
            </Button>
          </div>
          <p className="muted-copy">
            Fonte observada em {snapshot.sourceObservedAt} · SHA-256 {snapshot.hash}
          </p>
          <textarea
            aria-label="Conteúdo do snapshot de recuperação"
            readOnly
            rows={14}
            value={snapshot.markdown}
          />
          {copyStatus === null ? null : <p role="status">{copyStatus}</p>}
        </div>
      )}
    </div>
  );
}
