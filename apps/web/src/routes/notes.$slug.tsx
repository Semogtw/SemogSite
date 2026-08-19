import { Surface } from "@semogtw/ui";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { PublicMarkdown } from "../components/public/public-markdown";
import { PublicShell } from "../components/public/public-shell";
import { getPublicEditorialDocumentRouteFn } from "../server/public-editorial";
import publicEditorialCss from "../styles/public-editorial.css?url";
import { publicEditorialDetailHead } from "./-public-editorial-head";

export const Route = createFileRoute("/notes/$slug")({
  loader: async ({ params }) => {
    const resolution = await getPublicEditorialDocumentRouteFn({
      data: { slug: params.slug, kind: "note" },
    });
    if (resolution.redirectSlug !== null) {
      throw redirect({
        to: "/notes/$slug",
        params: { slug: resolution.redirectSlug },
        statusCode: 308,
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }
    return resolution.document;
  },
  head: ({ loaderData, params }) => {
    const head = publicEditorialDetailHead({
      kind: "note",
      slug: params.slug,
      document: loaderData ?? null,
    });
    return {
      ...head,
      links: [...head.links, { rel: "stylesheet", href: publicEditorialCss }],
    };
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
