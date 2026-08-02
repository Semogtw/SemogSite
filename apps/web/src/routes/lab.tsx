import { createFileRoute } from "@tanstack/react-router";
import { EditorialEmptyPage } from "../components/public/editorial-empty-page";

export const Route = createFileRoute("/lab")({
  head: () => ({
    meta: [
      { title: "Laboratório — Semogtw" },
      { name: "description", content: "Experimentos, protótipos e provas de conceito da Semogtw." },
    ],
  }),
  component: LabPage,
});

function LabPage() {
  return (
    <EditorialEmptyPage
      eyebrow="Laboratório"
      title="Experimentos podem ser úteis antes de estarem concluídos."
      introduction="O laboratório distinguirá claramente prova de conceito, experimento e produto estável."
      emptyTitle="Experimentos públicos em preparação"
      emptyDescription="Nenhum protótipo privado será exposto automaticamente por sincronização."
    />
  );
}
