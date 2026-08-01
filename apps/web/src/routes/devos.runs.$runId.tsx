import { EmptyState, Status, Surface } from "@semogtw/ui";
import type { StatusTone } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { RunCommandQueueForm } from "../components/devos/run-command-queue-form";
import { RunTransitionForm } from "../components/devos/run-transition-form";
import { getCooperativeRunDetailFn } from "../server/devos-runs";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/runs/$runId")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  loader: ({ params }) =>
    getCooperativeRunDetailFn({ data: { runId: params.runId } }),
  head: () => ({
    meta: [
      { title: "Histórico da execução — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: CooperativeRunDetailPage,
});

const timestampFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Bahia",
  dateStyle: "short",
  timeStyle: "medium",
});

const statusLabels = {
  running: "em andamento",
  blocked: "bloqueada",
  completed: "concluída",
  failed: "falhou",
  cancelled: "cancelada",
} as const;

const commandStatusLabels = {
  queued: "na fila",
  acknowledged: "reconhecido",
  completed: "aplicado",
  rejected: "rejeitado",
  expired: "expirado",
} as const;

function formatTimestamp(value: string | null): string {
  if (value === null) return "Não informado";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data inválida"
    : timestampFormatter.format(date);
}

function runTone(status: keyof typeof statusLabels): StatusTone {
  if (status === "completed") return "success";
  if (status === "blocked") return "warning";
  if (status === "failed" || status === "cancelled") return "danger";
  return "info";
}

function commandTone(
  status: keyof typeof commandStatusLabels,
): StatusTone {
  if (status === "completed") return "success";
  if (status === "rejected" || status === "expired") return "danger";
  if (status === "acknowledged") return "info";
  return "warning";
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return "Valor não serializável";
  }
}

function CooperativeRunDetailPage() {
  const detail = Route.useLoaderData();

  if (detail === null) {
    return (
      <DevOSShell activePath="/devos/runs">
        <header className="devos-page-header">
          <div>
            <p className="eyebrow">Ledger cooperativo</p>
            <h1>Execução não encontrada</h1>
          </div>
        </header>
        <EmptyState
          title="Nenhum registro corresponde a este endereço"
          description="IDs de URL não são usados para inferir estado de uma conversa ou processo."
        />
        <Link className="text-link" to="/devos/runs">
          Voltar às execuções
        </Link>
      </DevOSShell>
    );
  }

  const { run, events, checkpoints, commands } = detail;
  const acceptsCommands = run.status === "running" || run.status === "blocked";

  return (
    <DevOSShell activePath="/devos/runs">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Relato cooperativo · {run.origin}</p>
          <h1>{run.title}</h1>
          <p className="devos-page-intro">
            Histórico persistido pelo agente ou proprietário. Os horários indicam
            relatos recebidos, não telemetria do modelo em tempo real.
          </p>
        </div>
        <div className="run-card__statuses">
          <Status tone={runTone(run.status)}>
            {statusLabels[run.status]}
          </Status>
          <Status tone={run.freshness === "stale" ? "warning" : "neutral"}>
            {run.freshness === "stale"
              ? "possivelmente inativa"
              : "atual no último relato"}
          </Status>
        </div>
      </header>

      <div className="run-detail-summary-grid">
        <Surface>
          <h2>Último estado relatado</h2>
          <p>{run.summary}</p>
          <dl className="run-card__metadata">
            <div>
              <dt>Progresso</dt>
              <dd>{run.progress}%</dd>
            </div>
            <div>
              <dt>Fase</dt>
              <dd>{run.phase ?? "Não informada"}</dd>
            </div>
            <div>
              <dt>Branch</dt>
              <dd>{run.branch ?? "Não informada"}</dd>
            </div>
            <div>
              <dt>Último heartbeat</dt>
              <dd>{formatTimestamp(run.lastHeartbeatAt)}</dd>
            </div>
          </dl>
        </Surface>

        <Surface>
          <h2>Continuidade</h2>
          <p>
            <strong>Próxima ação:</strong> {run.nextAction ?? "Nenhuma"}
          </p>
          <p>
            <strong>Bloqueio:</strong> {run.blocker ?? "Nenhum relatado"}
          </p>
          <p className="muted-copy">
            Limite de freshness: {run.staleAfterSeconds} segundos · stale em:{" "}
            {formatTimestamp(run.staleAt)}
          </p>
        </Surface>
      </div>

      {acceptsCommands ? (
        <Surface className="run-detail-section">
          <div className="surface-heading-row">
            <div>
              <p className="eyebrow">Estado cooperativo</p>
              <h2>Registrar transição</h2>
              <p className="muted-copy">
                A transição atualiza o ledger; ela não controla o processo ou a
                conversa de origem.
              </p>
            </div>
          </div>
          <RunTransitionForm
            run={{
              id: run.id,
              status: run.status,
              progress: run.progress,
              phase: run.phase,
              branch: run.branch,
              nextAction: run.nextAction,
              updatedAt: run.updatedAt,
            }}
          />
        </Surface>
      ) : null}

      <Surface className="run-detail-section">
        <div className="surface-heading-row">
          <div>
            <p className="eyebrow">Evidência de continuidade</p>
            <h2>Checkpoints</h2>
          </div>
          <Status tone="neutral">{checkpoints.length}</Status>
        </div>
        {checkpoints.length === 0 ? (
          <EmptyState
            title="Nenhum checkpoint registrado"
            description="O progresso atual pode ter vindo apenas de registro ou heartbeat."
          />
        ) : (
          <div className="run-timeline">
            {checkpoints.map((checkpoint) => (
              <article key={checkpoint.id} className="run-timeline__item">
                <div className="run-timeline__heading">
                  <div>
                    <p className="eyebrow">
                      checkpoint {checkpoint.sequence} · {formatTimestamp(checkpoint.capturedAt)}
                    </p>
                    <h3>{checkpoint.summary}</h3>
                  </div>
                  <Status
                    tone={
                      checkpoint.testsStatus === "passed"
                        ? "success"
                        : checkpoint.testsStatus === "failed" ||
                            checkpoint.testsStatus === "blocked"
                          ? "danger"
                          : "warning"
                    }
                  >
                    testes: {checkpoint.testsStatus}
                  </Status>
                </div>
                <p>{checkpoint.testsSummary}</p>
                <dl className="run-card__metadata">
                  <div>
                    <dt>Progresso</dt>
                    <dd>{checkpoint.progress}%</dd>
                  </div>
                  <div>
                    <dt>Próximo passo</dt>
                    <dd>{checkpoint.nextStep}</dd>
                  </div>
                  <div>
                    <dt>Commits</dt>
                    <dd>
                      {checkpoint.malformedCommits
                        ? "Histórico malformado"
                        : checkpoint.commits.join(", ") || "Nenhum"}
                    </dd>
                  </div>
                  <div>
                    <dt>Bloqueios</dt>
                    <dd>{checkpoint.blockers || "Nenhum"}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </Surface>

      <Surface className="run-detail-section">
        <div className="surface-heading-row">
          <div>
            <p className="eyebrow">Pull cooperativo</p>
            <h2>Comandos do proprietário</h2>
            <p className="muted-copy">
              O agente recebe estes comandos somente quando consulta o DevOS;
              isto não envia uma mensagem instantânea ao ChatGPT.
            </p>
          </div>
          <Status tone="neutral">{commands.length}</Status>
        </div>

        {acceptsCommands ? (
          <RunCommandQueueForm runId={run.id} />
        ) : (
          <p className="muted-copy">
            A execução está em estado terminal e não aceita novos comandos.
          </p>
        )}

        {commands.length === 0 ? (
          <EmptyState
            title="Nenhum comando enfileirado"
            description="A ausência de comandos não altera nem interrompe a execução relatada."
          />
        ) : (
          <div className="run-command-list">
            {commands.map((command) => (
              <article key={command.id} className="run-command">
                <div className="run-timeline__heading">
                  <div>
                    <p className="eyebrow">
                      {command.kind} · {formatTimestamp(command.queuedAt)}
                    </p>
                    <h3>{command.summary}</h3>
                  </div>
                  <Status tone={commandTone(command.status)}>
                    {commandStatusLabels[command.status]}
                  </Status>
                </div>
                {command.reason ? <p>{command.reason}</p> : null}
                <details>
                  <summary>Ver payload privado</summary>
                  <pre>
                    {command.malformedPayload
                      ? "Payload histórico malformado"
                      : formatJson(command.payload)}
                  </pre>
                </details>
              </article>
            ))}
          </div>
        )}
      </Surface>

      <Surface className="run-detail-section">
        <div className="surface-heading-row">
          <div>
            <p className="eyebrow">Append-only</p>
            <h2>Eventos</h2>
          </div>
          <Status tone="neutral">{events.length}</Status>
        </div>
        {events.length === 0 ? (
          <EmptyState
            title="Nenhum evento disponível"
            description="O ledger não inventa histórico ausente."
          />
        ) : (
          <div className="run-timeline">
            {events.map((event) => (
              <article key={event.id} className="run-timeline__item">
                <p className="eyebrow">
                  #{event.sequence} · {event.kind} · {formatTimestamp(event.occurredAt)}
                </p>
                <h3>{event.summary}</h3>
                <p className="muted-copy">
                  {event.actor} · correlação {event.correlationId}
                </p>
                {event.malformedJson.length > 0 ? (
                  <p role="status" className="run-card__blocker">
                    Snapshot histórico malformado: {event.malformedJson.join(", ")}.
                  </p>
                ) : null}
                <details>
                  <summary>Ver snapshots</summary>
                  <div className="run-event-snapshots">
                    <section>
                      <h4>Antes</h4>
                      <pre>{formatJson(event.before)}</pre>
                    </section>
                    <section>
                      <h4>Depois</h4>
                      <pre>{formatJson(event.after)}</pre>
                    </section>
                  </div>
                </details>
              </article>
            ))}
          </div>
        )}
      </Surface>

      <Link className="text-link" to="/devos/runs">
        Voltar às execuções
      </Link>
    </DevOSShell>
  );
}
