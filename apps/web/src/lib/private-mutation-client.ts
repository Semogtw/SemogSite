export interface PrivateMutationClient {
  mutate<T>(operation: string, payload: unknown): Promise<T>;
}
