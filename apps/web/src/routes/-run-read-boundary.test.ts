import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(import.meta.dirname, path), "utf8");
}

describe("cooperative run canonical read boundary", () => {
  it("keeps list and detail reads client-side on the private D1 API", () => {
    const listRoute = source("devos.runs.index.tsx");
    const detailRoute = source("devos.runs.$runId.tsx");
    const server = source("../server/devos-runs.ts");

    expect(listRoute).toContain("ssr: false");
    expect(listRoute).toContain("privateDevos.runs.list");
    expect(listRoute).not.toContain("getCooperativeRunsFn");

    expect(detailRoute).toContain("ssr: false");
    expect(detailRoute).toContain("privateDevos.runs.get");
    expect(detailRoute).toContain("includeSnapshots: true");
    expect(detailRoute).not.toContain("getCooperativeRunDetailFn");

    expect(server).not.toContain("SqliteCooperativeRunReadModel");
    expect(server).not.toContain("getCooperativeRunsFn");
    expect(server).not.toContain("getCooperativeRunDetailFn");
    expect(server).toContain("SqliteRepositoryTargetOptions");
  });
});
