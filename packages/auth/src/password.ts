const encoder = new TextEncoder();
const ITERATIONS = 310_000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const ALGORITHM = "pbkdf2-sha256";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashOwnerPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error("OWNER_PASSWORD_TOO_SHORT");
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return [ALGORITHM, String(ITERATIONS), toBase64Url(salt), toBase64Url(hash)].join("$");
}

export async function verifyOwnerPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [algorithm, iterationsText, saltText, expectedText] = encodedHash.split("$");
  const iterations = Number(iterationsText);
  if (
    algorithm !== ALGORITHM ||
    !Number.isInteger(iterations) ||
    iterations < 100_000 ||
    saltText === undefined ||
    expectedText === undefined
  ) {
    return false;
  }

  try {
    const actual = await derive(password, fromBase64Url(saltText), iterations);
    return equalBytes(actual, fromBase64Url(expectedText));
  } catch {
    return false;
  }
}
