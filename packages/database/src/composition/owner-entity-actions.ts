import {
  OwnerBrowserPolicy,
  editabilityManifests,
  listOwnerEntityActions,
  type OwnerEntityAction,
} from "@semogtw/application";
import type { SqliteDatabase } from "../adapters/sqlite";
import { createDevOSCommandRegistry } from "./devos-command-registry";

function resourceEligible(input: {
  database: SqliteDatabase;
  resourceType: string;
  resourceId: string;
}): boolean {
  if (input.resourceType === "attention_item") {
    const row = input.database.$client
      .prepare(
        `SELECT status FROM attention_items
         WHERE id = ? AND status IN ('open', 'monitoring')`,
      )
      .get(input.resourceId) as { status: string } | undefined;
    return row !== undefined;
  }
  if (input.resourceType === "stage") {
    const row = input.database.$client
      .prepare("SELECT state FROM stages WHERE id = ? AND state <> 'completed'")
      .get(input.resourceId) as { state: string } | undefined;
    return row !== undefined;
  }
  return false;
}

export function getOwnerEntityActions(input: {
  database: SqliteDatabase;
  ownerId: string;
  resourceType: string;
  resourceId: string;
}): readonly OwnerEntityAction[] {
  if (
    input.ownerId.trim() !== input.ownerId ||
    input.ownerId.length < 1 ||
    input.ownerId.length > 200 ||
    input.resourceType.trim() !== input.resourceType ||
    input.resourceType.length < 1 ||
    input.resourceType.length > 120 ||
    input.resourceId.trim() !== input.resourceId ||
    input.resourceId.length < 1 ||
    input.resourceId.length > 200 ||
    !resourceEligible(input)
  ) {
    return [];
  }

  return listOwnerEntityActions({
    registry: createDevOSCommandRegistry(),
    manifests: editabilityManifests,
    policy: new OwnerBrowserPolicy(),
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    context: {
      ownerId: input.ownerId,
      actor: { kind: "owner_ui", actorId: input.ownerId },
      correlationId: "owner-entity-action-discovery",
      idempotencyKey: "owner-entity-action-discovery",
      reason: "Descobrir ações disponíveis para o recurso.",
      confirmed: false,
      approvalId: null,
    },
  });
}
