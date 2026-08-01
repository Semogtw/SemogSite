import { createFileRoute } from "@tanstack/react-router";
import { EditorialEmptyPage } from "../components/public/editorial-empty-page";

export const Route = createFileRoute("/stack")({
  head: () => ({
    meta: [
      { title: "Stack — Semogtw" },
      { name: "description", content: "Tecnologias, ferramentas e métodos usados pela Semogtw." },
    ],
  }),
  component: StackPage,
});

function StackPage() {
  return (
    <EditorialEmptyPage
      eyebrow="Stack"
      title="Ferramentas escolhidas pelo problema, não pela vitrine."
      introduction="A stack pública explicará tecnologias e métodos por uso demonstrado, evitando listas de logos sem contexto."
      emptyTitle="Catálogo técnico em revisão"
      emptyDescription="Tecnologias serão publicadas com projetos ou evidências associadas."
    />
  );
}
