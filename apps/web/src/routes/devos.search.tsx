import { EmptyState, Surface } from "@semogtw/ui";
import { createFileRoute } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/search")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  head: () => ({
    meta: [
      { title: "Busca — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  return (
    <DevOSShell activePath="/devos/more">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Recuperação privada</p>
          <h1>Busca</h1>
        </div>
      </header>
      <Surface>
        <EmptyState
          title="Índice ainda não construído"
          description="A busca respeitará autorização, origem e visibilidade em cada resultado, sem enviar conteúdo privado a serviços externos por padrão."
        />
      </Surface>
    </DevOSShell>
  );
}
