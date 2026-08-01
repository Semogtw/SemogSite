import { createFileRoute } from "@tanstack/react-router";
import { EditorialEmptyPage } from "../components/public/editorial-empty-page";

export const Route = createFileRoute("/projects/")({
  head: () => ({
    meta: [
      { title: "Projetos — Semogtw" },
      { name: "description", content: "Catálogo editorial de projetos publicamente aprovados da Semogtw." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  return (
    <EditorialEmptyPage
      eyebrow="Projetos"
      title="Produtos e sistemas com contexto verificável."
      introduction="Cada projeto publicado terá problema, proposta, decisões, arquitetura segura, marcos e links exclusivamente públicos."
      emptyTitle="Nenhum projeto aprovado para publicação"
      emptyDescription="O catálogo não usa automaticamente registros privados. Um projeto só aparece após sanitização e aprovação editorial."
    />
  );
}
