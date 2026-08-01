# MCP output-safety rerun — 2026-08-01

## Purpose

Re-run the current iterative output-confidentiality policy after extending the denylist with authentication identifiers and value-bearing credential fields.

This is dependency-free executable evidence for `packages/mcp/src/output-safety.ts`. It is not MCP protocol, Zod or workspace typecheck evidence.

## Environment

```text
Node.js v22.16.0
TypeScript 5.8.3
```

The current policy was copied exactly into a temporary strict TypeScript project and compiled with:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
noImplicitOverride
noFallthroughCasesInSwitch
useUnknownInCatchVariables
verbatimModuleSyntax
isolatedModules
moduleResolution = NodeNext
```

## Rejected keys observed

- `password`, `rawPassword`, `passwordHash`, `password_digest`;
- `accessToken`, `csrf_token`, `clientSecret`;
- `api_key`, `privateKey`;
- `authorization`, `authorizationHeader`;
- `cookie`, `cookieHeader`, `setCookie`;
- `credentials`, `secrets`;
- `sessionDigest`, `tokenDigest`;
- `sessionId`, `authSessionId`;
- `jwt`;
- `tokenValue`, `secretValue`, `passwordValue`.

## Allowed metadata observed

- `tokenConfigured`;
- `secretConfigured`;
- `passwordRotationRequired`;
- `authorizationStatus`;
- `cookiePolicy`;
- `contentDigest`.

## Graph behavior observed

- repeated references were handled;
- a circular graph without sensitive keys was accepted;
- adding `jwt` to a shared node was detected;
- a safe object graph 20,000 levels deep completed without recursive stack overflow.

Observed output:

```text
Latest iterative MCP output-safety checks passed.
```

## Protocol coverage added

`packages/mcp/src/server-sensitive-auth-identifiers.test.ts` now specifies the same rejection through the official MCP client/server protocol for:

- JWT;
- session ID;
- auth-session ID;
- authorization header;
- token value;
- secret value;
- password value.

Each case must return only:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"ok\":false,\"error\":{\"code\":\"SENSITIVE_OUTPUT_REJECTED\"}}"
    }
  ],
  "isError": true
}
```

The synthetic marker must not appear in tool or resource output.

The protocol file remains an executable specification until `@modelcontextprotocol/sdk` can be installed and Vitest output is observed.
