import { expect, test, type Page, type Request } from "@playwright/test";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const ownerPassword = "semogtw-e2e-owner";
const databasePath = resolve("data/semogtw-e2e.sqlite");

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

function replayHeaders(request: Request): Record<string, string> {
  const blocked = new Set(["content-length", "host"]);
  return Object.fromEntries(
    Object.entries(request.headers()).filter(([name]) => !blocked.has(name)),
  );
}

function readAttentionCommandState(title: string) {
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const attention = database
      .prepare(
        "SELECT id, status FROM attention_items WHERE title = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(title) as { id: string; status: string } | undefined;
    if (attention === undefined) throw new Error("E2E_ATTENTION_NOT_FOUND");

    const receipt = database
      .prepare(
        `SELECT COUNT(*) AS count,
                MIN(status) AS status,
                MIN(id) AS receiptId
         FROM command_receipts
         WHERE command_id = 'attention.transition'
           AND resource_type = 'attention_item'
           AND resource_id = ?`,
      )
      .get(attention.id) as {
      count: number;
      status: string | null;
      receiptId: string | null;
    };
    const audit = database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM audit_events
         WHERE action = 'attention.resolve'
           AND entity_type = 'attention_item'
           AND entity_id = ?`,
      )
      .get(attention.id) as { count: number };

    return { attention, receipt, audit };
  } finally {
    database.close();
  }
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
  test("captures, resolves, replays and rejects changed Attention payload", async ({
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

    const reason = "Evidência do E2E observada; o item pode ser finalizado.";
    await record.locator(".attention-actions summary").click();
    await record.locator(".attention-actions textarea").fill(reason);
    await record.locator('.attention-actions input[type="checkbox"]').check();
    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        (request.postData() ?? "").includes(reason),
    );
    await record
      .getByRole("button", { name: "Confirmar finalização" })
      .click();
    const commandRequest = await requestPromise;
    const originalBody = commandRequest.postData();
    expect(originalBody).not.toBeNull();

    await expect(record).toHaveCount(0);
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0);

    const replay = await page.request.fetch(commandRequest.url(), {
      method: "POST",
      headers: replayHeaders(commandRequest),
      data: originalBody ?? "",
      failOnStatusCode: false,
    });
    expect(replay.status()).toBe(200);
    expect(await replay.text()).toContain("Item resolvido e auditado.");

    const changedReason =
      "Tentativa divergente com a mesma chave idempotente do E2E.";
    const conflictingBody = (originalBody ?? "").replace(reason, changedReason);
    expect(conflictingBody).not.toBe(originalBody);
    const conflict = await page.request.fetch(commandRequest.url(), {
      method: "POST",
      headers: replayHeaders(commandRequest),
      data: conflictingBody,
      failOnStatusCode: false,
    });
    expect(conflict.status()).toBe(200);
    expect(await conflict.text()).toContain("IDEMPOTENCY_PAYLOAD_CONFLICT");

    expect(readAttentionCommandState(title)).toEqual({
      attention: expect.objectContaining({ status: "resolved" }),
      receipt: expect.objectContaining({ count: 1, status: "succeeded" }),
      audit: { count: 1 },
    });
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
