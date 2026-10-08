import {
  createPrivateApiClient,
  findPrivateStateWriteCapability,
  type PrivateRuntimeCapabilities,
} from "./private-api-client";
import {
  createPrivateEditorialRedirect,
  revokePrivateEditorialRedirect,
  type EditorialRedirectMutationInput,
  type EditorialRedirectMutationResult,
} from "./private-editorial-redirect-commands";
import { getPrivateMutationRetryPolicy, type PrivateMutationRetryPolicy } from "./private-api-retry-policy";

export type PrivateDevosClientOptions = Parameters<typeof createPrivateApiClient>[0];

export type PrivateDevosClient = {
  getCapabilities(refresh?: boolean): Promise<PrivateRuntimeCapabilities>;
  clearCapabilities(): void;
  read<T>(path: `/api/v1/private/${string}`): Promise<T>;
  mutate<T>(operation: string, payload: unknown): Promise<T>;
  getRetryPolicy(operation: string): Promise<PrivateMutationRetryPolicy>;
  editorial: {
    createRedirect(input: EditorialRedirectMutationInput): Promise<EditorialRedirectMutationResult>;
    revokeRedirect(input: EditorialRedirectMutationInput): Promise<EditorialRedirectMutationResult>;
  };
};

const allowedEditorialMutations = new Set([
  "editorial_redirect.create",
  "editorial_redirect.revoke",
]);

/**
 * Browser client for administration of the site only. Deprecated agent/run/
 * repository command helpers must never be re-exposed through this facade.
 */
export function createPrivateDevosClient(options: PrivateDevosClientOptions): PrivateDevosClient {
  const api = createPrivateApiClient(options);
  const mutate = async <T>(operation: string, payload: unknown): Promise<T> => {
    if (!allowedEditorialMutations.has(operation)) {
      throw new Error("Only editorial mutations are supported by the site administrator.");
    }
    return api.mutate<T>(operation, payload);
  };
  return {
    getCapabilities: api.getCapabilities,
    clearCapabilities: api.clearCapabilities,
    read: api.read,
    mutate,
    async getRetryPolicy(operation) {
      if (!allowedEditorialMutations.has(operation)) {
        throw new Error("Only editorial mutations are supported by the site administrator.");
      }
      let capabilities = await api.getCapabilities();
      let capability = capabilities.stateWriteEndpoints.find(item => item.name === operation);
      if (capability === undefined) {
        capabilities = await api.getCapabilities(true);
        capability = findPrivateStateWriteCapability(capabilities, operation);
      }
      return getPrivateMutationRetryPolicy(capability);
    },
    editorial: {
      createRedirect: input => createPrivateEditorialRedirect({ mutate }, input),
      revokeRedirect: input => revokePrivateEditorialRedirect({ mutate }, input),
    },
  };
}
