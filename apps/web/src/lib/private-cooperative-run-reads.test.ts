import { describe, expect, it, vi } from "vitest";
import { PrivateApiError } from "./private-api-client";
import {
  getPrivateCooperativeRun,
  listPrivateCooperativeRuns,
} from "./private-cooperative-run-reads";
import type { PrivateReadClient } from "./private-mutation-client";

function client() {
  const read = vi.fn<PrivateReadClient["read"]>();
  return {
    read,
    value: { read } as PrivateReadClient,
  };
}

describe("private cooperative run reads", () => {
  it("builds a bounded keyset list request on the canonical private route", async () => {
    const { read, value } = client();
    read.mockResolvedValue({ runs: [], asOf: "2026-08-16T07:00:00.000Z", nextCursor: null });

    await listPrivateCooperativeRuns(value, {
      limit: 25,
      projectId: "project-1",
      runningOnly: true,
      cursor: {
        updatedAt: "2026-08-16T06:00:00.000Z",
        id: "run-25",
      },
    });

    expect(read).toHaveBeenCalledWith(
      "/api/v1/private/cooperative-runs?limit=25&projectId=project-1&runningOnly=true&beforeUpdatedAt=2026-08-16T06%3A00%3A00.000Z&beforeId=run-25",
    );
  });

  it("opts into event snapshots only for an explicit detail request", async () => {
    const { read, value } = client();
    read.mockResolvedValue({});

    await getPrivateCooperativeRun(value, {
      runId: "run/with separator",
      eventLimit: 50,
      beforeSequence: 12,
      includeSnapshots: true,
    });

    expect(read).toHaveBeenCalledWith(
      "/api/v1/private/cooperative-runs/run%2Fwith%20separator?eventLimit=50&beforeSequence=12&includeSnapshots=true",
    );
  });

  it("maps only the canonical RUN_NOT_FOUND response to a null detail", async () => {
    const { read, value } = client();
    read.mockRejectedValue(
      new PrivateApiError(404, {
        code: "RUN_NOT_FOUND",
        message: "Esta execução não existe mais.",
      }),
    );

    await expect(
      getPrivateCooperativeRun(value, { runId: "missing-run" }),
    ).resolves.toBeNull();
  });

  it("does not hide storage or authorization errors as a missing run", async () => {
    const { read, value } = client();
    const error = new PrivateApiError(503, {
      code: "STORAGE_UNAVAILABLE",
      message: "Storage unavailable.",
    });
    read.mockRejectedValue(error);

    await expect(
      getPrivateCooperativeRun(value, { runId: "run-1" }),
    ).rejects.toBe(error);
  });
});
