import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "../components/public/public-shell";
import { publicCredentials } from "../content/public-credentials";
import journeyCss from "../styles/journey.css?url";
import { publicPortfolioHead } from "./-public-portfolio-head";

export const Route = createFileRoute("/journey")({
  head: () => {
    const head = publicPortfolioHead({
      title: "Trajetória — Semogtw",
      description:
        "Formação, aprendizado e marcos técnicos que ajudam a contextualizar a evolução profissional da Semogtw.",
      path: "/journey",
    });

    return {
      ...head,
      links: [...head.links, { rel: "stylesheet", href: journeyCss }],
    };
  },
  component: JourneyPage,
});

const currentMilestones = [
  {
    label: "Foco atual",
    title: "Engenharia de software aplicada a projetos próprios",
    description:
      "Aplicações web, automações e ferramentas são usadas para aprofundar arquitetura, backend, interfaces, persistência e entrega em sistemas que precisam ser executáveis e verificáveis.",
    href: "/projects" as const,
    action: "Ver projetos",
  },
  {
    label: "Foco atual",
    title: "Expandir repertório sem separar estudo de prática",
    description:
      "Fundamentos da graduação e formação complementar são conectados a implementação, análise, documentação e testes, para que o aprendizado apareça em trabalho concreto e não apenas em uma lista de cursos.",
    href: "/stack" as const,
    action: "Ver habilidades",
  },
] as const;

function JourneyPage() {
  const activeFormation = publicCredentials.filter(
    (credential) => credential.status === "in_progress",
  );

  return (
    <PublicShell>
      <header className="editorial-page-header">
        <p className="eyebrow">Trajetória</p>
        <h1>Formação e projetos vistos como uma evolução contínua.</h1>
        <p>
          O foco é mostrar como estudo e prática se encontram hoje. Datas e marcos
          históricos só entram quando houver contexto público suficiente para
          apresentá-los com precisão.
        </p>
      </header>

      <section className="journey-list" aria-label="Marcos atuais">
        {currentMilestones.map((milestone) => (
          <article className="journey-entry" key={milestone.title}>
            <span className="journey-entry__marker">{milestone.label}</span>
            <div>
              <h2>{milestone.title}</h2>
              <p>{milestone.description}</p>
              <Link className="text-link" to={milestone.href}>
                {milestone.action}
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="journey-formation" aria-labelledby="journey-formation-title">
        <div className="portfolio-section-heading">
          <div>
            <p className="eyebrow">Formação atual</p>
            <h2 id="journey-formation-title">Aprendizado em andamento</h2>
          </div>
          <p>
            Entradas em andamento são mostradas exatamente como formação ativa;
            conclusão e certificação só aparecem depois de existirem de fato.
          </p>
        </div>

        <div className="journey-formation__grid">
          {activeFormation.map((credential) => (
            <article key={credential.id}>
              <span>{credential.issuer}</span>
              <h3>{credential.title}</h3>
              <p>{credential.description}</p>
            </article>
          ))}
        </div>

        <Link className="text-link portfolio-section-link" to="/credentials">
          Ver formação e certificados
        </Link>
      </section>
    </PublicShell>
  );
}
