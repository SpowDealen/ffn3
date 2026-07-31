import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  GlobalResolutionInspectionService,
  GlobalResolutionInspectorRegistry,
  UniversalReconciliationContractRegistry,
  UniversalReconciliationInspectionEngine,
  assessReconciliation,
  buildGlobalResolutionInspectionRequest,
  buildUniversalReconciliationContext,
  createExternalNewsReconciliationContractRegistry,
  createGlobalResolutionInspectionFixture,
  type GlobalResolutionReconciliationCase,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import {
  applyGlobalResolutionInspectionDevFixtureAssessment,
  buildGlobalResolutionInspectionDevResult,
  createGlobalResolutionInspectionDevReviewCase,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/devFixture";

const now = "2026-07-30T10:00:00.000Z";

function withCapability(source: GlobalResolutionReconciliationCase, capability: string): GlobalResolutionReconciliationCase {
  return {...structuredClone(source), capability};
}

async function main(): Promise<void> {
  const succeeded = buildGlobalResolutionInspectionDevResult("confirmed_succeeded");
  const missing = buildGlobalResolutionInspectionDevResult("confirmed_not_applied");
  const conflict = buildGlobalResolutionInspectionDevResult("conflicting_evidence");
  const insufficient = buildGlobalResolutionInspectionDevResult("insufficient_evidence");
  const checkpoint = succeeded.reviewCase.globalResolution!;

  assert.equal(succeeded.assessment.version, "1.0.0");
  assert.deepEqual(succeeded.assessment.allowedActions, ["repair_checkpoint"]);
  assert.deepEqual(missing.assessment.allowedActions, ["enable_retry"]);
  assert.deepEqual(conflict.assessment.allowedActions, ["inspect_again"]);
  assert.deepEqual(insufficient.assessment.allowedActions, ["inspect_again"]);
  assert.deepEqual(buildGlobalResolutionInspectionDevResult("already_reconciled").assessment.allowedActions, ["none"]);
  assert.deepEqual(buildGlobalResolutionInspectionDevResult("technical_error").assessment.allowedActions, ["inspect_again"]);
  assert.deepEqual(buildGlobalResolutionInspectionDevResult("unsupported").assessment.allowedActions, ["none"]);
  assert.deepEqual(buildGlobalResolutionInspectionDevResult("stale_context").assessment.allowedActions, ["none"]);

  const reversed = {...structuredClone(succeeded.assessment.reconciliationCase), evidence: [...succeeded.assessment.reconciliationCase.evidence].reverse()};
  const reordered = assessReconciliation(reversed, checkpoint);
  assert.equal(reordered.status, "confirmed_succeeded");
  assert.equal(reordered.assessmentFingerprint, assessReconciliation(succeeded.assessment.reconciliationCase, checkpoint).assessmentFingerprint);
  assert.deepEqual(reordered.localEvidence, [...(reordered.localEvidence ?? [])].sort((left, right) => left.id.localeCompare(right.id)));
  assert.deepEqual(reordered.remoteEvidence, [...(reordered.remoteEvidence ?? [])].sort((left, right) => left.id.localeCompare(right.id)));

  const referenceSuccess = assessReconciliation(withCapability(succeeded.assessment.reconciliationCase, "replace_reference:noticia:luchador"), checkpoint);
  const referenceMissing = assessReconciliation(withCapability(missing.assessment.reconciliationCase, "replace_reference:noticia:luchador"), missing.reviewCase.globalResolution!);
  assert.equal(referenceSuccess.status, "confirmed_succeeded");
  assert.deepEqual(referenceSuccess.allowedActions, ["repair_checkpoint"]);
  assert.equal(referenceMissing.status, "confirmed_not_applied");
  assert.deepEqual(referenceMissing.allowedActions, ["enable_retry"]);

  const resumeSuccess = assessReconciliation(withCapability(succeeded.assessment.reconciliationCase, "resume:external_news"), checkpoint);
  const resumeMissing = assessReconciliation(withCapability(missing.assessment.reconciliationCase, "resume:external_news"), missing.reviewCase.globalResolution!);
  assert.equal(resumeSuccess.status, "confirmed_succeeded");
  assert.equal(resumeMissing.status, "confirmed_not_applied");
  assert.equal(conflict.assessment.status, "conflicting_evidence");
  assert.equal(insufficient.assessment.status, "insufficient_evidence");

  const baseCase = succeeded.assessment.reconciliationCase;
  const currentContext = buildUniversalReconciliationContext(baseCase, checkpoint);
  const staleVersion = assessReconciliation(baseCase, checkpoint, {expectedContext: {...currentContext, caseVersion: currentContext.caseVersion + 1}});
  const staleCheckpoint = assessReconciliation(baseCase, checkpoint, {expectedContext: {...currentContext, checkpointFingerprint: "sha256-v1:stalecheckpoint"}});
  const staleOperation = assessReconciliation(baseCase, checkpoint, {expectedContext: {...currentContext, operationId: "operation:stale"}});
  const staleFingerprint = assessReconciliation(baseCase, checkpoint, {expectedContext: {...currentContext, operationFingerprint: "sha256-v1:staleoperation"}});
  for (const assessment of [staleVersion, staleCheckpoint, staleOperation, staleFingerprint]) {
    assert.equal(assessment.status, "stale_context");
    assert.deepEqual(assessment.allowedActions, ["none"]);
  }
  const stalePayload = assessReconciliation(baseCase, checkpoint, {
    expectedContext: {...currentContext, payloadFingerprint: "sha256-v1:stalepayload"},
  });
  assert.equal(stalePayload.status, "stale_context");
  assert.deepEqual(stalePayload.allowedActions, ["none"]);

  const unsupported = assessReconciliation(baseCase, checkpoint, {registry: new UniversalReconciliationContractRegistry()});
  assert.equal(unsupported.status, "unsupported");
  const technical = assessReconciliation(baseCase, checkpoint, {technicalFailure: {code: "private token=never"}});
  assert.equal(technical.status, "technical_failure");
  assert.equal(JSON.stringify(technical).includes("private token=never"), false);

  const sensitiveCase = structuredClone(baseCase);
  sensitiveCase.evidence.push({
    id: "unsafe",
    type: "external_inspection",
    source: "external_inspector",
    operationId: sensitiveCase.operationId,
    observedAt: now,
    summary: "token=abc123 https://private.example.test/document",
    confidence: "insufficient",
    finding: "unknown",
  });
  const sanitized = assessReconciliation(sensitiveCase, checkpoint);
  const serialized = JSON.stringify(sanitized.remoteEvidence);
  assert.equal(serialized.includes("abc123"), false);
  assert.equal(serialized.includes("private.example.test"), false);
  const mismatchedFingerprint = structuredClone(baseCase);
  mismatchedFingerprint.payloadFingerprint = baseCase.evidence.find((item) => item.source === "external_inspector")?.fingerprint;
  mismatchedFingerprint.evidence = mismatchedFingerprint.evidence
    .filter((item) => item.source === "external_inspector")
    .map((item) => ({...item, fingerprint: "sha256-v1:remote-payload-mismatch"}));
  assert.equal(assessReconciliation(mismatchedFingerprint, checkpoint).status, "insufficient_evidence");

  const reviewCase = createGlobalResolutionInspectionDevReviewCase();
  const request = buildGlobalResolutionInspectionRequest({reviewCase, operationId: baseCase.operationId, requestedAt: now});
  assert.equal(request.ok, true);
  if (!request.ok) throw new Error("fixture_request_missing");
  const inspectorRegistry = new GlobalResolutionInspectorRegistry();
  inspectorRegistry.register(createGlobalResolutionInspectionFixture({mode: "entity-observed", id: "fixture:less-specific", specificity: 10}));
  inspectorRegistry.register(createGlobalResolutionInspectionFixture({mode: "entity-observed", id: "fixture:most-specific", specificity: 20}));
  const selected = inspectorRegistry.select(request.request);
  assert.equal(selected.ok && selected.inspector.id, "fixture:most-specific");

  let release!: () => void;
  const delayed = new Promise<void>((resolveDelay) => { release = resolveDelay; });
  const slowRegistry = new GlobalResolutionInspectorRegistry();
  slowRegistry.register(createGlobalResolutionInspectionFixture({mode: "slow", id: "fixture:slow", delay: () => delayed}));
  const readCase = () => reviewCase;
  const inspectionService = new GlobalResolutionInspectionService(slowRegistry, readCase, () => now);
  const orchestrator = new UniversalReconciliationInspectionEngine(inspectionService, readCase, createExternalNewsReconciliationContractRegistry());
  const oldResult = orchestrator.inspectAndAssess(request.request);
  const latestResult = orchestrator.inspectAndAssess(request.request);
  release();
  assert.deepEqual((await oldResult).accepted, false);
  assert.deepEqual((await latestResult).accepted, true);

  const repairedCase = applyGlobalResolutionInspectionDevFixtureAssessment(succeeded.reviewCase, succeeded.assessment);
  const repairedCheckpoint = repairedCase.globalResolution!;
  const appliedHistory = repairedCheckpoint.history.filter((entry) => entry.kind === "reconciliation_applied").at(-1);
  assert.equal(repairedCheckpoint.graph.nodes.find((node) => node.operationId === baseCase.operationId)?.state, "succeeded");
  assert.equal(appliedHistory?.inspectorId, succeeded.assessment.inspectorId);
  assert.equal(appliedHistory?.assessmentFingerprint, succeeded.assessment.assessmentFingerprint);
  assert.equal(appliedHistory?.evidenceFingerprint, succeeded.assessment.evidenceFingerprint);
  assert.equal(appliedHistory?.appliedAction, "repair_checkpoint");
  assert.deepEqual(appliedHistory?.reasonCodes, succeeded.assessment.reasons?.map((reason) => reason.code).sort());
  const repairedAgain = applyGlobalResolutionInspectionDevFixtureAssessment(repairedCase, succeeded.assessment);
  assert.equal(repairedAgain.globalResolution?.checkpointFingerprint, repairedCheckpoint.checkpointFingerprint);

  const retriableCase = applyGlobalResolutionInspectionDevFixtureAssessment(missing.reviewCase, missing.assessment);
  assert.equal(retriableCase.globalResolution?.graph.nodes.find((node) => node.operationId === baseCase.operationId)?.state, "ready");
  assert.equal(retriableCase.globalResolution?.execution?.operations.at(-1)?.attempt, missing.reviewCase.globalResolution?.execution?.operations.at(-1)?.attempt);

  const engineSource = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/reconciliation/engine/engine.ts"), "utf8");
  const orchestratorSource = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/reconciliation/engine/orchestrator.ts"), "utf8");
  const serviceSource = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/reconciliation/service.ts"), "utf8");
  const contractsSource = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/reconciliation/contracts/externalNews.ts"), "utf8");
  const componentSource = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/components/GlobalResolutionControls.tsx"), "utf8");
  const fixtureSource = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/devFixture.ts"), "utf8");
  const lifecycleSource = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/checkpoint/lifecycle.ts"), "utf8");
  const reconciliationLifecycleSource = lifecycleSource.slice(lifecycleSource.indexOf("export function applyCheckpointReconciliation"));
  const universalRequestSource = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/universalRequest.ts"), "utf8");
  for (const forbidden of ["external_news", "external-news", "resume:external_news", "sanity:external_news-effects"]) {
    assert.equal(engineSource.includes(forbidden), false);
    assert.equal(orchestratorSource.includes(forbidden), false);
    assert.equal(serviceSource.includes(forbidden), false);
    assert.equal(reconciliationLifecycleSource.includes(forbidden), false);
    assert.equal(universalRequestSource.includes(forbidden), false);
  }
  assert.equal(contractsSource.includes("resume:external_news"), true);
  assert.equal(componentSource.includes("allowedActions"), true);
  assert.equal(componentSource.includes('assessment.status === "confirmed_succeeded"'), false);
  assert.equal(componentSource.includes('assessment.status === "confirmed_not_applied"'), false);
  assert.equal(componentSource.includes("reconciliationEngine.inspectAndAssess"), true);
  assert.equal(fixtureSource.includes("assessReconciliation("), true);
  assert.equal(fixtureSource.includes("technicalFailure:"), true);
  assert.equal(serviceSource.includes("executeUniversalExecutionPlan"), false);
  assert.equal(serviceSource.includes("saveDraft("), false);
  assert.equal(serviceSource.includes("fetch("), false);
  console.log("AU4 universal reconciliation engine tests: OK");
}

void main();
