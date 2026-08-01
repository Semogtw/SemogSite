import { describe, expect, it } from "vitest";
import { parseRuntimeConfig } from "./index";

describe("parseRuntimeConfig", () => {
  it("fails closed when session configuration is absent", () => {
    expect(() => parseRuntimeConfig({ NODE_ENV: "production" })).toThrow(
      "SEMOGTW_SESSION_SECRET",
    );
  });
});
