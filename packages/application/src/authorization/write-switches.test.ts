import { describe, expect, it } from "vitest";
import { writesAllowed } from "./write-switches";
import type { AgentWriteSwitchState } from "./write-switches";

const enabled: AgentWriteSwitchState = {
  globalEnabled: true,
  clientEnabled: true,
  domainEnabled: true,
};

describe("remote agent write switches", () => {
  it("allows writes only when every independent switch is enabled", () => {
    expect(writesAllowed(enabled)).toBe(true);
  });

  it.each([
    { globalEnabled: false, clientEnabled: true, domainEnabled: true },
    { globalEnabled: true, clientEnabled: false, domainEnabled: true },
    { globalEnabled: true, clientEnabled: true, domainEnabled: false },
    { globalEnabled: false, clientEnabled: false, domainEnabled: true },
    { globalEnabled: false, clientEnabled: true, domainEnabled: false },
    { globalEnabled: true, clientEnabled: false, domainEnabled: false },
    { globalEnabled: false, clientEnabled: false, domainEnabled: false },
  ] satisfies readonly AgentWriteSwitchState[])(
    "denies when at least one switch is false %#",
    (state) => {
      expect(writesAllowed(state)).toBe(false);
    },
  );

  it("fails closed for a missing or malformed runtime value", () => {
    for (const state of [
      null,
      undefined,
      {},
      { globalEnabled: true, clientEnabled: true },
      { globalEnabled: 1, clientEnabled: true, domainEnabled: true },
      { globalEnabled: true, clientEnabled: "true", domainEnabled: true },
    ]) {
      expect(writesAllowed(state as never)).toBe(false);
    }
  });

  it("does not model read permission", () => {
    expect(Object.keys(enabled).sort()).toEqual([
      "clientEnabled",
      "domainEnabled",
      "globalEnabled",
    ]);
    expect("readEnabled" in enabled).toBe(false);
  });
});
