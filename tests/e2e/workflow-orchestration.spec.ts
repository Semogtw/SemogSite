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
    const declaredCapabilities = " Node-22, pnpm-10, node-22 ";
    await page
      .getByLabel("Capacidades do runtime atual")
      .fill(declaredCapabilities);
    await page.getByRole("button", { name: "Reavaliar trabalho seguro" }).click();

    await expect(
      page.getByText(
        "Avaliação atualizada apenas com as capacidades declaradas nesta sessão.",
      ),
    ).toBeVisible();
    await expect(page.getByLabel("Capacidades do runtime atual")).toHaveValue(
      declaredCapabilities,
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

  test("writes reservations and gates while recovery without observation fails closed", async ({
    page,
  }) => {
    await page.goto("/devos/operations");
    const targetForm = page
      .getByRole("button", { name: "Cadastrar alvo privado" })
      .locator("xpath=ancestor::form");
    await targetForm
      .getByLabel("Repositório GitHub")
      .fill("Semogtw/E2EWorkflow");
    await targetForm
      .getByLabel("Branch padrão esperada")
      .fill("main");
    await targetForm
      .getByLabel("Motivo do cadastro")
      .fill("Exercitar mutações reais do workflow orchestration no E2E.");
    await targetForm.getByRole("checkbox").check();
    await targetForm.getByRole("button", { name: "Cadastrar alvo privado" }).click();
    await expect(
      page.getByText(
        "Semogtw/E2EWorkflow foi cadastrado como alvo privado de sincronização.",
      ),
    ).toBeVisible();

    await page.goto("/devos/workflows");
    const reservationForm = page
      .getByRole("button", { name: "Reservar escopo" })
      .locator("xpath=ancestor::form");
    await expect(
      reservationForm.getByLabel("Repositório").locator("option", {
        hasText: "Semogtw/E2EWorkflow",
      }),
    ).toHaveCount(1);
    await reservationForm
      .getByLabel("Caminhos ou identificadores")
      .fill("packages/domain/**");
    await reservationForm
      .getByLabel("Finalidade")
      .fill("Reserva E2E de escopo");
    await reservationForm.getByRole("checkbox").nth(1).check();
    await reservationForm.getByRole("button", { name: "Reservar escopo" }).click();
    await expect(
      page.getByText("Escopo reservado de forma cooperativa."),
    ).toBeVisible();
    await expect(page.getByText("Reserva E2E de escopo")).toBeVisible();

    const gateForm = page
      .getByRole("button", { name: "Registrar gate pendente" })
      .locator("xpath=ancestor::form");
    await gateForm.getByLabel("Commit exato").fill("a".repeat(40));
    await gateForm.getByLabel("Nome do gate").fill("Gate E2E de domínio");
    await gateForm
      .getByLabel("Comando exato")
      .fill("pnpm --filter @semogtw/domain typecheck");
    await gateForm
      .getByLabel("Próxima ação segura")
      .fill("Executar o typecheck no ambiente E2E.");
    await gateForm.getByRole("checkbox").check();
    await gateForm
      .getByRole("button", { name: "Registrar gate pendente" })
      .click();
    await expect(
      page.getByText("Gate pendente registrado para o commit exato."),
    ).toBeVisible();
    await expect(page.getByText("Gate E2E de domínio")).toBeVisible();

    await page.getByRole("link", { name: "Gerar snapshot de recuperação" }).click();
    const recoveryForm = page
      .getByRole("button", { name: "Gerar snapshot de recuperação" })
      .locator("xpath=ancestor::form");
    await recoveryForm
      .getByLabel("Próxima ação exata")
      .fill("Sincronizar a observação GitHub antes do handoff.");
    await recoveryForm.getByLabel("Seção do plano opcional").fill("Task E2E");
    await recoveryForm.getByRole("checkbox").check();
    await recoveryForm
      .getByRole("button", { name: "Gerar snapshot de recuperação" })
      .click();

    await expect(
      page.getByText(
        "A branch aceita ainda não possui um SHA observado. Sincronize o GitHub antes de gerar o snapshot.",
      ),
    ).toBeVisible();
    await expect(page.getByText("Snapshot preservado")).toHaveCount(0);
  });
});
