import { describe, expect, it } from "vitest";
import {
  buildPortfolioRobots,
  buildPortfolioSitemap,
  normalizePublicOrigin,
} from "./-public-discovery";

describe("public portfolio discovery", () => {
  it("derives the public origin from the actual request", () => {
    expect(
      normalizePublicOrigin("https://portfolio.example.test/projects?preview=1"),
    ).toBe("https://portfolio.example.test");
  });

  it("keeps unfinished/private surfaces out and includes published projects", () => {
    const sitemap = buildPortfolioSitemap("https://portfolio.example.test/", [
      { slug: "semogsite" },
      { slug: "fichario-virtual" },
    ]);

    expect(sitemap).toContain("<loc>https://portfolio.example.test/</loc>");
    expect(sitemap).toContain("<loc>https://portfolio.example.test/projects</loc>");
    expect(sitemap).toContain("<loc>https://portfolio.example.test/credentials</loc>");
    expect(sitemap).toContain("<loc>https://portfolio.example.test/journey</loc>");
    expect(sitemap).toContain(
      "<loc>https://portfolio.example.test/projects/semogsite</loc>",
    );
    expect(sitemap).toContain(
      "<loc>https://portfolio.example.test/projects/fichario-virtual</loc>",
    );
    expect(sitemap).not.toContain("/devos");
    expect(sitemap).not.toContain("/lab");
    expect(sitemap).not.toContain("/notes");
  });

  it("adds the notes index and details only when notes are published", () => {
    const sitemap = buildPortfolioSitemap(
      "https://portfolio.example.test",
      [],
      [{ slug: "arquitetura-portatil" }],
    );

    expect(sitemap).toContain("<loc>https://portfolio.example.test/notes</loc>");
    expect(sitemap).toContain(
      "<loc>https://portfolio.example.test/notes/arquitetura-portatil</loc>",
    );
  });

  it("escapes dynamic editorial slugs instead of interpolating raw path content", () => {
    const sitemap = buildPortfolioSitemap(
      "https://portfolio.example.test",
      [{ slug: "projeto & revisão" }],
      [{ slug: "nota & decisão" }],
    );

    expect(sitemap).toContain(
      "https://portfolio.example.test/projects/projeto%20%26%20revis%C3%A3o",
    );
    expect(sitemap).toContain(
      "https://portfolio.example.test/notes/nota%20%26%20decis%C3%A3o",
    );
    expect(sitemap).not.toContain("projeto & revisão");
    expect(sitemap).not.toContain("nota & decisão");
  });

  it("allows the portfolio while discouraging crawler access to private routes", () => {
    const robots = buildPortfolioRobots("https://portfolio.example.test/");

    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Disallow: /devos");
    expect(robots).toContain("Disallow: /api/v1/private/");
    expect(robots).toContain(
      "Sitemap: https://portfolio.example.test/sitemap.xml",
    );
  });
});
