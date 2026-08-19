import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "../components/public/public-shell";
import {
  credentialKindLabel,
  listPublicCredentialsByStatus,
  type PublicCredential,
} from "../content/public-credentials";
import { publicPortfolioHead } from "./-public-portfolio-head";

export const Route = createFileRoute("/credentials")({
  head: () =>
    publicPortfolioHead({
      title: "Formação e certificados — Semogtw",
      description:
        "Formação acadêmica, cursos em andamento e certificados da Semogtw apresentados com contexto e status explícitos.",
      path: "/credentials",
    }),
  component: CredentialsPage,
});

function CredentialsPage() {
  const activeCredentials = listPublicCredentialsByStatus("in_progress");
  const completedCredentials = listPublicCredentialsByStatus("completed");

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
          {activeCredentials.map((credential) => (
            <CredentialRow credential={credential} key={credential.id} />
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
            Certificados individuais são publicados com nome exato, instituição,
            data e link de verificação quando essas informações estão disponíveis
            e preparadas para exposição pública.
          </p>
        </div>

        {completedCredentials.length > 0 ? (
          <div className="credential-list">
            {completedCredentials.map((credential) => (
              <CredentialRow credential={credential} key={credential.id} />
            ))}
          </div>
        ) : (
          <div className="credential-empty-state">
            <strong>Nenhum certificado individual publicado ainda.</strong>
            <p>
              A ausência é intencional: o portfólio não cria credenciais de exemplo
              nem transforma cursos em andamento em certificações concluídas.
            </p>
          </div>
        )}
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

function CredentialRow({ credential }: { credential: PublicCredential }) {
  return (
    <article className="credential-row">
      <div>
        <span>{credentialKindLabel[credential.kind]}</span>
        <h3>{credential.title}</h3>
        <div className="public-editorial-tags" aria-label="Habilidades relacionadas">
          {credential.relatedSkills.map((skill) => (
            <span key={skill}>{skill}</span>
          ))}
        </div>
      </div>
      <div>
        <strong>{credential.issuer}</strong>
        <span>
          {credential.status === "completed"
            ? credential.issuedOn
              ? `Concluído em ${formatCredentialDate(credential.issuedOn)}`
              : "Concluído"
            : "Em andamento"}
        </span>
        {credential.verificationUrl ? (
          <a
            className="text-link"
            href={credential.verificationUrl}
            target="_blank"
            rel="noreferrer"
          >
            Verificar credencial
          </a>
        ) : null}
      </div>
      <p>{credential.description}</p>
    </article>
  );
}

function formatCredentialDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
