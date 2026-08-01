import { EmptyState, Status, Surface } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "../components/public/public-shell";
import { getPublicProjectsFn } from "../server/public-projects";

export const Route = createFileRoute("/projects/")({
  loader: () => getPublicProjectsFn(),
  head: () => ({
    meta: [
      { title: "Projetos — Semogtw" },
      {
        name: "description",
        content:
          "Catálogo editorial de projetos publicamente aprovados da Semogtw.",
      },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const projects = Route.useLoaderData();

  return (
    <PublicShell>
      <header className="editorial-page-header">
        <p className="eyebrow">Projetos</p>
        <h1>Produtos e sistemas com contexto verificável.</h1>
        <p>
          Cada projeto publicado reúne problema, proposta, decisões, marcos e
          links exclusivamente públicos.
        </p>
      </header>

      {projects.length === 0 ? (
        <EmptyState
          title="Nenhum projeto aprovado para publicação"
          description="O catálogo não usa automaticamente registros privados. Um projeto só aparece após sanitização e aprovação editorial."
        />
      ) : (
        <section className="public-project-grid" aria-label="Projetos publicados">
          {projects.map((project) => (
            <Surface key={project.slug} className="public-project-card">
              <div className="public-project-card-header">
                <p className="eyebrow">Projeto publicado</p>
                {project.featured ? <Status tone="info">Destaque</Status> : null}
              </div>
              <h2>{project.name}</h2>
              <p>{project.publicSummary}</p>
              <div className="public-project-card-footer">
                <span data-tabular>
                  {project.publicProgress === null
                    ? "Progresso não publicado"
                    : `${project.publicProgress}% público`}
                </span>
                <Link
                  to="/projects/$slug"
                  params={{ slug: project.slug }}
                >
                  Abrir projeto
                </Link>
              </div>
            </Surface>
          ))}
        </section>
      )}
    </PublicShell>
  );
}
