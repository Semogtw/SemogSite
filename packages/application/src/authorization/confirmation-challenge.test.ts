import { describe, expect, it } from "vitest";
import {
  confirmationChallengeResponseBytes,
  confirmationChallengeTtlMinutes,
  createConfirmationChallengeService,
  type ConfirmationChallengeRecord,
  type ConfirmationChallengeStore,
} from "./confirmation-challenge";

class MemoryChallengeStore implements ConfirmationChallengeStore {
  readonly records = new Map<string, ConfirmationChallengeRecord>();

  async create(record: ConfirmationChallengeRecord): Promise<boolean> {
    if (this.records.has(record.challengeId)) return false;
    this.records.set(record.challengeId, record);
    return true;
  }

  async consume(input: {
    challengeId: string;
    clientId: string;
    commandId: string;
    commandVersion: number;
    payloadSha256: string;
    resourceSnapshotSha256: string;
    responseDigest: string;
    now: string;
  }): Promise<boolean> {
    const record = this.records.get(input.challengeId);
    if (
      record === undefined ||
      record.status !== "pending" ||
      input.now >= record.expiresAt ||
      record.clientId !== input.clientId ||
      record.commandId !== input.commandId ||
      record.commandVersion !== input.commandVersion ||
      record.payloadSha256 !== input.payloadSha256 ||
      record.resourceSnapshotSha256 !== input.resourceSnapshotSha256 ||
      record.responseDigest !== input.responseDigest
    ) {
      return false;
    }
    this.records.set(record.challengeId, {
      ...record,
      status: "consumed",
      consumedAt: input.now,
    });
    return true;
  }
}

function digest(value: string): Promise<string> {
  const output = [...new TextEncoder().encode(value)]
    .reduce((sum, byte) => (sum + byte) % 256, 0)
    .toString(16)
    .padStart(2, "0");
  return Promise.resolve(output.repeat(32));
}

function randomBytes(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_value, index) => (index + length) % 256);
}

const validCreate = {
  clientId: "client_1",
  commandId: "attention.transition",
  commandVersion: 1,
  payloadSha256: "a".repeat(64),
  resourceSnapshotSha256: "b".repeat(64),
  risk: "medium" as const,
  summary: "Finalizar o item de atenção selecionado.",
  now: "2026-08-04T20:00:00.000Z",
};

describe("confirmation challenge creation", () => {
  it("uses a ten-minute TTL and at least 32 random response bytes", async () => {
    expect(confirmationChallengeTtlMinutes).toBe(10);
    expect(confirmationChallengeResponseBytes).toBeGreaterThanOrEqual(32);

    const store = new MemoryChallengeStore();
    const service = createConfirmationChallengeService({
      store,
      randomBytes,
      sha256: digest,
    });

    const created = await service.create(validCreate);

    expect(created).toMatchObject({
      commandId: "attention.transition",
      commandVersion: 1,
      risk: "medium",
      summary: validCreate.summary,
      expiresAt: "2026-08-04T20:10:00.000Z",
    });
    expect(created.challengeId).toMatch(/^challenge_[a-f0-9]{32}$/u);
    expect(created.responseToken).toMatch(/^[a-f0-9]{64}$/u);

    const stored = store.records.get(created.challengeId);
    expect(stored).toMatchObject({
      challengeId: created.challengeId,
      clientId: "client_1",
      status: "pending",
      consumedAt: null,
      revokedAt: null,
    });
    expect(stored?.responseDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(stored)).not.toContain(created.responseToken);
    expect(JSON.stringify(stored)).not.toContain("responseToken");
    expect(JSON.stringify(stored)).not.toContain(validCreate.summary);
    expect(JSON.stringify(stored)).not.toContain("summary");
  });

  it.each([
    { risk: "critical" },
    { risk: "low" },
    { clientId: " client_1" },
    { commandId: "Attention Transition" },
    { commandVersion: 0 },
    { payloadSha256: "not-a-hash" },
    { resourceSnapshotSha256: "C".repeat(64) },
    { summary: "" },
    { summary: "x".repeat(501) },
    { now: "2026-02-31T20:00:00.000Z" },
  ])("rejects malformed creation material %#", async (override) => {
    const service = createConfirmationChallengeService({
      store: new MemoryChallengeStore(),
      randomBytes,
      sha256: digest,
    });
    await expect(
      service.create({ ...validCreate, ...override } as never),
    ).rejects.toThrow("CONFIRMATION_CHALLENGE_INVALID");
  });

  it("rejects a random source that returns fewer bytes than requested", async () => {
    const service = createConfirmationChallengeService({
      store: new MemoryChallengeStore(),
      randomBytes: (length) => new Uint8Array(Math.max(0, length - 1)),
      sha256: digest,
    });
    await expect(service.create(validCreate)).rejects.toThrow(
      "CONFIRMATION_CHALLENGE_RANDOM_INVALID",
    );
  });
});

describe("confirmation challenge consumption", () => {
  async function harness() {
    const store = new MemoryChallengeStore();
    const service = createConfirmationChallengeService({
      store,
      randomBytes,
      sha256: digest,
    });
    const challenge = await service.create(validCreate);
    return { store, service, challenge };
  }

  it("consumes the exact binding once", async () => {
    const { service, challenge } = await harness();
    const input = {
      challengeId: challenge.challengeId,
      clientId: validCreate.clientId,
      commandId: validCreate.commandId,
      commandVersion: validCreate.commandVersion,
      payloadSha256: validCreate.payloadSha256,
      resourceSnapshotSha256: validCreate.resourceSnapshotSha256,
      responseToken: challenge.responseToken,
      now: "2026-08-04T20:05:00.000Z",
    };

    await expect(service.consume(input)).resolves.toBe(true);
    await expect(service.consume(input)).resolves.toBe(false);
  });

  it.each([
    { clientId: "client_other" },
    { commandId: "roadmap.stages.complete" },
    { commandVersion: 2 },
    { payloadSha256: "c".repeat(64) },
    { resourceSnapshotSha256: "d".repeat(64) },
    { responseToken: "e".repeat(64) },
  ])("rejects modified binding %#", async (override) => {
    const { service, challenge } = await harness();
    await expect(
      service.consume({
        challengeId: challenge.challengeId,
        clientId: validCreate.clientId,
        commandId: validCreate.commandId,
        commandVersion: validCreate.commandVersion,
        payloadSha256: validCreate.payloadSha256,
        resourceSnapshotSha256: validCreate.resourceSnapshotSha256,
        responseToken: challenge.responseToken,
        now: "2026-08-04T20:05:00.000Z",
        ...override,
      }),
    ).resolves.toBe(false);
  });

  it("rejects expiry and revocation without exposing why", async () => {
    const expired = await harness();
    await expect(
      expired.service.consume({
        challengeId: expired.challenge.challengeId,
        clientId: validCreate.clientId,
        commandId: validCreate.commandId,
        commandVersion: validCreate.commandVersion,
        payloadSha256: validCreate.payloadSha256,
        resourceSnapshotSha256: validCreate.resourceSnapshotSha256,
        responseToken: expired.challenge.responseToken,
        now: "2026-08-04T20:10:00.000Z",
      }),
    ).resolves.toBe(false);

    const revoked = await harness();
    const record = revoked.store.records.get(revoked.challenge.challengeId);
    expect(record).toBeDefined();
    revoked.store.records.set(revoked.challenge.challengeId, {
      ...record!,
      status: "revoked",
      revokedAt: "2026-08-04T20:04:00.000Z",
    });
    await expect(
      revoked.service.consume({
        challengeId: revoked.challenge.challengeId,
        clientId: validCreate.clientId,
        commandId: validCreate.commandId,
        commandVersion: validCreate.commandVersion,
        payloadSha256: validCreate.payloadSha256,
        resourceSnapshotSha256: validCreate.resourceSnapshotSha256,
        responseToken: revoked.challenge.responseToken,
        now: "2026-08-04T20:05:00.000Z",
      }),
    ).resolves.toBe(false);
  });
});
