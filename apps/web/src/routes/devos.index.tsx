import { EmptyState, Status, Surface } from "@semogtw/ui";
import { createFileRoute } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  head: () => ({
    meta: [
      { title: "Início — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: DevOSOverviewPage,
});

function DevOSOverviewPage() {
  return (
    <DevOSShell activePath="/devos">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Semogtw DevOS</p>
          <h1>Visão geral</h1>
        </div>
        <Status tone="neutral">Dados locais ainda não sincronizados</Status>
      </header>
      <div className="metric-grid" aria-label="Métricas operacionais">
        <Surface><span>Projetos ativos</span><strong data-tabular>0</strong></Surface>
        <Surface><span>Etapas em andamento</span><strong data-tabular>0</strong></Surface>
        <Surface><span>Atenções de alto impacto</span><strong data-tabular>0</strong></Surface>
      </div>
      <EmptyState
        title="Nenhum estado operacional carregado"
        description="O DevOS permanece funcional e honesto enquanto a migração e a sincronização GitHub ainda não foram executadas."
      />
    </DevOSShell>
  );
}
