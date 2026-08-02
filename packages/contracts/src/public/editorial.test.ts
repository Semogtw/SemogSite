import { describe, expect, it } from "vitest";
import {
  PublicEditorialDocumentSchema,
  PublicEditorialListSchema,
} from "./editorial";

const hash = "a".repeat(64);
const document = {
  kind: "project",
  slug: "semog-site",
  title: "SemogSite",
  excerpt: "Plataforma editorial pública e DevOS privado.",
  bodyMarkdown: "# SemogSite\n\nConteúdo público revisado.",
  tags: ["typescript", "devos"],
  contentHash: hash,
  publishedRevisionId: "revision-1",
  updatedAt: "2026-08-01T23:20:00.000Z",
};

describe("public editorial contracts", () => {
  it("accepts only the reviewed public projection", () => {
    expect(PublicEditorialDocumentSchema.parse(document)).toEqual(document);
    expect(PublicEditorialListSchema.parse({ items: [document] })).toEqual({
      items: [document],
    });
  });

  it.each([
    ["private workflow status", { ...document, workflowStatus: "draft" }],
    ["private revision pointer", { ...document, workingRevisionId: "revision-2" }],
    ["review identity", { ...document, reviewerId: "semogtw-owner" }],
    ["operational branch", { ...document, branch: "develop/private" }],
    ["run metadata", { ...document, lastHeartbeatAt: document.updatedAt }],
    ["raw html", { ...document, bodyMarkdown: "<script>alert(1)</script>" }],
    ["invalid hash", { ...document, contentHash: "invalid" }],
  ])("rejects %s", (_name, value) => {
    expect(PublicEditorialDocumentSchema.safeParse(value).success).toBe(false);
  });
});
