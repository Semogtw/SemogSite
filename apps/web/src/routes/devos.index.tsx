import { EmptyState, Status, Surface } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { getDevOSOverviewFn } from "../server/devos-overview";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  loader: () => getDevOSOverviewFn(),
  head: () => ({
    meta: [
      { title: "Início — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: DevOSOverviewPage,
});

function DevOSOverviewPage() {
  const overview = Route.useLoaderData();

  return (
    <DevOSShell activePath="/devos">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Semogtw DevOS</p>
          <h1>Visão geral</h1>
        </div>
        <Status tone={overview.lastSyncedAt === null ? "neutral" : "success"}>
          {overview.lastSyncedAt === null
            ? "Sem sincronização confirmada"
            : "Sincronização confirmada"}
        </Status>
      </header>
      <div className="metric-grid" aria-label="Métricas operacionais">
        <Surface>
          <span>Projetos ativos</span>
          <strong data-tabular>{overview.activeProjectCount}</strong>
        </Surface>
        <Surface>
          <span>Etapas em andamento</span>
          <strong data-tabular>{overview.inProgressStageCount}</strong>
        </Surface>
        <Surface>
          <span>Atenções de alto impacto</span>
          <strong data-tabular>{overview.highImpactAttentionCount}</strong>
        </Surface>
      </div>

      {overview.projects.length === 0 ? (
        <EmptyState
          title="Nenhum estado operacional carregado"
          description="O DevOS permanece honesto enquanto migração e sincronização ainda não foram executadas."
        />
      ) : (
        <div className="devos-section-grid">
          <Surface>
            <h2>Projetos ativos</h2>
            <div className="devos-record-list">
              {overview.projects.map((project) => (
                <article key={project.id} className="devos-record">
                  <div>
                    <h3>{project.name}</h3>
                    <p>{project.focus}</p>
                  </div>
                  <div className="devos-record-actions">
                    <Status tone={project.health === "blocked" ? "danger" : "neutral"}>
                      {project.priority}
                    </Status>
                    <Link
                      to="/devos/projects/$slug"
                      params={{ slug: project.slug }}
                    >
                      Abrir projeto
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </Surface>

          <Surface>
            <h2>Etapas atuais</h2>
            {overview.currentStages.length === 0 ? (
              <EmptyState
                title="Nenhuma etapa atual"
                description="Etapas em andamento ou bloqueadas aparecerão aqui."
              />
            ) : (
              <div className="devos-record-list">
                {overview.currentStages.map((stage) => (
                  <article key={stage.id} className="devos-record">
                    <div>
                      <h3>{stage.title}</h3>
                      <p>{stage.progress}% concluído</p>
                    </div>
                    <Status tone={stage.state === "blocked" ? "danger" : "info"}>
                      {stage.state === "blocked" ? "Bloqueada" : "Em andamento"}
                    </Status>
                  </article>
                ))}
              </div>
            )}
          </Surface>

          <Surface>
            <h2>Atenções abertas</h2>
            {overview.attention.length === 0 ? (
              <EmptyState
                title="Nenhuma atenção aberta"
                description="Riscos, decisões e dependências externas aparecerão somente quando registrados."
              />
            ) : (
              <div className="devos-record-list">
                {overview.attention.map((item) => (
                  <article key={item.id} className="devos-record">
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.nextAction}</p>
                    </div>
                    <Status tone={item.impact === "high" ? "danger" : "warning"}>
                      {item.impact}
                    </Status>
                  </article>
                ))}
              </div>
            )}
          </Surface>
        </div>
      )}
    </DevOSShell>
  );
}
