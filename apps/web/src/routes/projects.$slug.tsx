import { Surface } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicMarkdown } from "../components/public/public-markdown";
import { PublicShell } from "../components/public/public-shell";
import { getPublicProjectFn } from "../server/public-projects";
import { publicEditorialDetailHead } from "./-public-editorial-head";

export const Route = createFileRoute("/projects/$slug")({
  loader: ({ params }) => getPublicProjectFn({ data: { slug: params.slug } }),
  head: ({ loaderData, params }) =>
    publicEditorialDetailHead({
      kind: "project",
      slug: params.slug,
      document: loaderData ?? null,
    }),
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
          <h1>Nenhuma publicação pública corresponde a “{slug}”.</h1>
          <p>
            Uma linha operacional, um rascunho ou uma publicação retirada não é
            usada como fallback nesta rota.
          </p>
          <Link className="text-link" to="/projects">
            Voltar aos projetos
          </Link>
        </header>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <article className="public-editorial-detail">
        <header className="editorial-page-header">
          <p className="eyebrow">Projeto publicado</p>
          <h1>{project.title}</h1>
          <p>{project.excerpt}</p>
        </header>

        <div className="public-editorial-byline">
          <time dateTime={project.updatedAt}>
            Publicado em{" "}
            {new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "long",
              timeZone: "America/Bahia",
            }).format(new Date(project.updatedAt))}
          </time>
          <div className="public-editorial-tags" aria-label="Marcadores">
            {project.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>

        <Surface className="public-editorial-content">
          <PublicMarkdown markdown={project.bodyMarkdown} />
        </Surface>

        <Link className="text-link" to="/projects">
          Todos os projetos
        </Link>
      </article>
    </PublicShell>
  );
}
