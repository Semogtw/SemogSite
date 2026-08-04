import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const ownerPassword = "semogtw-e2e-owner";

async function loginOwner(page: Page, returnTo: string) {
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

test.describe("Command Gateway privacy", () => {
  test("keeps command discovery and receipts out of public pages", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Ações disponíveis")).toHaveCount(0);
    await expect(page.getByText("Exige confirmação")).toHaveCount(0);
    await expect(page.getByText("Planejado", { exact: true })).toHaveCount(0);
    await expect(page.getByText("attention.transition")).toHaveCount(0);
    await expect(page.getByText("roadmap.stages.complete")).toHaveCount(0);
    await expect(page.getByText(/command-receipt-/u)).toHaveCount(0);
  });

  test("redirects anonymous owner surfaces before command metadata renders", async ({
    page,
  }) => {
    await page.goto("/devos/today");
    await expect(page).toHaveURL(/\/devos\/login/u);
    await expect(page.getByText("Ações disponíveis")).toHaveCount(0);

    await page.goto("/devos/projects/semogtw-platform-demo");
    await expect(page).toHaveURL(/\/devos\/login/u);
    await expect(page.getByText("Concluir etapa")).toHaveCount(0);
  });
});

test.describe("owner Command Gateway parity", () => {
  test("captures and resolves Attention through the canonical owner path", async ({
    page,
  }) => {
    const title = `Attention Gateway E2E ${randomUUID()}`;
    await loginOwner(page, "/devos/capture");

    await page.getByLabel("Título").fill(title);
    await page
      .getByLabel("Próxima ação")
      .fill("Verificar a ação canônica e finalizar o registro.");
    await page
      .getByLabel("Razão da alteração")
      .fill("Criar um registro isolado para o E2E do Command Gateway.");
    await page
      .getByText(
        "Confirmo que este registro deve ser persistido e auditado como uma entrada manual do proprietário.",
      )
      .click();
    await page.getByRole("button", { name: "Registrar atenção" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Atenção registrada e auditada.",
    );

    await page.goto("/devos/today");
    const record = page.locator("article").filter({
      has: page.getByRole("heading", { name: title }),
    });
    await expect(record).toHaveCount(1);

    await record.locator(".entity-actions-disclosure summary").click();
    const discovery = record.locator(".entity-actions-disclosure");
    await expect(discovery.getByText("Finalizar item")).toBeVisible();
    await expect(discovery.getByText("Risco médio")).toBeVisible();
    await expect(discovery.getByText("Exige confirmação")).toBeVisible();
    await expect(discovery).not.toContainText("attention.transition");
    await expect(discovery).not.toContainText("capability");
    await expect(discovery).not.toContainText("schema");

    await record.locator(".attention-actions summary").click();
    await record
      .locator(".attention-actions textarea")
      .fill("Evidência do E2E observada; o item pode ser finalizado.");
    await record.locator('.attention-actions input[type="checkbox"]').check();
    await record
      .getByRole("button", { name: "Confirmar finalização" })
      .click();

    await expect(record).toHaveCount(0);
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  });

  test("shows stage completion as planned without enabling the Gateway", async ({
    page,
  }) => {
    await loginOwner(page, "/devos/projects/semogtw-platform-demo");
    const stage = page.locator("article").filter({
      has: page.getByRole("heading", {
        name: "Validar persistência demonstrativa",
      }),
    });
    await expect(stage).toHaveCount(1);

    await stage.locator(".entity-actions-disclosure summary").click();
    const discovery = stage.locator(".entity-actions-disclosure");
    await expect(discovery.getByText("Concluir etapa")).toBeVisible();
    await expect(discovery.getByText("Risco alto")).toBeVisible();
    await expect(discovery.getByText("Planejado")).toBeVisible();
    await expect(discovery).not.toContainText("roadmap.stages.complete");
  });
});
