import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import {
  createSemogtwMcpServer,
  type SemogtwMcpReadService,
} from "./server";

function serviceWithNonJsonValue(value: unknown): SemogtwMcpReadService {
  return {
    async getOverview() {
      return {
        activeProjectCount: 1,
        inProgressStageCount: 0,
        highImpactAttentionCount: 0,
        projects: [{ id: "project-1", nonJsonValue: value }],
        currentStages: [],
        attention: [],
        lastSyncedAt: null,
      } as never;
    },
    async getToday() {
      return {
        executeNow: [],
        nextInQueue: [],
        needsOwner: [],
        externalDependencies: [],
        recentActivity: [],
      };
    },
    async listProjects() {
      return {
        activeProjects: [],
        activeRepositories: [],
        repositoryCatalog: [],
      };
    },
    async getProject() {
      return { ok: false, code: "NOT_FOUND" };
    },
    async queryRoadmap() {
      return {
        ok: true,
        data: {
          items: [],
          board: {
            backlog: [],
            next: [],
            in_progress: [],
            blocked: [],
            completed: [],
          },
        },
      };
    },
  };
}

const stableFailure = {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        ok: false,
        error: { code: "DEVOS_READ_FAILED" },
      }),
    },
  ],
  isError: true,
};

describe("Semogtw MCP JSON serialization failures", () => {
  it.each([
    ["bigint", 1n],
    [
      "circular reference",
      (() => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        return circular;
      })(),
    ],
  ])("sanitizes %s values for tools and resources", async (_label, value) => {
    const server = createSemogtwMcpServer(serviceWithNonJsonValue(value));
    const client = new Client({ name: "serialization-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      await expect(
        client.callTool({ name: "devos_get_overview", arguments: {} }),
      ).resolves.toEqual(stableFailure);

      const resource = await client.readResource({
        uri: "semogtw://devos/overview",
      });
      const content = resource.contents[0];
      if (content === undefined || !("text" in content)) {
        throw new Error("EXPECTED_TEXT_RESOURCE");
      }
      expect(JSON.parse(content.text)).toEqual({
        ok: false,
        error: { code: "DEVOS_READ_FAILED" },
      });
      expect(content.text).not.toContain("nonJsonValue");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
