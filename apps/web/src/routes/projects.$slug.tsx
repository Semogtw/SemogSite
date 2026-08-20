import { Surface } from "@semogtw/ui";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { PublicMarkdown } from "../components/public/public-markdown";
import { PublicShell } from "../components/public/public-shell";
import { getPublicProjectRouteFn } from "../server/public-projects";
import projectCaseStudyCss from "../styles/project-case-study.css?url";
import publicEditorialCss from "../styles/public-editorial.css?url";
import { publicEditorialDetailHead } from "./-public-editorial-head";

export const Route = createFileRoute("/projects/$slug")({
  loader: async ({ params }) => {
    const resolution = await getPublicProjectRouteFn({
      data: { slug: params.slug },
    });
    if (resolution.redirectSlug !== null) {
      throw redirect({
        to: "/projects/$slug",
        params: { slug: resolution.redirectSlug },
        statusCode: 308,
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }
    return resolution.document;
  },
  head: ({ loaderData, params }) => {
    const head = publicEditorialDetailHead({
      kind: "project",
      slug: params.slug,
      document: loaderData ?? null,
    });
    return {
      ...head,
      links: [
        ...head.links,
        { rel: "stylesheet", href: publicEditorialCss },
        { rel: "stylesheet", href: projectCaseStudyCss },
      ],
    };
  },
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { slug } = Route.useParams();
  const project = Route.useLoaderData();

  if (project === null) {
    return (
      <PublicShell>
        <header className="editorial-page-header">
          <p className="eyebrow">Projeto não publicado</p>
          <h1>Nenhum case study público corresponde a “{slug}”.</h1>
          <p>
            Rascunhos, publicações retiradas e dados operacionais privados não são
            usados como fallback para preencher esta página.
          </p>
          <Link className="text-link" to="/projects">
            Voltar aos projetos
          </Link>
        </header>
      </PublicShell>
    );
  }

  const publishedDate = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "America/Bahia",
  }).format(new Date(project.updatedAt));

  return (
    <PublicShell>
      <article className="public-editorial-detail project-case-study">
        <header className="editorial-page-header project-case-study__header">
          <p className="eyebrow">Case study</p>
          <h1>{project.title}</h1>
          <p>{project.excerpt}</p>
        </header>

        <section
          className="project-case-study__overview"
          aria-label="Resumo do projeto"
        >
          <div className="project-case-study__meta">
            <div>
              <span className="project-case-study__label">Publicado</span>
              <time dateTime={project.updatedAt}>{publishedDate}</time>
            </div>
            <div>
              <span className="project-case-study__label">Tecnologias e temas</span>
              {project.tags.length > 0 ? (
                <div className="public-editorial-tags" aria-label="Tecnologias e temas">
                  {project.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              ) : (
                <span className="project-case-study__muted">
                  Contexto técnico descrito no case study.
                </span>
              )}
            </div>
          </div>

          <div className="project-case-study__reading-note">
            <span className="project-case-study__label">O que procurar</span>
            <p>
              O conteúdo publicado prioriza problema, solução, decisões técnicas,
              trade-offs, verificações e aprendizados. O objetivo é tornar o
              raciocínio por trás do projeto tão inspecionável quanto a stack.
            </p>
          </div>
        </section>

        <Surface className="public-editorial-content project-case-study__content">
          <PublicMarkdown markdown={project.bodyMarkdown} />
        </Surface>

        <footer className="project-case-study__footer">
          <div>
            <p className="eyebrow">Continuar explorando</p>
            <h2>Veja o projeto no contexto das outras habilidades.</h2>
          </div>
          <div className="project-case-study__footer-actions">
            <Link className="button button-primary" to="/projects">
              Todos os projetos
            </Link>
            <Link className="button button-secondary" to="/stack">
              Ver habilidades
            </Link>
          </div>
        </footer>
      </article>
    </PublicShell>
  );
}
