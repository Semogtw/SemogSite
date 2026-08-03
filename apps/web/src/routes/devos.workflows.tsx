import { EmptyState, Status, Surface } from "@semogtw/ui";
import { createFileRoute } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { getWorkflowOrchestrationDashboardFn } from "../server/devos-workflows";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/workflows")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  loader: () => getWorkflowOrchestrationDashboardFn(),
  head: () => ({
    meta: [
      { title: "Fluxos — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: WorkflowOrchestrationPage,
});

function reservationTone(
  freshness: "active" | "expired" | "inactive",
): "success" | "warning" | "neutral" {
  if (freshness === "active") return "success";
  if (freshness === "expired") return "warning";
  return "neutral";
}

function obligationTone(
  status: string,
): "success" | "danger" | "warning" | "info" | "neutral" {
  if (status === "passed") return "success";
  if (status === "failed") return "danger";
  if (status === "blocked") return "warning";
  if (status === "pending" || status === "running") return "info";
  return "neutral";
}

function WorkflowOrchestrationPage() {
  const dashboard = Route.useLoaderData();

  return (
    <DevOSShell activePath="/devos/workflows">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Coordenação portátil</p>
          <h1>Fluxos de desenvolvimento</h1>
          <p className="muted-copy">
            Reservas são declarações cooperativas e gates são evidências ligadas a
            um commit exato. Nenhum indicador representa telemetria oculta da IA.
          </p>
        </div>
        <Status tone="info">Observado em {dashboard.observedAt}</Status>
      </header>

      <div className="devos-section-grid">
        <Surface>
          <h2>Reservas ativas</h2>
          <p className="metric-value">{dashboard.summary.activeReservations}</p>
          <p className="muted-copy">
            Escopos que ainda não expiraram no momento desta leitura.
          </p>
        </Surface>
        <Surface>
          <h2>Reservas expiradas</h2>
          <p className="metric-value">{dashboard.summary.expiredReservations}</p>
          <p className="muted-copy">
            Mantidas no histórico, mas não impedem novo trabalho.
          </p>
        </Surface>
        <Surface>
          <h2>Gates não resolvidos</h2>
          <p className="metric-value">
            {dashboard.summary.unresolvedObligations}
          </p>
          <p className="muted-copy">
            Pendentes, em execução, falhos ou bloqueados.
          </p>
        </Surface>
        <Surface>
          <h2>Bloqueios de ambiente</h2>
          <p className="metric-value">
            {dashboard.summary.environmentBlockedObligations}
          </p>
          <p className="muted-copy">
            Separados de regressões confirmadas de código.
          </p>
        </Surface>
      </div>

      <div className="operations-stack">
        <Surface>
          <div className="surface-heading-row">
            <div>
              <p className="eyebrow">Proteção contra sobreposição</p>
              <h2>Reservas de escopo</h2>
            </div>
            <Status tone="neutral">Leitura conservadora</Status>
          </div>

          {dashboard.reservations.length === 0 ? (
            <EmptyState
              title="Nenhuma reserva registrada"
              description="Sessões e agentes poderão declarar branch, caminhos e finalidade antes de iniciar trabalho substancial."
            />
          ) : (
            <div className="devos-record-list">
              {dashboard.reservations.map((reservation) => (
                <article
                  className="devos-record devos-record--stacked"
                  key={reservation.id}
                >
                  <div className="devos-record__main">
                    <div>
                      <h3>{reservation.repositoryFullName}</h3>
                      <p>
                        <code>{reservation.branch}</code> · {reservation.holderLabel}
                      </p>
                    </div>
                    <Status tone={reservationTone(reservation.freshness)}>
                      {reservation.freshness}
                    </Status>
                  </div>
                  <p>{reservation.purpose}</p>
                  <p className="muted-copy">
                    Escopo: {reservation.patterns.join(", ") || "inválido/indisponível"}
                  </p>
                  <p className="muted-copy">
                    Renovada em {reservation.renewedAt} · expira em {reservation.expiresAt}
                  </p>
                </article>
              ))}
            </div>
          )}
        </Surface>

        <Surface>
          <div className="surface-heading-row">
            <div>
              <p className="eyebrow">Dívida de validação</p>
              <h2>Obrigações de verificação</h2>
            </div>
            <Status tone="neutral">Vinculadas a SHA</Status>
          </div>

          {dashboard.obligations.length === 0 ? (
            <EmptyState
              title="Nenhum gate registrado"
              description="Testes indisponíveis ou pendentes aparecerão aqui sem serem confundidos com falhas de código."
            />
          ) : (
            <div className="devos-record-list">
              {dashboard.obligations.map((obligation) => (
                <article
                  className="devos-record devos-record--stacked"
                  key={obligation.id}
                >
                  <div className="devos-record__main">
                    <div>
                      <h3>{obligation.gateName}</h3>
                      <p>
                        {obligation.repositoryFullName} · <code>{obligation.branch}</code>
                      </p>
                    </div>
                    <Status tone={obligationTone(obligation.status)}>
                      {obligation.status}
                    </Status>
                  </div>
                  <p>
                    Commit: <code>{obligation.targetCommitSha.slice(0, 12)}</code>
                    {obligation.failureClassification === null
                      ? ""
                      : ` · ${obligation.failureClassification}`}
                  </p>
                  <p className="muted-copy">
                    Comando: <code>{obligation.command}</code>
                  </p>
                  {obligation.resultSummary === null ? null : (
                    <p>{obligation.resultSummary}</p>
                  )}
                  <p className="muted-copy">
                    Próxima ação: {obligation.nextAction}
                  </p>
                </article>
              ))}
            </div>
          )}
        </Surface>
      </div>
    </DevOSShell>
  );
}
