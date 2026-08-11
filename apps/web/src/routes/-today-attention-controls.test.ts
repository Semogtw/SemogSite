import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(import.meta.dirname, path), "utf8");
}

describe("today attention controls", () => {
  it("finalizes attention through the canonical private browser API", () => {
    const route = source("devos.today.tsx");
    const commands = source("../lib/private-attention-commands.ts");

    expect(route).toContain("createPrivateDevosBrowserClient");
    expect(route).toContain("privateDevos.attention.transition");
    expect(route).toContain("PrivateApiError");
    expect(route).toContain("await router.invalidate()");
    expect(route).not.toContain("transitionAttentionFn");
    expect(route).not.toContain("readCookie");
    expect(commands).toContain('"attention.transition"');
  });
});
