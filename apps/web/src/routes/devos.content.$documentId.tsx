import { EmptyState, Status, Surface } from "@semogtw/ui";
import type { StatusTone } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { EditorialRevisionForm } from "../components/devos/editorial-revision-form";
import { EditorialWorkflowControls } from "../components/devos/editorial-workflow-controls";
import { getEditorialDocumentDetailFn } from "../server/devos-editorial";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/content/$documentId")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  loader: async ({ params }) =>
    getEditorialDocumentDetailFn({
      data: { documentId: params.documentId },
    }),
  head: () => ({
    meta: [
      { title: "Documento editorial — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: EditorialDocumentPage,
});

const timestampFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Bahia",
  dateStyle: "short",
  timeStyle: "short",
});

const workflowLabels = {
  draft: "rascunho",
  in_review: "em revisão",
  approved: "aprovado",
} as const;

const publicationLabels = {
  unpublished: "não publicado",
  published: "publicado",
  withdrawn: "retirado",
} as const;

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "data inválida"
    : timestampFormatter.format(date);
}

function workflowTone(
  status: keyof typeof workflowLabels,
): StatusTone {
  if (status === "approved") return "success";
  if (status === "in_review") return "warning";
  return "neutral";
}

function EditorialDocumentPage() {
  const detail = Route.useLoaderData();
  if (detail === null) {
    return (
      <DevOSShell activePath="/devos/more">
        <EmptyState
          title="Documento não encontrado"
          description="O documento pode ter sido removido da referência ou o identificador é inválido."
        />
      </DevOSShell>
    );
  }

  const working =
    detail.revisions.find(
      (revision) => revision.id === detail.document.workingRevisionId,
    ) ?? detail.revisions[0] ?? null;

  return (
    <DevOSShell activePath="/devos/more">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">/{detail.document.slug}</p>
          <h1>{working?.title ?? "Documento editorial"}</h1>
          <p className="devos-page-intro">
            Preview autenticado do conteúdo armazenado. Markdown é exibido
            como texto nesta fase; HTML bruto continua proibido.
          </p>
        </div>
        <div className="editorial-card__statuses">
          <Status tone={workflowTone(detail.document.workflowStatus)}>
            {workflowLabels[detail.document.workflowStatus]}
          </Status>
          <Status
            tone={
              detail.document.publicationStatus === "published"
                ? "success"
                : "neutral"
            }
          >
            {publicationLabels[detail.document.publicationStatus]}
          </Status>
        </div>
      </header>

      <Link className="text-link" to="/devos/content">
        ← Voltar ao conteúdo
      </Link>

      <div className="editorial-detail-grid">
        <Surface className="editorial-preview">
          <div className="surface-heading-row">
            <div>
              <p className="eyebrow">Preview privado</p>
              <h2>{working?.title ?? "Revisão indisponível"}</h2>
              <p className="muted-copy">
                {working?.excerpt ?? "Sem resumo disponível."}
              </p>
            </div>
            <Status tone="info">
              revisão {working?.sequence ?? "—"}
            </Status>
          </div>

          {working ? (
            <>
              <div className="editorial-preview__tags">
                {working.tags.length === 0 ? (
                  <span>Sem tags</span>
                ) : (
                  working.tags.map((tag) => <span key={tag}>{tag}</span>)
                )}
              </div>
              <pre className="editorial-preview__body">
                {working.bodyMarkdown}
              </pre>
              <dl className="editorial-card__metadata">
                <div>
                  <dt>Hash do conteúdo</dt>
                  <dd className="editorial-hash">{working.contentHash}</dd>
                </div>
                <div>
                  <dt>Criado</dt>
                  <dd>{formatTimestamp(working.createdAt)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <EmptyState
              title="Revisão indisponível"
              description="O documento existe, mas sua revisão de trabalho não pôde ser projetada."
            />
          )}
        </Surface>

        <Surface className="editorial-section">
          <p className="eyebrow">Estado editorial</p>
          <h2>Controle e histórico</h2>
          <dl className="editorial-card__metadata">
            <div>
              <dt>Versão do agregado</dt>
              <dd>{detail.document.version}</dd>
            </div>
            <div>
              <dt>Revisões</dt>
              <dd>{detail.revisions.length}</dd>
            </div>
            <div>
              <dt>Revisões sensíveis</dt>
              <dd>{detail.reviews.length}</dd>
            </div>
            <div>
              <dt>Eventos</dt>
              <dd>{detail.events.length}</dd>
            </div>
          </dl>
          <EditorialWorkflowControls
            documentId={detail.document.id}
            revisionId={detail.document.workingRevisionId}
            expectedUpdatedAt={detail.document.updatedAt}
            workflowStatus={detail.document.workflowStatus}
          />
          {working && detail.document.workflowStatus === "draft" ? (
            <EditorialRevisionForm
              documentId={detail.document.id}
              expectedUpdatedAt={detail.document.updatedAt}
              title={working.title}
              excerpt={working.excerpt}
              bodyMarkdown={working.bodyMarkdown}
              tags={working.tags}
            />
          ) : null}
        </Surface>
      </div>

      <Surface className="editorial-section">
        <div className="surface-heading-row">
          <div>
            <p className="eyebrow">Revisões imutáveis</p>
            <h2>Histórico de conteúdo</h2>
          </div>
        </div>
        <ol className="editorial-history-list">
          {detail.revisions.map((revision) => (
            <li key={revision.id}>
              <div>
                <strong>r{revision.sequence} · {revision.title}</strong>
                <p>{revision.excerpt}</p>
              </div>
              <time dateTime={revision.createdAt}>
                {formatTimestamp(revision.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      </Surface>

      <Surface className="editorial-section">
        <div className="surface-heading-row">
          <div>
            <p className="eyebrow">Auditoria editorial</p>
            <h2>Eventos</h2>
          </div>
        </div>
        <ol className="editorial-history-list">
          {detail.events.map((event) => (
            <li key={event.id}>
              <div>
                <strong>#{event.sequence} · {event.kind}</strong>
                <p>{event.summary}</p>
              </div>
              <time dateTime={event.occurredAt}>
                {formatTimestamp(event.occurredAt)}
              </time>
            </li>
          ))}
        </ol>
      </Surface>
    </DevOSShell>
  );
}
