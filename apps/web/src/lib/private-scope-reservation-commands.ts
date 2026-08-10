import type { PrivateMutationClient } from "./private-mutation-client";

export type OverrideScopeReservationInput = {
  idempotencyKey: string;
  reservationId: string;
  expectedVersion: number;
  reason: string;
  confirmed: true;
};

export type ScopeReservationMutationResult = {
  reservation: unknown;
};

export function overridePrivateScopeReservation(
  client: PrivateMutationClient,
  input: OverrideScopeReservationInput,
): Promise<ScopeReservationMutationResult> {
  return client.mutate<ScopeReservationMutationResult>(
    "scope_reservation.override",
    input,
  );
}
