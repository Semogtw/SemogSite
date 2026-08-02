import { describe, expect, it } from "vitest";
import {
  computeEditorialContentHash,
  parseEditorialTags,
} from "./editorial-content.server";

describe("editorial content helpers", () => {
  it("normalizes comma-separated tags deterministically", () => {
    expect(parseEditorialTags(" TypeScript, devos,typescript,  privacy ")).toEqual([
      "typescript",
      "devos",
      "privacy",
    ]);
  });

  it("hashes the normalized authored content", () => {
    const first = computeEditorialContentHash({
      title: "  Documento ",
      excerpt: " Resumo ",
      bodyMarkdown: "# Corpo\n",
      tags: ["DevOS", "privacy", "devos"],
    });
    const equivalent = computeEditorialContentHash({
      title: "Documento",
      excerpt: "Resumo",
      bodyMarkdown: "# Corpo",
      tags: ["devos", "privacy"],
    });
    const changed = computeEditorialContentHash({
      title: "Documento",
      excerpt: "Resumo alterado",
      bodyMarkdown: "# Corpo",
      tags: ["devos", "privacy"],
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(equivalent).toBe(first);
    expect(changed).not.toBe(first);
  });
});
