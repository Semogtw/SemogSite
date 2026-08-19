export const portfolioDiscoveryPaths = [
  "/",
  "/projects",
  "/stack",
  "/credentials",
  "/about",
  "/contact",
  "/journey",
] as const;

export type PublicDiscoveryProject = {
  slug: string;
};

export function normalizePublicOrigin(requestUrl: string): string {
  const url = new URL(requestUrl);
  return `${url.protocol}//${url.host}`;
}

export function buildPortfolioSitemap(
  origin: string,
  projects: readonly PublicDiscoveryProject[] = [],
): string {
  const normalizedOrigin = origin.replace(/\/+$/u, "");
  const staticUrls = portfolioDiscoveryPaths.map((path) =>
    path === "/" ? `${normalizedOrigin}/` : `${normalizedOrigin}${path}`,
  );
  const projectUrls = projects.map(
    (project) => `${normalizedOrigin}/projects/${encodeURIComponent(project.slug)}`,
  );
  const urls = [...staticUrls, ...projectUrls]
    .map((location) => `  <url>\n    <loc>${escapeXml(location)}</loc>\n  </url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function buildPortfolioRobots(origin: string): string {
  const normalizedOrigin = origin.replace(/\/+$/u, "");
  return `User-agent: *\nAllow: /\nDisallow: /devos\nDisallow: /api/v1/private/\n\nSitemap: ${normalizedOrigin}/sitemap.xml\n`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}
