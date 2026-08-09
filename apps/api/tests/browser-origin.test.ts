import { describe, expect, it } from "vitest";
import { createApiApp } from "../src/app";

describe("browser origin mutation guard", () => {
  it("rejects cross-origin browser login attempts before auth", async () => {
    const response = await createApiApp().request(
      "https://api.example.test/api/v1/auth/login",
      {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ password: "irrelevant" }),
      },
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("x-correlation-id")).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "ORIGIN_INVALID",
        message: "Origem da solicitação não permitida.",
      },
    });
  });

  it("allows same-origin browser mutations to reach endpoint auth", async () => {
    const response = await createApiApp().request(
      "https://api.example.test/api/v1/auth/login",
      {
        method: "POST",
        headers: {
          origin: "https://api.example.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ password: "irrelevant" }),
      },
    );

    expect(response.status).toBe(401);
  });

  it("keeps non-browser clients without Origin compatible", async () => {
    const response = await createApiApp().request(
      "https://api.example.test/api/v1/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "irrelevant" }),
      },
    );

    expect(response.status).toBe(401);
  });

  it("does not reject safe cross-origin reads", async () => {
    const response = await createApiApp().request(
      "https://api.example.test/api/v1/auth/session",
      { headers: { origin: "https://other.example" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { authenticated: false },
    });
  });

  it("guards future private mutations before private auth", async () => {
    const response = await createApiApp().request(
      "https://api.example.test/api/v1/private/future-mutation",
      {
        method: "POST",
        headers: { origin: "https://evil.example" },
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "ORIGIN_INVALID" },
    });
  });
});
