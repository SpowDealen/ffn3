import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  GLOBAL_RESOLUTION_INSPECTION_DEV_SCENARIOS,
  GlobalResolutionInspectionDevFixtureSession,
  applyGlobalResolutionInspectionDevFixtureAssessment,
  buildGlobalResolutionInspectionDevResult,
  createGlobalResolutionInspectionDevReviewCase,
  globalResolutionInspectionDevFixtureSecurity,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/devFixture";

async function main(): Promise<void> {
  assert.deepEqual(GLOBAL_RESOLUTION_INSPECTION_DEV_SCENARIOS, [
    "confirmed_succeeded", "confirmed_not_applied", "conflicting_evidence",
    "insufficient_evidence", "already_reconciled", "technical_failure", "technical_error", "unsupported", "stale_context",
    "producer_missing", "producer_ambiguous", "producer_version_mismatch", "capability_unsupported", "inspector_unavailable",
  ]);
  assert.deepEqual(globalResolutionInspectionDevFixtureSecurity, {
    devOnly: true,
    usesPersistentStore: false,
    writesLocalStorage: false,
    callsSanity: false,
    callsInspectionEndpoint: false,
    executesOperations: false,
    callsSaveDraft: false,
    callsResume: false,
    mutatesRealReviewCases: false,
    persistsResults: false,
  });

  for (const scenario of ["confirmed_succeeded", "confirmed_not_applied", "conflicting_evidence", "insufficient_evidence", "already_reconciled"] as const) {
    const result = buildGlobalResolutionInspectionDevResult(scenario);
    assert.equal(result.assessment.status, scenario);
    assert.equal(result.assessment.repairAllowed, scenario === "confirmed_succeeded");
    assert.equal(result.assessment.retryAllowed, scenario === "confirmed_not_applied");
    assert.equal(result.assessment.evidence.some((item) => item.source === "checkpoint"), true);
    assert.equal(result.assessment.evidence.some((item) => item.source === "external_inspector"), true);
  }
  assert.equal(buildGlobalResolutionInspectionDevResult("technical_error").assessment.status, "technical_failure");
  assert.equal(buildGlobalResolutionInspectionDevResult("unsupported").assessment.status, "unsupported");
  assert.equal(buildGlobalResolutionInspectionDevResult("stale_context").assessment.status, "stale_context");

  const realCase = createGlobalResolutionInspectionDevReviewCase();
  const before = JSON.stringify(realCase);
  const succeeded = buildGlobalResolutionInspectionDevResult("confirmed_succeeded");
  const repaired = applyGlobalResolutionInspectionDevFixtureAssessment(succeeded.reviewCase, succeeded.assessment);
  const creationState = (value: typeof repaired) => value.globalResolution?.graph.nodes.find((node) => value.globalResolution?.plan.operations.find((operation) => operation.id === node.operationId)?.requiredCapability === "create:luchador")?.state;
  assert.equal(creationState(repaired), "succeeded");
  assert.equal(creationState(succeeded.reviewCase), "reconciliation_required");
  const notApplied = buildGlobalResolutionInspectionDevResult("confirmed_not_applied");
  const retryEnabled = applyGlobalResolutionInspectionDevFixtureAssessment(notApplied.reviewCase, notApplied.assessment);
  assert.equal(creationState(retryEnabled), "ready");
  assert.equal(JSON.stringify(realCase), before);

  const session = new GlobalResolutionInspectionDevFixtureSession();
  const controller = new AbortController();
  const cancelled = session.inspect("confirmed_succeeded", {signal: controller.signal, delayMs: 20});
  controller.abort();
  assert.equal(await cancelled, undefined);
  assert.equal(session.pendingCount, 0);

  const obsolete = session.inspect("confirmed_succeeded", {delayMs: 30});
  session.selectScenario();
  const current = session.inspect("confirmed_not_applied", {delayMs: 0});
  assert.equal(await obsolete, undefined);
  assert.equal((await current)?.assessment.status, "confirmed_not_applied");

  const pendingAtUnmount = session.inspect("conflicting_evidence", {delayMs: 30});
  session.dispose();
  assert.equal(await pendingAtUnmount, undefined);
  assert.equal(session.pendingCount, 0);
  assert.equal(session.isDisposed, true);

  const model = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/devFixture.ts"), "utf8");
  const component = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/components/GlobalResolutionInspectionDevFixture.tsx"), "utf8");
  const integration = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/components/GlobalResolutionControls.tsx"), "utf8");
  const styles = readFileSync(resolve("_laboratorio/laboratorio-ia/src/styles.css"), "utf8");
  assert.equal(model.includes("import.meta.env?.DEV"), true);
  assert.equal(integration.includes("import.meta.env.DEV && devFixtureOpen"), true);
  assert.equal(integration.includes("Abrir fixture visual AU4"), true);
  assert.equal(component.includes("GlobalResolutionInspectionDevFixtureSession"), true);
  assert.equal(component.includes("new AbortController()"), true);
  assert.equal(component.includes('event.key === "Escape"'), true);
  assert.equal(component.includes('aria-busy={busy}'), true);
  assert.equal(component.includes('role="status"'), true);
  assert.equal(component.includes('role="alert"'), true);
  assert.equal(component.includes("GLOBAL_RESOLUTION_RECONCILIATION_ACTION_LABELS[action]"), true);
  assert.equal(component.includes('action === "repair_checkpoint" ? "Reparar checkpoint"'), false);
  assert.equal(component.includes("localStorage."), false);
  assert.equal(component.includes("fetch("), false);
  assert.equal(component.includes("createSanityInspectionHttpReader"), false);
  assert.equal(component.includes("saveDraft("), false);
  assert.equal(component.includes("authorizeAndResumeExternalNews"), false);
  assert.equal(component.includes("executeExternalNewsResolutionOperation"), false);
  assert.equal(component.includes("getReviewCase("), false);
  assert.equal(component.includes("updateGlobalResolutionCheckpoint"), false);
  assert.equal(component.includes("token"), false);
  assert.equal(component.includes("GROQ"), false);
  assert.equal(component.includes("stack"), false);
  assert.equal(styles.includes("overflow-wrap: anywhere"), true);
  assert.equal(styles.includes("@media (max-width: 560px)"), true);
  assert.equal(styles.includes(".global-resolution-inspection-actions { display: grid; grid-template-columns: 1fr; }"), true);
  console.log("AU4 global resolution inspection DEV fixture tests: OK");
}

void main();
