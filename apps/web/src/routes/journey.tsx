import { createFileRoute } from "@tanstack/react-router";
import { EditorialEmptyPage } from "../components/public/editorial-empty-page";

export const Route = createFileRoute("/journey")({
  head: () => ({
    meta: [
      { title: "Trajetória — Semogtw" },
      { name: "description", content: "Marcos, aprendizados e projetos da trajetória Semogtw." },
    ],
  }),
  component: JourneyPage,
});

function JourneyPage() {
  return (
    <EditorialEmptyPage
      eyebrow="Trajetória"
      title="Marcos demonstrados por projetos e evidências."
      introduction="A linha do tempo combinará formação, entregas, estudos e aprendizados sem usar barras arbitrárias de habilidade."
      emptyTitle="Linha do tempo ainda não publicada"
      emptyDescription="Somente entradas com resumo público e visibilidade aprovada aparecerão nesta página."
    />
  );
}
