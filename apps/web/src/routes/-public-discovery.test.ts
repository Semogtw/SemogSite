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

  it("keeps unfinished/private surfaces out of the sitemap", () => {
    const sitemap = buildPortfolioSitemap("https://portfolio.example.test/");

    expect(sitemap).toContain("<loc>https://portfolio.example.test/</loc>");
    expect(sitemap).toContain("<loc>https://portfolio.example.test/projects</loc>");
    expect(sitemap).toContain("<loc>https://portfolio.example.test/credentials</loc>");
    expect(sitemap).toContain("<loc>https://portfolio.example.test/journey</loc>");
    expect(sitemap).not.toContain("/devos");
    expect(sitemap).not.toContain("/lab");
    expect(sitemap).not.toContain("/notes");
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
