import assert from "node:assert/strict";
import { scanText } from "./check-upstream-clean.mjs";

const result = scanText("Julia — Plano de Desenvolvimento Individual");

assert.deepEqual(result, ["Julia", "Plano de Desenvolvimento Individual"]);
