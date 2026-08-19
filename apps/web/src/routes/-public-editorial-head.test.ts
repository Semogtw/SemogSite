import { describe, expect, it } from "vitest";
import {
  publicEditorialDetailHead,
  publicEditorialListHead,
} from "./-public-editorial-head";

describe("public editorial head metadata", () => {
  it("uses provider-neutral canonical paths for public indexes", () => {
    expect(publicEditorialListHead("note").links).toEqual([
      { rel: "canonical", href: "/notes" },
    ]);
    expect(publicEditorialListHead("project").links).toEqual([
      { rel: "canonical", href: "/projects" },
    ]);
  });

  it("keeps an empty editorial index out of search discovery", () => {
    const head = publicEditorialListHead("note", { index: false });

    expect(head.meta).toContainEqual({
      name: "robots",
      content: "noindex, follow",
    });
    expect(head.links).toEqual([{ rel: "canonical", href: "/notes" }]);
  });

  it("adds canonical and social metadata only for a published detail projection", () => {
    const head = publicEditorialDetailHead({
      kind: "note",
      slug: "arquitetura-portatil",
      document: {
        title: "Arquitetura portátil",
        excerpt: "Resumo público revisado.",
      },
    });

    expect(head.links).toEqual([
      { rel: "canonical", href: "/notes/arquitetura-portatil" },
    ]);
    expect(head.meta).toContainEqual({ title: "Arquitetura portátil — Semogtw" });
    expect(head.meta).toContainEqual({
      name: "description",
      content: "Resumo público revisado.",
    });
    expect(head.meta).toContainEqual({
      property: "og:title",
      content: "Arquitetura portátil — Semogtw",
    });
    expect(head.meta).toContainEqual({
      property: "og:description",
      content: "Resumo público revisado.",
    });
    expect(head.meta).toContainEqual({ name: "twitter:card", content: "summary" });
  });

  it("keeps unknown or withdrawn details noindex without a canonical link", () => {
    const head = publicEditorialDetailHead({
      kind: "project",
      slug: "projeto-retirado",
      document: null,
    });

    expect(head.links).toBeUndefined();
    expect(head.meta).toContainEqual({
      name: "robots",
      content: "noindex, nofollow",
    });
  });
});
