import { describe, expect, it, vi } from "vitest";
import {
  evaluateAgentGrantState,
  planAgentGrantStatusTransition,
} from "./grant-lifecycle";
import type {
  AgentCapability,
  AgentGrantDefinition,
  ResourceSelector,
} from "./types";

const now = "2026-08-04T20:00:00.000Z";

function grant(
  overrides: Partial<AgentGrantDefinition> = {},
): AgentGrantDefinition {
  return {
    id: "grant_1",
    ownerId: "owner_1",
    clientId: "client_1",
    profileId: null,
    status: "active",
    capabilities: ["attention.write"],
    resourceSelectors: {
      attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
    },
    riskCeiling: "medium",
    expiresAt: null,
    version: 3,
    ...overrides,
  };
}

function accessorArray<T>(getter: () => T): T[] {
  const value: T[] = [];
  Object.defineProperty(value, "0", {
    configurable: true,
    enumerable: true,
    get: getter,
  });
  value.length = 1;
  return value;
}

function poisonMethod<T extends unknown[]>(
  value: T,
  method: "flatMap" | "every" | "some",
): ReturnType<typeof vi.fn> {
  const poisoned = vi.fn(() => {
    throw new Error(`caller ${method} must not run`);
  });
  Object.defineProperty(value, method, {
    configurable: true,
    value: poisoned,
  });
  return poisoned;
}

describe("grant lifecycle public boundary", () => {
  it("marks capability accessors invalid without invoking them", () => {
    const getter = vi.fn(() => "attention.write" as AgentCapability);

    expect(
      evaluateAgentGrantState(
        grant({ capabilities: accessorArray(getter) }),
        now,
      ),
    ).toBe("invalid");
    expect(getter).not.toHaveBeenCalled();
  });

  it("evaluates a valid copy without invoking caller array methods", () => {
    const candidate = grant();
    const flatMap = poisonMethod(
      candidate.capabilities as AgentCapability[],
      "flatMap",
    );
    const every = poisonMethod(
      candidate.capabilities as AgentCapability[],
      "every",
    );
    const selectorSome = poisonMethod(
      candidate.resourceSelectors.attention_item as ResourceSelector[],
      "some",
    );

    expect(evaluateAgentGrantState(candidate, now)).toBe("active");
    expect(flatMap).not.toHaveBeenCalled();
    expect(every).not.toHaveBeenCalled();
    expect(selectorSome).not.toHaveBeenCalled();
  });

  it("rejects accessor-backed grant fields without invoking them", () => {
    const getter = vi.fn(() => "owner_1");
    const candidate = grant() as AgentGrantDefinition & Record<string, unknown>;
    Object.defineProperty(candidate, "ownerId", {
      configurable: true,
      enumerable: true,
      get: getter,
    });

    expect(() =>
      planAgentGrantStatusTransition({
        actor: { kind: "owner_ui", actorId: "owner_1" },
        grant: candidate,
        targetStatus: "suspended",
        now,
        reason: "Pause while reviewing the integration.",
      }),
    ).toThrow("AGENT_GRANT_TRANSITION_INVALID");
    expect(getter).not.toHaveBeenCalled();
  });
});
