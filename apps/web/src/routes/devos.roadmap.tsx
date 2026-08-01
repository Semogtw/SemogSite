import { EmptyState, Status, Surface } from "@semogtw/ui";
import { createFileRoute } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/roadmap")({
  beforeLoad: async ({ location }) => ({ owner: await requireOwner(location.href) }),
  head: () => ({ meta: [{ title: "Roadmap — Semogtw DevOS" }, { name: "robots", content: "noindex, nofollow, noarchive" }] }),
  component: RoadmapPage,
});

const columns = ["Backlog", "Próximas", "Em andamento", "Bloqueadas", "Concluídas"] as const;

function RoadmapPage() {
  return (
    <DevOSShell activePath="/devos/roadmap">
      <header className="devos-page-header">
        <div><p className="eyebrow">Execução verificável</p><h1>Roadmap</h1></div>
        <Status tone="info">Somente leitura nesta fundação</Status>
      </header>
      <div className="roadmap-board" aria-label="Etapas por estado">
        {columns.map((column) => (
          <Surface key={column} className="roadmap-column">
            <h2>{column}</h2>
            <EmptyState title="Sem etapas" description="Filtros e etapas persistidas aparecerão aqui sem alterar a ordem canônica." />
          </Surface>
        ))}
      </div>
    </DevOSShell>
  );
}
