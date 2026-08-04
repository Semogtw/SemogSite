import type { OwnerEntityAction } from "@semogtw/database/commands";
import { describe, expect, it, vi } from "vitest";
import { createDevOSEntityActionsHandler } from "./devos-entity-actions-handler";

type TestDatabase = { marker: string };
type Owner = { id: string; sessionId: string };

function dependencies(actions: readonly OwnerEntityAction[] = []) {
  const resolveOwner = vi.fn<() => Promise<Owner | null>>(
    async () => ({ id: "owner-1", sessionId: "session-1" }),
  );
  const getDatabase = vi.fn<() => Promise<TestDatabase | null>>(
    async () => ({ marker: "database" }),
  );
  const getActions = vi.fn(
    (_database: TestDatabase, _input: {
      ownerId: string;
      resourceType: string;
      resourceId: string;
    }) => actions,
  );
  return { resolveOwner, getDatabase, getActions };
}

describe("DevOS entity action handler", () => {
  it("resolves the owner before opening storage", async () => {
    const deps = dependencies();
    deps.resolveOwner.mockResolvedValue(null);
    const handler = createDevOSEntityActionsHandler(deps);

    await expect(
      handler({ resourceType: "attention_item", resourceId: "attention-1" }),
    ).resolves.toEqual([]);
    expect(deps.getDatabase).not.toHaveBeenCalled();
    expect(deps.getActions).not.toHaveBeenCalled();
  });

  it("passes only the authenticated owner and exact resource to the resolver", async () => {
    const action: OwnerEntityAction = {
      labelPtBr: "Finalizar item",
      risk: "medium",
      reversible: true,
      availability: "confirmation_required",
    };
    const deps = dependencies([action]);
    const handler = createDevOSEntityActionsHandler(deps);

    const result = await handler({
      resourceType: "attention_item",
      resourceId: "attention-1",
    });
    expect(result).toEqual([action]);
    expect(JSON.stringify(result)).not.toContain("attention.transition");
    expect(deps.getActions).toHaveBeenCalledWith(
      { marker: "database" },
      {
        ownerId: "owner-1",
        resourceType: "attention_item",
        resourceId: "attention-1",
      },
    );
  });

  it("returns an indistinguishable empty list for absent resources or storage", async () => {
    const missing = dependencies([]);
    await expect(
      createDevOSEntityActionsHandler(missing)({
        resourceType: "stage",
        resourceId: "missing",
      }),
    ).resolves.toEqual([]);

    const unavailable = dependencies();
    unavailable.getDatabase.mockResolvedValue(null);
    await expect(
      createDevOSEntityActionsHandler(unavailable)({
        resourceType: "stage",
        resourceId: "stage-1",
      }),
    ).resolves.toEqual([]);
  });
});
