import { EmptyState, Surface } from "@semogtw/ui";
import { createFileRoute } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/today")({
  beforeLoad: async ({ location }) => ({ owner: await requireOwner(location.href) }),
  head: () => ({ meta: [{ title: "Hoje — Semogtw DevOS" }, { name: "robots", content: "noindex, nofollow, noarchive" }] }),
  component: TodayPage,
});

function TodayPage() {
  return (
    <DevOSShell activePath="/devos/today">
      <header className="devos-page-header">
        <div><p className="eyebrow">Execução</p><h1>Hoje</h1></div>
      </header>
      <div className="devos-section-grid">
        <Surface><h2>Executar agora</h2><EmptyState title="Fila vazia" description="Etapas em andamento aparecerão aqui após a carga de dados." /></Surface>
        <Surface><h2>Precisa de você</h2><EmptyState title="Nenhuma decisão pendente" description="Itens atribuídos ao proprietário serão agrupados nesta seção." /></Surface>
        <Surface><h2>Dependências externas</h2><EmptyState title="Nenhuma dependência registrada" description="Testes locais e dependências de ambiente serão apresentados sem presumir conclusão." /></Surface>
      </div>
    </DevOSShell>
  );
}
