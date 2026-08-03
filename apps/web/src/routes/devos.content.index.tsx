import { EmptyState, Status, Surface } from "@semogtw/ui";
import type { StatusTone } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { EditorialDocumentForm } from "../components/devos/editorial-document-form";
import { getEditorialDocumentsFn } from "../server/devos-editorial";

export const Route = createFileRoute("/devos/content/")({
  loader: async () => getEditorialDocumentsFn({ data: { limit: 100 } }),
  head: () => ({
    meta: [
      { title: "Conteúdo — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: ContentPage,
});

const timestampFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Bahia",
  dateStyle: "short",
  timeStyle: "short",
});

const kindLabels = {
  project: "Projeto",
  note: "Nota",
  experiment: "Experimento",
  page: "Página",
} as const;

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

function publicationTone(
  status: keyof typeof publicationLabels,
): StatusTone {
  if (status === "published") return "success";
  if (status === "withdrawn") return "warning";
  return "neutral";
}

function ContentPage() {
  const documents = Route.useLoaderData();
  const reviewCount = documents.filter(
    ({ document }) => document.workflowStatus === "in_review",
  ).length;

  return (
    <DevOSShell activePath="/devos/more">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Workflow editorial privado</p>
          <h1>Conteúdo</h1>
          <p className="devos-page-intro">
            Documentos autorais e revisões imutáveis. Nada nesta tela vira
            conteúdo público sem aprovação e publicação explícitas.
          </p>
        </div>
        <Status tone={reviewCount > 0 ? "warning" : "neutral"}>
          {documents.length} documentos · {reviewCount} em revisão
        </Status>
      </header>

      <Surface className="editorial-section">
        <div className="surface-heading-row">
          <div>
            <p className="eyebrow">Autoria privada</p>
            <h2>Novo documento</h2>
            <p className="muted-copy">
              O primeiro conteúdo é salvo como revisão imutável e permanece
              não publicado.
            </p>
          </div>
        </div>
        <EditorialDocumentForm />
      </Surface>

      {documents.length === 0 ? (
        <EmptyState
          title="Nenhum documento editorial"
          description="Crie um rascunho privado para iniciar o histórico de revisões."
        />
      ) : (
        <div className="editorial-card-grid">
          {documents.map(({ document, workingTitle, publishedTitle }) => (
            <Surface key={document.id} className="editorial-card">
              <div className="editorial-card__heading">
                <div>
                  <p className="eyebrow">
                    {kindLabels[document.kind]} · /{document.slug}
                  </p>
                  <h2>{workingTitle ?? "Título indisponível"}</h2>
                </div>
                <div className="editorial-card__statuses">
                  <Status tone={workflowTone(document.workflowStatus)}>
                    {workflowLabels[document.workflowStatus]}
                  </Status>
                  <Status tone={publicationTone(document.publicationStatus)}>
                    {publicationLabels[document.publicationStatus]}
                  </Status>
                </div>
              </div>

              <dl className="editorial-card__metadata">
                <div>
                  <dt>Versão do documento</dt>
                  <dd>{document.version}</dd>
                </div>
                <div>
                  <dt>Atualizado</dt>
                  <dd>{formatTimestamp(document.updatedAt)}</dd>
                </div>
                <div>
                  <dt>Título público atual</dt>
                  <dd>{publishedTitle ?? "Nenhum"}</dd>
                </div>
              </dl>

              <Link
                className="text-link"
                to="/devos/content/$documentId"
                params={{ documentId: document.id }}
              >
                Abrir documento e preview
              </Link>
            </Surface>
          ))}
        </div>
      )}
    </DevOSShell>
  );
}
