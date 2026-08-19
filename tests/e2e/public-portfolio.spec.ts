import { expect, test } from "@playwright/test";

const primaryNavigation = [
  ["Projetos", "/projects"],
  ["Habilidades", "/stack"],
  ["Certificados", "/credentials"],
  ["Sobre", "/about"],
  ["Contato", "/contact"],
] as const;

test("public portfolio home exposes the professional navigation and factual structured data", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Projetos que mostram como eu penso, construo e entrego software.",
    }),
  ).toBeVisible();

  for (const [label, href] of primaryNavigation) {
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveAttribute(
      "href",
      href,
    );
  }

  await expect(page.getByRole("link", { name: "Trajetória", exact: true })).toHaveAttribute(
    "href",
    "/journey",
  );
  await expect(page.getByRole("link", { name: "Laboratório", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Notas", exact: true })).toHaveCount(0);

  const structuredDataText = await page
    .locator('script[type="application/ld+json"]')
    .textContent();
  expect(structuredDataText).not.toBeNull();
  const structuredData = JSON.parse(structuredDataText ?? "{}") as {
    "@type"?: string;
    name?: string;
    sameAs?: string[];
    knowsAbout?: string[];
  };
  expect(structuredData["@type"]).toBe("Person");
  expect(structuredData.name).toBe("Semogtw");
  expect(structuredData.sameAs).toContain("https://github.com/Semogtw");
  expect(structuredData.knowsAbout).toContain("Engenharia de software");
});

test("keyboard users can skip repeated public navigation", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Pular para o conteúdo" });
  await expect(skipLink).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.locator("#conteudo")).toBeFocused();
});

test("portfolio pages are reachable without owner authentication", async ({ page }) => {
  const destinations = [
    ["/stack", "Tecnologia explicada pelo que foi feito com ela."],
    ["/credentials", "Aprendizado registrado com contexto, não só com selos."],
    ["/about", "Aprender computação construindo sistemas que precisam funcionar de verdade."],
    ["/contact", "Comece pelo trabalho público e continue a conversa por um canal verificável."],
    ["/journey", "Formação e projetos vistos como uma evolução contínua."],
  ] as const;

  for (const [path, heading] of destinations) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

test("portfolio mobile menu navigates and exposes current destination at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver projetos", exact: true })).toBeVisible();

  const menuButton = page.getByRole("button", { name: "Abrir menu" });
  await expect(menuButton).toBeVisible();
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");

  await menuButton.click();
  await expect(page.getByRole("button", { name: "Fechar menu" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  const credentialsLink = page.getByRole("link", { name: "Certificados", exact: true });
  await expect(credentialsLink).toBeVisible();
  await credentialsLink.click();
  await expect(page).toHaveURL(/\/credentials$/u);
  await expect(page.getByText("Ciência da Computação", { exact: true })).toBeVisible();
  await expect(page.getByText("Trilha de Analista de Dados", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(page.getByRole("link", { name: "Certificados", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.goto("/journey");
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Engenharia de software aplicada a projetos próprios",
    }),
  ).toBeVisible();

  await page.goto("/contact");
  const githubLink = page.getByRole("link", { name: "Abrir GitHub", exact: true });
  await expect(githubLink).toBeVisible();
  await expect(githubLink).toHaveAttribute("href", "https://github.com/Semogtw");
});

test("portfolio discovery endpoints expose only intentional public surfaces", async ({ request }) => {
  const robotsResponse = await request.get("/robots.txt");
  expect(robotsResponse.status()).toBe(200);
  expect(robotsResponse.headers()["content-type"]).toContain("text/plain");
  const robots = await robotsResponse.text();
  expect(robots).toContain("Allow: /");
  expect(robots).toContain("Disallow: /devos");
  expect(robots).toContain("Disallow: /api/v1/private/");
  expect(robots).toContain("Sitemap:");

  const sitemapResponse = await request.get("/sitemap.xml");
  expect(sitemapResponse.status()).toBe(200);
  expect(sitemapResponse.headers()["content-type"]).toContain("application/xml");
  const sitemap = await sitemapResponse.text();

  for (const path of [
    "/projects",
    "/stack",
    "/credentials",
    "/about",
    "/contact",
    "/journey",
  ]) {
    expect(sitemap).toContain(path);
  }

  expect(sitemap).not.toContain("/devos");
  expect(sitemap).not.toContain("/api/v1/private/");
  expect(sitemap).not.toContain("/lab");
  expect(sitemap).not.toContain("/notes");
});
