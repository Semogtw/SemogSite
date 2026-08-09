import type { CooperativeRunSnapshot } from "@semogtw/domain";

export type CooperativeRunFreshness = {
  heartbeatAgeSeconds: number;
  heartbeatExpired: boolean;
};

/**
 * Derives heartbeat freshness without mutating or reinterpreting the canonical
 * run status. A completed/failed run may have an old heartbeat and still be a
 * valid terminal record; callers should use `heartbeatExpired` only as an
 * operational freshness signal.
 */
export function deriveCooperativeRunFreshness(
  run: Pick<
    CooperativeRunSnapshot,
    "lastHeartbeatAt" | "staleAfterSeconds"
  >,
  now: Date = new Date(),
): CooperativeRunFreshness {
  const heartbeatMs = Date.parse(run.lastHeartbeatAt);
  const nowMs = now.getTime();
  if (!Number.isFinite(heartbeatMs) || !Number.isFinite(nowMs)) {
    return {
      heartbeatAgeSeconds: 0,
      heartbeatExpired: true,
    };
  }

  const heartbeatAgeSeconds = Math.max(
    0,
    Math.floor((nowMs - heartbeatMs) / 1_000),
  );
  return {
    heartbeatAgeSeconds,
    heartbeatExpired: heartbeatAgeSeconds > run.staleAfterSeconds,
  };
}
