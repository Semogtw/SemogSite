import { EmptyState, Surface } from "@semogtw/ui";
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
          "Projetos publicados pela Semogtw após revisão editorial explícita.",
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
        <h1>Produtos e sistemas apresentados por uma projeção editorial.</h1>
        <p>
          Esta vitrine não lê status, branches, bloqueios ou próximas ações do
          DevOS. Apenas revisões aprovadas e publicadas chegam à área pública.
        </p>
      </header>

      {projects.length === 0 ? (
        <EmptyState
          title="Nenhum projeto publicado"
          description="Projetos operacionais e rascunhos editoriais permanecem privados até aprovação e publicação explícitas."
        />
      ) : (
        <section className="public-project-grid" aria-label="Projetos publicados">
          {projects.map((project) => (
            <Surface key={project.slug} className="public-project-card">
              <div className="public-project-card__eyebrow">
                <span>Projeto publicado</span>
                <time dateTime={project.updatedAt}>
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "medium",
                    timeZone: "America/Bahia",
                  }).format(new Date(project.updatedAt))}
                </time>
              </div>
              <h2>{project.title}</h2>
              <p>{project.excerpt}</p>
              <div className="public-editorial-tags" aria-label="Marcadores">
                {project.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <Link to="/projects/$slug" params={{ slug: project.slug }}>
                Abrir projeto
              </Link>
            </Surface>
          ))}
        </section>
      )}
    </PublicShell>
  );
}
