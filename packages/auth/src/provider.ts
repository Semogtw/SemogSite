export type OwnerCredentials = {
  password: string;
};

export type AuthenticatedOwner = {
  id: string;
  sessionId: string;
  expiresAt: string;
};

export type AuthSuccess = {
  ok: true;
  rawToken: string;
  session: {
    id: string;
    expiresAt: string;
  };
};

export type AuthFailure = {
  ok: false;
  reason: "INVALID_CREDENTIALS" | "AUTH_NOT_CONFIGURED";
};

export type AuthResult = AuthSuccess | AuthFailure;

export interface AuthProvider {
  authenticate(credentials: OwnerCredentials): Promise<AuthResult>;
  resolveSession(rawToken: string): Promise<AuthenticatedOwner | null>;
  revokeSession(sessionId: string): Promise<void>;
}
