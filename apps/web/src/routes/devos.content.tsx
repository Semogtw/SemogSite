import { EmptyState, Status, Surface } from "@semogtw/ui";
import { createFileRoute } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/content")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  head: () => ({
    meta: [
      { title: "Conteúdo — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: ContentPage,
});

function ContentPage() {
  return (
    <DevOSShell activePath="/devos/more">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Workflow editorial</p>
          <h1>Conteúdo</h1>
        </div>
        <Status tone="info">Publicação exige aprovação</Status>
      </header>
      <Surface>
        <EmptyState
          title="Nenhum rascunho editorial"
          description="Rascunhos permanecerão privados até sanitização, revisão, aprovação do proprietário e definição explícita de visibilidade."
        />
      </Surface>
    </DevOSShell>
  );
}
