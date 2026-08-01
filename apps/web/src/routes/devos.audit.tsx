import { Button, EmptyState, Status, Surface } from "@semogtw/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { DevOSShell } from "../components/devos/devos-shell";
import { getAuditPageFn } from "../server/devos-audit";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/audit")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  loader: () =>
    getAuditPageFn({
      data: { page: 1, pageSize: 25, action: null, entityType: null },
    }),
  head: () => ({
    meta: [
      { title: "Auditoria — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: AuditPage,
});

const timestampFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Bahia",
  dateStyle: "short",
  timeStyle: "medium",
});

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data inválida"
    : timestampFormatter.format(date);
}

function formatJson(value: unknown): string {
  if (value === null) return "null";
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return "Valor não serializável";
  }
}

function AuditPage() {
  const initialPage = Route.useLoaderData();
  const [pageData, setPageData] = useState(initialPage);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadPage(page: number) {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await getAuditPageFn({
        data: {
          page,
          pageSize: pageData.pageSize,
          action: action.trim().length === 0 ? null : action,
          entityType: entityType.trim().length === 0 ? null : entityType,
        },
      });
      setPageData(result);
    } catch {
      setMessage("Não foi possível carregar a auditoria.");
    } finally {
      setPending(false);
    }
  }

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadPage(1);
  }

  return (
    <DevOSShell activePath="/devos/audit">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Rastreabilidade privada</p>
          <h1>Auditoria</h1>
        </div>
        <Status tone="neutral">{pageData.total} eventos</Status>
      </header>

      <Surface className="audit-filter-surface">
        <form className="audit-filters" onSubmit={applyFilters}>
          <label>
            Ação exata
            <input
              value={action}
              maxLength={200}
              placeholder="evidence.create"
              onChange={(event) => setAction(event.target.value)}
            />
          </label>
          <label>
            Tipo de entidade
            <input
              value={entityType}
              maxLength={200}
              placeholder="evidence"
              onChange={(event) => setEntityType(event.target.value)}
            />
          </label>
          <Button type="submit" tone="primary" disabled={pending}>
            {pending ? "Carregando…" : "Aplicar filtros"}
          </Button>
        </form>
        {message ? <p role="alert">{message}</p> : null}
      </Surface>

      {pageData.items.length === 0 ? (
        <EmptyState
          title="Nenhum evento encontrado"
          description="A auditoria permanece vazia quando não há mutações confirmadas para os filtros informados."
        />
      ) : (
        <div className="audit-list">
          {pageData.items.map((item) => (
            <Surface key={item.id} className="audit-record">
              <div className="audit-record__heading">
                <div>
                  <p className="eyebrow">{item.entityType}</p>
                  <h2>{item.action}</h2>
                </div>
                <Status tone={item.confirmed ? "success" : "warning"}>
                  {item.confirmed ? "confirmado" : "não confirmado"}
                </Status>
              </div>
              <dl className="audit-metadata">
                <div>
                  <dt>Entidade</dt>
                  <dd>{item.entityId}</dd>
                </div>
                <div>
                  <dt>Ator</dt>
                  <dd>{item.actor}</dd>
                </div>
                <div>
                  <dt>Horário</dt>
                  <dd>{formatTimestamp(item.occurredAt)}</dd>
                </div>
                <div>
                  <dt>Correlação</dt>
                  <dd>{item.correlationId}</dd>
                </div>
              </dl>
              <p className="audit-reason">{item.reason}</p>
              {item.malformedJson.length > 0 ? (
                <p className="audit-warning" role="status">
                  Snapshot histórico malformado: {item.malformedJson.join(", ")}.
                </p>
              ) : null}
              <details className="audit-snapshots">
                <summary>Ver snapshots</summary>
                <div className="audit-snapshot-grid">
                  <section>
                    <h3>Antes</h3>
                    <pre>{formatJson(item.before)}</pre>
                  </section>
                  <section>
                    <h3>Depois</h3>
                    <pre>{formatJson(item.after)}</pre>
                  </section>
                </div>
              </details>
            </Surface>
          ))}
        </div>
      )}

      <nav className="audit-pagination" aria-label="Paginação da auditoria">
        <Button
          tone="neutral"
          disabled={pending || pageData.page <= 1}
          onClick={() => void loadPage(pageData.page - 1)}
        >
          Anterior
        </Button>
        <span data-tabular>
          Página {pageData.page} de {Math.max(1, pageData.totalPages)}
        </span>
        <Button
          tone="neutral"
          disabled={pending || pageData.page >= pageData.totalPages}
          onClick={() => void loadPage(pageData.page + 1)}
        >
          Próxima
        </Button>
      </nav>
    </DevOSShell>
  );
}
