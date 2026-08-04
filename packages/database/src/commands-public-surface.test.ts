import { describe, expect, it } from "vitest";
import * as commands from "./commands";

describe("@semogtw/database/commands public surface", () => {
  it("exports command composition without requiring internal repository imports", () => {
    expect(commands).toMatchObject({
      createSqliteDevOSCommandGateway: expect.any(Function),
      createDevOSCommandRegistry: expect.any(Function),
      getOwnerEntityActions: expect.any(Function),
      createAttentionTransitionCommandRunner: expect.any(Function),
      SqliteCommandReceiptRepository: expect.any(Function),
      SqliteTransactionalCommandExecutor: expect.any(Function),
    });
  });
});
