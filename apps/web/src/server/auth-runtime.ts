import type { AuthProvider } from "@semogtw/auth";

let authProvider: AuthProvider | null = null;
let sessionSecret: string | null = null;

export function configureWebAuth(input: {
  authProvider: AuthProvider;
  sessionSecret: string;
}): void {
  if (input.sessionSecret.length < 32) {
    throw new Error("INVALID_SESSION_CONFIGURATION");
  }
  authProvider = input.authProvider;
  sessionSecret = input.sessionSecret;
}

export function getWebAuthProvider(): AuthProvider | null {
  return authProvider;
}

export function getWebSessionSecret(): string | null {
  return sessionSecret;
}

export function resetWebAuthForTests(): void {
  authProvider = null;
  sessionSecret = null;
}
