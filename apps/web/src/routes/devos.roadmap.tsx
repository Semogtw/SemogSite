import { EmptyState, Status, Surface } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { getRoadmapFn } from "../server/devos-roadmap";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/roadmap")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  loader: () => getRoadmapFn(),
  head: () => ({
    meta: [
      { title: "Roadmap — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: RoadmapPage,
});

const columns = [
  { state: "backlog", label: "Backlog" },
  { state: "next", label: "Próximas" },
  { state: "in_progress", label: "Em andamento" },
  { state: "blocked", label: "Bloqueadas" },
  { state: "completed", label: "Concluídas" },
] as const;

function RoadmapPage() {
  const roadmap = Route.useLoaderData();

  return (
    <DevOSShell activePath="/devos/roadmap">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Execução verificável</p>
          <h1>Roadmap</h1>
        </div>
        <Status tone="info">Somente leitura nesta fundação</Status>
      </header>

      <div className="roadmap-board" aria-label="Etapas por estado">
        {columns.map((column) => {
          const items = roadmap.board[column.state];
          return (
            <Surface key={column.state} className="roadmap-column">
              <h2>
                {column.label} <span data-tabular>({items.length})</span>
              </h2>
              {items.length === 0 ? (
                <EmptyState
                  title="Sem etapas"
                  description="Nenhuma etapa persistida neste estado."
                />
              ) : (
                <div className="roadmap-list">
                  {items.map((item) => (
                    <article key={item.id} className="roadmap-card">
                      <p className="roadmap-project">{item.projectName}</p>
                      <h3>{item.title}</h3>
                      <p>{item.nextStep ?? item.currentPosition}</p>
                      {item.blocker ? (
                        <p className="roadmap-blocker">{item.blocker}</p>
                      ) : null}
                      <div className="roadmap-card-footer">
                        <Status
                          tone={
                            item.state === "blocked"
                              ? "danger"
                              : item.state === "completed"
                                ? "success"
                                : "neutral"
                          }
                        >
                          {item.progress}%
                        </Status>
                        <Link
                          to="/devos/projects"
                          search={{}}
                        >
                          Projetos
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Surface>
          );
        })}
      </div>
    </DevOSShell>
  );
}
