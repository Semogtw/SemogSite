import type { OwnerEntityAction } from "@semogtw/database/commands";

export type DevOSEntityActionsInput = {
  resourceType: string;
  resourceId: string;
};

type OwnerIdentity = {
  id: string;
  sessionId: string;
};

export type DevOSEntityActionsDependencies<Database> = {
  resolveOwner(): Promise<OwnerIdentity | null>;
  getDatabase(): Promise<Database | null>;
  getActions(
    database: Database,
    input: {
      ownerId: string;
      resourceType: string;
      resourceId: string;
    },
  ): readonly OwnerEntityAction[];
};

export function createDevOSEntityActionsHandler<Database>(
  dependencies: DevOSEntityActionsDependencies<Database>,
): (
  input: DevOSEntityActionsInput,
) => Promise<readonly OwnerEntityAction[]> {
  return async (input) => {
    if (
      input.resourceType.trim() !== input.resourceType ||
      input.resourceType.length < 1 ||
      input.resourceType.length > 120 ||
      input.resourceId.trim() !== input.resourceId ||
      input.resourceId.length < 1 ||
      input.resourceId.length > 200
    ) {
      return [];
    }

    const owner = await dependencies.resolveOwner();
    if (owner === null) return [];

    const database = await dependencies.getDatabase();
    if (database === null) return [];

    try {
      return dependencies.getActions(database, {
        ownerId: owner.id,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
      });
    } catch {
      return [];
    }
  };
}
