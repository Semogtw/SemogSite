import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "../components/public/public-shell";

export const Route = createFileRoute("/")({
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

      <section className="empty-editorial" aria-labelledby="projects-title">
        <p className="eyebrow">Projetos selecionados</p>
        <h2 id="projects-title">As publicações começam deliberadamente vazias.</h2>
        <p>
          Projetos só aparecem aqui depois de receberem conteúdo público
          aprovado. Dados operacionais nunca são usados como substituto.
        </p>
      </section>
    </PublicShell>
  );
}
