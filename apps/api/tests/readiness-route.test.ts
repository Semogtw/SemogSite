import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

describe("API readiness", () => {
  it("fails closed when no runtime probe is composed", async () => {
    const response = await createApiApp().request("/ready");

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("5");
    expect(response.headers.get("x-correlation-id")).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "SERVICE_NOT_READY",
        message: "Serviço indisponível para tráfego.",
      },
    });
  });

  it("returns ready only when the composed probe succeeds", async () => {
    const check = vi.fn(async () => true);
    const response = await createApiApp({ readiness: { check } }).request(
      "/ready",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(check).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "semogtw-api",
      status: "ready",
    });
  });

  it("sanitizes readiness probe failures", async () => {
    const response = await createApiApp({
      readiness: {
        check: async () => {
          throw new Error("PRIVATE_DATABASE_DETAIL");
        },
      },
    }).request("/ready");

    expect(response.status).toBe(503);
    const body = JSON.stringify(await response.json());
    expect(body).toContain("SERVICE_NOT_READY");
    expect(body).not.toContain("PRIVATE_DATABASE_DETAIL");
  });
});
