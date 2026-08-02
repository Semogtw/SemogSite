# MCP package portability boundaries — 2026-08-01

## Purpose

Keep `packages/mcp` a transport-free, storage-free and runtime-portable protocol adapter.

The package may depend on:

- `@semogtw/domain`;
- `@modelcontextprotocol/sdk` protocol/server abstractions;
- Zod;
- its own relative modules.

It may not depend on application packages, storage/auth/config/UI packages or Node built-in modules.

## Guardrails added

### `check-mcp-package-boundaries.mjs`

Rejects imports from:

- `@semogtw/auth`;
- `@semogtw/config`;
- `@semogtw/contracts`;
- `@semogtw/database`;
- `@semogtw/github`;
- `@semogtw/ui`;
- web/API/MCP application packages;
- relative paths escaping into `apps/*` or disallowed packages;
- common bare and `node:` built-ins.

### `check-mcp-node-runtime-boundary.mjs`

Uses Node's live `builtinModules` list rather than a manually maintained list. It rejects static, dynamic and CommonJS imports of every built-in known to the executing Node version, including subpaths.

Examples covered:

- `node:test`;
- `node:sqlite`;
- `fs/promises`;
- `assert/strict`;
- `timers/promises`;
- `module`.

The second guardrail complements the package dependency regex and prevents newly added Node built-ins from bypassing portability controls.

## Observed execution

The package-dependency fixtures were executed with Node and observed to allow domain/SDK/Zod/local imports while rejecting database, auth, UI, app and Node imports.

Observed output:

```text
MCP package dependency boundary passed.
```

The live-built-in fixtures were executed against Node.js 22.16.0.

Observed output:

```text
MCP Node runtime boundary passed.
```

## Gate integration

The local authenticated clone path was asked to add both commands to `pnpm check` and `test:guardrails` when available. Because shell authentication/network state cannot be treated as connector evidence, confirm the remote `package.json` before claiming automatic gate coverage.

Required remote scripts:

```json
{
  "check:mcp-package-boundaries": "node scripts/check-mcp-package-boundaries.mjs",
  "check:mcp-node-runtime-boundary": "node scripts/check-mcp-node-runtime-boundary.mjs"
}
```

Required `test:guardrails` additions:

```text
node scripts/check-mcp-package-boundaries.test.mjs
node scripts/check-mcp-node-runtime-boundary.test.mjs
```

Until that confirmation, the scripts and their observed fixture output are valid standalone evidence, not proof that the root gate invokes them.
