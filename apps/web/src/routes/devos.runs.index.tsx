import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { EmptyState, Status, Surface } from "@semogtw/ui";
import type { StatusTone } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { RunRegistrationForm } from "../components/devos/run-registration-form";
import { createPrivateDevosBrowserClient } from "../lib/private-devos-browser-client";
import { getCooperativeRunRegistrationOptionsFn } from "../server/devos-runs";
import { requireOwner } from "../server/require-owner";

const privateDevos = createPrivateDevosBrowserClient({
  csrfCookieName: CSRF_COOKIE_NAME,
});

export const Route = createFileRoute("/devos/runs/")({
  ssr: false,
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  loader: async () => {
    const [runPage, projects] = await Promise.all([
      privateDevos.runs.list({ limit: 100 }),
      getCooperativeRunRegistrationOptionsFn(),
    ]);
    return { runs: runPage.runs, projects };
  },
  head: () => ({
    meta: [
      { title: "Execuções — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: CooperativeRunsPage,
});

const timestampFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Bahia",
  dateStyle: "short",
  timeStyle: "short",
});

const statusLabels = {
  running: "em andamento",
  blocked: "bloqueada",
  completed: "concluída",
  failed: "falhou",
  cancelled: "cancelada",
} as const;

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "data inválida"
    : timestampFormatter.format(date);
}

function statusTone(status: keyof typeof statusLabels): StatusTone {
  if (status === "completed") return "success";
  if (status === "blocked") return "warning";
  if (status === "failed" || status === "cancelled") return "danger";
  return "info";
}

function CooperativeRunsPage() {
  const { runs, projects } = Route.useLoaderData();
  const staleCount = runs.filter((run) => run.freshness.heartbeatExpired).length;

  return (
    <DevOSShell activePath="/devos/runs">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Relatos cooperativos</p>
          <h1>Execuções</h1>
          <p className="devos-page-intro">
            Estado informado por agentes participantes. Esta tela não observa
            conversas do ChatGPT nem prova que um modelo continua executando.
          </p>
        </div>
        <Status tone={staleCount > 0 ? "warning" : "neutral"}>
          {runs.length} registros · {staleCount} possivelmente inativos
        </Status>
      </header>

      <Surface className="run-detail-section">
        <div className="surface-heading-row">
          <div>
            <p className="eyebrow">Registro explícito</p>
            <h2>Nova execução cooperativa</h2>
            <p className="muted-copy">
              Criar o registro não inicia um agente. Use-o somente para um
              participante que concordou em publicar checkpoints.
            </p>
          </div>
        </div>
        <RunRegistrationForm projects={projects} />
      </Surface>

      {runs.length === 0 ? (
        <EmptyState
          title="Nenhuma execução cooperativa registrada"
          description="Uma execução aparece somente depois que um agente ou o proprietário registra e atualiza o ledger explicitamente."
        />
      ) : (
        <div className="run-card-grid">
          {runs.map((run) => (
            <Surface key={run.id} className="run-card">
              <div className="run-card__heading">
                <div>
                  <p className="eyebrow">{run.actorLabel}</p>
                  <h2>{run.title}</h2>
                </div>
                <div className="run-card__statuses">
                  <Status tone={statusTone(run.status)}>
                    {statusLabels[run.status]}
                  </Status>
                  <Status
                    tone={run.freshness.heartbeatExpired ? "warning" : "neutral"}
                  >
                    {run.freshness.heartbeatExpired
                      ? "possivelmente inativa"
                      : "atual no último relato"}
                  </Status>
                </div>
              </div>

              <p>{run.summary}</p>

              <dl className="run-card__metadata">
                <div>
                  <dt>Fase</dt>
                  <dd>{run.phase ?? "Não informada"}</dd>
                </div>
                <div>
                  <dt>Progresso relatado</dt>
                  <dd>{run.progress}%</dd>
                </div>
                <div>
                  <dt>Último relato</dt>
                  <dd>{formatTimestamp(run.lastHeartbeatAt)}</dd>
                </div>
                <div>
                  <dt>Próxima ação</dt>
                  <dd>{run.nextAction ?? "Nenhuma"}</dd>
                </div>
              </dl>

              {run.blocker ? (
                <p className="run-card__blocker">
                  <strong>Bloqueio:</strong> {run.blocker}
                </p>
              ) : null}

              <Link
                className="text-link"
                to="/devos/runs/$runId"
                params={{ runId: run.id }}
              >
                Abrir histórico
              </Link>
            </Surface>
          ))}
        </div>
      )}
    </DevOSShell>
  );
}
