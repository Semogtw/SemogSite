import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "../components/public/public-shell";
import { publicCredentials } from "../content/public-credentials";
import { publicPortfolioHead } from "./-public-portfolio-head";

export const Route = createFileRoute("/journey")({
  head: () =>
    publicPortfolioHead({
      title: "Trajetória — Semogtw",
      description:
        "Formação, aprendizado e marcos técnicos que ajudam a contextualizar a evolução do portfólio Semogtw.",
      path: "/journey",
    }),
  component: JourneyPage,
});

const currentMilestones = [
  {
    label: "Agora",
    title: "Portfólio profissional orientado por evidência",
    description:
      "O SemogSite está sendo organizado para conectar habilidades a projetos, decisões técnicas, verificações e formação, mantendo o DevOS operacional fora da superfície pública.",
    href: "/projects" as const,
    action: "Ver projetos",
  },
  {
    label: "Agora",
    title: "Projetos pessoais como laboratório de engenharia",
    description:
      "Aplicações, automações e experimentos são usados para aprofundar desenvolvimento web, backend, dados, infraestrutura e qualidade de software em situações concretas.",
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
          Esta página contextualiza o que está sendo estudado e construído agora,
          sem inventar datas, níveis ou marcos que ainda não tenham uma evidência
          pública adequada.
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
