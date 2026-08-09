import type { D1QueryResult } from "../adapters/d1";

/**
 * Verifies that every statement in a D1 batch completed successfully.
 * Adapters intentionally throw a generic storage error rather than exposing
 * D1 error text to upper layers that may surface it through HTTP responses.
 */
export function assertD1BatchSucceeded(
  results: readonly D1QueryResult[],
  operation: string,
): void {
  const failed = results.find(
    (result) => result.success === false || (result.error?.length ?? 0) > 0,
  );
  if (failed !== undefined) {
    throw new Error(`D1 ${operation} batch failed.`);
  }
}

/**
 * Returns the trustworthy change count from one guarded DML statement.
 * Missing, fractional, negative or otherwise malformed metadata is treated as
 * a storage failure: callers must never infer optimistic-write success from an
 * ambiguous D1 result.
 */
export function readD1ChangeCount(
  result: D1QueryResult | undefined,
  operation: string,
): number {
  const changes = result?.meta?.["changes"];
  if (typeof changes !== "number" || !Number.isInteger(changes) || changes < 0) {
    throw new Error(`D1 ${operation} result is missing changes metadata.`);
  }
  return changes;
}

/**
 * Guard for writes that are contractually allowed to affect at most one row.
 * It distinguishes the useful CAS states (0 or 1) and fails closed on any
 * impossible multi-row result.
 */
export function readD1SingleRowChange(
  result: D1QueryResult | undefined,
  operation: string,
): 0 | 1 {
  const changes = readD1ChangeCount(result, operation);
  if (changes !== 0 && changes !== 1) {
    throw new Error(`D1 ${operation} changed more than one row.`);
  }
  return changes;
}
