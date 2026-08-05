import { describe, expect, it, vi } from "vitest";
import {
  createConfirmationChallengeService,
  type ConfirmationChallengeRecord,
  type ConfirmationChallengeStore,
} from "./confirmation-challenge";

class Store implements ConfirmationChallengeStore {
  readonly created: ConfirmationChallengeRecord[] = [];

  async create(record: ConfirmationChallengeRecord): Promise<boolean> {
    this.created.push(record);
    return true;
  }

  async consume(): Promise<boolean> {
    return true;
  }
}

const validCreate = {
  clientId: "client_1",
  commandId: "attention.transition",
  commandVersion: 1,
  payloadSha256: "a".repeat(64),
  resourceSnapshotSha256: "b".repeat(64),
  risk: "medium" as const,
  summary: "Confirm supervised attention transition.",
  now: "2026-08-05T12:00:00.000Z",
};

function digest(): Promise<string> {
  return Promise.resolve("c".repeat(64));
}

function randomBytes(length: number): Uint8Array {
  return new Uint8Array(length).fill(1);
}

describe("confirmation challenge public boundary", () => {
  it("rejects accessor-backed creation material without invoking it", async () => {
    const getter = vi.fn(() => "client_1");
    const material: Record<string, unknown> = { ...validCreate };
    delete material.clientId;
    Object.defineProperty(material, "clientId", {
      configurable: true,
      enumerable: true,
      get: getter,
    });
    const service = createConfirmationChallengeService({
      store: new Store(),
      randomBytes,
      sha256: digest,
    });

    await expect(service.create(material as never)).rejects.toThrow(
      "CONFIRMATION_CHALLENGE_INVALID",
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it("fails closed for accessor-backed consumption material", async () => {
    const getter = vi.fn(() => "f".repeat(64));
    const material: Record<string, unknown> = {
      challengeId: `challenge_${"a".repeat(32)}`,
      clientId: "client_1",
      commandId: "attention.transition",
      commandVersion: 1,
      payloadSha256: "a".repeat(64),
      resourceSnapshotSha256: "b".repeat(64),
      now: "2026-08-05T12:01:00.000Z",
    };
    Object.defineProperty(material, "responseToken", {
      configurable: true,
      enumerable: true,
      get: getter,
    });
    const service = createConfirmationChallengeService({
      store: new Store(),
      randomBytes,
      sha256: digest,
    });

    await expect(service.consume(material as never)).resolves.toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it("encodes random bytes without invoking their iterator", async () => {
    const iteratorGetter = vi.fn(() => {
      throw new Error("random byte iterator must not run");
    });
    const service = createConfirmationChallengeService({
      store: new Store(),
      randomBytes(length) {
        const value = randomBytes(length);
        Object.defineProperty(value, Symbol.iterator, {
          configurable: true,
          get: iteratorGetter,
        });
        return value;
      },
      sha256: digest,
    });

    await expect(service.create(validCreate)).resolves.toMatchObject({
      commandId: "attention.transition",
    });
    expect(iteratorGetter).not.toHaveBeenCalled();
  });

  it("captures dependencies instead of following later mutations", async () => {
    const store = new Store();
    const dependencies = {
      store,
      randomBytes,
      sha256: digest,
    };
    const service = createConfirmationChallengeService(dependencies);
    dependencies.randomBytes = () => {
      throw new Error("mutated random source must not run");
    };
    dependencies.sha256 = () => {
      throw new Error("mutated digest must not run");
    };

    await expect(service.create(validCreate)).resolves.toBeDefined();
    expect(store.created).toHaveLength(1);
  });

  it("rejects non-string digest results", async () => {
    const service = createConfirmationChallengeService({
      store: new Store(),
      randomBytes,
      sha256: async () => ({ toString: () => "c".repeat(64) }) as never,
    });

    await expect(service.create(validCreate)).rejects.toThrow(
      "CONFIRMATION_CHALLENGE_DIGEST_INVALID",
    );
  });
});
