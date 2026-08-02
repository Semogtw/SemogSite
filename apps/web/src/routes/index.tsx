import { Surface } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "../components/public/public-shell";
import { getPublicProjectsFn } from "../server/public-projects";

export const Route = createFileRoute("/")({
  loader: () => getPublicProjectsFn(),
  head: () => ({
    meta: [
      { title: "Semogtw — Produtos, sistemas e experimentos" },
      {
        name: "description",
        content:
          "Projetos, notas técnicas e experimentos da Semogtw, publicados com revisão e privacidade por construção.",
      },
    ],
  }),
  component: HomePage,
});

const principles = [
  "Evidência antes de status",
  "Arquitetura portátil",
  "Privacidade por construção",
] as const;

function HomePage() {
  const projects = Route.useLoaderData();
  const featuredProjects = projects.slice(0, 3);

  return (
    <PublicShell>
      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">Sistemas pessoais · produtos · infraestrutura</p>
        <h1 id="hero-title">
          Construindo ferramentas que preservam contexto e ampliam autonomia.
        </h1>
        <p className="hero-copy">
          A Semogtw reúne projetos, estudos técnicos e experimentos em uma
          plataforma editorial conectada a um núcleo operacional privado.
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" to="/projects">
            Explorar projetos
          </Link>
          <Link className="button button-secondary" to="/lab">
            Abrir laboratório
          </Link>
        </div>
      </section>

      <section className="principles" aria-labelledby="principles-title">
        <div>
          <p className="eyebrow">Princípios de construção</p>
          <h2 id="principles-title">Uma identidade, duas densidades.</h2>
        </div>
        <ol>
          {principles.map((principle, index) => (
            <li key={principle}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {principle}
            </li>
          ))}
        </ol>
      </section>

      <section className="featured-editorial" aria-labelledby="projects-title">
        <div className="featured-editorial-heading">
          <p className="eyebrow">Projetos selecionados</p>
          <h2 id="projects-title">
            {featuredProjects.length === 0
              ? "As publicações começam deliberadamente vazias."
              : "Projetos com conteúdo público aprovado."}
          </h2>
          {featuredProjects.length === 0 ? (
            <p>
              Projetos só aparecem aqui depois de receberem uma revisão editorial
              aprovada e publicada. Dados operacionais nunca são usados como
              substituto.
            </p>
          ) : null}
        </div>

        {featuredProjects.length > 0 ? (
          <div className="public-project-grid home-project-grid">
            {featuredProjects.map((project) => (
              <Surface key={project.slug} className="public-project-card">
                <p className="eyebrow">Projeto publicado</p>
                <h3>{project.title}</h3>
                <p>{project.excerpt}</p>
                <div className="public-project-card-footer">
                  <span data-tabular>Revisão editorial publicada</span>
                  <Link
                    to="/projects/$slug"
                    params={{ slug: project.slug }}
                  >
                    Abrir projeto
                  </Link>
                </div>
              </Surface>
            ))}
          </div>
        ) : null}
      </section>
    </PublicShell>
  );
}
