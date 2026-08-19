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
    expect("scripts" in head).toBe(false);
  });

  it("serializes optional structured data as inert JSON-LD", () => {
    const head = publicPortfolioHead({
      title: "Semogtw — Portfólio",
      description: "Projetos e habilidades.",
      path: "/",
      structuredData: {
        "@context": "https://schema.org",
        "@type": "Person",
        name: "Semogtw",
        description: "Portfólio </script><script>alert(1)</script>",
      },
    });

    expect(head.scripts).toHaveLength(1);
    expect(head.scripts?.[0]).toMatchObject({ type: "application/ld+json" });
    expect(head.scripts?.[0]?.children).toContain("\\u003c/script>");
    expect(head.scripts?.[0]?.children).not.toContain("</script>");
  });
});
