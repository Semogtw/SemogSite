import { EmptyState, Surface } from "@semogtw/ui";
import { createFileRoute } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/insights")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  head: () => ({
    meta: [
      { title: "Insights — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: InsightsPage,
});

function InsightsPage() {
  return (
    <DevOSShell activePath="/devos/more">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Síntese privada</p>
          <h1>Insights</h1>
        </div>
      </header>
      <Surface>
        <EmptyState
          title="Nenhum insight derivado"
          description="Sínteses futuras citarão sua origem, timestamp e confiança; texto importado nunca será tratado como instrução."
        />
      </Surface>
    </DevOSShell>
  );
}
