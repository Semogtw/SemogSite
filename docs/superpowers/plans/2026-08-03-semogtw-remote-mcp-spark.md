# Semogtw Remote MCP and Gemini Spark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separately deployable, owner-authorized OAuth 2.1 and stateless Streamable HTTP bridge for the existing read-only Semogtw MCP catalog, then verify it with generic MCP clients and Gemini Spark when the owner's account exposes custom apps.

**Architecture:** Add a framework-free `packages/mcp-auth` domain package, additive SQLite migration/repositories, owner consent and client management in the private DevOS, and a dedicated Node 22 `apps/mcp-http` runtime that acts as OAuth authorization server plus protected MCP resource server. `packages/mcp` remains transport/auth/database-free and `apps/mcp` remains listener-free. Every remote MCP request verifies an audience-bound opaque bearer token before database or MCP construction and receives a fresh stateless server/transport lifecycle.

**Tech Stack:** Node.js 22, TypeScript, pnpm workspaces, Zod, SQLite/Drizzle, `@modelcontextprotocol/sdk` 1.x, OAuth 2.1 authorization code + PKCE S256, opaque token digests, TanStack Start private owner UI, Vitest, Playwright.

## Global Constraints

- Implement from the newest consolidated branch containing commit `272527a8548aa33e5b2afd1f4eabb9667c9a858f` or a verified descendant; do not restart from an older `develop/*` branch.
- Follow `docs/superpowers/specs/2026-08-03-semogtw-remote-mcp-spark-design.md` as the canonical design.
- Keep `packages/mcp` free of HTTP, OAuth, cookies, database, environment and provider-specific imports.
- Keep `apps/mcp` listener-free.
- Use additive migration `0014_mcp_oauth.sql`; persist only digests of client secrets, authorization codes, access tokens and refresh tokens.
- Support owner-managed preregistration and Dynamic Client Registration.
- Support only OAuth authorization code with mandatory PKCE S256.
- Bind codes/tokens to exact client ID, redirect URI, scope and canonical MCP resource/audience.
- Initial scope is exactly `devos.read`; no write scope exists.
- Access-token lifetime is 15 minutes; authorization-code lifetime is 5 minutes; refresh-token absolute lifetime is 30 days.
- Rotate refresh tokens atomically and revoke the previous token on every successful refresh.
- Accept bearer tokens only in the `Authorization` header.
- Remote MCP is disabled unless `SEMOGTW_MCP_REMOTE_ENABLED=true` and every required security setting validates.
- Enforce 64 KiB request bodies, existing 256 KiB logical MCP responses, 15-second timeout and four concurrent requests per client.
- Use a fresh stateless MCP server/transport per request; never share auth or protocol state between clients.
- Never log secrets, secret digests usable for cross-request correlation, MCP arguments/results, recovery content, private repository metadata, SQL or raw exceptions.
- Treat Spark/custom-app unavailability as `external_dependency`, not a code failure.
- Commit after every independently reviewable task and push frequently.

---

## Planned file structure

```text
packages/mcp-auth/
  package.json
  tsconfig.json
  src/index.ts
  src/model.ts
  src/validation.ts
  src/ports.ts
  src/client-service.ts
  src/authorization-service.ts
  src/token-service.ts
  src/revocation-service.ts
  src/*.test.ts

packages/database/
  migrations/0014_mcp_oauth.sql
  src/schema/mcp-oauth.ts
  src/repositories/mcp-oauth-client-repository.ts
  src/repositories/mcp-oauth-authorization-repository.ts
  src/repositories/mcp-oauth-token-repository.ts
  src/repositories/mcp-oauth-security-event-repository.ts
  src/repositories/*.test.ts
  src/mcp-oauth-migrations.test.ts

apps/web/
  src/routes/devos.integrations.mcp.tsx
  src/routes/devos.integrations.mcp_.consent.tsx
  src/components/devos/mcp-client-management.tsx
  src/components/devos/mcp-consent-panel.tsx
  src/server/devos-mcp-clients.ts
  src/server/devos-mcp-consent.ts
  src/server/*.test.ts

apps/mcp-http/
  package.json
  tsconfig.json
  src/config.ts
  src/http-policy.ts
  src/limits.ts
  src/oauth-metadata.ts
  src/oauth-registration.ts
  src/oauth-authorize.ts
  src/oauth-token.ts
  src/oauth-revoke.ts
  src/mcp-handler.ts
  src/streamable-transport.ts
  src/node-server.ts
  src/composition.ts
  src/index.ts
  src/*.test.ts
  src/remote-mcp.integration.test.ts

scripts/check-mcp-transport-boundary.mjs
scripts/check-mcp-transport-boundary*.test.mjs

runbooks/mcp-remote.md
docs/testing/2026-08-03-remote-mcp-test-matrix.md
docs/testing/2026-08-03-gemini-spark-mcp-acceptance.md
```

---

### Task 1: Reconcile the current verified MCP baseline

**Files:**
- Create: `docs/testing/2026-08-03-remote-mcp-test-matrix.md`
- Modify: `MCP.md`
- Modify: `docs/superpowers/plans/README.md`

**Interfaces:**
- Consumes: existing `createSqliteSemogtwMcpServer(database)` and the four-resource/five-tool catalog.
- Produces: exact base SHA, resolved SDK version and observed baseline commands for all later tasks.

- [ ] **Step 1: Verify ancestry and capture the exact head**

```bash
git fetch --all --prune
git merge-base --is-ancestor 272527a8548aa33e5b2afd1f4eabb9667c9a858f HEAD
git rev-parse HEAD
```

Expected: ancestry check exits `0`. Record the exact head in the test matrix.

- [ ] **Step 2: Run the existing focused MCP gates**

```bash
pnpm install --frozen-lockfile
pnpm --filter @semogtw/mcp test
pnpm --filter @semogtw/mcp typecheck
pnpm --filter @semogtw/mcp-app test
pnpm --filter @semogtw/mcp-app typecheck
pnpm check:mcp-transport-boundary
pnpm check:mcp-package-boundaries
pnpm check:mcp-node-runtime-boundary
```

Expected: PASS. Record exact test counts and command output.

- [ ] **Step 3: Record the installed SDK API surface**

```bash
pnpm why @modelcontextprotocol/sdk
node -e "import('@modelcontextprotocol/sdk/server/streamableHttp.js').then(m => console.log(Object.keys(m).sort()))"
```

Expected: the installed stable SDK and Streamable HTTP module resolve. Record exact version/exports; do not copy an API from memory.

- [ ] **Step 4: Reconcile stale documentation claims**

Remove only claims disproven by current observed output, such as dependency installation being impossible. Preserve historical evidence tied to older commits.

- [ ] **Step 5: Commit**

```bash
git add MCP.md docs/testing/2026-08-03-remote-mcp-test-matrix.md docs/superpowers/plans/README.md
git commit -m "docs: reconcile remote MCP baseline"
git push
```

---

### Task 2: Create the framework-free MCP authorization package

**Files:**
- Create: `packages/mcp-auth/package.json`
- Create: `packages/mcp-auth/tsconfig.json`
- Create: `packages/mcp-auth/src/model.ts`
- Create: `packages/mcp-auth/src/validation.ts`
- Create: `packages/mcp-auth/src/ports.ts`
- Create: `packages/mcp-auth/src/index.ts`
- Create: `packages/mcp-auth/src/validation.test.ts`

**Interfaces:**

```ts
export const MCP_READ_SCOPE = "devos.read" as const;

export type McpOAuthClient = {
  id: string;
  name: string;
  redirectUris: readonly string[];
  tokenEndpointAuthMethod: "client_secret_basic" | "none";
  status: "active" | "revoked";
  createdAt: string;
  revokedAt: string | null;
  version: number;
};

export type McpAuthorizationRequest = {
  id: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  scopes: readonly ["devos.read"];
  state: string | null;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  expiresAt: string;
};

export type McpTokenPrincipal = {
  ownerId: string;
  clientId: string;
  resource: string;
  scopes: readonly ["devos.read"];
  expiresAt: string;
};

export interface McpSecretGenerator {
  generate(bytes: number): string;
}

export interface McpSecretDigester {
  digest(secret: string): string;
  verify(secret: string, digest: string): boolean;
}

export interface McpClock {
  now(): string;
}

export function validateMcpRedirectUri(input: {
  uri: string;
  allowLoopback: boolean;
}): string;

export function verifyPkceS256(input: {
  verifier: string;
  expectedChallenge: string;
}): boolean;
```

- [ ] **Step 1: Write failing validation tests**

Cover exact redirect matching, HTTPS-only production redirects, loopback exceptions, no URL credentials/fragments/wildcards, bounded client names, only `authorization_code`, only `code`, only PKCE `S256`, only `devos.read`, exact resource URL and canonical unique redirect lists.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/mcp-auth exec vitest run src/validation.test.ts
```

Expected: FAIL because the package/contracts do not exist.

- [ ] **Step 3: Implement minimal pure validation and ports**

Do not import React, Hono, TanStack, Drizzle, SQLite or MCP SDK. Use runtime-independent data contracts and injected clock/secret ports.

- [ ] **Step 4: Run checks**

```bash
pnpm --filter @semogtw/mcp-auth test
pnpm --filter @semogtw/mcp-auth typecheck
pnpm check:boundaries
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-auth pnpm-lock.yaml
git commit -m "feat: define MCP OAuth domain contracts"
git push
```

---

### Task 3: Add migration `0014_mcp_oauth.sql`

**Files:**
- Create: `packages/database/migrations/0014_mcp_oauth.sql`
- Create: `packages/database/src/schema/mcp-oauth.ts`
- Modify: `packages/database/src/schema/index.ts`
- Create: `packages/database/src/mcp-oauth-migrations.test.ts`
- Modify: `packages/database/src/adapters/sqlite-migrations.test.ts`
- Modify: `packages/database/src/backup/sqlite-backup.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**

Create these tables with foreign keys/check constraints and additive indexes:

```text
mcp_oauth_clients
mcp_oauth_client_grants
mcp_oauth_authorization_requests
mcp_oauth_authorization_codes
mcp_oauth_access_tokens
mcp_oauth_refresh_tokens
mcp_oauth_security_events
```

Secret-bearing columns are digest-only:

```text
client_secret_digest
authorization_code_digest
access_token_digest
refresh_token_digest
```

There are no raw secret columns.

- [ ] **Step 1: Write failing migration tests**

Assert fresh migration order `0001` through `0014`, repeated application idempotency, foreign-key integrity, required unique indexes, token/resource/scope constraints, terminal/revoked timestamps and absence of raw secret column names.

- [ ] **Step 2: Verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/mcp-oauth-migrations.test.ts src/adapters/sqlite-migrations.test.ts
```

- [ ] **Step 3: Implement the migration and Drizzle schema**

Use UTC ISO timestamps and integer optimistic versions. Authorization codes are single-use. Refresh-token rows support rotation chains and atomic revocation. Security events store bounded codes/metadata only.

- [ ] **Step 4: Extend backup verification**

Assert backup/restore preserves migration `0014`, clients, grants and token digests while never requiring raw secrets.

- [ ] **Step 5: Run focused checks**

```bash
pnpm --filter @semogtw/database exec vitest run \
  src/mcp-oauth-migrations.test.ts \
  src/adapters/sqlite-migrations.test.ts \
  src/backup/sqlite-backup.test.ts
pnpm --filter @semogtw/database typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/database
git commit -m "feat: add MCP OAuth persistence schema"
git push
```

---

### Task 4: Implement transactional OAuth repositories

**Files:**
- Create: `packages/database/src/repositories/mcp-oauth-client-repository.ts`
- Create: `packages/database/src/repositories/mcp-oauth-client-repository.test.ts`
- Create: `packages/database/src/repositories/mcp-oauth-authorization-repository.ts`
- Create: `packages/database/src/repositories/mcp-oauth-authorization-repository.test.ts`
- Create: `packages/database/src/repositories/mcp-oauth-token-repository.ts`
- Create: `packages/database/src/repositories/mcp-oauth-token-repository.test.ts`
- Create: `packages/database/src/repositories/mcp-oauth-security-event-repository.ts`
- Create: `packages/database/src/repositories/mcp-oauth-security-event-repository.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**

```ts
export interface McpOAuthClientRepository {
  create(input: CreateMcpOAuthClientRecord): McpOAuthClientRecord;
  findActiveById(id: string): McpOAuthClientRecord | null;
  listForOwner(ownerId: string, limit: number): readonly McpOAuthClientRecord[];
  revoke(input: { id: string; ownerId: string; expectedVersion: number; now: string }): boolean;
}

export interface McpOAuthAuthorizationRepository {
  createRequest(input: CreateAuthorizationRequestRecord): AuthorizationRequestRecord;
  approveRequest(input: ApproveAuthorizationRequestRecord): AuthorizationCodeRecord;
  consumeCode(input: ConsumeAuthorizationCodeRecord): AuthorizationCodeRecord | null;
}

export interface McpOAuthTokenRepository {
  issueInitialPair(input: IssueTokenPairRecord): IssuedTokenPairRecord;
  rotateRefreshToken(input: RotateRefreshTokenRecord): IssuedTokenPairRecord | null;
  findAccessTokenByDigest(digest: string): AccessTokenRecord | null;
  revokeTokenFamily(input: RevokeTokenFamilyRecord): number;
  revokeClientTokens(input: { clientId: string; now: string }): number;
}
```

- [ ] **Step 1: Write failing repository tests**

Cover idempotent client creation keys, optimistic client revocation, exact owner binding, short-lived requests/codes, single-use code consumption, wrong-client/redirect/resource rejection, initial token issuance, atomic refresh rotation, replay rejection, client-wide revocation and event-write rollback.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/mcp-oauth-*.test.ts
```

- [ ] **Step 3: Implement immediate transactions**

Entity/grant/token/security-event writes that belong to one action share one transaction. Reusing a consumed code or rotated refresh token returns a generic invalid result and creates a bounded replay event.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/mcp-oauth-*.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database/src/repositories packages/database/src/index.ts
git commit -m "feat: add MCP OAuth repositories"
git push
```

---

### Task 5: Implement client registration and revocation services

**Files:**
- Create: `packages/mcp-auth/src/client-service.ts`
- Create: `packages/mcp-auth/src/client-service.test.ts`
- Modify: `packages/mcp-auth/src/index.ts`

**Interfaces:**

```ts
export interface McpClientService {
  preregister(input: {
    ownerId: string;
    name: string;
    redirectUris: readonly string[];
    tokenEndpointAuthMethod: "client_secret_basic" | "none";
    idempotencyKey: string;
  }): Promise<{
    client: McpOAuthClient;
    clientSecret: string | null;
  }>;

  dynamicRegister(input: {
    name: string;
    redirectUris: readonly string[];
    grantTypes: readonly string[];
    responseTypes: readonly string[];
    tokenEndpointAuthMethod: "client_secret_basic" | "none";
  }): Promise<{
    client: McpOAuthClient;
    clientSecret: string | null;
  }>;

  revoke(input: {
    ownerId: string;
    clientId: string;
    expectedVersion: number;
    reason: string;
    confirmation: true;
  }): Promise<void>;
}
```

- [ ] **Step 1: Write failing service tests**

Cover one-time secret return, digest-only repository input, DCR rate/client-count policy port, no automatic grant, owner-only preregistration/revocation, optimistic concurrency, exact redirects and token-family revocation when a client is revoked.

- [ ] **Step 2: Implement minimal services**

Generated secrets are returned only from the creation call and never retrievable later. DCR creates an ungranted active client; owner approval remains required during authorization.

- [ ] **Step 3: Run checks and commit**

```bash
pnpm --filter @semogtw/mcp-auth exec vitest run src/client-service.test.ts
pnpm --filter @semogtw/mcp-auth typecheck
git add packages/mcp-auth/src
git commit -m "feat: add MCP OAuth client lifecycle"
git push
```

---

### Task 6: Implement authorization-code, PKCE and token services

**Files:**
- Create: `packages/mcp-auth/src/authorization-service.ts`
- Create: `packages/mcp-auth/src/authorization-service.test.ts`
- Create: `packages/mcp-auth/src/token-service.ts`
- Create: `packages/mcp-auth/src/token-service.test.ts`
- Create: `packages/mcp-auth/src/revocation-service.ts`
- Create: `packages/mcp-auth/src/revocation-service.test.ts`
- Modify: `packages/mcp-auth/src/index.ts`

**Interfaces:**

```ts
export interface McpAuthorizationService {
  begin(input: BeginAuthorizationInput): Promise<McpAuthorizationRequest>;
  approve(input: {
    ownerId: string;
    requestId: string;
    confirmation: true;
  }): Promise<{ redirectUri: string; code: string; state: string | null }>;
  deny(input: { ownerId: string; requestId: string }): Promise<{ redirectUri: string; state: string | null }>;
}

export interface McpTokenService {
  exchangeAuthorizationCode(input: {
    clientId: string;
    clientSecret?: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
    resource: string;
  }): Promise<OAuthTokenResponse>;
  refresh(input: {
    clientId: string;
    clientSecret?: string;
    refreshToken: string;
    resource: string;
  }): Promise<OAuthTokenResponse>;
  verifyAccessToken(input: {
    bearerToken: string;
    expectedResource: string;
    requiredScope: "devos.read";
  }): Promise<McpTokenPrincipal | null>;
}
```

- [ ] **Step 1: Write failing authorization tests**

Cover exact client/redirect/resource binding, PKCE S256 only, five-minute expiry, owner approval/denial, one-time code, state passthrough and no private fields in redirect errors.

- [ ] **Step 2: Write failing token tests**

Cover confidential/public client authentication, code exchange, 15-minute access token, 30-day refresh absolute expiry, digest-only persistence, atomic refresh rotation, replay rejection, wrong audience/scope/owner/client rejection and revocation.

- [ ] **Step 3: Implement services using injected ports**

Use generic OAuth failure codes. Never include repository or exception details. Verification must return null before any DevOS read composition when invalid.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/mcp-auth test
pnpm --filter @semogtw/mcp-auth typecheck
git add packages/mcp-auth/src
git commit -m "feat: add MCP OAuth authorization and tokens"
git push
```

---

### Task 7: Add private DevOS client management and consent

**Files:**
- Create: `apps/web/src/routes/devos.integrations.mcp.tsx`
- Create: `apps/web/src/routes/devos.integrations.mcp_.consent.tsx`
- Create: `apps/web/src/components/devos/mcp-client-management.tsx`
- Create: `apps/web/src/components/devos/mcp-consent-panel.tsx`
- Create: `apps/web/src/server/devos-mcp-clients.ts`
- Create: `apps/web/src/server/devos-mcp-clients.test.ts`
- Create: `apps/web/src/server/devos-mcp-consent.ts`
- Create: `apps/web/src/server/devos-mcp-consent.test.ts`
- Modify: `packages/ui/src/navigation/devos-sidebar.tsx`

**Interfaces:**

```ts
export type DevOSMcpClientView = {
  id: string;
  name: string;
  redirectUris: readonly string[];
  status: "active" | "revoked";
  createdAt: string;
  version: number;
};
```

Private mutations follow existing owner + CSRF + confirmation + reason + expected-version + idempotency patterns.

- [ ] **Step 1: Write failing server tests**

Assert anonymous calls fail before repository access; client secret is returned once on creation and absent from later reads/audit; revocation requires owner, CSRF, bounded reason, confirmation and version; consent displays exact client name, redirect origin, scope and resource; stale/expired requests cannot be approved.

- [ ] **Step 2: Implement server functions and DTOs**

Reuse existing owner resolution and sanitization patterns. Do not expose client-secret digests, token digests or raw authorization request internals.

- [ ] **Step 3: Implement responsive private UI**

Provide create, one-time secret display/copy, list, revoke and consent approve/deny. At 360 px, no horizontal table is required. Add `noindex` and clear warnings that client approval grants private read access.

- [ ] **Step 4: Run focused tests**

```bash
pnpm --filter @semogtw/web exec vitest run \
  src/server/devos-mcp-clients.test.ts \
  src/server/devos-mcp-consent.test.ts
pnpm --filter @semogtw/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/web packages/ui
git commit -m "feat: add owner MCP client management"
git push
```

---

### Task 8: Create fail-closed `apps/mcp-http` configuration and HTTP policy

**Files:**
- Create: `apps/mcp-http/package.json`
- Create: `apps/mcp-http/tsconfig.json`
- Create: `apps/mcp-http/src/config.ts`
- Create: `apps/mcp-http/src/config.test.ts`
- Create: `apps/mcp-http/src/http-policy.ts`
- Create: `apps/mcp-http/src/http-policy.test.ts`
- Create: `apps/mcp-http/src/limits.ts`
- Create: `apps/mcp-http/src/limits.test.ts`
- Create: `apps/mcp-http/src/index.ts`
- Modify: `.env.example`

**Interfaces:**

```ts
export type RemoteMcpConfig = {
  enabled: boolean;
  canonicalOrigin: string;
  mcpResource: string;
  ownerId: string;
  sessionSecret: string;
  bodyLimitBytes: 65536;
  requestTimeoutMs: 15000;
  perClientConcurrency: 4;
  globalConcurrency: number;
  trustedProxy: boolean;
  allowedOrigins: readonly string[];
};

export function parseRemoteMcpConfig(
  env: Record<string, string | undefined>,
): RemoteMcpConfig;
```

- [ ] **Step 1: Write failing config/policy tests**

Reject enabled configuration without HTTPS canonical origin, exact owner, session secret, positive limits or trusted-proxy decision. Reject URL credentials/query/fragment, wildcard origins, wrong Host, disallowed Origin, unsupported media type/method and oversized body before auth/database calls.

- [ ] **Step 2: Implement config, policy and permit pool**

Disabled mode requires no OAuth secrets and must deny remote routes deterministically. In-memory rate/concurrency is local/single-instance only; production multi-instance requires a shared adapter.

- [ ] **Step 3: Run checks and commit**

```bash
pnpm --filter @semogtw/mcp-http test
pnpm --filter @semogtw/mcp-http typecheck
git add apps/mcp-http .env.example pnpm-lock.yaml
git commit -m "feat: define remote MCP runtime policy"
git push
```

---

### Task 9: Implement OAuth metadata, registration and token HTTP routes

**Files:**
- Create: `apps/mcp-http/src/oauth-metadata.ts`
- Create: `apps/mcp-http/src/oauth-metadata.test.ts`
- Create: `apps/mcp-http/src/oauth-registration.ts`
- Create: `apps/mcp-http/src/oauth-registration.test.ts`
- Create: `apps/mcp-http/src/oauth-authorize.ts`
- Create: `apps/mcp-http/src/oauth-authorize.test.ts`
- Create: `apps/mcp-http/src/oauth-token.ts`
- Create: `apps/mcp-http/src/oauth-token.test.ts`
- Create: `apps/mcp-http/src/oauth-revoke.ts`
- Create: `apps/mcp-http/src/oauth-revoke.test.ts`

**Interfaces:**

Routes:

```text
GET  /.well-known/oauth-protected-resource
GET  /.well-known/oauth-authorization-server
POST /oauth/register
GET  /oauth/authorize
POST /oauth/token
POST /oauth/revoke
```

- [ ] **Step 1: Write metadata tests**

Assert exact issuer/resource/endpoints, `devos.read`, authorization-code grant, PKCE S256, supported client auth methods and no owner/private values.

- [ ] **Step 2: Write registration tests**

Assert bounded RFC 7591 input, exact redirects, no grant, one-time secret, rate/client limits and sanitized errors.

- [ ] **Step 3: Write authorize/token/revoke tests**

Assert begin redirects to the private consent surface with opaque request ID; approval completion returns code/state to exact redirect; token exchange/refresh use correct content type and generic OAuth errors; revoke is idempotent and leaks no token status.

- [ ] **Step 4: Implement route handlers around `packages/mcp-auth` services**

Handlers parse HTTP only; business rules remain in `packages/mcp-auth`. Apply no-store headers to every response.

- [ ] **Step 5: Run focused tests and commit**

```bash
pnpm --filter @semogtw/mcp-http exec vitest run src/oauth-*.test.ts
pnpm --filter @semogtw/mcp-http typecheck
git add apps/mcp-http/src
git commit -m "feat: expose MCP OAuth endpoints"
git push
```

---

### Task 10: Implement authenticated stateless Streamable HTTP

**Files:**
- Create: `apps/mcp-http/src/mcp-handler.ts`
- Create: `apps/mcp-http/src/mcp-handler.test.ts`
- Create: `apps/mcp-http/src/streamable-transport.ts`
- Create: `apps/mcp-http/src/streamable-transport.test.ts`
- Create: `apps/mcp-http/src/composition.ts`
- Create: `apps/mcp-http/src/node-server.ts`
- Create: `apps/mcp-http/src/node-server.test.ts`
- Modify: `apps/mcp-http/src/index.ts`
- Modify: root `package.json`

**Interfaces:**

```ts
export function createRemoteMcpHandler(input: {
  config: RemoteMcpConfig;
  tokenService: McpTokenService;
  permits: McpPermitPool;
  openDatabase(): Promise<SqliteDatabase>;
  createMcpServer(database: SqliteDatabase): McpServer;
  createTransport(): StreamableHttpAdapter;
  log(event: SanitizedRemoteMcpEvent): void;
}): (request: Request) => Promise<Response>;
```

Required order:

```text
kill switch → HTTP policy → bearer verify → scope/resource/owner → permit → database → server → transport → handle → close → release
```

- [ ] **Step 1: Write failing lifecycle tests**

Assert every failure before authorization skips database/MCP creation. Assert invalid/expired/revoked/wrong-resource/missing-scope tokens fail before private services. Assert close/release in `finally` after success, exception, timeout and abort.

- [ ] **Step 2: Implement the exact installed SDK adapter**

Use stateless Streamable HTTP with no session ID. Keep the SDK import isolated to `streamable-transport.ts`.

- [ ] **Step 3: Implement Node routes**

Expose health, metadata/OAuth and `/mcp`. Bound body while reading. No automatic credential-forwarding redirects. Add private/no-store/nosniff headers.

- [ ] **Step 4: Run focused checks**

```bash
pnpm --filter @semogtw/mcp-http test
pnpm --filter @semogtw/mcp-http typecheck
pnpm --filter @semogtw/mcp-http build
```

- [ ] **Step 5: Commit**

```bash
git add apps/mcp-http package.json pnpm-lock.yaml
git commit -m "feat: add authenticated Streamable HTTP MCP"
git push
```

---

### Task 11: Narrow the MCP transport guardrail

**Files:**
- Modify: `scripts/check-mcp-transport-boundary.mjs`
- Modify: `scripts/check-mcp-transport-boundary.test.mjs`
- Modify: `scripts/check-mcp-transport-boundary-imports.test.mjs`
- Modify: `scripts/check-mcp-transport-boundary-apps.test.mjs`
- Modify: `scripts/check-mcp-cross-surface-imports.test.mjs`

**Interfaces:**
- Allow Node network imports only in `apps/mcp-http/src/node-server.ts`.
- Allow Streamable HTTP SDK import only in `apps/mcp-http/src/streamable-transport.ts`.
- Continue rejecting stdio/SSE and all listeners in `packages/mcp`, `apps/mcp`, web and API.

- [ ] **Step 1: Add failing allow/reject fixtures**

Cover approved exact files and reject copied/renamed extra listeners, Hono/Express shortcuts, stdio/SSE and cross-surface MCP imports.

- [ ] **Step 2: Implement path-aware allowlist**

Default remains deny. The allowlist changes in the same commit as its tests.

- [ ] **Step 3: Run all guardrails**

```bash
pnpm test:guardrails
pnpm check:mcp-transport-boundary
pnpm check:mcp-package-boundaries
pnpm check:mcp-node-runtime-boundary
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts
git commit -m "test: approve only the remote MCP boundary"
git push
```

---

### Task 12: Add end-to-end OAuth and MCP protocol integration tests

**Files:**
- Create: `apps/mcp-http/src/remote-mcp.integration.test.ts`
- Modify: `docs/testing/2026-08-03-remote-mcp-test-matrix.md`

**Interfaces:**
- Uses isolated migrated SQLite, ephemeral Node port and official MCP client.

- [ ] **Step 1: Test preregistration authorization flow**

Create client, begin authorization, owner-approve, exchange code with PKCE, discover the exact four resources/five tools, call reads and revoke.

- [ ] **Step 2: Test DCR flow**

Register dynamically, prove no access before consent, authorize with PKCE, call reads, rotate refresh token, reject replay and revoke client.

- [ ] **Step 3: Test security boundaries**

Cover wrong redirect/resource/audience/client secret, expired/reused code, invalid/revoked access token, missing scope, body/host/origin limits, two-client isolation, response size limit, no-store headers and sanitized logs with synthetic secret markers.

- [ ] **Step 4: Run focused and aggregate gates**

```bash
pnpm --filter @semogtw/mcp-http exec vitest run src/remote-mcp.integration.test.ts
pnpm check
pnpm build
```

Record exact counts and head SHA.

- [ ] **Step 5: Commit**

```bash
git add apps/mcp-http/src/remote-mcp.integration.test.ts docs/testing/2026-08-03-remote-mcp-test-matrix.md
git commit -m "test: verify remote MCP OAuth and protocol"
git push
```

---

### Task 13: Add browser tests for client management and consent

**Files:**
- Create: `tests/e2e/mcp-oauth.spec.ts`
- Modify: `playwright.config.ts` only if a separate MCP preview process is required
- Modify: `docs/testing/2026-08-03-remote-mcp-test-matrix.md`

- [ ] **Step 1: Add anonymous/private isolation tests**

Anonymous client management and consent routes redirect before private content. Public pages contain no client IDs, redirects, scopes, MCP labels or secret markers.

- [ ] **Step 2: Add owner lifecycle test**

At desktop and 360 × 800: create client, display secret once, reload and prove secret absent, open consent, approve, revoke client and observe inactive state.

- [ ] **Step 3: Run browser gate**

```bash
pnpm test:e2e -- tests/e2e/mcp-oauth.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/mcp-oauth.spec.ts playwright.config.ts docs/testing/2026-08-03-remote-mcp-test-matrix.md
git commit -m "test: cover MCP OAuth owner flows"
git push
```

---

### Task 14: Deploy private preview and rehearse operations

**Files:**
- Create: `runbooks/mcp-remote.md`
- Modify: `DEPLOYMENT.md`
- Modify: `SECURITY.md`
- Modify: `RUNBOOK.md`
- Modify: `docs/testing/2026-08-03-remote-mcp-test-matrix.md`

- [ ] **Step 1: Record host capability evidence before deployment**

Document Node 22, SQLite persistence/migration/backup, secret store, TLS/proxy chain, instance count, rate-limit adapter, logs and rollback. No assumed capability is marked available.

- [ ] **Step 2: Deploy preview with remote kill switch initially off**

Verify site/API remain unaffected. Enable only after metadata/auth/database smoke tests pass.

- [ ] **Step 3: Execute operational matrix**

Verify TLS/canonical Host, DCR/preregistration, PKCE, refresh rotation, revocation, timeout/disconnect cleanup, rate/concurrency, cold start, no-store caches, sanitized logs, encrypted backup/restore and kill-switch disable/re-enable.

- [ ] **Step 4: Rehearse rollback**

Disable endpoint, revoke clients/tokens, deploy previous code and prove canonical DevOS data plus web/API remain intact. Migration `0014` remains additive/unused rather than deleted.

- [ ] **Step 5: Commit evidence**

```bash
git add runbooks/mcp-remote.md DEPLOYMENT.md SECURITY.md RUNBOOK.md docs/testing/2026-08-03-remote-mcp-test-matrix.md
git commit -m "docs: add remote MCP operations and rollback"
git push
```

---

### Task 15: Verify Gemini Spark compatibility

**Files:**
- Create: `docs/testing/2026-08-03-gemini-spark-mcp-acceptance.md`
- Modify: `docs/testing/2026-08-03-remote-mcp-test-matrix.md`
- Modify: `MCP.md`

- [ ] **Step 1: Record actual account capability**

Record date, AI Pro label, country, Spark availability and whether **Custom apps for Spark** appears. Do not commit account identifiers or private screenshots.

- [ ] **Step 2: Test preregistration and DCR as supported**

Add the private preview URL, complete owner authorization and verify catalog discovery. If Spark chooses one registration mode only, record observed behavior exactly.

- [ ] **Step 3: Run Phase 1 reads**

Call overview, today, projects, one project and roadmap. Verify no mutation rows/events are produced.

- [ ] **Step 4: Test composition with native Google connections**

Use a read-only briefing prompt combining Google data and Semogtw reads. Verify the MCP server receives no Google credentials and only bounded tool arguments.

- [ ] **Step 5: Test removal/revocation/mobile behavior**

Remove app, revoke client/tokens and prove calls fail. When supported, verify the connection is usable on mobile after web configuration.

- [ ] **Step 6: Record exact outcome**

Use `observed pass` only for completed Spark calls. If custom apps are unavailable, mark `external_dependency` while retaining generic client success.

- [ ] **Step 7: Commit**

```bash
git add docs/testing/2026-08-03-gemini-spark-mcp-acceptance.md docs/testing/2026-08-03-remote-mcp-test-matrix.md MCP.md
git commit -m "docs: record Gemini Spark MCP acceptance"
git push
```

---

### Task 16: Final documentation, full gate and pull request

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `README.md`
- Modify: `MCP.md`
- Modify: `SECURITY.md`
- Modify: `DEPLOYMENT.md`
- Modify: `RUNBOOK.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/DATA_MODEL.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: Reconcile all canonical docs with observed state**

Document migration `0014`, package/runtime boundaries, OAuth routes, token lifetimes, client management, kill switch, exact catalog, verified clients and deferred writes. Remove “no remote MCP” only when implementation/evidence exists.

- [ ] **Step 2: Run final full gate**

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test:e2e
```

Also rerun focused OAuth/MCP integration, migration/backup and guardrail suites. Record exact SHA and outputs.

- [ ] **Step 3: Inspect secrets and diff**

```bash
git diff --check
git grep -nE 'Bearer [A-Za-z0-9._-]+|client_secret[^_d]|refresh_token[^_d]|access_token[^_d]|authorization_code[^_d]' -- . ':!pnpm-lock.yaml'
git diff 272527a8548aa33e5b2afd1f4eabb9667c9a858f...HEAD --stat
```

Review expected test/schema field-name matches manually; no real credential value may exist.

- [ ] **Step 4: Commit and push**

```bash
git add ARCHITECTURE.md README.md MCP.md SECURITY.md DEPLOYMENT.md RUNBOOK.md CHANGELOG.md docs packages apps tests scripts .env.example package.json pnpm-lock.yaml
git commit -m "docs: finalize remote MCP and Spark integration"
git push
```

- [ ] **Step 5: Open a focused pull request**

Target the newest consolidated integration branch at execution time. Include exact commits, tests, migration/backup evidence, preview URL class (not secrets), generic client status, Spark status, rollback rehearsal and an explicit statement that no MCP write tools were added.

---

## Deferred work

Do not include in this plan:

- the six workflow/recovery read tools, which have a separate plan;
- MCP write tools or write scopes;
- direct GitHub writes;
- provider browser automation, cookie storage or prompt submission;
- stateful MCP sessions, subscriptions, sampling or elicitation;
- unrelated scheduler/webhook features;
- Client ID Metadata Documents unless an observed target-client requirement makes them necessary.
