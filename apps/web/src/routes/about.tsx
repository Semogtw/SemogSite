import { createFileRoute } from "@tanstack/react-router";
import { EditorialEmptyPage } from "../components/public/editorial-empty-page";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "Sobre — Semogtw" },
      { name: "description", content: "Princípios, trajetória e modo de construir da Semogtw." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <EditorialEmptyPage
      eyebrow="Sobre"
      title="Construção independente, contexto preservado."
      introduction="Esta página apresentará a identidade, os princípios e a trajetória da Semogtw sem transformar o site em um currículo genérico."
      emptyTitle="Conteúdo editorial em preparação"
      emptyDescription="A apresentação pública será adicionada somente depois de revisão explícita do texto e de suas referências."
    />
  );
}
