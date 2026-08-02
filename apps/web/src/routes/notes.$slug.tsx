import { Surface } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicMarkdown } from "../components/public/public-markdown";
import { PublicShell } from "../components/public/public-shell";
import { getPublicEditorialDocumentFn } from "../server/public-editorial";

export const Route = createFileRoute("/notes/$slug")({
  loader: ({ params }) =>
    getPublicEditorialDocumentFn({
      data: { slug: params.slug, kind: "note" },
    }),
  head: ({ loaderData, params }) =>
    loaderData == null
      ? {
          meta: [
            { title: `Nota ${params.slug} — Semogtw` },
            { name: "robots", content: "noindex, nofollow" },
            {
              name: "description",
              content: "Nota técnica ainda não publicada.",
            },
          ],
        }
      : {
          meta: [
            { title: `${loaderData.title} — Semogtw` },
            { name: "description", content: loaderData.excerpt },
          ],
        },
  component: NotePage,
});

function NotePage() {
  const { slug } = Route.useParams();
  const document = Route.useLoaderData();

  if (document === null) {
    return (
      <PublicShell>
        <header className="editorial-page-header">
          <p className="eyebrow">Nota não publicada</p>
          <h1>Nenhuma publicação pública corresponde a “{slug}”.</h1>
          <p>
            Rascunhos privados, revisões retiradas e outros tipos editoriais
            nunca são usados para preencher esta rota.
          </p>
          <Link className="text-link" to="/notes">
            Voltar às notas
          </Link>
        </header>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <article className="public-editorial-detail">
        <header className="editorial-page-header">
          <p className="eyebrow">Nota publicada</p>
          <h1>{document.title}</h1>
          <p>{document.excerpt}</p>
        </header>

        <div className="public-editorial-byline">
          <time dateTime={document.updatedAt}>
            Publicada em{" "}
            {new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "long",
              timeZone: "America/Bahia",
            }).format(new Date(document.updatedAt))}
          </time>
          <div className="public-editorial-tags" aria-label="Marcadores">
            {document.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>

        <Surface className="public-editorial-content">
          <PublicMarkdown markdown={document.bodyMarkdown} />
        </Surface>

        <Link className="text-link" to="/notes">
          Todas as notas
        </Link>
      </article>
    </PublicShell>
  );
}
