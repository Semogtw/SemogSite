import { Surface } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/more")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  head: () => ({
    meta: [
      { title: "Ferramentas — Administração Semogtw" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: MorePage,
});

const destinations = [
  { to: "/devos/content", title: "Conteúdo", description: "Rascunhos, revisões e publicação do portfólio." },
  { to: "/devos/audit", title: "Auditoria", description: "Histórico privado de alterações." },
  { to: "/devos/settings", title: "Configurações", description: "Acesso e preferências do site." },
] as const;

function MorePage() {
  return (
    <DevOSShell activePath="/devos">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Administração do site</p>
          <h1>Ferramentas</h1>
        </div>
      </header>
      <div className="more-grid">
        {destinations.map((destination) => (
          <Link key={destination.to} to={destination.to} className="more-link">
            <Surface>
              <h2>{destination.title}</h2>
              <p>{destination.description}</p>
            </Surface>
          </Link>
        ))}
      </div>
    </DevOSShell>
  );
}
