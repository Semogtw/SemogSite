import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "../components/public/public-shell";

export const Route = createFileRoute("/notes/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Nota ${params.slug} — Semogtw` },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Nota técnica ainda não publicada." },
    ],
  }),
  component: NotePage,
});

function NotePage() {
  const { slug } = Route.useParams();
  return (
    <PublicShell>
      <header className="editorial-page-header">
        <p className="eyebrow">Nota não publicada</p>
        <h1>Nenhuma publicação pública corresponde a “{slug}”.</h1>
        <p>Rascunhos privados nunca são usados para preencher uma rota pública.</p>
        <Link className="text-link" to="/notes">Voltar às notas</Link>
      </header>
    </PublicShell>
  );
}
