import { Surface } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  head: () => ({
    meta: [
      { title: "Administração — Semogtw" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: SiteAdministrationPage,
});

const actions = [
  {
    to: "/devos/content",
    title: "Gerenciar conteúdo",
    description: "Criar projetos, notas e páginas; revisar versões e controlar a publicação.",
  },
  {
    to: "/devos/audit",
    title: "Histórico de alterações",
    description: "Consultar mudanças registradas na área privada.",
  },
  {
    to: "/devos/settings",
    title: "Configurações",
    description: "Preferências, acesso e integrações administrativas do site.",
  },
] as const;

function SiteAdministrationPage() {
  return (
    <DevOSShell activePath="/devos">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Administração do site</p>
          <h1>Gerenciar Semogtw</h1>
          <p className="devos-page-intro">
            Área privada para preparar, revisar e publicar conteúdo do portfólio.
            O acompanhamento de repositórios e execuções de agentes não faz
            parte deste painel administrativo.
          </p>
        </div>
      </header>

      <div className="more-grid" aria-label="Ferramentas administrativas">
        {actions.map((action) => (
          <Link key={action.to} to={action.to} className="more-link">
            <Surface>
              <h2>{action.title}</h2>
              <p>{action.description}</p>
            </Surface>
          </Link>
        ))}
      </div>

      <p className="devos-page-intro">
        <Link className="text-link" to="/">Visualizar portfólio público</Link>
      </p>
    </DevOSShell>
  );
}
