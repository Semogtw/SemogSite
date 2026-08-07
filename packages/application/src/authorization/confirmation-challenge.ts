import { isCanonicalUtcTimestamp } from "../iso-timestamp";

export const confirmationChallengeTtlMinutes = 10;
export const confirmationChallengeResponseBytes = 32;
const confirmationChallengeIdBytes = 16;

export type ConfirmationChallengeRisk = "medium" | "high";
export type ConfirmationChallengeStatus =
  | "pending"
  | "consumed"
  | "expired"
  | "revoked";

export type ConfirmationChallengePublic = {
  challengeId: string;
  commandId: string;
  commandVersion: number;
  risk: ConfirmationChallengeRisk;
  summary: string;
  expiresAt: string;
  responseToken: string;
};

export type ConfirmationChallengeRecord = {
  challengeId: string;
  clientId: string;
  commandId: string;
  commandVersion: number;
  payloadSha256: string;
  resourceSnapshotSha256: string;
  risk: ConfirmationChallengeRisk;
  responseDigest: string;
  status: ConfirmationChallengeStatus;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
};

export interface ConfirmationChallengeStore {
  create(record: ConfirmationChallengeRecord): Promise<boolean>;
  consume(input: {
    challengeId: string;
    clientId: string;
    commandId: string;
    commandVersion: number;
    payloadSha256: string;
    resourceSnapshotSha256: string;
    responseDigest: string;
    now: string;
  }): Promise<boolean>;
}

export interface ConfirmationChallengeService {
  create(input: {
    clientId: string;
    commandId: string;
    commandVersion: number;
    payloadSha256: string;
    resourceSnapshotSha256: string;
    risk: ConfirmationChallengeRisk;
    summary: string;
    now: string;
  }): Promise<ConfirmationChallengePublic>;
  consume(input: {
    challengeId: string;
    clientId: string;
    commandId: string;
    commandVersion: number;
    payloadSha256: string;
    resourceSnapshotSha256: string;
    responseToken: string;
    now: string;
  }): Promise<boolean>;
}

const hashPattern = /^[a-f0-9]{64}$/u;
const commandIdPattern = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const challengeIdPattern = /^challenge_[a-f0-9]{32}$/u;
const responseTokenPattern = /^[a-f0-9]{64,}$/u;

function bounded(value: string, maximum: number): boolean {
  return (
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

function bytesToHex(value: Uint8Array): string {
  return [...value]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function exactRandomBytes(
  randomBytes: (length: number) => Uint8Array,
  length: number,
): Uint8Array {
  const value = randomBytes(length);
  if (!(value instanceof Uint8Array) || value.byteLength !== length) {
    throw new Error("CONFIRMATION_CHALLENGE_RANDOM_INVALID");
  }
  return value;
}

function creationValid(input: {
  clientId: string;
  commandId: string;
  commandVersion: number;
  payloadSha256: string;
  resourceSnapshotSha256: string;
  risk: string;
  summary: string;
  now: string;
}): boolean {
  return (
    bounded(input.clientId, 200) &&
    input.commandId.length <= 160 &&
    commandIdPattern.test(input.commandId) &&
    Number.isInteger(input.commandVersion) &&
    input.commandVersion >= 1 &&
    hashPattern.test(input.payloadSha256) &&
    hashPattern.test(input.resourceSnapshotSha256) &&
    (input.risk === "medium" || input.risk === "high") &&
    bounded(input.summary, 500) &&
    isCanonicalUtcTimestamp(input.now)
  );
}

function consumptionValid(input: {
  challengeId: string;
  clientId: string;
  commandId: string;
  commandVersion: number;
  payloadSha256: string;
  resourceSnapshotSha256: string;
  responseToken: string;
  now: string;
}): boolean {
  return (
    challengeIdPattern.test(input.challengeId) &&
    bounded(input.clientId, 200) &&
    input.commandId.length <= 160 &&
    commandIdPattern.test(input.commandId) &&
    Number.isInteger(input.commandVersion) &&
    input.commandVersion >= 1 &&
    hashPattern.test(input.payloadSha256) &&
    hashPattern.test(input.resourceSnapshotSha256) &&
    responseTokenPattern.test(input.responseToken) &&
    input.responseToken.length % 2 === 0 &&
    isCanonicalUtcTimestamp(input.now)
  );
}

export function createConfirmationChallengeService(input: {
  store: ConfirmationChallengeStore;
  randomBytes(length: number): Uint8Array;
  sha256(value: string): Promise<string>;
}): ConfirmationChallengeService {
  return {
    async create(material) {
      if (!creationValid(material)) {
        throw new Error("CONFIRMATION_CHALLENGE_INVALID");
      }

      const challengeId = `challenge_${bytesToHex(
        exactRandomBytes(input.randomBytes, confirmationChallengeIdBytes),
      )}`;
      const responseToken = bytesToHex(
        exactRandomBytes(
          input.randomBytes,
          confirmationChallengeResponseBytes,
        ),
      );
      const responseDigest = await input.sha256(responseToken);
      if (!hashPattern.test(responseDigest)) {
        throw new Error("CONFIRMATION_CHALLENGE_DIGEST_INVALID");
      }

      const expiresAt = new Date(
        Date.parse(material.now) + confirmationChallengeTtlMinutes * 60_000,
      ).toISOString();
      const stored = await input.store.create({
        challengeId,
        clientId: material.clientId,
        commandId: material.commandId,
        commandVersion: material.commandVersion,
        payloadSha256: material.payloadSha256,
        resourceSnapshotSha256: material.resourceSnapshotSha256,
        risk: material.risk,
        responseDigest,
        status: "pending",
        createdAt: material.now,
        expiresAt,
        consumedAt: null,
        revokedAt: null,
      });
      if (!stored) throw new Error("CONFIRMATION_CHALLENGE_CONFLICT");

      return {
        challengeId,
        commandId: material.commandId,
        commandVersion: material.commandVersion,
        risk: material.risk,
        summary: material.summary,
        expiresAt,
        responseToken,
      };
    },

    async consume(material) {
      if (!consumptionValid(material)) return false;
      let responseDigest: string;
      try {
        responseDigest = await input.sha256(material.responseToken);
      } catch {
        return false;
      }
      if (!hashPattern.test(responseDigest)) return false;

      return input.store.consume({
        challengeId: material.challengeId,
        clientId: material.clientId,
        commandId: material.commandId,
        commandVersion: material.commandVersion,
        payloadSha256: material.payloadSha256,
        resourceSnapshotSha256: material.resourceSnapshotSha256,
        responseDigest,
        now: material.now,
      });
    },
  };
}
