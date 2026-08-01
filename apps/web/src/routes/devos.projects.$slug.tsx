import { EmptyState, Status, Surface } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/projects/$slug")({
  beforeLoad: async ({ location }) => ({ owner: await requireOwner(location.href) }),
  head: () => ({ meta: [{ title: "Hub do projeto — Semogtw DevOS" }, { name: "robots", content: "noindex, nofollow, noarchive" }] }),
  component: ProjectHubPage,
});

function ProjectHubPage() {
  const { slug } = Route.useParams();
  return (
    <DevOSShell activePath="/devos/projects">
      <header className="devos-page-header">
        <div><p className="eyebrow">Hub privado</p><h1>{slug}</h1></div>
        <Status tone="neutral">Contexto não carregado</Status>
      </header>
      <div className="devos-section-grid">
        <Surface><h2>Foco agora</h2><EmptyState title="Sem foco persistido" description="Nenhum valor é inferido da URL ou do nome do projeto." /></Surface>
        <Surface><h2>Próximo gate</h2><EmptyState title="Gate indisponível" description="A próxima entrega aparecerá somente após leitura autenticada do serviço de domínio." /></Surface>
      </div>
      <Surface>
        <h2>Contexto para agente</h2>
        <p>O texto será gerado por `buildAgentContext` usando dados persistidos, timestamp e confiança.</p>
      </Surface>
      <Link className="text-link" to="/devos/projects">Voltar aos projetos</Link>
    </DevOSShell>
  );
}
