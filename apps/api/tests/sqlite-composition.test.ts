import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "@semogtw/auth";
import { createSqliteApiRuntime } from "../src/composition/sqlite";

const validHash =
  "pbkdf2-sha256$310000$AQIDBAUGBwgJCgsMDQ4PEA$XIN4Q-dDSXIV3hDVJdpOvUlb3nFS3GXS-g7wNMNsdis";

describe("SQLite API composition", () => {
  it("serves public routes and keeps private routes closed without auth", async () => {
    const runtime = createSqliteApiRuntime({
      SEMOGTW_DATABASE_URL: ":memory:",
    });

    const publicResponse = await runtime.app.request(
      "/api/v1/public/projects",
    );
    await expect(publicResponse.json()).resolves.toEqual({ ok: true, data: [] });

    const privateResponse = await runtime.app.request(
      "/api/v1/private/overview",
    );
    expect(privateResponse.status).toBe(401);
    expect(privateResponse.headers.get("cache-control")).toBe(
      "no-store, private",
    );
    runtime.close();
  });

  it("authorizes a valid local session and returns the demo overview", async () => {
    const runtime = createSqliteApiRuntime({
      NODE_ENV: "test",
      SEMOGTW_DATABASE_URL: ":memory:",
      SEMOGTW_SESSION_SECRET: "s".repeat(32),
      SEMOGTW_OWNER_PASSWORD_HASH: validHash,
    });

    expect(runtime.authProvider).not.toBeUndefined();
    const login = await runtime.app.request("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "127.0.0.1",
      },
      body: JSON.stringify({
        password: "correct horse battery staple",
      }),
    });
    expect(login.status).toBe(200);
    const cookieHeader = login.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";", 1)[0])
      .join("; ");
    expect(cookieHeader).toContain(`${SESSION_COOKIE_NAME}=`);

    const response = await runtime.app.request(
      "/api/v1/private/overview",
      {
        headers: { cookie: cookieHeader },
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        activeProjectCount: 1,
        inProgressStageCount: 1,
      },
    });

    const todayResponse = await runtime.app.request(
      "/api/v1/private/today",
      { headers: { cookie: cookieHeader } },
    );
    expect(todayResponse.status).toBe(200);
    await expect(todayResponse.json()).resolves.toMatchObject({
      ok: true,
      data: {
        executeNow: [
          {
            stageId: "demo-stage-database",
            projectId: "demo-project-platform",
            projectSlug: "semogtw-platform-demo",
          },
        ],
      },
    });

    const roadmapResponse = await runtime.app.request(
      "/api/v1/private/roadmap",
      { headers: { cookie: cookieHeader } },
    );
    expect(roadmapResponse.status).toBe(200);
    await expect(roadmapResponse.json()).resolves.toMatchObject({
      ok: true,
      data: {
        items: [
          {
            id: "demo-stage-database",
            projectId: "demo-project-platform",
            projectName: "Semogtw Platform — demonstração",
            state: "in_progress",
          },
        ],
        board: { in_progress: [{ id: "demo-stage-database" }] },
      },
    });

    const portfolioResponse = await runtime.app.request(
      "/api/v1/private/projects",
      { headers: { cookie: cookieHeader } },
    );
    expect(portfolioResponse.status).toBe(200);
    await expect(portfolioResponse.json()).resolves.toMatchObject({
      ok: true,
      data: {
        activeProjects: [{
          id: "demo-project-platform",
          slug: "semogtw-platform-demo",
        }],
      },
    });

    const projectResponse = await runtime.app.request(
      "/api/v1/private/projects/semogtw-platform-demo",
      { headers: { cookie: cookieHeader } },
    );
    expect(projectResponse.status).toBe(200);
    await expect(projectResponse.json()).resolves.toMatchObject({
      ok: true,
      data: {
        project: { id: "demo-project-platform" },
        currentStages: [{ id: "demo-stage-database" }],
      },
    });
    runtime.close();
  });
});
