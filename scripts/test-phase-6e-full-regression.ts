import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const suites = ["test-phase-5c-outcomes.ts", "test-phase-5d-decision-memory.ts", "test-phase-5e-relevant-decision-retrieval.ts", "test-phase-5f-deep-investigation.ts", "test-phase-6a-end-to-end-integration.ts", "test-phase-6b-real-world-cases.ts", "test-phase-6c-notifications.ts", "test-phase-6c-full-regression.ts", "test-phase-6d-idempotency.ts", "test-phase-6d-full-regression.ts", "test-phase-6e-robustness-recovery.ts"];
const results = suites.map((suite) => { const result = spawnSync("npx", ["tsx", `scripts/${suite}`], {cwd: root, encoding: "utf8", env: {...process.env, NO_COLOR: "1"}}); assert.equal(result.status, 0, `${suite} failed\n${result.stdout}\n${result.stderr}`); assert.match(result.stdout, /tests: OK/); return {suite, status: "passed"}; });
console.log(`Phase 6E full regression summary: ${JSON.stringify({results, externalEffects: 0})}`);
console.log("Phase 6E full regression tests: OK");
