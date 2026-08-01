import { EmptyState, Status, Surface } from "@semogtw/ui";
import { createFileRoute } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/operations")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  head: () => ({
    meta: [
      { title: "Operação — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: OperationsPage,
});

function OperationsPage() {
  return (
    <DevOSShell activePath="/devos/operations">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Saúde operacional</p>
          <h1>Operação</h1>
        </div>
        <Status tone="neutral">Sem integrações configuradas</Status>
      </header>
      <div className="devos-section-grid">
        <Surface>
          <h2>Sincronizações</h2>
          <EmptyState
            title="Nenhuma execução registrada"
            description="Runs de GitHub, migração e MCP aparecerão somente depois que seus adaptadores forem configurados."
          />
        </Surface>
        <Surface>
          <h2>Diagnósticos</h2>
          <EmptyState
            title="Nenhum diagnóstico disponível"
            description="Falhas serão registradas por código sanitizado, correlação e timestamp, nunca com tokens ou corpos privados."
          />
        </Surface>
      </div>
    </DevOSShell>
  );
}
