import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import type {EntityResolutionResult, EntityResolutionStatus} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity";
import type {GlobalResolutionInspectionEvidence, GlobalResolutionInspectionStatus, GlobalResolutionObservation} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/types";
import type {TransversalResolutionPlan} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/transversalPlanning";
import {
  decideAutonomousEditorialAction,
  editorialEvidenceSufficiencySecurity,
  evaluateEditorialEvidenceSufficiency,
  type AutonomousEditorialDecisionInput,
  type EditorialEvidenceSufficiencyInput,
} from "../_laboratorio/laboratorio-ia/src/review/editorialDecision";
import type {TransactionOperationalView} from "../_laboratorio/laboratorio-ia/src/review/transactions/orchestrator";

const NOW = "2026-08-07T12:00:00.000Z";
const OLD = "2026-08-07T10:00:00.000Z";
const CASE = Object.freeze({caseId: "case:au8-b2", caseVersion: 3, status: "open"});
let assertions = 0;
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };

function inspection(options: {status?: GlobalResolutionInspectionStatus; observations?: readonly GlobalResolutionObservation[]; producer?: string; suffix?: string; inspectedAt?: string} = {}): GlobalResolutionInspectionEvidence {
  const status = options.status ?? "observed";
  const suffix = options.suffix ?? `${status}-${options.producer ?? "external"}`;
  return {inspectorId: options.producer?.includes("sanity") ? "sanity-read-model" : "source-inspector", inspectorVersion: "1", inspectionId: `inspection:${suffix}`, producer: options.producer ?? "external_feed", capability: "inspect", operationId: `operation:${suffix}`, operationFingerprint: `sha256-v1:operation-${suffix}`, checkpointFingerprint: "sha256-v1:checkpoint", inspectedAt: options.inspectedAt ?? NOW, status, observations: [...(options.observations ?? [{kind: "entity_exists", entityType: "fighter", entityId: "redacted"}])], warnings: [], fingerprint: `sha256-v1:inspection-${suffix}`};
}

function identity(status: EntityResolutionStatus = "reuse", options: {candidateId?: string; source?: string; suffix?: string} = {}): EntityResolutionResult {
  const suffix = options.suffix ?? `${status}-${options.source ?? "source"}-${options.candidateId ?? "none"}`;
  const candidates = options.source ? [{candidate: {source: options.source}}] : [];
  return {status, entityType: "fighter", candidateId: options.candidateId, candidates, reasonCodes: [`fixture_${status}`], inputFingerprint: `sha256-v1:identity-input-${suffix}`, resolutionFingerprint: `sha256-v1:identity-${suffix}`} as unknown as EntityResolutionResult;
}

function plan(createdAt = NOW): TransversalResolutionPlan {
  return {version: "1.0.0", plan: {schemaVersion: 1, id: "plan:b2", caseId: CASE.caseId, caseVersion: CASE.caseVersion, producer: "fixture", originalOperation: "fixture", operations: [], graph: {}, status: "ready", structurallyValid: true, executable: false, blockers: [], warnings: [], assumptions: [], policy: {minimumCreateConfidence: 0.9, minimumReuseConfidence: 0.9, ambiguity: "block", allowSkipOperation: false, allowOptionalDependencySkip: false, allowSkippedDependencyForResume: false, maximumRisk: "medium", requireAllNodesForResume: true, unsupportedOperation: "block", insufficientInformation: "block", availableCapabilities: []}, fingerprint: "sha256-v1:plan", idempotencyKey: "plan:b2", createdAt, requiredCapabilities: []}, decisions: [{requirementId: "fighter", entityType: "fighter", decision: "reuse", operationIds: ["reuse:fighter"], reasonCodes: ["resolved"], evidenceFingerprints: ["sha256-v1:evidence"], candidateId: "redacted", ready: true}], orderedOperationIds: ["reuse:fighter"], layers: [["reuse:fighter"]], decisionFingerprint: "sha256-v1:resolution-b2", inputFingerprint: "sha256-v1:resolution-input", executionAllowed: false, writes: false} as unknown as TransversalResolutionPlan;
}

function transaction(risk: "low" | "high" = "low"): TransactionOperationalView {
  return {transactionId: "transaction:b2", state: "ready", progress: {total: 1, completed: 0, executing: 0, blocked: 0, reconciliation: 0, compensation: 0, remaining: 1}, nextReadySteps: [{stepId: "step:b2", operationId: "operation:b2", capability: "resume:fixture", mode: "external_effect", risk, state: "ready"}], incidents: [], authorizationRequired: [], reconciliationRequired: [], compensationRequired: [], updatedAt: NOW, transactionFingerprint: `sha256-v1:transaction-${risk}`, timeline: []};
}

function evaluate(input: Partial<EditorialEvidenceSufficiencyInput> = {}) {
  return evaluateEditorialEvidenceSufficiency({case: CASE, evaluatedAt: NOW, decisionIntent: "reuse_existing", ...input});
}

function main(): void {
  const canonical = inspection({producer: "sanity_official", suffix: "canonical"});
  const externalIdentity = identity("reuse", {candidateId: "fighter:canonical", source: "external_feed", suffix: "canonical"});
  const complete = evaluate({inspection: [canonical], identities: [externalIdentity]});
  equal(complete.classification, "sufficient");
  equal(complete.canDecideNow, true);
  equal(complete.coverage.ratio, 1);
  equal(complete.coverage.missingDimensions.length, 0);
  check(complete.authority.authoritative >= 1);
  equal(complete.independence.independentSourceCount, 2);
  check(complete.independence.adequate);
  check(complete.freshness.current);
  equal(complete.recommendations[0].kind, "ready_to_decide");
  check(complete.safeExplanation.includes("Puede emitirse"));

  const partial = evaluate({inspection: [canonical]});
  equal(partial.classification, "partial");
  equal(partial.canDecideNow, false);
  check(partial.missingEvidence.some((item) => item.dimension === "identity"));
  check(partial.recommendations.some((item) => item.kind === "search_candidates"));

  const insufficient = evaluate();
  equal(insufficient.classification, "insufficient");
  equal(insufficient.canDecideNow, false);
  equal(insufficient.coverage.ratio, 0);
  check(insufficient.recommendations.some((item) => item.kind === "wait_for_evidence"));

  const conflict = evaluate({identities: [identity("conflicting_identity", {suffix: "conflict"})], inspection: [canonical]});
  equal(conflict.classification, "contradictory");
  equal(conflict.canDecideNow, false);
  check(conflict.contradictions.some((item) => item.code === "identity_conflict"));
  check(conflict.recommendations.some((item) => item.kind === "request_human"));
  check(conflict.recommendations.some((item) => item.kind === "compare_entities"));

  const multipleTargets = evaluate({inspection: [canonical], identities: [identity("reuse", {candidateId: "fighter:a", suffix: "target-a"}), identity("reuse", {candidateId: "fighter:b", suffix: "target-b"})]});
  equal(multipleTargets.classification, "contradictory");
  check(multipleTargets.contradictions.some((item) => item.code === "multiple_resolved_targets"));

  const duplicated = evaluate({inspection: [canonical, canonical], identities: [externalIdentity, externalIdentity]});
  equal(duplicated.classification, "sufficient");
  equal(duplicated.evidenceUsed.length, 2, "Los fingerprints duplicados se proyectan una sola vez");
  equal(duplicated.sources.length, 2, "Los duplicados no inflan las fuentes");
  equal(duplicated.independence.independentSourceCount, 2);
  equal(duplicated.evaluationFingerprint, complete.evaluationFingerprint, "Duplicar la misma evidencia no altera la evaluación semántica");

  const sameExternal = evaluate({inspection: [inspection({producer: "external_feed", suffix: "same-source"})], identities: [identity("reuse", {candidateId: "fighter:a", source: "external_feed", suffix: "same-source"})]});
  equal(sameExternal.classification, "partial");
  equal(sameExternal.independence.independentSourceCount, 1);
  equal(sameExternal.authority.authoritative, 0);
  check(sameExternal.recommendations.some((item) => item.kind === "inspect_sanity"));
  check(sameExternal.recommendations.some((item) => item.kind === "inspect_source"));
  check(complete.authority.authoritative > sameExternal.authority.authoritative, "La fuente oficial conserva mayor autoridad");

  const ambiguous = evaluate({inspection: [canonical], identities: [identity("ambiguous", {suffix: "ambiguous"})]});
  equal(ambiguous.classification, "partial");
  equal(ambiguous.canDecideNow, false);
  check(ambiguous.recommendations.some((item) => item.kind === "search_candidates"));
  check(ambiguous.recommendations.some((item) => item.kind === "compare_entities"));

  const stale = evaluate({inspection: [inspection({producer: "sanity_official", suffix: "stale", inspectedAt: OLD})], identities: [externalIdentity], maximumAgeMs: 30 * 60 * 1000});
  equal(stale.classification, "stale");
  equal(stale.canDecideNow, false);
  equal(stale.freshness.staleEvidenceIds.length, 1);
  check(stale.recommendations.some((item) => item.kind === "inspect_sanity"));
  check(stale.recommendations.some((item) => item.kind === "inspect_source"));
  const staleDecision = decideAutonomousEditorialAction({case: CASE, evaluatedAt: NOW, inspection: [inspection({producer: "sanity_official", suffix: "stale-gate", inspectedAt: OLD})], identities: [externalIdentity]});
  equal(staleDecision.decision, "investigate");
  equal(staleDecision.evidenceSufficiency, "stale");
  equal(staleDecision.canDecideNow, false);

  const unavailable = evaluate({inspection: [inspection({status: "unavailable", observations: [{kind: "service_unavailable", reason: "temporary"}], suffix: "unavailable"})]});
  equal(unavailable.classification, "unavailable");
  equal(unavailable.canDecideNow, false);
  check(unavailable.recommendations.some((item) => item.kind === "wait_for_evidence"));

  const highRisk = evaluateEditorialEvidenceSufficiency({case: CASE, evaluatedAt: NOW, decisionIntent: "resume", decisionRisk: "high", resolution: plan(), transaction: transaction("high")});
  equal(highRisk.classification, "sufficient");
  equal(highRisk.riskGate, "blocked");
  equal(highRisk.canDecideNow, false);
  check(highRisk.recommendations.some((item) => item.kind === "request_human"));

  const reversed = evaluate({identities: [externalIdentity], inspection: [canonical]});
  equal(reversed.inputFingerprint, complete.inputFingerprint);
  equal(reversed.evaluationFingerprint, complete.evaluationFingerprint);

  const incompleteDecisionInput: AutonomousEditorialDecisionInput = {case: CASE, evaluatedAt: NOW, identities: [externalIdentity]};
  const gated = decideAutonomousEditorialAction(incompleteDecisionInput);
  equal(gated.decision, "investigate", "B1 no emite reuse con evidencia parcial");
  equal(gated.evidenceSufficiency, "partial");
  equal(gated.canDecideNow, false);
  const ready = decideAutonomousEditorialAction({case: CASE, evaluatedAt: NOW, inspection: [canonical], identities: [externalIdentity]});
  equal(ready.decision, "reuse_existing");
  equal(ready.evidenceSufficiency, "sufficient");
  equal(ready.canDecideNow, true);
  check(ready.evidenceSufficiencyFingerprint.startsWith("sha256-v1:"));

  const safe = JSON.stringify(complete).toLowerCase();
  check(!safe.includes("fighter:canonical"));
  check(!safe.includes('"payload"'));
  check(!safe.includes('"token"'));
  check(!safe.includes('"secret"'));
  check(!safe.includes('"stack"'));
  check(!safe.includes('"groq"'));

  equal(editorialEvidenceSufficiencySecurity.pure, true);
  equal(editorialEvidenceSufficiencySecurity.executesInvestigation, false);
  equal(editorialEvidenceSufficiencySecurity.executesOperations, false);
  equal(editorialEvidenceSufficiencySecurity.createsEntities, false);
  equal(editorialEvidenceSufficiencySecurity.launchesTransactions, false);
  equal(editorialEvidenceSufficiencySecurity.accessesSanityDirectly, false);
  equal(editorialEvidenceSufficiencySecurity.writes, false);
  equal(editorialEvidenceSufficiencySecurity.confidenceCanReplaceEvidence, false);

  const evaluatorSource = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/editorialDecision/evidenceSufficiency/evaluate.ts", import.meta.url), "utf8");
  const engineSource = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/editorialDecision/engine.ts", import.meta.url), "utf8");
  check(!evaluatorSource.includes("executeTransactionStep"));
  check(!evaluatorSource.includes("orchestrateTransaction("));
  check(!evaluatorSource.includes("sanityClient"));
  check(!evaluatorSource.includes("addReviewResolution"));
  check(engineSource.includes("evaluateEditorialEvidenceSufficiency"), "B1 consume obligatoriamente la evaluación B2");
  check(assertions >= 75, `Se esperaban al menos 75 comprobaciones y hubo ${assertions}`);
  console.log(`AU8 B2 evidence sufficiency tests: OK (${assertions} assertions; six classifications, seven investigation policies, B1 gate and zero real writes)`);
}

main();
