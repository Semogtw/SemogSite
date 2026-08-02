import { expect, test, type Page } from "@playwright/test";

const password = "semogtw-e2e-owner";
const slug = "nota-editorial-e2e";

async function login(page: Page) {
  await page.goto("/devos/login");
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/devos(?:\/)?$/u);
}

async function submitForReview(page: Page) {
  await page.getByRole("checkbox", {
    name: /Confirmo que esta revisão está pronta/u,
  }).check();
  await page.getByRole("button", { name: "Enviar para revisão" }).click();
  await expect(
    page.getByRole("button", { name: "Aprovar revisão analisada" }),
  ).toBeVisible();
}

async function approve(page: Page, reason: string) {
  const checklist = page.getByRole("group", {
    name: "Checklist sensível obrigatório",
  });
  const checks = checklist.getByRole("checkbox");
  const approveButton = page.getByRole("button", {
    name: "Aprovar revisão analisada",
  });
  await expect(checks).toHaveCount(7);
  await page.getByLabel("Motivo da aprovação").fill(reason);
  await page.getByRole("checkbox", {
    name: /Confirmo que analisei esta revisão exata/u,
  }).check();
  await expect(approveButton).toBeDisabled();

  for (let index = 0; index < 7; index += 1) await checks.nth(index).check();
  await approveButton.click();
  await expect(
    page.getByRole("button", { name: "Publicar revisão aprovada" }),
  ).toBeVisible();
}

async function publish(page: Page) {
  await page.getByRole("checkbox", {
    name: /Confirmo que esta revisão aprovada pode se tornar/u,
  }).check();
  await page.getByRole("button", { name: "Publicar revisão aprovada" }).click();
  await expect(
    page.getByRole("button", { name: "Retirar projeção pública" }),
  ).toBeVisible();
}

test.describe.serial("editorial publication lifecycle", () => {
  test("publishes, replaces, rolls back and withdraws approved revisions", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/devos/content");

    await page.getByLabel("Tipo de documento").selectOption("note");
    await page.getByLabel("Slug canônico").fill(slug);
    await page.getByLabel("Título").fill("Nota editorial original");
    await page
      .getByLabel("Resumo editorial")
      .fill("Resumo público da revisão original.");
    await page.getByLabel("Tags separadas por vírgula").fill("e2e, editorial");
    await page
      .getByLabel("Corpo em Markdown seguro")
      .fill("# Nota editorial original\n\nConteúdo público original.");
    await page.getByRole("checkbox", {
      name: /Confirmo que este é um rascunho privado/u,
    }).check();
    await page.getByRole("button", { name: "Criar rascunho privado" }).click();
    await expect(page).toHaveURL(/\/devos\/content\//u);
    const detailPath = new URL(page.url()).pathname;

    await submitForReview(page);
    await approve(page, "Revisão original validada pelo gate E2E.");
    await publish(page);

    await page.goto(`/notes/${slug}`);
    await expect(
      page.getByRole("heading", { name: "Nota editorial original" }).first(),
    ).toBeVisible();
    await expect(page.getByText("Conteúdo público original.")).toBeVisible();

    await page.goto(detailPath);
    await page.getByLabel("Motivo da reabertura").fill("Preparar revisão atualizada.");
    await page.getByRole("checkbox", {
      name: /Confirmo que esta revisão precisa voltar/u,
    }).check();
    await page.getByRole("button", { name: "Reabrir como rascunho" }).click();
    await expect(
      page.getByText("Criar nova revisão imutável"),
    ).toBeVisible();

    await page.getByText("Criar nova revisão imutável").click();
    const revisionForm = page.locator("details.editorial-revision-form form");
    await revisionForm.getByLabel("Título").fill("Nota editorial atualizada");
    await revisionForm
      .getByLabel("Resumo editorial")
      .fill("Resumo público da revisão atualizada.");
    await revisionForm
      .getByLabel("Corpo em Markdown seguro")
      .fill("# Nota editorial atualizada\n\nConteúdo público atualizado.");
    await revisionForm.getByRole("checkbox").check();
    await revisionForm
      .getByRole("button", { name: "Salvar nova revisão" })
      .click();

    await submitForReview(page);
    await approve(page, "Segunda revisão validada pelo gate E2E.");

    // A projeção anterior permanece disponível até a troca atômica explícita.
    await page.goto(`/notes/${slug}`);
    await expect(
      page.getByRole("heading", { name: "Nota editorial original" }).first(),
    ).toBeVisible();
    await page.goto(detailPath);
    await expect(
      page.getByRole("button", { name: "Publicar revisão aprovada" }),
    ).toBeVisible();
    await publish(page);

    await page.goto(`/notes/${slug}`);
    await expect(
      page.getByRole("heading", { name: "Nota editorial atualizada" }).first(),
    ).toBeVisible();
    await page.goto(detailPath);

    const rollbackSelect = page.getByLabel("Revisão aprovada para restaurar");
    await expect(rollbackSelect.locator("option")).toHaveCount(1);
    await page.getByLabel("Motivo do rollback").fill("Restaurar versão original.");
    await page.getByRole("checkbox", {
      name: /Confirmo que a revisão histórica selecionada/u,
    }).check();
    await page.getByRole("button", { name: "Restaurar revisão aprovada" }).click();

    await page.goto(`/notes/${slug}`);
    await expect(
      page.getByRole("heading", { name: "Nota editorial original" }).first(),
    ).toBeVisible();
    await page.goto(detailPath);

    await page.getByLabel("Motivo da retirada").fill("Encerrar publicação E2E.");
    await page.getByRole("checkbox", {
      name: /Confirmo a retirada imediata desta projeção pública/u,
    }).check();
    await page.getByRole("button", { name: "Retirar projeção pública" }).click();
    await page.goto(`/notes/${slug}`);
    await expect(page.getByRole("heading", { name: /Nenhuma publicação pública corresponde/u })).toBeVisible();
  });

  test("keeps private routes isolated and public pages usable at 360x800", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto("/devos");
    await expect(page).toHaveURL(/\/devos\/login/u);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/u,
    );

    for (const path of ["/", "/notes", "/projects"]) {
      await page.goto(path);
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasOverflow).toBe(false);

      const robots = page.locator('meta[name="robots"]');
      if ((await robots.count()) > 0) {
        await expect(robots).not.toHaveAttribute("content", /noindex/u);
      }
    }

    await page.goto("/");
    await page.keyboard.press("Tab");
    const focusVisible = await page.evaluate(() => {
      const element = document.activeElement;
      return element instanceof HTMLElement && element !== document.body;
    });
    expect(focusVisible).toBe(true);
    expect(consoleErrors).toEqual([]);
    await context.close();
  });
});
