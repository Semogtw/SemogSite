import { createFileRoute } from "@tanstack/react-router";
import { EditorialEmptyPage } from "../components/public/editorial-empty-page";

export const Route = createFileRoute("/lab")({
  head: () => ({
    meta: [
      { title: "Laboratório — Semogtw" },
      {
        name: "description",
        content: "Área reservada para experimentos e provas de conceito públicos da Semogtw.",
      },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  component: LabPage,
});

function LabPage() {
  return (
    <EditorialEmptyPage
      eyebrow="Laboratório"
      title="Experimentos podem ser úteis antes de estarem concluídos."
      introduction="O laboratório distinguirá claramente prova de conceito, experimento e produto estável quando houver material público suficiente para isso."
      emptyTitle="Laboratório ainda não publicado"
      emptyDescription="A rota está reservada para uso futuro e não é promovida nem indexada enquanto estiver vazia."
    />
  );
}
