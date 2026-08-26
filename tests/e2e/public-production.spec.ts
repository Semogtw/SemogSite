import { expect, test } from "@playwright/test";

test("public HTML ships baseline browser metadata and delivery headers", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);

  const headers = response?.headers() ?? {};
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");

  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#0b0d12",
  );
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/favicon.svg",
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/site.webmanifest",
  );
});

test("favicon and web manifest are valid public assets", async ({ request }) => {
  const favicon = await request.get("/favicon.svg");
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()["content-type"]).toContain("image/svg+xml");
  expect(await favicon.text()).toContain("<svg");

  const manifest = await request.get("/site.webmanifest");
  expect(manifest.status()).toBe(200);
  expect(manifest.headers()["content-type"]).toContain("application/manifest+json");
  const body = (await manifest.json()) as {
    name?: string;
    start_url?: string;
    display?: string;
    icons?: Array<{ src?: string }>;
  };
  expect(body.name).toBe("Semogtw");
  expect(body.start_url).toBe("/");
  expect(body.display).toBe("standalone");
  expect(body.icons?.[0]?.src).toBe("/favicon.svg");
});

test("public pages do not create horizontal overflow at launch breakpoints", async ({ page }) => {
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/projects", "/stack", "/credentials", "/about", "/contact", "/journey", "/notes"]) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} at ${width}px`).toBe(200);
      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasHorizontalOverflow, `${path} overflows at ${width}px`).toBe(false);
    }
  }
});

test("generic unknown public routes return a real 404 and remain recoverable", async ({ page }) => {
  const response = await page.goto("/rota-publica-inexistente-e2e");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Página não encontrada." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Voltar ao início" })).toHaveAttribute(
    "href",
    "/",
  );
});
