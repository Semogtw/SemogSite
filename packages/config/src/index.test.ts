import { describe, expect, it } from "vitest";
import { parseDatabaseConfig, parseRuntimeConfig } from "./index";

describe("parseDatabaseConfig", () => {
  it("uses a portable local SQLite path without auth configuration", () => {
    expect(parseDatabaseConfig({})).toEqual({
      databaseUrl: "./data/semogtw.sqlite",
    });
    expect(
      parseDatabaseConfig({ SEMOGTW_DATABASE_URL: ":memory:" }),
    ).toEqual({ databaseUrl: ":memory:" });
  });
});

describe("parseRuntimeConfig", () => {
  it("fails closed when session configuration is absent", () => {
    expect(() => parseRuntimeConfig({ NODE_ENV: "production" })).toThrow(
      "SEMOGTW_SESSION_SECRET",
    );
  });
});
