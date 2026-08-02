import { EmptyState, Surface } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "../components/public/public-shell";
import { getPublicEditorialFn } from "../server/public-editorial";

export const Route = createFileRoute("/notes/")({
  loader: () => getPublicEditorialFn({ data: { kind: "note", limit: 50 } }),
  head: () => ({
    meta: [
      { title: "Notas — Semogtw" },
      {
        name: "description",
        content:
          "Notas técnicas, decisões, retrospectivas e tutoriais publicados pela Semogtw.",
      },
    ],
  }),
  component: NotesPage,
});

function NotesPage() {
  const notes = Route.useLoaderData();

  return (
    <PublicShell>
      <header className="editorial-page-header">
        <p className="eyebrow">Notas</p>
        <h1>Decisões e aprendizados que merecem permanecer.</h1>
        <p>
          Cada nota passa por revisão sensível e publicação explícita. Rascunhos,
          checklist e contexto operacional privado nunca entram nesta listagem.
        </p>
      </header>

      {notes.length === 0 ? (
        <EmptyState
          title="Nenhuma nota publicada"
          description="Rascunhos privados e sessões de desenvolvimento não são indexados nem usados como conteúdo público."
        />
      ) : (
        <section className="public-editorial-grid" aria-label="Notas publicadas">
          {notes.map((note) => (
            <Surface key={note.slug} className="public-editorial-card">
              <div className="public-editorial-card__meta">
                <p className="eyebrow">Nota publicada</p>
                <time dateTime={note.updatedAt}>
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "medium",
                    timeZone: "America/Bahia",
                  }).format(new Date(note.updatedAt))}
                </time>
              </div>
              <h2>{note.title}</h2>
              <p>{note.excerpt}</p>
              <div className="public-editorial-tags" aria-label="Marcadores">
                {note.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <Link to="/notes/$slug" params={{ slug: note.slug }}>
                Ler nota
              </Link>
            </Surface>
          ))}
        </section>
      )}
    </PublicShell>
  );
}
