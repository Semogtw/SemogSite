import { expect, test, type Page } from "@playwright/test";

const ownerPassword = "semogtw-e2e-owner";

async function loginOwner(page: Page, returnTo = "/devos/growth") {
  await page.goto(returnTo);
  await expect(page).toHaveURL(/\/devos\/login/u);
  await page.getByLabel("Senha").fill(ownerPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/devos$/u);
  await page.goto(returnTo);
  await expect(page).toHaveURL(
    new RegExp(`${returnTo.replaceAll("/", "\\/")}$`, "u"),
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
}

test.describe("Growth privacy", () => {
  test("redirects anonymous overview and detail routes before private data renders", async ({
    page,
  }) => {
    await page.goto("/devos/growth");
    await expect(page).toHaveURL(/\/devos\/login/u);
    await expect(page.getByRole("heading", { name: "Acesso privado" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Growth" })).toHaveCount(0);

    await page.goto("/devos/growth/private-goal-id");
    await expect(page).toHaveURL(/\/devos\/login/u);
    await expect(page.getByText("Checkpoints")).toHaveCount(0);
  });

  test("keeps Growth-only language and controls out of public pages", async ({ page }) => {
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/devos/u);
    await expect(page.getByText("Criar uma meta")).toHaveCount(0);
    await expect(page.getByText("Prévia da redistribuição")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Aplicar redistribuição" }),
    ).toHaveCount(0);
  });
});

test.describe("authenticated Growth owner experience", () => {
  test.beforeEach(async ({ page }) => {
    await loginOwner(page);
  });

  test("creates a deterministic template goal and applies a server-derived rebalance", async ({
    page,
  }) => {
    const title = "Aprender Rust com Growth E2E";

    await expect(page.getByRole("heading", { name: "Growth" })).toBeVisible();
    await page.getByLabel("O que deseja alcançar?").fill(title);
    await page
      .getByLabel("Por que isso importa?")
      .fill("Validar a experiência privada de aprendizado de ponta a ponta.");
    await page
      .getByLabel("Usar uma estrutura pronta?")
      .selectOption({ label: "Aprender uma linguagem de programação" });

    await expect(
      page.getByRole("region", { name: "Prévia da estrutura" }),
    ).toBeVisible();
    await expect(page.getByText("Total automático: 100%")).toBeVisible();
    await expect(page.getByText("Fundamentos", { exact: true })).toBeVisible();
    await expect(page.getByText("Projeto aplicado", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Criar meta" }).click();
    await expect(page.getByRole("status")).toHaveText("Meta criada com sucesso.");
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    await page.getByRole("link", { name: title }).click();
    await expect(page).toHaveURL(/\/devos\/growth\//u);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Checkpoints" })).toBeVisible();
    await expect(page.getByText("Total proposto: 100 pontos")).toBeVisible();
    await expect(page.getByText(/pontos · automático/u).first()).toBeVisible();

    await page.getByRole("button", { name: "Aplicar redistribuição" }).click();
    await expect(page.getByRole("status")).toHaveText("Pesos atualizados.");
  });

  test("remains usable at a 360 pixel viewport", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/devos/growth");

    await expect(page.getByRole("heading", { name: "Growth" })).toBeVisible();
    await expect(page.getByLabel("O que deseja alcançar?")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Growth", exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
