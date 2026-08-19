import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "../components/public/public-shell";
import { publicPortfolioHead } from "./-public-portfolio-head";

export const Route = createFileRoute("/contact")({
  head: () =>
    publicPortfolioHead({
      title: "Contato — Semogtw",
      description:
        "Canais públicos para conhecer o trabalho da Semogtw e entrar em contato sobre projetos, colaboração ou oportunidades.",
      path: "/contact",
    }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <PublicShell>
      <header className="editorial-page-header">
        <p className="eyebrow">Contato</p>
        <h1>Comece pelo trabalho público e continue a conversa por um canal verificável.</h1>
        <p>
          Esta página expõe apenas canais escolhidos para uso público. Dados de
          contas conectadas, integrações privadas e identificadores operacionais
          não são reaproveitados como contato.
        </p>
      </header>

      <section className="contact-channel-list" aria-label="Canais públicos">
        <article className="contact-channel">
          <div>
            <span>GitHub</span>
            <h2>Semogtw</h2>
            <p>
              Repositórios públicos, histórico de contribuições e projetos que
              complementam os case studies deste portfólio.
            </p>
          </div>
          <a
            className="button button-secondary"
            href="https://github.com/Semogtw"
            target="_blank"
            rel="noreferrer"
          >
            Abrir GitHub
          </a>
        </article>
      </section>

      <section className="portfolio-inline-cta" aria-labelledby="contact-projects-title">
        <div>
          <p className="eyebrow">Antes do contato</p>
          <h2 id="contact-projects-title">Quer contexto técnico primeiro?</h2>
        </div>
        <div>
          <p>
            Os projetos públicos reúnem decisões, stack, aprendizados e links
            relevantes para entender melhor o trabalho antes de conversar.
          </p>
          <Link className="button button-primary" to="/projects">
            Ver projetos
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
