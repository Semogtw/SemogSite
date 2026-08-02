import { Status, Surface } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "../components/public/public-shell";
import { getPublicProjectFn } from "../server/public-projects";

export const Route = createFileRoute("/projects/$slug")({
  loader: ({ params }) => getPublicProjectFn({ data: { slug: params.slug } }),
  head: ({ loaderData, params }) =>
    loaderData == null
      ? {
          meta: [
            { title: `Projeto ${params.slug} — Semogtw` },
            { name: "robots", content: "noindex, nofollow" },
            {
              name: "description",
              content: "Página pública de projeto ainda não publicada.",
            },
          ],
        }
      : {
          meta: [
            { title: `${loaderData.name} — Semogtw` },
            { name: "description", content: loaderData.publicSummary },
          ],
        },
  component: ProjectPage,
});

function ProjectPage() {
  const { slug } = Route.useParams();
  const project = Route.useLoaderData();

  if (project === null) {
    return (
      <PublicShell>
        <header className="editorial-page-header">
          <p className="eyebrow">Projeto não publicado</p>
          <h1>Nenhum conteúdo público corresponde a “{slug}”.</h1>
          <p>
            Rotas de projeto não usam dados privados como fallback. O conteúdo
            ficará disponível somente após aprovação editorial.
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
      <article className="public-project-detail">
        <header className="editorial-page-header">
          <div className="public-project-card-header">
            <p className="eyebrow">Projeto publicado</p>
            {project.featured ? <Status tone="info">Destaque</Status> : null}
          </div>
          <h1>{project.name}</h1>
          <p>{project.publicSummary}</p>
        </header>

        <Surface className="public-project-facts">
          <div>
            <span>Progresso publicado</span>
            <strong data-tabular>
              {project.publicProgress === null
                ? "Não informado"
                : `${project.publicProgress}%`}
            </strong>
          </div>
          <div>
            <span>Última atividade pública</span>
            <strong>
              {project.lastPublicActivityAt === null
                ? "Não publicada"
                : new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "medium",
                    timeZone: "America/Bahia",
                  }).format(new Date(project.lastPublicActivityAt))}
            </strong>
          </div>
        </Surface>

        <div className="public-project-links">
          {project.liveUrl ? (
            <a href={project.liveUrl} rel="noreferrer" target="_blank">
              Abrir projeto
            </a>
          ) : null}
          {project.documentationUrl ? (
            <a
              href={project.documentationUrl}
              rel="noreferrer"
              target="_blank"
            >
              Ler documentação
            </a>
          ) : null}
          <Link to="/projects">Todos os projetos</Link>
        </div>
      </article>
    </PublicShell>
  );
}
