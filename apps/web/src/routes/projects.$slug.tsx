import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "../components/public/public-shell";

export const Route = createFileRoute("/projects/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Projeto ${params.slug} — Semogtw` },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Página pública de projeto ainda não publicada." },
    ],
  }),
  component: ProjectPage,
});

function ProjectPage() {
  const { slug } = Route.useParams();
  return (
    <PublicShell>
      <header className="editorial-page-header">
        <p className="eyebrow">Projeto não publicado</p>
        <h1>Nenhum conteúdo público corresponde a “{slug}”.</h1>
        <p>
          Rotas de projeto não usam dados privados como fallback. O conteúdo
          ficará disponível somente após aprovação editorial.
        </p>
        <Link className="text-link" to="/projects">Voltar aos projetos</Link>
      </header>
    </PublicShell>
  );
}
