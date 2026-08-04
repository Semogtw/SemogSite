import { createDevOSGrowthComposition } from "./devos-growth-composition";
import { createDevOSGrowthServerFunctions } from "./devos-growth-server-functions";
import { resolveCurrentOwner } from "./current-owner.server";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const handlers = createDevOSGrowthComposition({
  getDatabase: getNodeDatabase,
  async resolveOwner() {
    const owner = await resolveCurrentOwner();
    return owner === null
      ? null
      : {
          id: owner.id,
          sessionId: owner.sessionId,
        };
  },
  async authorizeMutation(csrfToken) {
    const owner = await requireMutationOwner(csrfToken);
    return owner === null
      ? null
      : {
          id: owner.id,
          sessionId: owner.sessionId,
        };
  },
  now: () => new Date().toISOString(),
  nextId: (prefix) => `${prefix}_${crypto.randomUUID()}`,
  nextCorrelationId: () => crypto.randomUUID(),
});

export const {
  getGrowthOverviewFn,
  getGrowthGoalFn,
  previewLearningGoalTemplateFn,
  quickCreateLearningGoalFn,
} = createDevOSGrowthServerFunctions(handlers);
