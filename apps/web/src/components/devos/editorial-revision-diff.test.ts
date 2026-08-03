import { describe, expect, it } from "vitest";
import { compareEditorialRevisions } from "./editorial-revision-diff";

const base = {
  id: "revision-1",
  sequence: 1,
  title: "Título original",
  excerpt: "Resumo original",
  bodyMarkdown: "# Título\n\nLinha igual\nLinha antiga\nFim",
  tags: ["arquitetura", "privado"],
};

describe("compareEditorialRevisions", () => {
  it("reports changed fields and a bounded line-oriented body diff", () => {
    const comparison = compareEditorialRevisions(base, {
      ...base,
      id: "revision-2",
      sequence: 2,
      title: "Título revisado",
      excerpt: "Resumo revisado",
      bodyMarkdown: "# Título\n\nLinha igual\nLinha nova\nLinha adicional\nFim",
      tags: ["arquitetura", "publicável"],
    });

    expect(comparison.fields).toEqual([
      {
        field: "title",
        label: "Título",
        before: "Título original",
        after: "Título revisado",
      },
      {
        field: "excerpt",
        label: "Resumo",
        before: "Resumo original",
        after: "Resumo revisado",
      },
      {
        field: "tags",
        label: "Tags",
        before: "arquitetura, privado",
        after: "arquitetura, publicável",
      },
    ]);
    expect(comparison.body.summary).toEqual({
      added: 2,
      removed: 1,
      unchanged: 4,
    });
    expect(comparison.body.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "removed", text: "Linha antiga" }),
        expect.objectContaining({ kind: "added", text: "Linha nova" }),
        expect.objectContaining({ kind: "added", text: "Linha adicional" }),
      ]),
    );
  });

  it("compacts long unchanged runs without leaking unbounded output", () => {
    const unchanged = Array.from({ length: 80 }, (_, index) => `linha ${index}`);
    const comparison = compareEditorialRevisions(
      { ...base, bodyMarkdown: [...unchanged, "antes"].join("\n") },
      { ...base, sequence: 2, bodyMarkdown: [...unchanged, "depois"].join("\n") },
    );

    expect(comparison.body.lines.some((line) => line.kind === "omitted")).toBe(
      true,
    );
    expect(comparison.body.lines.length).toBeLessThan(30);
    expect(comparison.body.summary).toEqual({
      added: 1,
      removed: 1,
      unchanged: 80,
    });
  });
});
