import { EmptyState, Surface } from "@semogtw/ui";
import { createFileRoute } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/capture")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  head: () => ({
    meta: [
      { title: "Capturar — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: CapturePage,
});

function CapturePage() {
  return (
    <DevOSShell activePath="/devos/more">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Entrada rápida</p>
          <h1>Capturar</h1>
        </div>
      </header>
      <Surface>
        <EmptyState
          title="Captura ainda somente leitura"
          description="A primeira mutação exigirá validação, CSRF, confirmação, auditoria e origem explícita antes de ser habilitada."
        />
      </Surface>
    </DevOSShell>
  );
}
