import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import {
  createSemogtwMcpServer,
  type SemogtwMcpReadService,
} from "./server";

const marker = "must-never-reach-mcp-output";

const service: SemogtwMcpReadService = {
  async getOverview() {
    return {
      activeProjectCount: 1,
      inProgressStageCount: 0,
      highImpactAttentionCount: 0,
      projects: [
        {
          id: "project-1",
          integrationState: {
            accessToken: marker,
            nested: { passwordHash: marker },
          },
        },
      ],
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

describe("Semogtw MCP sensitive output rejection", () => {
  it("rejects nested token/password fields for tools and resources", async () => {
    const server = createSemogtwMcpServer(service);
    const client = new Client({ name: "sensitive-output", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      const tool = await client.callTool({
        name: "devos_get_overview",
        arguments: {},
      });
      expect(tool).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: false,
              error: { code: "SENSITIVE_OUTPUT_REJECTED" },
            }),
          },
        ],
        isError: true,
      });
      expect(JSON.stringify(tool)).not.toContain(marker);

      const resource = await client.readResource({
        uri: "semogtw://devos/overview",
      });
      const content = resource.contents[0];
      if (content === undefined || !("text" in content)) {
        throw new Error("EXPECTED_TEXT_RESOURCE");
      }
      expect(JSON.parse(content.text)).toEqual({
        ok: false,
        error: { code: "SENSITIVE_OUTPUT_REJECTED" },
      });
      expect(content.text).not.toContain(marker);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
