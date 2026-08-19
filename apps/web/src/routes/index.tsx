import { Surface } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "../components/public/public-shell";
import { getPublicProjectsFn } from "../server/public-projects";
import { publicPortfolioHead } from "./-public-portfolio-head";

export const Route = createFileRoute("/")({
  loader: () => getPublicProjectsFn(),
  head: () =>
    publicPortfolioHead({
      title: "Semogtw — Portfólio de software e automação",
      description:
        "Portfólio técnico da Semogtw com projetos, habilidades, formação e evidências de trabalho em software, automação e sistemas.",
      path: "/",
    }),
  component: HomePage,
});

const capabilityHighlights = [
  {
    title: "Aplicações web full-stack",
    description:
      "React, TypeScript e TanStack conectando interface, domínio, APIs e persistência em produtos utilizáveis.",
    proof: "Evidência em projetos publicados",
  },
  {
    title: "Backend e dados",
    description:
      "APIs com Hono e Zod, SQLite/D1, Drizzle, migrations, autenticação, segurança e modelos de leitura e escrita.",
    proof: "Evidência no SemogSite",
  },
  {
    title: "Automação e engenharia",
    description:
      "Workflows GitHub, MCP, agentes, gates de verificação, recuperação e documentação para tornar desenvolvimento reproduzível.",
    proof: "Evidência no SemogSite e Offline-Toolchains",
  },
  {
    title: "Qualidade e entrega",
    description:
      "Typecheck, testes, builds, smoke tests, validação de migrations e processos de rollback tratados como parte do produto.",
    proof: "Evidência nos pipelines dos projetos",
  },
] as const;

function HomePage() {
  const projects = Route.useLoaderData();
  const featuredProjects = projects.slice(0, 3);

  return (
    <PublicShell>
      <section className="hero portfolio-hero" aria-labelledby="hero-title">
        <p className="eyebrow">Portfólio técnico</p>
        <h1 id="hero-title">
          Projetos que mostram como eu penso, construo e entrego software.
        </h1>
        <p className="hero-copy">
          Este portfólio reúne sistemas, experimentos, habilidades e formação
          com evidências reais: código, decisões técnicas, testes e resultados,
          sem barras arbitrárias de proficiência.
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" to="/projects">
            Ver projetos
          </Link>
          <Link className="button button-secondary" to="/stack">
            Explorar habilidades
          </Link>
        </div>
      </section>

      <section className="portfolio-section" aria-labelledby="capabilities-title">
        <div className="portfolio-section-heading">
          <div>
            <p className="eyebrow">Habilidades demonstradas</p>
            <h2 id="capabilities-title">Competência ligada a evidência.</h2>
          </div>
          <p>
            Cada área abaixo deve apontar para algo que foi realmente construído,
            testado ou documentado. O objetivo é mostrar profundidade sem
            transformar tecnologia em uma coleção de logos.
          </p>
        </div>

        <div className="portfolio-capability-list">
          {capabilityHighlights.map((capability) => (
            <article className="portfolio-capability" key={capability.title}>
              <div>
                <h3>{capability.title}</h3>
                <p>{capability.description}</p>
              </div>
              <span>{capability.proof}</span>
            </article>
          ))}
        </div>

        <Link className="text-link portfolio-section-link" to="/stack">
          Ver mapa completo de habilidades
        </Link>
      </section>

      <section className="featured-editorial" aria-labelledby="projects-title">
        <div className="featured-editorial-heading">
          <div>
            <p className="eyebrow">Projetos selecionados</p>
            <h2 id="projects-title">
              {featuredProjects.length === 0
                ? "Case studies em preparação."
                : "Projetos com contexto, decisões e resultados."}
            </h2>
          </div>
          <p>
            {featuredProjects.length === 0
              ? "Um projeto só entra nesta vitrine quando há contexto suficiente para explicar problema, solução, stack e decisões técnicas sem expor informações privadas do processo de desenvolvimento."
              : "A vitrine privilegia o que foi construído e aprendido, não apenas o nome do repositório ou uma lista de tecnologias."}
          </p>
        </div>

        {featuredProjects.length > 0 ? (
          <div className="public-project-grid home-project-grid">
            {featuredProjects.map((project) => (
              <Surface key={project.slug} className="public-project-card">
                <p className="eyebrow">Case study</p>
                <h3>{project.title}</h3>
                <p>{project.excerpt}</p>
                <div className="public-project-card-footer">
                  <span data-tabular>Projeto publicado</span>
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

        <Link className="text-link portfolio-section-link" to="/projects">
          Explorar todos os projetos
        </Link>
      </section>

      <section className="portfolio-credentials-preview" aria-labelledby="credentials-title">
        <div>
          <p className="eyebrow">Formação e certificados</p>
          <h2 id="credentials-title">Aprendizado com contexto verificável.</h2>
        </div>
        <div>
          <p>
            Cursos, formação e credenciais aparecem com instituição, situação e
            evidência verificável quando disponível. Certificados não substituem
            projetos; complementam o que eles demonstram.
          </p>
          <Link className="text-link" to="/credentials">
            Ver formação e certificados
          </Link>
        </div>
      </section>

      <section className="portfolio-cta" aria-labelledby="portfolio-cta-title">
        <div>
          <p className="eyebrow">Contato</p>
          <h2 id="portfolio-cta-title">Quer entender melhor um projeto?</h2>
        </div>
        <div>
          <p>
            A área de contato concentra os canais públicos para conversar sobre
            projetos, colaboração ou oportunidades.
          </p>
          <Link className="button button-primary" to="/contact">
            Entrar em contato
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
