import assert from "node:assert/strict";
import {
  applicationForbiddenImports,
  findBoundaryViolations,
} from "./check-boundaries.mjs";

assert.deepEqual(
  findBoundaryViolations(
    'import { createHash } from "node:crypto";\nimport React from "react";',
    applicationForbiddenImports,
  ),
  [
    { specifier: "node:crypto", forbidden: "node:" },
    { specifier: "react", forbidden: "react" },
  ],
);

assert.deepEqual(
  findBoundaryViolations(
    'import type { AttentionLifecycleSnapshot } from "@semogtw/domain/attention";\nimport catalog from "./editability-catalog.json";',
    applicationForbiddenImports,
  ),
  [],
);

console.log("Application boundary guardrail fixtures passed.");
