import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(import.meta.dirname, path), "utf8");
}

describe("public editorial routes", () => {
  it("loads only published notes through the public editorial server boundary", () => {
    const listRoute = source("notes.index.tsx");
    const detailRoute = source("notes.$slug.tsx");
    const server = source("../server/public-editorial.ts");

    expect(server).toContain("getPublicEditorialFn");
    expect(server).toContain("getPublicEditorialDocumentRouteFn");
    expect(listRoute).toContain('kind: "note"');
    expect(listRoute).toContain("getPublicEditorialFn");
    expect(detailRoute).toContain("getPublicEditorialDocumentRouteFn");
    expect(detailRoute).toContain("statusCode: 308");
    expect(detailRoute).toContain('kind: "note"');
  });

  it("renders approved markdown through the reviewed React renderer", () => {
    const detailRoute = source("notes.$slug.tsx");

    expect(detailRoute).toContain("PublicMarkdown");
    expect(detailRoute).toContain("document.bodyMarkdown");
    expect(detailRoute).not.toContain("dangerouslySetInnerHTML");
  });

  it("uses permanent same-origin redirects only for audited aliases", () => {
    const notes = source("notes.$slug.tsx");
    const projects = source("projects.$slug.tsx");
    const editorialServer = source("../server/public-editorial.server.ts");

    expect(editorialServer).toContain("resolveBySlug");
    expect(editorialServer).toContain("resolveRedirect");
    expect(notes).toContain("redirectSlug");
    expect(notes).toContain("statusCode: 308");
    expect(notes).toContain('"Cache-Control": "no-store, max-age=0"');
    expect(projects).toContain("redirectSlug");
    expect(projects).toContain("statusCode: 308");
    expect(projects).toContain('"Cache-Control": "no-store, max-age=0"');
  });

});
