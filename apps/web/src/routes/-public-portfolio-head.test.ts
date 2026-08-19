import { describe, expect, it } from "vitest";
import { publicPortfolioHead } from "./-public-portfolio-head";

describe("publicPortfolioHead", () => {
  it("keeps document, social and canonical metadata aligned", () => {
    const head = publicPortfolioHead({
      title: "Habilidades — Semogtw",
      description: "Habilidades demonstradas por projetos.",
      path: "/stack",
    });

    expect(head.meta).toContainEqual({ title: "Habilidades — Semogtw" });
    expect(head.meta).toContainEqual({
      property: "og:title",
      content: "Habilidades — Semogtw",
    });
    expect(head.meta).toContainEqual({
      name: "twitter:description",
      content: "Habilidades demonstradas por projetos.",
    });
    expect(head.links).toEqual([{ rel: "canonical", href: "/stack" }]);
  });
});
