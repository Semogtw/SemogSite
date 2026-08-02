import { describe, expect, it } from "vitest";
import { toPublicProjectDto } from "./project";

const source = {
  slug: "offline-toolchains",
  name: "Offline Toolchains",
  visibility: "public" as const,
  publicSummary: "Toolchains reproduzíveis para ambientes offline.",
  publicProgress: 45,
  featured: true,
  liveUrl: null,
  documentationUrl: "https://example.invalid/public-docs",
  lastPublicActivityAt: "2026-08-01T00:00:00.000Z",
  privateSummary: "PRIVATE_MARKER",
  branchSummary: "secret/internal",
  repositoryFullNames: ["Semogtw/private-repo"],
  blockers: ["PRIVATE_BLOCKER"],
  evidenceUrls: ["https://example.invalid/private-evidence"],
  sessionDetails: ["PRIVATE_SESSION"],
  auditEventIds: ["audit-private"],
};

describe("toPublicProjectDto", () => {
  it("does not serialize private repository or operational fields", () => {
    const serialized = JSON.stringify(toPublicProjectDto(source));

    expect(serialized).not.toContain("PRIVATE_");
    expect(serialized).not.toContain("private-repo");
    expect(serialized).not.toContain("secret/internal");
    expect(serialized).not.toContain("private-evidence");
    expect(serialized).not.toContain("audit-private");
  });

  it("rejects private sources", () => {
    expect(() =>
      toPublicProjectDto({ ...source, visibility: "private" }),
    ).toThrow("PUBLICATION_NOT_ALLOWED");
  });
});
