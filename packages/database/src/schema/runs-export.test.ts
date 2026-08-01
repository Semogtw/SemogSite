import { describe, expect, it } from "vitest";
import * as schema from "./index";

describe("cooperative run schema exports", () => {
  it("includes every run-ledger table in the composed Drizzle schema", () => {
    expect(schema.cooperativeRuns).toBeDefined();
    expect(schema.cooperativeRunEvents).toBeDefined();
    expect(schema.cooperativeRunCheckpoints).toBeDefined();
    expect(schema.cooperativeRunCommands).toBeDefined();
  });
});
