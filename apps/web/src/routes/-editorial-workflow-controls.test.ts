import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(import.meta.dirname, path), "utf8");
}

describe("editorial workflow controls", () => {
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
