import { createFileRoute } from "@tanstack/react-router";
import { EditorialEmptyPage } from "../components/public/editorial-empty-page";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contato — Semogtw" },
      { name: "description", content: "Canais públicos de contato e colaboração da Semogtw." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <EditorialEmptyPage
      eyebrow="Contato"
      title="Canais públicos, deliberadamente escolhidos."
      introduction="Somente endereços e perfis explicitamente aprovados serão exibidos nesta página."
      emptyTitle="Canais em configuração"
      emptyDescription="Nenhum dado pessoal ou identificador privado será inferido a partir de integrações conectadas."
    />
  );
}
