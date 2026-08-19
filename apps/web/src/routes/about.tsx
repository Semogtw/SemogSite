import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "../components/public/public-shell";
import { publicPortfolioHead } from "./-public-portfolio-head";

export const Route = createFileRoute("/about")({
  head: () =>
    publicPortfolioHead({
      title: "Sobre — Semogtw",
      description:
        "Sobre a Semogtw: formação em Ciência da Computação, projetos pessoais e uma abordagem de desenvolvimento guiada por evidências.",
      path: "/about",
    }),
  component: AboutPage,
});

const workingPrinciples = [
  {
    title: "Construir para aprender",
    description:
      "Uso projetos pessoais como ambiente para transformar fundamentos em decisões concretas de produto, arquitetura, dados e operação.",
  },
  {
    title: "Verificar antes de afirmar",
    description:
      "Testes, typecheck, builds, smoke tests e documentação fazem parte da entrega e também da forma como uma habilidade é apresentada neste portfólio.",
  },
  {
    title: "Preservar contexto",
    description:
      "Branches, handoffs, histórico e documentação são usados para que decisões técnicas não desapareçam quando uma sessão ou ferramenta termina.",
  },
] as const;

function AboutPage() {
  return (
    <PublicShell>
      <header className="editorial-page-header">
        <p className="eyebrow">Sobre</p>
        <h1>Aprender computação construindo sistemas que precisam funcionar de verdade.</h1>
        <p>
          Sou estudante de Ciência da Computação na UESB e mantenho projetos
          pessoais para aprofundar engenharia de software, automação, dados e
          infraestrutura. A Semogtw é a identidade que reúne esse trabalho público.
        </p>
      </header>

      <section className="portfolio-section" aria-labelledby="approach-title">
        <div className="portfolio-section-heading">
          <div>
            <p className="eyebrow">Como trabalho</p>
            <h2 id="approach-title">Processo também é evidência técnica.</h2>
          </div>
          <p>
            O objetivo não é parecer experiente por quantidade de tecnologias,
            mas mostrar evolução por decisões registradas, sistemas executáveis e
            verificações reproduzíveis.
          </p>
        </div>

        <div className="portfolio-capability-list">
          {workingPrinciples.map((principle) => (
            <article className="portfolio-capability" key={principle.title}>
              <div>
                <h3>{principle.title}</h3>
                <p>{principle.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="portfolio-inline-cta" aria-labelledby="about-projects-title">
        <div>
          <p className="eyebrow">Evidência</p>
          <h2 id="about-projects-title">A melhor continuação é abrir os projetos.</h2>
        </div>
        <div>
          <p>
            Os case studies conectam essa forma de trabalhar a código, decisões,
            tecnologias e resultados concretos.
          </p>
          <Link className="button button-primary" to="/projects">
            Ver projetos
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
