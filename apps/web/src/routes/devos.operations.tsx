import { Status } from "@semogtw/ui";
import { createFileRoute } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { GitHubSyncPanel } from "../components/devos/github-sync-panel";
import { RepositoryTargetRegistrationPanel } from "../components/devos/repository-target-registration-panel";
import { getGitHubSyncDashboardFn } from "../server/devos-github-status";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/operations")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  loader: () => getGitHubSyncDashboardFn(),
  head: () => ({
    meta: [
      { title: "Operação — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: OperationsPage,
});

function OperationsPage() {
  const { configured, dashboard, projects } = Route.useLoaderData();

  return (
    <DevOSShell activePath="/devos/operations">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Integrações e continuidade</p>
          <h1>Operação</h1>
        </div>
        <Status tone="info">Leitura conservadora</Status>
      </header>

      <div className="operations-stack">
        <RepositoryTargetRegistrationPanel projects={projects} />
        <GitHubSyncPanel configured={configured} dashboard={dashboard} />
      </div>
    </DevOSShell>
  );
}
