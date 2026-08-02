import { EmptyState, Surface } from "@semogtw/ui";
import { createFileRoute } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/settings")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  head: () => ({
    meta: [
      { title: "Configurações — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <DevOSShell activePath="/devos/settings">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Preferências privadas</p>
          <h1>Configurações</h1>
        </div>
      </header>
      <div className="devos-section-grid">
        <Surface>
          <h2>Conta e sessão</h2>
          <EmptyState
            title="Controles em preparação"
            description="Rotação de credencial, revogação de sessões e logout serão expostos como mutações auditadas."
          />
        </Surface>
        <Surface>
          <h2>Integrações</h2>
          <EmptyState
            title="Nenhuma integração conectada"
            description="GitHub, MCP e hospedagem continuarão atrás de adaptadores e permissões explícitas."
          />
        </Surface>
      </div>
    </DevOSShell>
  );
}
