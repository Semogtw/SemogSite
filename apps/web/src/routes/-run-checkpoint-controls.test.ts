import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(import.meta.dirname, path), "utf8");
}

describe("cooperative run checkpoint controls", () => {
  it("records checkpoint evidence through the canonical private API", () => {
    const form = source("../components/devos/run-checkpoint-form.tsx");
    const commands = source("../lib/private-cooperative-run-commands.ts");

    expect(form).toContain("createPrivateDevosBrowserClient");
    expect(form).toContain("privateDevos.runs.recordCheckpoint");
    expect(form).toContain("idempotencyKey.current");
    expect(form).toContain("A mesma chave será reutilizada");
    expect(form).not.toContain("recordCooperativeRunCheckpointFn");
    expect(form).not.toContain("readCookie");
    expect(commands).toContain('"cooperative_run.checkpoint"');
  });
});
