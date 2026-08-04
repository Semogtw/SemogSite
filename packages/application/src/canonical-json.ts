import { createHash } from "node:crypto";

function invalid(): never {
  throw new Error("CANONICAL_JSON_INVALID");
}

function jsonString(value: string | number): string {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? invalid() : encoded;
}

function encodeNumber(value: number): string {
  if (!Number.isFinite(value)) invalid();
  return Object.is(value, -0) ? "0" : jsonString(value);
}

function encodeArray(value: readonly unknown[], active: WeakSet<object>): string {
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== "string") ||
    ownKeys.length !== value.length + 1
  ) {
    invalid();
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) invalid();
  }
  const allowed = new Set([
    ...Array.from({ length: value.length }, (_item, index) => String(index)),
    "length",
  ]);
  if (ownKeys.some((key) => !allowed.has(key as string))) invalid();
  return `[${value.map((item) => encode(item, active)).join(",")}]`;
}

function encodeObject(
  value: Record<string, unknown>,
  active: WeakSet<object>,
): string {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) invalid();

  const stringKeys = keys as string[];
  for (const key of stringKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      invalid();
    }
  }

  return `{${stringKeys
    .sort()
    .map(
      (key) =>
        `${jsonString(key)}:${encode(descriptors[key]!.value, active)}`,
    )
    .join(",")}}`;
}

function encode(value: unknown, active: WeakSet<object>): string {
  if (value === null) return "null";
  if (typeof value === "string") return jsonString(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return encodeNumber(value);
  if (typeof value !== "object") invalid();

  if (active.has(value)) throw new Error("CANONICAL_JSON_CYCLE");
  active.add(value);
  try {
    return Array.isArray(value)
      ? encodeArray(value, active)
      : encodeObject(value as Record<string, unknown>, active);
  } finally {
    active.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return encode(value, new WeakSet<object>());
}

export function canonicalSha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
