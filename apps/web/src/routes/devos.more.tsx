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
      { title: "Mais — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: MorePage,
});

const destinations = [
  {
    to: "/devos/roadmap",
    title: "Roadmap",
    description: "Etapas, progresso e próximos gates dos projetos.",
  },
  {
    to: "/devos/runs",
    title: "Execuções",
    description: "Relatos cooperativos, checkpoints e comandos enfileirados.",
  },
  {
    to: "/devos/insights",
    title: "Insights",
    description: "Padrões e decisões derivados de evidência.",
  },
  {
    to: "/devos/capture",
    title: "Capturar",
    description: "Atenções e handoffs manuais com confirmação e auditoria.",
  },
  {
    to: "/devos/audit",
    title: "Auditoria",
    description: "Histórico privado de mutações, motivos e correlações.",
  },
  {
    to: "/devos/search",
    title: "Busca",
    description: "Pesquisa privada sobre conteúdo autorizado.",
  },
  {
    to: "/devos/content",
    title: "Conteúdo",
    description: "Fluxo editorial privado antes da publicação.",
  },
  {
    to: "/devos/settings",
    title: "Configurações",
    description: "Conta, integrações e preferências.",
  },
] as const;

function MorePage() {
  return (
    <DevOSShell activePath="/devos/more">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Outras ferramentas</p>
          <h1>Mais</h1>
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
