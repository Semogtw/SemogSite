import { Status, Surface } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { RecoverySnapshotForm } from "../components/devos/recovery-snapshot-form";
import { getWorkflowOrchestrationDashboardFn } from "../server/devos-workflows";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/workflows/recovery")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  loader: () => getWorkflowOrchestrationDashboardFn(),
  head: () => ({
    meta: [
      { title: "Recuperação — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: RecoverySnapshotWorkspace,
});

function RecoverySnapshotWorkspace() {
  const dashboard = Route.useLoaderData();

  return (
    <DevOSShell activePath="/devos/workflows">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Continuidade após reset</p>
          <h1>Snapshot de recuperação</h1>
          <p className="muted-copy">
            Gere um handoff determinístico usando somente projeto, branch, SHA,
            reservas e gates já persistidos. A geração falha fechada quando a branch
            aceita ainda não possui uma observação GitHub verificável.
          </p>
        </div>
        <Status tone="info">Owner-only</Status>
      </header>

      <Surface>
        <div className="surface-heading-row">
          <div>
            <h2>Preservar estado atual</h2>
            <p className="muted-copy">
              O snapshot é salvo com SHA-256 do JSON canônico e não pode ser
              alterado depois da criação.
            </p>
          </div>
          <Status tone="neutral">
            {dashboard.repositoryOptions.length} alvos ativos
          </Status>
        </div>
        <RecoverySnapshotForm repositories={dashboard.repositoryOptions} />
      </Surface>

      <Link className="text-link" to="/devos/workflows">
        Voltar aos fluxos
      </Link>
    </DevOSShell>
  );
}
