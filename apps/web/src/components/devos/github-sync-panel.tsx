import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import type { GitHubSyncDashboard } from "@semogtw/database";
import { Button, EmptyState, Status, Surface } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { readCookie } from "../../client/cookies";
import { triggerGitHubSyncFn } from "../../server/devos-github-sync";
import { BranchRecommendationAcceptanceForm } from "./branch-recommendation-acceptance-form";
import { RepositoryTargetLifecycleForm } from "./repository-target-lifecycle-form";

const timestampFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Bahia",
  dateStyle: "short",
  timeStyle: "medium",
});

function formatTimestamp(value: string | null): string {
  if (value === null) return "Ainda não observado";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data inválida"
    : timestampFormatter.format(date);
}

function statusTone(
  status: "running" | "success" | "partial" | "failed",
): "info" | "success" | "warning" | "danger" {
  if (status === "success") return "success";
  if (status === "partial") return "warning";
  if (status === "failed") return "danger";
  return "info";
}

export function GitHubSyncPanel({
  configured,
  dashboard,
}: {
  configured: boolean;
  dashboard: GitHubSyncDashboard;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    status: "success" | "partial" | "failed";
    createdCount: number;
    skippedCount: number;
    errorCount: number;
    warnings: readonly string[];
    rateLimitRemaining: number | null;
    rateLimitResetAt: string | null;
  } | null>(null);

  async function synchronize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !configured || dashboard.configuredTargets === 0) return;
    if (!confirmed) {
      setMessage("Confirme conscientemente a leitura do GitHub.");
      return;
    }

    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken === null) {
      setMessage("Não foi possível validar esta sessão.");
      return;
    }

    setPending(true);
    setMessage(null);
    setSummary(null);
    try {
      const response = await triggerGitHubSyncFn({
        data: { csrfToken, confirmed: true },
      });
      setMessage(response.message);
      if (!response.ok) return;

      setSummary(response.summary);
      setConfirmed(false);
      await router.invalidate();
    } catch {
      setMessage("Não foi possível executar a leitura do GitHub.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="github-sync-layout">
      <Surface className="github-sync-control">
        <div className="surface-heading-row">
          <div>
            <p className="eyebrow">Integração somente leitura</p>
            <h2>GitHub</h2>
            <p className="muted-copy">
              Observa metadados e heads de branches. Recomendações não alteram a
              branch ativa e nenhuma escrita é enviada ao GitHub.
            </p>
          </div>
          <Status tone={configured ? "success" : "warning"}>
            {configured ? "token configurado" : "não configurado"}
          </Status>
        </div>

        <dl className="github-sync-summary-grid">
          <div>
            <dt>Alvos habilitados</dt>
            <dd>{dashboard.configuredTargets}</dd>
          </div>
          <div>
            <dt>Último estado</dt>
            <dd>{dashboard.lastRun?.status ?? "sem execução"}</dd>
          </div>
          <div>
            <dt>Rate limit restante</dt>
            <dd>{dashboard.lastRun?.rateLimitRemaining ?? "desconhecido"}</dd>
          </div>
          <div>
            <dt>Próxima liberação</dt>
            <dd>{formatTimestamp(dashboard.lastRun?.rateLimitResetAt ?? null)}</dd>
          </div>
        </dl>

        <form className="github-sync-form" onSubmit={synchronize}>
          <label className="capture-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={
                !configured || pending || dashboard.configuredTargets === 0
              }
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              Confirmo a leitura limitada dos repositórios habilitados. Nenhuma
              recomendação será aplicada automaticamente.
            </span>
          </label>
          <Button
            type="submit"
            tone="primary"
            disabled={
              !configured ||
              dashboard.configuredTargets === 0 ||
              !confirmed ||
              pending
            }
          >
            {pending ? "Observando…" : "Sincronizar observações"}
          </Button>
        </form>

        {message ? (
          <div
            className={`capture-feedback ${summary?.status === "success" ? "capture-feedback--success" : "capture-feedback--error"}`}
            role="status"
          >
            <strong>{message}</strong>
            {summary ? (
              <p>
                Criadas: {summary.createdCount} · repetidas: {summary.skippedCount}
                {" · "}falhas/parciais: {summary.errorCount}
              </p>
            ) : null}
          </div>
        ) : null}
      </Surface>

      <Surface>
        <div className="surface-heading-row">
          <div>
            <p className="eyebrow">Última rodada</p>
            <h2>Execução persistida</h2>
          </div>
          {dashboard.lastRun ? (
            <Status tone={statusTone(dashboard.lastRun.status)}>
              {dashboard.lastRun.status}
            </Status>
          ) : null}
        </div>
        {dashboard.lastRun === null ? (
          <EmptyState
            title="Nenhuma execução registrada"
            description="O painel não presume estado do GitHub antes da primeira leitura confirmada."
          />
        ) : (
          <div className="github-run-details">
            <p>
              Início: {formatTimestamp(dashboard.lastRun.startedAt)} · fim:{" "}
              {formatTimestamp(dashboard.lastRun.finishedAt)}
            </p>
            <p>
              Criadas: {dashboard.lastRun.createdCount} · repetidas:{" "}
              {dashboard.lastRun.skippedCount} · falhas/parciais:{" "}
              {dashboard.lastRun.errorCount}
            </p>
            {dashboard.lastRun.processedTargets !== null ? (
              <p>Alvos processados: {dashboard.lastRun.processedTargets}</p>
            ) : null}
            {dashboard.lastRun.errorSummary ? (
              <p className="audit-warning">{dashboard.lastRun.errorSummary}</p>
            ) : null}
            {dashboard.lastRun.warnings.length > 0 ? (
              <details>
                <summary>Ver avisos normalizados</summary>
                <ul>
                  {dashboard.lastRun.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            {dashboard.lastRun.malformedJson.length > 0 ? (
              <p className="audit-warning">
                Metadados históricos malformados:{" "}
                {dashboard.lastRun.malformedJson.join(", ")}.
              </p>
            ) : null}
          </div>
        )}
      </Surface>

      <section className="github-repository-section">
        <div className="surface-heading-row">
          <div>
            <p className="eyebrow">Evidência por repositório</p>
            <h2>Branches observadas</h2>
          </div>
        </div>
        {dashboard.repositories.length === 0 ? (
          <EmptyState
            title="Nenhum repositório cadastrado"
            description="Cadastre um alvo privado acima para habilitar futuras rodadas de observação."
          />
        ) : (
          <div className="github-repository-grid">
            {dashboard.repositories.map((repository) => {
              const recommendation = repository.recommendation;
              const effectiveActiveBranch =
                repository.activeBranch ?? repository.defaultBranch;
              const canAccept =
                recommendation?.status === "recommended" &&
                recommendation.branch !== null &&
                recommendation.branch !== effectiveActiveBranch;

              return (
                <Surface key={repository.id} className="github-repository-card">
                  <div className="github-repository-card__heading">
                    <div>
                      <h3>{repository.fullName}</h3>
                      <p>
                        Última leitura: {formatTimestamp(repository.lastSyncedAt)}
                      </p>
                    </div>
                    <div className="github-repository-card__statuses">
                      <Status tone={repository.syncEnabled ? "success" : "warning"}>
                        {repository.syncEnabled ? "habilitado" : "pausado"}
                      </Status>
                      <Status tone="neutral">{repository.status}</Status>
                    </div>
                  </div>
                  <dl>
                    <div>
                      <dt>Branch ativa persistida</dt>
                      <dd>{effectiveActiveBranch}</dd>
                    </div>
                    <div>
                      <dt>Recomendação observada</dt>
                      <dd>{recommendation?.branch ?? "indisponível"}</dd>
                    </div>
                    <div>
                      <dt>Confiança</dt>
                      <dd>{recommendation?.confidence ?? "baixa"}</dd>
                    </div>
                  </dl>
                  {recommendation ? (
                    <details className="github-recommendation-details">
                      <summary>Por que esta recomendação?</summary>
                      <p>{recommendation.reason}</p>
                      {recommendation.warnings.length > 0 ? (
                        <ul>
                          {recommendation.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      ) : null}
                    </details>
                  ) : null}
                  {canAccept && recommendation ? (
                    <BranchRecommendationAcceptanceForm
                      repositoryId={repository.id}
                      recommendationId={recommendation.id}
                      expectedActiveBranch={repository.activeBranch}
                      recommendedBranch={recommendation.branch!}
                    />
                  ) : recommendation?.branch === effectiveActiveBranch ? (
                    <Status tone="success">recomendação já ativa</Status>
                  ) : null}
                  <RepositoryTargetLifecycleForm
                    repositoryId={repository.id}
                    fullName={repository.fullName}
                    syncEnabled={repository.syncEnabled}
                    updatedAt={repository.updatedAt}
                  />
                </Surface>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
