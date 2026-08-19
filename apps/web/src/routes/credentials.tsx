import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "../components/public/public-shell";

export const Route = createFileRoute("/credentials")({
  head: () => ({
    meta: [
      { title: "Formação e certificados — Semogtw" },
      {
        name: "description",
        content:
          "Formação acadêmica, cursos em andamento e certificados da Semogtw apresentados com contexto e status explícitos.",
      },
    ],
  }),
  component: CredentialsPage,
});

const learningEntries = [
  {
    kind: "Formação acadêmica",
    title: "Ciência da Computação",
    issuer: "UESB",
    status: "Em andamento",
    description:
      "Graduação usada como base para aprofundar fundamentos de computação e conectar teoria com projetos de software.",
  },
  {
    kind: "Formação complementar",
    title: "Trilha de Analista de Dados",
    issuer: "DataCamp",
    status: "Em andamento",
    description:
      "Formação complementar voltada a desenvolver repertório prático para análise de dados e ampliar a atuação técnica.",
  },
] as const;

function CredentialsPage() {
  return (
    <PublicShell>
      <header className="editorial-page-header">
        <p className="eyebrow">Formação e certificados</p>
        <h1>Aprendizado registrado com contexto, não só com selos.</h1>
        <p>
          Esta página separa formação em andamento de certificados concluídos.
          Instituição, situação e evidência verificável ficam explícitas para não
          transformar estudo em uma lista ambígua de credenciais.
        </p>
      </header>

      <section className="credential-section" aria-labelledby="learning-title">
        <div className="portfolio-section-heading">
          <div>
            <p className="eyebrow">Em andamento</p>
            <h2 id="learning-title">Formação ativa</h2>
          </div>
          <p>
            Estudos atuais aparecem como formação em andamento e não são
            apresentados como certificações concluídas.
          </p>
        </div>

        <div className="credential-list">
          {learningEntries.map((entry) => (
            <article className="credential-row" key={`${entry.issuer}-${entry.title}`}>
              <div>
                <span>{entry.kind}</span>
                <h3>{entry.title}</h3>
              </div>
              <div>
                <strong>{entry.issuer}</strong>
                <span>{entry.status}</span>
              </div>
              <p>{entry.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="credential-section" aria-labelledby="certificates-title">
        <div className="portfolio-section-heading">
          <div>
            <p className="eyebrow">Concluídos</p>
            <h2 id="certificates-title">Certificados</h2>
          </div>
          <p>
            Certificados individuais serão publicados com nome exato, instituição,
            data e link de verificação quando esses dados estiverem preparados para
            exposição pública.
          </p>
        </div>

        <div className="credential-empty-state">
          <strong>Nenhum certificado individual publicado ainda.</strong>
          <p>
            A ausência é intencional: o portfólio não cria credenciais de exemplo
            nem transforma cursos em andamento em certificações concluídas.
          </p>
        </div>
      </section>

      <section className="portfolio-inline-cta" aria-labelledby="credentials-projects-title">
        <div>
          <p className="eyebrow">Aplicação prática</p>
          <h2 id="credentials-projects-title">Projetos continuam sendo a principal evidência.</h2>
        </div>
        <div>
          <p>
            Formação mostra repertório; os projetos mostram como esse repertório é
            usado para tomar decisões e construir sistemas reais.
          </p>
          <Link className="button button-primary" to="/projects">
            Ver projetos
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
