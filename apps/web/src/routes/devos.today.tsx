import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { Button, EmptyState, Status, Surface } from "@semogtw/ui";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { readCookie } from "../client/cookies";
import { DevOSShell } from "../components/devos/devos-shell";
import { transitionAttentionFn } from "../server/devos-attention-lifecycle";
import { getTodayQueueFn } from "../server/devos-today";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/today")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  loader: () => getTodayQueueFn(),
  head: () => ({
    meta: [
      { title: "Hoje — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: TodayPage,
});

type AttentionTargetStatus = "resolved" | "dismissed";

function AttentionActions({
  attentionId,
  expectedUpdatedAt,
}: {
  attentionId: string;
  expectedUpdatedAt: string;
}) {
  const router = useRouter();
  const [targetStatus, setTargetStatus] =
    useState<AttentionTargetStatus>("resolved");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!confirmed) {
      setMessage("Confirme conscientemente a finalização do item.");
      return;
    }

    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken === null) {
      setMessage("Não foi possível validar esta sessão.");
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      const result = await transitionAttentionFn({
        data: {
          csrfToken,
          idempotencyKey,
          attentionId,
          expectedUpdatedAt,
          targetStatus,
          reason,
          confirmed: true,
        },
      });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      setReason("");
      setConfirmed(false);
      setIdempotencyKey(crypto.randomUUID());
      await router.invalidate();
    } catch {
      setMessage("Não foi possível salvar esta alteração.");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="attention-actions">
      <summary>Finalizar item</summary>
      <form onSubmit={submit}>
        <label>
          Resultado
          <select
            value={targetStatus}
            onChange={(event) =>
              setTargetStatus(event.target.value as AttentionTargetStatus)
            }
          >
            <option value="resolved">Resolvido</option>
            <option value="dismissed">Dispensado</option>
          </select>
        </label>
        <label>
          Motivo
          <textarea
            value={reason}
            maxLength={500}
            rows={3}
            required
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <label className="attention-actions__confirmation">
          <input
            type="checkbox"
            checked={confirmed}
            required
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            Confirmo que este item deve sair da fila ativa e que o motivo será
            registrado na auditoria.
          </span>
        </label>
        {message ? (
          <p className="attention-actions__feedback" role="alert">
            {message}
          </p>
        ) : null}
        <Button
          type="submit"
          tone={targetStatus === "dismissed" ? "danger" : "primary"}
          disabled={pending || !confirmed}
        >
          {pending ? "Salvando…" : "Confirmar finalização"}
        </Button>
      </form>
    </details>
  );
}

function AttentionRecord({
  item,
  external = false,
}: {
  item: {
    id: string;
    title: string;
    nextAction: string;
    impact: "high" | "medium" | "low";
    updatedAt: string;
  };
  external?: boolean;
}) {
  return (
    <article className="devos-record devos-record--stacked">
      <div className="devos-record__main">
        <div>
          <h3>{item.title}</h3>
          <p>{item.nextAction}</p>
        </div>
        <Status
          tone={
            external ? "warning" : item.impact === "high" ? "danger" : "warning"
          }
        >
          {external ? "externa" : item.impact}
        </Status>
      </div>
      <AttentionActions
        attentionId={item.id}
        expectedUpdatedAt={item.updatedAt}
      />
    </article>
  );
}

function TodayPage() {
  const queue = Route.useLoaderData();

  return (
    <DevOSShell activePath="/devos/today">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Execução</p>
          <h1>Hoje</h1>
        </div>
        <Status tone="neutral">
          {queue.executeNow.length} em execução
        </Status>
      </header>

      <div className="devos-section-grid">
        <Surface>
          <h2>Executar agora</h2>
          {queue.executeNow.length === 0 ? (
            <EmptyState
              title="Fila vazia"
              description="Etapas em andamento aparecerão aqui após persistência validada."
            />
          ) : (
            <div className="devos-record-list">
              {queue.executeNow.map((item) => (
                <article key={item.stageId} className="devos-record">
                  <div>
                    <h3>{item.title}</h3>
                    <p>
                      {item.projectName} · {item.nextStep}
                    </p>
                  </div>
                  <div className="devos-record-actions">
                    <Status tone={item.partiallyBlocked ? "warning" : "info"}>
                      {item.progress}%
                    </Status>
                    <Link
                      to="/devos/projects/$slug"
                      params={{ slug: item.projectSlug }}
                    >
                      Projeto
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Surface>

        <Surface>
          <h2>Próximo na fila</h2>
          {queue.nextInQueue.length === 0 ? (
            <EmptyState
              title="Nenhuma próxima etapa"
              description="A fila não promove backlog automaticamente sem estado explícito."
            />
          ) : (
            <div className="devos-record-list">
              {queue.nextInQueue.map((item) => (
                <article key={item.stageId} className="devos-record">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.projectName}</p>
                  </div>
                  <div className="devos-record-actions">
                    <Status tone="neutral">{item.projectPriority}</Status>
                    <Link
                      to="/devos/projects/$slug"
                      params={{ slug: item.projectSlug }}
                    >
                      Projeto
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Surface>

        <Surface>
          <h2>Precisa de você</h2>
          {queue.needsOwner.length === 0 ? (
            <EmptyState
              title="Nenhuma decisão pendente"
              description="Itens atribuídos ao proprietário serão agrupados nesta seção."
            />
          ) : (
            <div className="devos-record-list">
              {queue.needsOwner.map((item) => (
                <AttentionRecord key={item.id} item={item} />
              ))}
            </div>
          )}
        </Surface>

        <Surface>
          <h2>Dependências externas</h2>
          {queue.externalDependencies.length === 0 ? (
            <EmptyState
              title="Nenhuma dependência registrada"
              description="Testes locais e dependências de ambiente serão apresentados sem presumir conclusão."
            />
          ) : (
            <div className="devos-record-list">
              {queue.externalDependencies.map((item) => (
                <AttentionRecord key={item.id} item={item} external />
              ))}
            </div>
          )}
        </Surface>
      </div>
    </DevOSShell>
  );
}
