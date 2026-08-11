import type { PrivateMutationClient } from "./private-mutation-client";

export type ScopeReservationKind =
  | "repository"
  | "directory"
  | "files"
  | "issue"
  | "stage"
  | "custom";

export type AcquireScopeReservationInput = {
  idempotencyKey: string;
  projectId: string | null;
  repositoryId: string;
  runId: string | null;
  branch: string;
  kind: ScopeReservationKind;
  patterns: readonly string[];
  holderLabel: string;
  purpose: string;
  ttlSeconds: number;
  acknowledgeOverlap: boolean;
  confirmed: true;
};

export type AcquireScopeReservationResult = {
  reservation: unknown;
  overlaps: readonly unknown[];
};

export type RenewScopeReservationInput = {
  idempotencyKey: string;
  reservationId: string;
  runId: string;
  expectedVersion: number;
  ttlSeconds: number;
  confirmed: true;
};

export type ReleaseScopeReservationInput = {
  idempotencyKey: string;
  reservationId: string;
  runId: string;
  expectedVersion: number;
  reason: string;
  confirmed: true;
};

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

export function acquirePrivateScopeReservation(
  client: PrivateMutationClient,
  input: AcquireScopeReservationInput,
): Promise<AcquireScopeReservationResult> {
  return client.mutate<AcquireScopeReservationResult>(
    "scope_reservation.acquire",
    input,
  );
}

export function renewPrivateScopeReservation(
  client: PrivateMutationClient,
  input: RenewScopeReservationInput,
): Promise<ScopeReservationMutationResult> {
  return client.mutate<ScopeReservationMutationResult>(
    "scope_reservation.renew",
    input,
  );
}

export function releasePrivateScopeReservation(
  client: PrivateMutationClient,
  input: ReleaseScopeReservationInput,
): Promise<ScopeReservationMutationResult> {
  return client.mutate<ScopeReservationMutationResult>(
    "scope_reservation.release",
    input,
  );
}

export function overridePrivateScopeReservation(
  client: PrivateMutationClient,
  input: OverrideScopeReservationInput,
): Promise<ScopeReservationMutationResult> {
  return client.mutate<ScopeReservationMutationResult>(
    "scope_reservation.override",
    input,
  );
}
