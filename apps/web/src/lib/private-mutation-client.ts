export interface PrivateReadClient {
  read<T>(path: `/api/v1/private/${string}`): Promise<T>;
}

export interface PrivateMutationClient {
  mutate<T>(operation: string, payload: unknown): Promise<T>;
}
