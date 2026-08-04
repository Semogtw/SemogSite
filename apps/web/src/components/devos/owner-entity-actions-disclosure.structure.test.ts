import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./owner-entity-actions-disclosure.tsx", import.meta.url),
  "utf8",
);

describe("owner entity action disclosure structure", () => {
  it("uses the private discovery endpoint and human labels", () => {
    expect(source).toContain("getOwnerEntityActionsFn");
    expect(source).toContain("Ações disponíveis");
    expect(source).toContain("labelPtBr");
    expect(source).toContain("Exige confirmação");
    expect(source).toContain("Planejado");
  });

  it("does not depend on or render technical command identities", () => {
    expect(source).not.toContain("action.commandId");
    expect(source).not.toContain("attention.transition");
    expect(source).not.toContain("roadmap.stages.complete");
  });
});
