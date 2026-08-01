import { EmptyState, Surface } from "@semogtw/ui";
import { createFileRoute } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/projects/")({
  beforeLoad: async ({ location }) => ({ owner: await requireOwner(location.href) }),
  head: () => ({ meta: [{ title: "Projetos — Semogtw DevOS" }, { name: "robots", content: "noindex, nofollow, noarchive" }] }),
  component: DevOSProjectsPage,
});

function DevOSProjectsPage() {
  return (
    <DevOSShell activePath="/devos/projects">
      <header className="devos-page-header"><div><p className="eyebrow">Portfólio operacional</p><h1>Projetos</h1></div></header>
      <Surface>
        <h2>Projetos ativos</h2>
        <EmptyState title="Nenhum projeto operacional carregado" description="O catálogo será preenchido pela migração validada; o seed demonstrativo não é apresentado como estado real." />
      </Surface>
      <details className="catalog-disclosure">
        <summary>Catálogo completo de repositórios</summary>
        <EmptyState title="Catálogo indisponível" description="Repositórios históricos serão exibidos somente dentro da sessão autenticada e após reconciliação." />
      </details>
    </DevOSShell>
  );
}
