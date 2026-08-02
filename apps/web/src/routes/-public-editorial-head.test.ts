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

  it("adds canonical metadata only for a published detail projection", () => {
    expect(
      publicEditorialDetailHead({
        kind: "note",
        slug: "arquitetura-portatil",
        document: {
          title: "Arquitetura portátil",
          excerpt: "Resumo público revisado.",
        },
      }),
    ).toMatchObject({
      links: [{ rel: "canonical", href: "/notes/arquitetura-portatil" }],
      meta: [
        { title: "Arquitetura portátil — Semogtw" },
        { name: "description", content: "Resumo público revisado." },
      ],
    });
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
