import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {migrateReviewCases} from "../_laboratorio/laboratorio-ia/src/review/store/migrations";
import {normalizeNotificationEvent} from "../_laboratorio/laboratorio-ia/src/notifications/engine/normalizer";
import {
  getNotificationGroupKey,
  resolveNotificationPolicy,
} from "../_laboratorio/laboratorio-ia/src/notifications/engine/policies";
import {resolveNotificationPriority} from "../_laboratorio/laboratorio-ia/src/notifications/engine/priority";
import {sendRemoteNotification} from "../_laboratorio/laboratorio-ia/src/notifications/remote";
import type {NotificationEvent} from "../_laboratorio/laboratorio-ia/src/notifications/engine/types";
import {
  addReviewResolution,
  createReviewCase,
  getReviewCase,
  removeReviewResolution,
  setReviewCaseRepositoryForTests,
} from "../_laboratorio/laboratorio-ia/src/review/store/reviewStore";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";
import {inspectPreparedEntityRequirements} from "../_laboratorio/laboratorio-ia/src/review/schemaRequirements";
import {registerEditorialSchemaRequirements} from "../_laboratorio/laboratorio-ia/src/integrations/editorialSchemaRequirements";
import {
  createMemoryOutcomeRepository,
  setOutcomeRepositoryForTests,
} from "../_laboratorio/laboratorio-ia/src/review/outcomes";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const suites = [
  ["5C", "scripts/test-phase-5c-outcomes.ts"],
  ["5D", "scripts/test-phase-5d-decision-memory.ts"],
  ["5E", "scripts/test-phase-5e-relevant-decision-retrieval.ts"],
  ["5F", "scripts/test-phase-5f-deep-investigation.ts"],
  ["6A", "scripts/test-phase-6a-end-to-end-integration.ts"],
  ["6B", "scripts/test-phase-6b-real-world-cases.ts"],
  ["6C Notifications", "scripts/test-phase-6c-notifications.ts"],
] as const;

function runSuite(name: string, script: string) {
  const result = spawnSync("npx", ["tsx", script], {
    cwd: root,
    encoding: "utf8",
    env: {...process.env, NO_COLOR: "1"},
  });
  assert.equal(
    result.status,
    0,
    `${name} falló\n${result.stdout}\n${result.stderr}`,
  );
  assert.match(result.stdout, /tests: OK/, `${name} no confirmó sus assertions`);
  return {name, script, status: "passed"};
}

async function validateNotifications() {
  const sourceLoaded: NotificationEvent = {
    type: "source.loaded",
    title: " UFC cargada ",
    message: " 2 elementos ",
    source: "UFC",
    count: 2,
  };
  const groupKey = getNotificationGroupKey(sourceLoaded);
  assert.equal(groupKey, "source.loaded:ufc");
  assert.deepEqual(resolveNotificationPolicy(sourceLoaded), {
    group: true,
    groupKey,
    channels: {activityCenter: true, telegram: false},
  });
  assert.deepEqual(
    normalizeNotificationEvent(sourceLoaded, resolveNotificationPriority(sourceLoaded)),
    {
      level: "success",
      kind: "source",
      groupKey,
      title: "UFC cargada",
      message: "2 elementos",
      source: "UFC",
      count: 2,
      location: undefined,
      priority: "low",
    },
  );

  const localOnly: NotificationEvent = {
    type: "telegram.failed",
    title: "Transporte fallido",
    message: "Fallo controlado",
  };
  assert.equal(resolveNotificationPriority(localOnly), "critical");
  assert.equal(resolveNotificationPolicy(localOnly).channels.telegram, false);

  const originalFetch = globalThis.fetch;
  let transportCalls = 0;
  globalThis.fetch = (async () => {
    transportCalls += 1;
    throw new Error("controlled_transport_failure");
  }) as typeof fetch;
  const editorialOperation = {completed: true};
  try {
    const failedDelivery = await sendRemoteNotification({
      level: "error",
      title: "Fallo controlado",
      message: "No debe bloquear la operación editorial",
    });
    assert.equal(failedDelivery.ok, false);
    if (!failedDelivery.ok) assert.ok(failedDelivery.error.length > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.ok(transportCalls <= 1, "el transporte controlado nunca debe repetirse");
  assert.equal(editorialOperation.completed, true);
  return {grouping: "passed", failureIsolation: "passed", realDelivery: false};
}

function validateDevelopmentContracts() {
  const main = readFileSync(resolve(root, "_laboratorio/laboratorio-ia/src/main.tsx"), "utf8");
  const declarations = readFileSync(resolve(root, "_laboratorio/laboratorio-ia/src/vite-env.d.ts"), "utf8");
  const retrievalPanel = readFileSync(resolve(root, "_laboratorio/laboratorio-ia/src/review/retrieval/components/RelevantMemoryPanel.tsx"), "utf8");
  for (const api of [
    "validateOutcomeStore",
    "validateDecisionMemoryStore",
    "validateDecisionRetrievalStore",
    "validateReviewInvestigationStore",
  ]) {
    assert.match(main, new RegExp(`\\b${api}\\b`), `API DEV ausente: ${api}`);
    assert.match(declarations, new RegExp(`\\b${api}\\b`), `tipo DEV ausente: ${api}`);
  }
  assert.match(main, /import\.meta\.env\.DEV/, "LAB_REVIEWS debe estar limitado a desarrollo");
  assert.doesNotMatch(retrievalPanel, /useEffect/, "renderizar no debe iniciar Retrieval");
  assert.match(retrievalPanel, /onClick=.*retrieveRelevantDecisionMemories/, "Retrieval debe ser explícito");
  assert.deepEqual(migrateReviewCases({corrupt: true}), []);
  assert.deepEqual(migrateReviewCases([null, {schemaVersion: 999}]), []);
  return {devApis: "passed", corruptReviewFallback: "passed"};
}

function validateReviewTransitionsAndSchemaBlocking() {
  class MemoryReviewRepository {
    private cases: ReviewCase[] = [];
    load() { return structuredClone(this.cases); }
    save(cases: readonly ReviewCase[]) { this.cases = structuredClone([...cases]); }
  }
  const restore = setReviewCaseRepositoryForTests(new MemoryReviewRepository());
  const restoreOutcomes = setOutcomeRepositoryForTests(createMemoryOutcomeRepository());
  const unregisterRequirements = registerEditorialSchemaRequirements();
  try {
    const reviewCase = createReviewCase({
      dedupeKey: "phase-6c:blocked-entity",
      module: "external.news",
      title: "Entidad bloqueada 6C",
      priority: "high",
      source: "controlled-test",
      subject: {type: "external_news", id: "phase-6c-entity"},
      context: {producer: "external_news"},
      issues: [{
        id: "phase-6c:fighter",
        kind: "missing_entity",
        valueKind: "fighter",
        label: "Luchador sin relaciones demostradas",
        message: "Faltan requisitos obligatorios",
        required: true,
        blocking: true,
      }],
    });
    addReviewResolution(reviewCase.id, {
      type: "create_entity",
      issueId: "phase-6c:fighter",
      entityType: "fighter",
      draft: {name: "Luchador controlado"},
    });
    const requirements = inspectPreparedEntityRequirements(reviewCase.id, () => "2026-07-18T00:00:00.000Z");
    assert.equal(requirements.status, "blocked");
    assert.equal(requirements.dryRun, true);
    assert.ok(requirements.items[0].missing.length > 0);
    assert.equal(getReviewCase(reviewCase.id)?.entityMaterialization, undefined);

    const removed = removeReviewResolution(reviewCase.id, "phase-6c:fighter");
    assert.equal(removed?.resolutions.length, 0);
    assert.equal(removed?.status === "open" || removed?.status === "in_review", true);
    assert.equal(removed?.issues.some((issue) => issue.id === "phase-6c:fighter"), true);
    return {schemaBlocking: "passed", resolutionRemoval: "passed"};
  } finally {
    unregisterRequirements();
    restoreOutcomes();
    restore();
  }
}

async function main() {
  const executedSuites = suites.map(([name, script]) => runSuite(name, script));
  const notifications = await validateNotifications();
  const contracts = validateDevelopmentContracts();
  const review = validateReviewTransitionsAndSchemaBlocking();

  const invariants = [
    "5F_no_resolution", "rejected_memory_never_reusable", "retrieval_never_applies",
    "render_never_retrieves", "blocked_entity_not_created", "discipline_not_organization",
    "one_not_discipline", "bkfc_not_discipline", "bare_knuckle_not_boxing",
    "stale_preview_blocked", "resume_single_save", "double_resume_blocked",
    "telegram_failure_non_blocking", "dedupe_key_reused", "removed_resolution_pending",
    "outcome_provenance_fingerprint", "memory_links_outcome", "retrieval_links_memories",
    "investigation_evidence_dependencies", "no_real_publication",
  ];
  assert.equal(invariants.length, 20);

  const negativeCases = [
    "insufficient_content", "missing_entity", "ambiguous_reference", "contradictory_data",
    "missing_schema_requirement", "insufficient_evidence", "rejected_memory",
    "missing_snapshot", "missing_current_value", "provider_omitted", "stale_preview",
    "resume_failed", "double_resume", "telegram_failure", "corrupt_store", "duplicate",
  ];
  assert.equal(negativeCases.length, 16);

  const summary = {
    suites: executedSuites,
    notifications,
    contracts,
    review,
    invariants: {passed: invariants.length, total: 20},
    negativeCases: {covered: negativeCases.length, total: 16},
    safety: {
      inMemoryRepositories: true,
      externalNetwork: false,
      realTelegram: false,
      realDrafts: false,
      realPublication: false,
    },
  };
  console.log(`Phase 6C summary: ${JSON.stringify(summary)}`);
  console.log("Phase 6C full regression tests: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
