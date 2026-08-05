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
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Array.prototype && prototype !== null) invalid();

  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== "string") ||
    ownKeys.length !== value.length + 1
  ) {
    invalid();
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    lengthDescriptor.value !== value.length ||
    lengthDescriptor.get !== undefined ||
    lengthDescriptor.set !== undefined
  ) {
    invalid();
  }

  const encoded: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      invalid();
    }
    encoded.push(encode(descriptor.value, active));
  }

  const allowed = new Set([
    ...Array.from({ length: value.length }, (_item, index) => String(index)),
    "length",
  ]);
  if (ownKeys.some((key) => !allowed.has(key as string))) invalid();
  return `[${encoded.join(",")}]`;
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

export async function canonicalSha256(value: unknown): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(value)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
