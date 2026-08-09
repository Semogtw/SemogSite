import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import type {
  ApiRequestObservation,
  ApiRequestObserver,
} from "../src/middleware/request-observer";

describe("privacy-safe request observer", () => {
  it("records only allowlisted coarse metadata", async () => {
    const observations: ApiRequestObservation[] = [];
    const observer: ApiRequestObserver = {
      record(observation) {
        observations.push(observation);
      },
    };

    const response = await createApiApp({ requestObserver: observer }).request(
      "https://api.example.test/api/v1/private/projects/PRIVATE-SLUG?branch=SECRET_BRANCH",
      {
        headers: {
          authorization: "Bearer SECRET_TOKEN",
          cookie: "semogtw_session=SECRET_SESSION",
        },
      },
    );

    expect(response.status).toBe(401);
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      method: "GET",
      scope: "private",
      status: 401,
      correlationId: expect.any(String),
      durationMs: expect.any(Number),
    });

    const serialized = JSON.stringify(observations[0]);
    expect(serialized).not.toContain("PRIVATE-SLUG");
    expect(serialized).not.toContain("SECRET_BRANCH");
    expect(serialized).not.toContain("SECRET_TOKEN");
    expect(serialized).not.toContain("SECRET_SESSION");
    expect(Object.keys(observations[0] ?? {}).sort()).toEqual([
      "correlationId",
      "durationMs",
      "method",
      "scope",
      "status",
    ]);
  });

  it("records thrown request failures as 500 without error details", async () => {
    const record = vi.fn<(observation: ApiRequestObservation) => void>();
    const response = await createApiApp({
      requestObserver: { record },
      publicProjects: {
        list: async () => {
          throw new Error("PRIVATE_DATABASE_DETAIL");
        },
        findBySlug: async () => null,
      },
    }).request("https://api.example.test/api/v1/public/projects");

    expect(response.status).toBe(500);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]?.[0]).toMatchObject({
      scope: "public",
      status: 500,
    });
    expect(JSON.stringify(record.mock.calls[0]?.[0])).not.toContain(
      "PRIVATE_DATABASE_DETAIL",
    );
  });

  it("never lets an observer failure change the request result", async () => {
    const response = await createApiApp({
      requestObserver: {
        record() {
          throw new Error("logger unavailable");
        },
      },
    }).request("https://api.example.test/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "semogtw-api",
    });
  });
});
