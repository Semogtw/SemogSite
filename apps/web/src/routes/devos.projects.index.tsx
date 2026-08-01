import { EmptyState, Status, Surface } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { getOperationalPortfolioFn } from "../server/devos-projects";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/projects/")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  loader: () => getOperationalPortfolioFn(),
  head: () => ({
    meta: [
      { title: "Projetos — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: DevOSProjectsPage,
});

function DevOSProjectsPage() {
  const portfolio = Route.useLoaderData();

  return (
    <DevOSShell activePath="/devos/projects">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Portfólio operacional</p>
          <h1>Projetos</h1>
        </div>
        <Status tone="neutral">
          {portfolio.activeProjects.length} ativos
        </Status>
      </header>

      <Surface>
        <h2>Projetos ativos</h2>
        {portfolio.activeProjects.length === 0 ? (
          <EmptyState
            title="Nenhum projeto operacional carregado"
            description="O catálogo será preenchido pela migração validada; nenhum estado é inferido de nomes ou documentação."
          />
        ) : (
          <div className="devos-record-list">
            {portfolio.activeProjects.map((project) => (
              <article key={project.id} className="devos-record">
                <div>
                  <h3>{project.name}</h3>
                  <p>{project.nextAction}</p>
                </div>
                <div className="devos-record-actions">
                  <Status
                    tone={
                      project.health === "blocked"
                        ? "danger"
                        : project.health === "attention"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {project.priority}
                  </Status>
                  <Link
                    to="/devos/projects/$slug"
                    params={{ slug: project.slug }}
                  >
                    Abrir hub
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </Surface>

      <details className="catalog-disclosure">
        <summary>
          Catálogo completo de repositórios ({portfolio.repositoryCatalog.length})
        </summary>
        {portfolio.repositoryCatalog.length === 0 ? (
          <EmptyState
            title="Catálogo indisponível"
            description="Repositórios serão exibidos somente dentro da sessão autenticada e após reconciliação explícita."
          />
        ) : (
          <div className="devos-record-list catalog-record-list">
            {portfolio.repositoryCatalog.map((repository) => (
              <article key={repository.id} className="devos-record">
                <div>
                  <h3>{repository.fullName}</h3>
                  <p>
                    {repository.role} · branch ativa:{" "}
                    {repository.activeBranch ?? repository.defaultBranch}
                  </p>
                </div>
                <Status
                  tone={repository.status === "active" ? "success" : "neutral"}
                >
                  {repository.status}
                </Status>
              </article>
            ))}
          </div>
        )}
      </details>
    </DevOSShell>
  );
}
