import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { SEMOGTW_MCP_SERVER_INFO } from "./catalog";
import {
  createSemogtwMcpServer,
  type SemogtwMcpReadService,
} from "./server";

const service: SemogtwMcpReadService = {
  async getOverview() {
    return {
      activeProjectCount: 0,
      inProgressStageCount: 0,
      highImpactAttentionCount: 0,
      projects: [],
      currentStages: [],
      attention: [],
      lastSyncedAt: null,
    };
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

describe("Semogtw MCP server identity", () => {
  it("reports the canonical unreleased identity during initialization", async () => {
    const server = createSemogtwMcpServer(service);
    const client = new Client({ name: "identity-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      expect(client.getServerVersion()).toEqual(SEMOGTW_MCP_SERVER_INFO);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
