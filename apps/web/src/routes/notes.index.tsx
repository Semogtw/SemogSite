import { createFileRoute } from "@tanstack/react-router";
import { EditorialEmptyPage } from "../components/public/editorial-empty-page";

export const Route = createFileRoute("/notes/")({
  head: () => ({
    meta: [
      { title: "Notas — Semogtw" },
      { name: "description", content: "Notas técnicas, decisões, retrospectivas e tutoriais publicados pela Semogtw." },
    ],
  }),
  component: NotesPage,
});

function NotesPage() {
  return (
    <EditorialEmptyPage
      eyebrow="Notas"
      title="Decisões e aprendizados que merecem permanecer."
      introduction="Notas podem nascer de sessões privadas, mas passam por sanitização, revisão e aprovação antes de aparecer aqui."
      emptyTitle="Nenhuma nota publicada"
      emptyDescription="Rascunhos privados e sessões de desenvolvimento não são indexados nem usados como conteúdo público."
    />
  );
}
