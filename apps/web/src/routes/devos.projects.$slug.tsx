import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import type { ProjectHub } from "@semogtw/domain";
import { EmptyState, Status, Surface } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { EvidenceCaptureForm } from "../components/devos/evidence-capture-form";
import { StageCompletionForm } from "../components/devos/stage-completion-form";
import { PrivateApiError } from "../lib/private-api-client";
import { createPrivateDevosBrowserClient } from "../lib/private-devos-browser-client";
import { requireOwner } from "../server/require-owner";

const privateDevos = createPrivateDevosBrowserClient({
  csrfCookieName: CSRF_COOKIE_NAME,
});

async function loadProjectHub(slug: string): Promise<ProjectHub | null> {
  try {
    return await privateDevos.read<ProjectHub>(
      `/api/v1/private/projects/${encodeURIComponent(slug)}` as `/api/v1/private/${string}`,
    );
  } catch (error) {
    if (error instanceof PrivateApiError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

export const Route = createFileRoute("/devos/projects/$slug")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  loader: ({ params }) => loadProjectHub(params.slug),
  head: () => ({
    meta: [
      { title: "Hub do projeto — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: ProjectHubPage,
});

function ProjectHubPage() {
  const { slug } = Route.useParams();
  const hub = Route.useLoaderData();

  if (hub === null) {
    return (
      <DevOSShell activePath="/devos/projects">
        <header className="devos-page-header">
          <div>
            <p className="eyebrow">Hub privado</p>
            <h1>Projeto não encontrado</h1>
          </div>
        </header>
        <EmptyState
          title="Nenhum projeto corresponde a este endereço"
          description="O nome da URL não é usado para inferir conteúdo operacional."
        />
        <Link className="text-link" to="/devos/projects">
          Voltar aos projetos
        </Link>
      </DevOSShell>
    );
  }

  return (
    <DevOSShell activePath="/devos/projects">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Hub privado · {slug}</p>
          <h1>{hub.project.name}</h1>
        </div>
        <Status tone="neutral">Origem: {hub.dataSource}</Status>
      </header>

      <div className="devos-section-grid">
        <Surface>
          <h2>Foco agora</h2>
          <p>{hub.project.focus}</p>
          <p className="muted-copy">Próxima ação: {hub.project.nextAction}</p>
        </Surface>
        <Surface>
          <h2>Próximo gate</h2>
          {hub.nextGate === null ? (
            <EmptyState
              title="Gate indisponível"
              description="Nenhum workstream ativo possui gate persistido."
            />
          ) : (
            <p>{hub.nextGate}</p>
          )}
        </Surface>
        <Surface>
          <h2>Etapas atuais</h2>
          {hub.currentStages.length === 0 ? (
            <EmptyState
              title="Nenhuma etapa atual"
              description="Etapas next, em andamento ou bloqueadas aparecerão aqui."
            />
          ) : (
            <div className="devos-record-list">
              {hub.currentStages.map((stage) => (
                <article
                  key={stage.id}
                  className="devos-record devos-record--stacked"
                >
                  <div className="devos-record__main">
                    <div>
                      <h3>{stage.title}</h3>
                      <p>{stage.nextStep ?? stage.currentPosition}</p>
                    </div>
                    <Status
                      tone={stage.state === "blocked" ? "danger" : "info"}
                    >
                      {stage.progress}% · {stage.state}
                    </Status>
                  </div>
                  <StageCompletionForm stageId={stage.id} />
                </article>
              ))}
            </div>
          )}
        </Surface>
        <Surface>
          <h2>Repositórios</h2>
          {hub.repositories.length === 0 ? (
            <EmptyState
              title="Nenhum repositório associado"
              description="O seed demonstrativo não inventa identidade GitHub."
            />
          ) : (
            <div className="devos-record-list">
              {hub.repositories.map((repository) => (
                <article key={repository.id} className="devos-record">
                  <div>
                    <h3>{repository.fullName}</h3>
                    <p>
                      {repository.role} · {repository.activeBranch ?? repository.defaultBranch}
                    </p>
                  </div>
                  <Status
                    tone={repository.status === "active" ? "success" : "neutral"}
                  >
                    {repository.status}
                  </Status>
                </article>
              ))}
            </div>
          )}
        </Surface>
        <Surface>
          <div className="surface-heading-row">
            <div>
              <h2>Evidências recentes</h2>
              <p className="muted-copy">
                Registros manuais preservam o estado observado e geram auditoria.
              </p>
            </div>
          </div>
          <EvidenceCaptureForm
            projectId={hub.project.id}
            stages={hub.currentStages.map((stage) => ({
              id: stage.id,
              title: stage.title,
            }))}
          />
          {hub.evidence.length === 0 ? (
            <EmptyState
              title="Nenhuma evidência capturada"
              description="Conclusões não serão inferidas sem commits, testes, documentos ou notas observadas."
            />
          ) : (
            <div className="devos-record-list evidence-record-list">
              {hub.evidence.map((item) => (
                <article key={item.id} className="devos-record">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.summary}</p>
                  </div>
                  <Status tone={item.status === "passed" ? "success" : "neutral"}>
                    {item.status}
                  </Status>
                </article>
              ))}
            </div>
          )}
        </Surface>
        <Surface>
          <h2>Sessões recentes</h2>
          {hub.recentSessions.length === 0 ? (
            <EmptyState
              title="Nenhuma sessão registrada"
              description="Continuidade de agentes aparecerá após importação ou captura auditada."
            />
          ) : (
            <div className="devos-record-list">
              {hub.recentSessions.map((session) => (
                <article key={session.id} className="devos-record">
                  <div>
                    <h3>{session.title}</h3>
                    <p>{session.nextStep}</p>
                  </div>
                  <Status tone={session.testsStatus === "passed" ? "success" : "warning"}>
                    {session.testsStatus}
                  </Status>
                </article>
              ))}
            </div>
          )}
        </Surface>
      </div>

      <Link className="text-link" to="/devos/projects">
        Voltar aos projetos
      </Link>
    </DevOSShell>
  );
}
