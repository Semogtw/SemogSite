import assert from "node:assert/strict";
import { scanPublicText } from "./check-public-confidentiality.mjs";

assert.deepEqual(scanPublicText("const branchSummary = 'secret';"), ["private-field:branchSummary"]);
assert.deepEqual(scanPublicText("token = ghp_123456789012345678901234567890123456"), ["secret-pattern:github-token"]);
assert.deepEqual(scanPublicText("publicSummary: 'safe'"), []);
