import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(import.meta.dirname, path), "utf8");
}

describe("cooperative run command controls", () => {
  it("queues canonical intent through the private API without a Node mutation action", () => {
    const form = source("../components/devos/run-command-queue-form.tsx");
    const commands = source("../lib/private-cooperative-run-commands.ts");

    expect(form).toContain("createPrivateDevosBrowserClient");
    expect(form).toContain("privateDevos.runs.queueCommand");
    expect(form).toContain("idempotencyKey.current");
    expect(form).toContain("só o receberá quando consultar o DevOS");
    expect(form).not.toContain("queueCooperativeRunCommandFn");
    expect(form).not.toContain("readCookie");
    expect(commands).toContain('"cooperative_run.command.queue"');
  });
});
