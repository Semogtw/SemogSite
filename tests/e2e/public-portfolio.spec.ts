import { expect, test } from "@playwright/test";

const primaryNavigation = [
  ["Projetos", "/projects"],
  ["Habilidades", "/stack"],
  ["Certificados", "/credentials"],
  ["Sobre", "/about"],
  ["Contato", "/contact"],
] as const;

test("public portfolio home exposes the professional navigation", async ({ page }) => {
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

  await expect(page.getByRole("link", { name: "Laboratório", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Notas", exact: true })).toHaveCount(0);
});

test("portfolio primary pages are reachable without owner authentication", async ({ page }) => {
  const destinations = [
    ["/stack", "Tecnologia explicada pelo que foi feito com ela."],
    ["/credentials", "Aprendizado registrado com contexto, não só com selos."],
    ["/about", "Aprender computação construindo sistemas que precisam funcionar de verdade."],
    ["/contact", "Comece pelo trabalho público e continue a conversa por um canal verificável."],
  ] as const;

  for (const [path, heading] of destinations) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

test("portfolio remains navigable at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver projetos", exact: true })).toBeVisible();

  await page.goto("/credentials");
  await expect(page.getByText("Ciência da Computação", { exact: true })).toBeVisible();
  await expect(page.getByText("Trilha de Analista de Dados", { exact: true })).toBeVisible();

  await page.goto("/contact");
  const githubLink = page.getByRole("link", { name: "Abrir GitHub", exact: true });
  await expect(githubLink).toBeVisible();
  await expect(githubLink).toHaveAttribute("href", "https://github.com/Semogtw");
});
