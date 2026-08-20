import { EmptyState, Surface } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "../components/public/public-shell";
import { getPublicProjectsFn } from "../server/public-projects";
import publicProjectsCss from "../styles/public-projects.css?url";
import { publicEditorialListHead } from "./-public-editorial-head";

const publishedDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeZone: "America/Bahia",
});

export const Route = createFileRoute("/projects/")({
  loader: () => getPublicProjectsFn(),
  head: () => {
    const head = publicEditorialListHead("project");
    return {
      ...head,
      links: [...head.links, { rel: "stylesheet", href: publicProjectsCss }],
    };
  },
  component: ProjectsPage,
});

function ProjectsPage() {
  const projects = Route.useLoaderData();

  return (
    <PublicShell>
      <header className="editorial-page-header">
        <p className="eyebrow">Projetos</p>
        <h1>Projetos explicados como trabalho, não como uma lista de repositórios.</h1>
        <p>
          Cada case study reúne contexto, decisões técnicas, stack, verificações
          e aprendizados para mostrar como um problema foi transformado em software.
        </p>
      </header>

      {projects.length === 0 ? (
        <div className="project-empty-state">
          <EmptyState
            title="Case studies em preparação"
            description="Os primeiros projetos serão publicados quando tiverem contexto suficiente para explicar problema, solução, decisões e resultados sem preencher a página com conteúdo de exemplo."
          />
          <nav
            className="project-empty-state__actions"
            aria-label="Outras formas de explorar o portfólio"
          >
            <Link className="button button-primary" to="/stack">
              Ver habilidades demonstradas
            </Link>
            <Link className="button button-secondary" to="/journey">
              Ver trajetória
            </Link>
          </nav>
        </div>
      ) : (
        <section className="public-project-grid" aria-label="Case studies publicados">
          {projects.map((project) => (
            <Surface key={project.slug} className="public-project-card">
              <div className="public-project-card__eyebrow">
                <span>Case study</span>
                <time dateTime={project.updatedAt}>
                  {publishedDateFormatter.format(new Date(project.updatedAt))}
                </time>
              </div>
              <h2>{project.title}</h2>
              <p>{project.excerpt}</p>
              <div className="public-editorial-tags" aria-label="Tecnologias e temas">
                {project.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <Link to="/projects/$slug" params={{ slug: project.slug }}>
                Abrir case study
              </Link>
            </Surface>
          ))}
        </section>
      )}
    </PublicShell>
  );
}
