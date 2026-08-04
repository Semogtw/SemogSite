import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./devos.today.tsx", import.meta.url),
  "utf8",
);

describe("Today Attention Command Gateway wiring", () => {
  it("binds the observed timestamp and a stable per-attempt idempotency key", () => {
    expect(source).toContain("expectedUpdatedAt");
    expect(source).toContain("idempotencyKey");
    expect(source).toContain("useState(() => crypto.randomUUID())");
    expect(source).toContain("expectedUpdatedAt={item.updatedAt}");
    expect(source).toContain("setIdempotencyKey(crypto.randomUUID())");
  });

  it("does not let the client choose command identity or capability", () => {
    expect(source).not.toContain('commandId: "attention.transition"');
    expect(source).not.toContain('capability: "attention.write"');
    expect(source).not.toContain('resourceType: "attention_item"');
  });
});
