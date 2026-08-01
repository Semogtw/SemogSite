import { EmptyState, Status, Surface } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { getTodayQueueFn } from "../server/devos-today";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/today")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  loader: () => getTodayQueueFn(),
  head: () => ({
    meta: [
      { title: "Hoje — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: TodayPage,
});

function TodayPage() {
  const queue = Route.useLoaderData();

  return (
    <DevOSShell activePath="/devos/today">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Execução</p>
          <h1>Hoje</h1>
        </div>
        <Status tone="neutral">
          {queue.executeNow.length} em execução
        </Status>
      </header>

      <div className="devos-section-grid">
        <Surface>
          <h2>Executar agora</h2>
          {queue.executeNow.length === 0 ? (
            <EmptyState
              title="Fila vazia"
              description="Etapas em andamento aparecerão aqui após persistência validada."
            />
          ) : (
            <div className="devos-record-list">
              {queue.executeNow.map((item) => (
                <article key={item.stageId} className="devos-record">
                  <div>
                    <h3>{item.title}</h3>
                    <p>
                      {item.projectName} · {item.nextStep}
                    </p>
                  </div>
                  <div className="devos-record-actions">
                    <Status tone={item.partiallyBlocked ? "warning" : "info"}>
                      {item.progress}%
                    </Status>
                    <Link
                      to="/devos/projects/$slug"
                      params={{
                        slug:
                          queue.executeNow.find(
                            (candidate) => candidate.stageId === item.stageId,
                          )?.projectId ?? item.projectId,
                      }}
                      disabled
                    >
                      Projeto
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Surface>

        <Surface>
          <h2>Próximo na fila</h2>
          {queue.nextInQueue.length === 0 ? (
            <EmptyState
              title="Nenhuma próxima etapa"
              description="A fila não promove backlog automaticamente sem estado explícito."
            />
          ) : (
            <div className="devos-record-list">
              {queue.nextInQueue.map((item) => (
                <article key={item.stageId} className="devos-record">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.projectName}</p>
                  </div>
                  <Status tone="neutral">{item.projectPriority}</Status>
                </article>
              ))}
            </div>
          )}
        </Surface>

        <Surface>
          <h2>Precisa de você</h2>
          {queue.needsOwner.length === 0 ? (
            <EmptyState
              title="Nenhuma decisão pendente"
              description="Itens atribuídos ao proprietário serão agrupados nesta seção."
            />
          ) : (
            <div className="devos-record-list">
              {queue.needsOwner.map((item) => (
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

        <Surface>
          <h2>Dependências externas</h2>
          {queue.externalDependencies.length === 0 ? (
            <EmptyState
              title="Nenhuma dependência registrada"
              description="Testes locais e dependências de ambiente serão apresentados sem presumir conclusão."
            />
          ) : (
            <div className="devos-record-list">
              {queue.externalDependencies.map((item) => (
                <article key={item.id} className="devos-record">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.nextAction}</p>
                  </div>
                  <Status tone="warning">externa</Status>
                </article>
              ))}
            </div>
          )}
        </Surface>
      </div>
    </DevOSShell>
  );
}
