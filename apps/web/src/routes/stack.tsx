import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "../components/public/public-shell";
import { publicPortfolioHead } from "./-public-portfolio-head";

export const Route = createFileRoute("/stack")({
  head: () =>
    publicPortfolioHead({
      title: "Habilidades — Semogtw",
      description:
        "Habilidades técnicas da Semogtw apresentadas por uso real em projetos, decisões de arquitetura, testes e entrega.",
      path: "/stack",
    }),
  component: SkillsPage,
});

const skillGroups = [
  {
    title: "Frontend e produto",
    summary:
      "Interfaces web construídas com foco em fluxo real, responsividade, acessibilidade e manutenção do sistema de design.",
    skills: [
      "TypeScript",
      "React",
      "TanStack Start / Router",
      "HTML semântico",
      "CSS responsivo",
      "Acessibilidade",
    ],
    evidence: "SemogSite",
  },
  {
    title: "Backend e APIs",
    summary:
      "Serviços tipados, contratos explícitos e fronteiras seguras entre interface, domínio, integrações e persistência.",
    skills: [
      "Node.js",
      "Hono",
      "Zod",
      "REST",
      "Autenticação e sessões",
      "Validação e segurança de entrada",
    ],
    evidence: "SemogSite",
  },
  {
    title: "Dados e persistência",
    summary:
      "Modelagem e evolução de dados com migrations, adapters portáveis, invariantes e rotinas de backup e restauração.",
    skills: [
      "SQLite",
      "Cloudflare D1",
      "Drizzle ORM",
      "Migrations",
      "Read models",
      "Backup e restore",
    ],
    evidence: "SemogSite",
  },
  {
    title: "Automação e engenharia de software",
    summary:
      "Pipelines e ferramentas para reduzir trabalho manual, preservar contexto e tornar verificações reproduzíveis.",
    skills: [
      "Git e GitHub",
      "GitHub Actions",
      "MCP",
      "Agentes de desenvolvimento",
      "Typecheck e testes",
      "Build, smoke test e rollback",
    ],
    evidence: "SemogSite · Offline-Toolchains",
  },
] as const;

function SkillsPage() {
  return (
    <PublicShell>
      <header className="editorial-page-header">
        <p className="eyebrow">Habilidades</p>
        <h1>Tecnologia explicada pelo que foi feito com ela.</h1>
        <p>
          Não uso porcentagens ou níveis arbitrários. As habilidades públicas são
          agrupadas por área e ligadas a projetos, decisões e processos que podem
          ser inspecionados.
        </p>
      </header>

      <section className="skill-group-list" aria-label="Áreas de habilidade">
        {skillGroups.map((group) => (
          <article className="skill-group" key={group.title}>
            <div className="skill-group__intro">
              <h2>{group.title}</h2>
              <p>{group.summary}</p>
            </div>
            <ul className="skill-list" aria-label={`Tecnologias em ${group.title}`}>
              {group.skills.map((skill) => (
                <li key={skill}>{skill}</li>
              ))}
            </ul>
            <div className="skill-group__evidence">
              <span>Evidência</span>
              <strong>{group.evidence}</strong>
            </div>
          </article>
        ))}
      </section>

      <section className="portfolio-inline-cta" aria-labelledby="skills-projects-title">
        <div>
          <p className="eyebrow">Do conhecimento à prática</p>
          <h2 id="skills-projects-title">Veja as habilidades dentro dos projetos.</h2>
        </div>
        <div>
          <p>
            Os case studies mostram onde cada tecnologia entrou, quais decisões
            ela suportou e quais verificações foram usadas para entregar o resultado.
          </p>
          <Link className="button button-primary" to="/projects">
            Abrir projetos
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
