import { expect, test } from "@playwright/test";

const ownerPassword = "semogtw-e2e-owner";

test("canonical auth API works through the browser-facing web origin", async ({ page }) => {
  await page.goto("/");

  const anonymous = await page.evaluate(async () => {
    const response = await fetch("/api/v1/auth/session", {
      credentials: "same-origin",
    });
    return {
      status: response.status,
      body: await response.json(),
    };
  });

  expect(anonymous.status).toBe(200);
  expect(anonymous.body).toMatchObject({
    ok: true,
    data: { authenticated: false },
  });

  const login = await page.evaluate(async (password) => {
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    return {
      status: response.status,
      body: await response.json(),
    };
  }, ownerPassword);

  expect(login.status).toBe(200);
  expect(login.body).toMatchObject({ ok: true });

  const authenticated = await page.evaluate(async () => {
    const response = await fetch("/api/v1/auth/session", {
      credentials: "same-origin",
    });
    return {
      status: response.status,
      body: await response.json(),
    };
  });

  expect(authenticated.status).toBe(200);
  expect(authenticated.body).toMatchObject({
    ok: true,
    data: {
      authenticated: true,
      owner: { id: "semogtw-owner" },
    },
  });
});

test("canonical auth API rejects an explicitly cross-site browser mutation", async ({
  request,
}) => {
  const response = await request.post("/api/v1/auth/login", {
    headers: {
      "content-type": "application/json",
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    },
    data: { password: ownerPassword },
  });

  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: { code: "ORIGIN_INVALID" },
  });
});
