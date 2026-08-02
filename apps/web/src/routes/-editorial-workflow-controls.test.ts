import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(import.meta.dirname, path), "utf8");
}

describe("editorial workflow controls", () => {
  it("keeps public projection controls available across workflow states", () => {
    const controls = source("../components/devos/editorial-workflow-controls.tsx");

    expect(controls).toContain("const publicationManagement");
    expect(controls.match(/\{publicationManagement\}/gu)).toHaveLength(3);
  });

  it("restores only an explicitly selected approved historical revision", () => {
    const route = source("devos.content.$documentId.tsx");
    const server = source("../server/devos-editorial.ts");
    const controls = source("../components/devos/editorial-workflow-controls.tsx");

    expect(server).toContain("rollbackEditorialPublicationFn");
    expect(controls).toContain("Restaurar revisão aprovada");
    expect(controls).toContain("rollbackEditorialPublicationFn");
    expect(controls).toContain("Motivo do rollback");
    expect(route).toContain("rollbackCandidates={rollbackCandidates}");
  });

  it("requires an audit reason before withdrawing a public projection", () => {
    const server = source("../server/devos-editorial.ts");
    const controls = source("../components/devos/editorial-workflow-controls.tsx");

    expect(server).toContain("withdrawEditorialPublicationFn");
    expect(controls).toContain("Retirar projeção pública");
    expect(controls).toContain("withdrawEditorialPublicationFn");
    expect(controls).toContain("Motivo da retirada");
  });

  it("allows an approved revision to replace an older public projection", () => {
    const route = source("devos.content.$documentId.tsx");
    const controls = source("../components/devos/editorial-workflow-controls.tsx");

    expect(route).toContain('publishedRevisionId={detail.document.publishedRevisionId}');
    expect(controls).toContain("publishedRevisionId !== revisionId");
  });

  it("keeps publication separate and bound to the approved revision", () => {
    const route = source("devos.content.$documentId.tsx");
    const server = source("../server/devos-editorial.ts");
    const controls = source("../components/devos/editorial-workflow-controls.tsx");

    expect(server).toContain("publishEditorialRevisionFn");
    expect(controls).toContain("Publicar revisão aprovada");
    expect(controls).toContain("publishEditorialRevisionFn");
    expect(route).toContain('publicationStatus={detail.document.publicationStatus}');
  });

  it("requires an audit reason before reopening reviewed content", () => {
    const server = source("../server/devos-editorial.ts");
    const controls = source("../components/devos/editorial-workflow-controls.tsx");

    expect(server).toContain("reopenEditorialDraftFn");
    expect(controls).toContain("Reabrir como rascunho");
    expect(controls).toContain("reopenEditorialDraftFn");
    expect(controls).toContain("Motivo da reabertura");
  });

  it("exposes a sensitive checklist approval control while in review", () => {
    const route = source("devos.content.$documentId.tsx");
    const server = source("../server/devos-editorial.ts");
    const controls = source("../components/devos/editorial-workflow-controls.tsx");

    expect(server).toContain("approveEditorialRevisionFn");
    expect(controls).toContain("Aprovar revisão analisada");
    expect(controls).toContain("approveEditorialRevisionFn");
    expect(controls).toContain("markdownSafety");
    expect(route).toContain('revisionId={detail.document.workingRevisionId}');
  });

  it("exposes a draft-only submit-for-review control on document detail", () => {
    const route = source("devos.content.$documentId.tsx");
    const server = source("../server/devos-editorial.ts");
    const controls = source("../components/devos/editorial-workflow-controls.tsx");

    expect(server).toContain("submitEditorialForReviewFn");
    expect(controls).toContain("Enviar para revisão");
    expect(controls).toContain("submitEditorialForReviewFn");
    expect(route).toContain("EditorialWorkflowControls");
    expect(route).toContain('workflowStatus={detail.document.workflowStatus}');
  });
});
