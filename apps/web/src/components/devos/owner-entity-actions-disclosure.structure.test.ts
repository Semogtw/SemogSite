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

  it("uses commandId only as a React key", () => {
    expect(source).toContain("key={action.commandId}");
    expect(source).not.toContain("{action.commandId}");
  });
});
