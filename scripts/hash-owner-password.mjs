import { stdin, stdout } from "node:process";

const encoder = new TextEncoder();
const ITERATIONS = 310_000;

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

async function derive(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    key,
    256,
  );
  return new Uint8Array(bits);
}

async function readHidden(prompt) {
  if (!stdin.isTTY) {
    const chunks = [];
    for await (const chunk of stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").trimEnd();
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  return await new Promise((resolve, reject) => {
    let value = "";
    const onData = (character) => {
      if (character === "\u0003") {
        cleanup();
        reject(new Error("CANCELLED"));
        return;
      }
      if (character === "\r" || character === "\n") {
        cleanup();
        stdout.write("\n");
        resolve(value);
        return;
      }
      if (character === "\u007f") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          stdout.write("\b \b");
        }
        return;
      }
      value += character;
      stdout.write("•");
    };
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on("data", onData);
  });
}

const password = await readHidden("Senha do proprietário: ");
if (password.length < 12) {
  console.error("A senha precisa ter pelo menos 12 caracteres.");
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const hash = await derive(password, salt);
stdout.write(
  `pbkdf2-sha256$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}\n`,
);
