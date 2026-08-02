import assert from "node:assert/strict";
import {
  isPublicSurfacePath,
  scanPublicText,
} from "./check-public-confidentiality.mjs";

assert.deepEqual(scanPublicText("const branchSummary = 'secret';"), [
  "private-field:branchSummary",
]);
assert.deepEqual(
  scanPublicText("token = ghp_123456789012345678901234567890123456"),
  ["secret-pattern:github-token"],
);
assert.deepEqual(scanPublicText("publicSummary: 'safe'"), []);

assert.equal(
  isPublicSurfacePath("apps/api/src/routes/public/projects.ts"),
  true,
);
assert.equal(
  isPublicSurfacePath("apps/web/src/routes/projects.index.tsx"),
  true,
);
assert.equal(
  isPublicSurfacePath("packages/contracts/src/public/project.ts"),
  false,
);
assert.equal(
  isPublicSurfacePath("packages/contracts/src/public/project.test.ts"),
  false,
);
