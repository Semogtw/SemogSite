import { expect, test, type Page } from "@playwright/test";

const ownerPassword = "semogtw-e2e-owner";

async function loginOwner(page: Page, returnTo = "/devos/workflows") {
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

test.describe("workflow orchestration privacy", () => {
  test("redirects anonymous workflow routes without rendering private content", async ({
    page,
  }) => {
    await page.goto("/devos/workflows");

    await expect(page).toHaveURL(/\/devos\/login/u);
    await expect(page.getByRole("heading", { name: "Acesso privado" })).toBeVisible();
    await expect(page.getByText("Próximo trabalho seguro")).toHaveCount(0);
    await expect(page.getByText("Reservas ativas")).toHaveCount(0);

    await page.goto("/devos/workflows/recovery");
    await expect(page).toHaveURL(/\/devos\/login/u);
    await expect(page.getByText("Snapshots preservados")).toHaveCount(0);
  });

  test("keeps workflow-only labels out of the public homepage", async ({ page }) => {
    await page.goto("/");

    await expect(page).not.toHaveURL(/\/devos/u);
    await expect(page.getByText("Próximo trabalho seguro")).toHaveCount(0);
    await expect(page.getByText("Obrigações de verificação")).toHaveCount(0);
    await expect(page.getByText("Snapshots preservados")).toHaveCount(0);
  });
});

test.describe("authenticated workflow orchestration", () => {
  test.beforeEach(async ({ page }) => {
    await loginOwner(page);
  });

  test("opens the workflow dashboard and recovery history", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Fluxos de desenvolvimento" }),
    ).toBeVisible();
    await expect(page.getByText("Próximo trabalho seguro")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reservar escopo" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Registrar gate pendente" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Gerar snapshot de recuperação" }).click();
    await expect(page).toHaveURL(/\/devos\/workflows\/recovery$/u);
    await expect(
      page.getByRole("heading", { name: "Snapshot de recuperação" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Snapshots preservados" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Voltar aos fluxos" })).toBeVisible();
  });

  test("re-evaluates safe work only from explicit session capabilities", async ({
    page,
  }) => {
    await page
      .getByLabel("Capacidades do runtime atual")
      .fill(" Node-22, pnpm-10\nnode-22 ");
    await page.getByRole("button", { name: "Reavaliar trabalho seguro" }).click();

    await expect(
      page.getByText(
        "Avaliação atualizada apenas com as capacidades declaradas nesta sessão.",
      ),
    ).toBeVisible();
    await expect(page.getByLabel("Capacidades do runtime atual")).toHaveValue(
      " Node-22, pnpm-10\nnode-22 ",
    );
  });

  test("remains usable at a 360 pixel viewport", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/devos/workflows");
    await expect(
      page.getByRole("heading", { name: "Fluxos de desenvolvimento" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto("/devos/workflows/recovery");
    await expect(
      page.getByRole("heading", { name: "Snapshot de recuperação" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
