import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import type {EntityResolutionResult, EntityResolutionStatus, UniversalEntityType} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity";
import type {GlobalResolutionInspectionEvidence, GlobalResolutionObservation, GlobalResolutionInspectionStatus} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/types";
import type {TransversalResolutionDecisionKind, TransversalResolutionPlan} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/transversalPlanning";
import {
  autonomousEditorialDecisionSecurity,
  decideAutonomousEditorialAction,
  type AutonomousEditorialDecisionInput,
  type AutonomousEditorialDecisionKind,
} from "../_laboratorio/laboratorio-ia/src/review/editorialDecision";
import type {SafeTransactionStepDescriptor, TransactionIncident, TransactionOperationalView} from "../_laboratorio/laboratorio-ia/src/review/transactions/orchestrator";

let assertions = 0;
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };
const CASE = Object.freeze({caseId: "case:au8-b1", caseVersion: 7, status: "open", priority: "high"});
const EVALUATED_AT = "2026-08-07T10:05:00.000Z";

function identity(status: EntityResolutionStatus, entityType: UniversalEntityType = "fighter", candidateId?: string, fingerprintSuffix: string = status): EntityResolutionResult {
  return Object.freeze({status, entityType, candidateId, candidates: Object.freeze([]), reasonCodes: Object.freeze([`fixture_${status}`]), inputFingerprint: `sha256-v1:input-${fingerprintSuffix}`, resolutionFingerprint: `sha256-v1:identity-${fingerprintSuffix}`});
}

function inspection(status: GlobalResolutionInspectionStatus, observations: readonly GlobalResolutionObservation[], suffix: string = status): GlobalResolutionInspectionEvidence {
  return Object.freeze({inspectorId: "fixture", inspectorVersion: "1", inspectionId: `inspection:${suffix}`, producer: "fixture", capability: "inspect", operationId: `operation:${suffix}`, operationFingerprint: `sha256-v1:operation-${suffix}`, checkpointFingerprint: "sha256-v1:checkpoint", inspectedAt: "2026-08-07T10:00:00.000Z", status, observations: [...observations], warnings: [], fingerprint: `sha256-v1:inspection-${suffix}`});
}

function plan(decision: TransversalResolutionDecisionKind, options: {guard?: boolean; evidence?: boolean; blocked?: boolean; entityType?: UniversalEntityType} = {}): TransversalResolutionPlan {
  const blocked = options.blocked === true;
  const entityType = options.entityType ?? "fighter";
  return {
    version: "1.0.0",
    plan: {
      schemaVersion: 1, id: `plan:${decision}`, caseId: CASE.caseId, caseVersion: CASE.caseVersion, producer: "fixture", originalOperation: "fixture",
      operations: [], graph: {nodes: [], edges: [], roots: [], leaves: [], fingerprint: "sha256-v1:graph"}, status: blocked ? "blocked" : "ready", structurallyValid: !blocked, executable: false,
      blockers: blocked ? [{code: "invalid_resolution", severity: "blocking", scope: "structure", message: "blocked", evidence: [], explanation: "blocked", requiredAction: "investigate"}] : [],
      warnings: [], assumptions: [], policy: {minimumCreateConfidence: 0.9, minimumReuseConfidence: 0.9, ambiguity: "block", allowSkipOperation: false, allowOptionalDependencySkip: false, allowSkippedDependencyForResume: false, maximumRisk: "medium", requireAllNodesForResume: true, unsupportedOperation: "block", insufficientInformation: "block", availableCapabilities: []},
      fingerprint: `sha256-v1:plan-${decision}`, idempotencyKey: `plan:${decision}`, createdAt: "2026-08-07T10:00:00.000Z", requiredCapabilities: [],
    },
    decisions: [{requirementId: `requirement:${decision}`, entityType, decision, operationIds: [`operation:${decision}`], reasonCodes: [`fixture_${decision}`], evidenceFingerprints: options.evidence === false ? [] : [`sha256-v1:evidence-${decision}`], creationGuardFingerprint: options.guard ? "sha256-v1:creation-guard" : undefined, ready: !blocked}],
    orderedOperationIds: [`operation:${decision}`], layers: [[`operation:${decision}`]], decisionFingerprint: `sha256-v1:decision-${decision}-${options.guard ? "guard" : "no-guard"}-${options.evidence === false ? "no-evidence" : "evidence"}-${blocked ? "blocked" : "ready"}`,
    inputFingerprint: `sha256-v1:plan-input-${decision}`, executionAllowed: false, writes: false,
  } as unknown as TransversalResolutionPlan;
}

function step(risk: SafeTransactionStepDescriptor["risk"] = "low", capability = "validate:noticia"): SafeTransactionStepDescriptor {
  return {stepId: `step:${capability}`, operationId: `operation:${capability}`, capability, mode: "external_effect", risk, state: "ready"};
}

function incident(kind: TransactionIncident["kind"], severity: TransactionIncident["severity"] = "blocking"): TransactionIncident {
  return {incidentId: `incident:${kind}`, transactionId: "transaction:fixture", severity, kind, reasonCodes: [`fixture_${kind}`], safeSummary: `Incidencia segura: ${kind}.`, actionRequired: kind === "authorization_required" ? "authorize" : kind === "effect_uncertain" ? "reconcile" : kind.includes("compensation") ? "compensate" : "human_review", fingerprint: `sha256-v1:incident-${kind}`};
}

function transaction(options: {steps?: readonly SafeTransactionStepDescriptor[]; incidents?: readonly TransactionIncident[]; authorization?: boolean; reconciliation?: boolean; compensation?: boolean} = {}): TransactionOperationalView {
  return {transactionId: "transaction:fixture", state: "ready", progress: {total: options.steps?.length ?? 0, completed: 0, executing: 0, blocked: 0, reconciliation: options.reconciliation ? 1 : 0, compensation: options.compensation ? 1 : 0, remaining: options.steps?.length ?? 0}, nextReadySteps: options.steps ?? [], incidents: options.incidents ?? [], authorizationRequired: options.authorization ? ["step:authorization"] : [], reconciliationRequired: options.reconciliation ? ["step:reconciliation"] : [], compensationRequired: options.compensation ? ["step:compensation"] : [], updatedAt: "2026-08-07T10:00:00.000Z", transactionFingerprint: `sha256-v1:transaction-${JSON.stringify(options)}`, timeline: []};
}

function decide(input: Omit<AutonomousEditorialDecisionInput, "case" | "evaluatedAt"> = {}) { return decideAutonomousEditorialAction({case: CASE, evaluatedAt: EVALUATED_AT, ...input}); }
function expects(kind: AutonomousEditorialDecisionKind, input: Omit<AutonomousEditorialDecisionInput, "case" | "evaluatedAt"> = {}) {
  const result = decide(input);
  equal(result.decision, kind);
  equal(result.executionAllowed, false);
  equal(result.writes, false);
  check(result.foundations.length > 0);
  check(result.operatorExplanation.length > 20);
  check(result.inputFingerprint.startsWith("sha256-v1:"));
  check(result.decisionFingerprint.startsWith("sha256-v1:"));
  return result;
}

function main(): void {
  const empty = expects("wait_for_evidence");
  equal(empty.confidence, 0);
  check(empty.preconditions.some((item) => !item.satisfied));

  const reused = expects("reuse_existing", {inspection: [inspection("observed", [{kind: "entity_exists", entityType: "fighter", entityId: "fighter:canonical"}])], identities: [identity("reuse", "fighter", "fighter:canonical")]});
  equal(reused.subjectEntityType, "fighter");
  check(reused.evidence.every((item) => item.source === "identity"));
  check(reused.confidence > 0 && reused.confidence <= 0.74);
  equal(reused.evidenceSufficiency, "sufficient");
  equal(reused.canDecideNow, true);

  expects("investigate", {identities: [identity("ambiguous")]});
  expects("investigate", {inspection: [inspection("ambiguous", [{kind: "multiple_candidates", entityType: "fighter", candidateIds: ["a", "b"]}])]});
  const conflict = expects("block", {identities: [identity("conflicting_identity")]});
  equal(conflict.risk, "critical");
  check(conflict.blockingReasons.some((item) => item.code === "identity_conflict"));
  const multiple = expects("block", {identities: [identity("reuse", "fighter", "fighter:a", "reuse-a"), identity("reuse", "fighter", "fighter:b", "reuse-b")]});
  check(multiple.blockingReasons.some((item) => item.code === "multiple_resolved_identities"));
  expects("block", {inspection: [inspection("observed", [{kind: "payload_differs", entityId: "fighter:a", expectedFingerprint: "expected", actualFingerprint: "actual"}])]});
  expects("block", {resolution: plan("blocked", {blocked: true})});
  const currentPlan = plan("validate");
  const stalePlan = {...currentPlan, plan: {...currentPlan.plan, caseVersion: CASE.caseVersion - 1}} as TransversalResolutionPlan;
  const stale = expects("block", {resolution: stalePlan});
  check(stale.blockingReasons.some((item) => item.code === "stale_resolution_context"));
  const invalidCase = decideAutonomousEditorialAction({case: {caseId: "", caseVersion: -1}, evaluatedAt: EVALUATED_AT});
  equal(invalidCase.decision, "block");
  check(invalidCase.blockingReasons.some((item) => item.code === "invalid_case_context"));

  expects("request_authorization", {transaction: transaction({authorization: true, incidents: [incident("authorization_required")]})});
  expects("request_reconciliation", {transaction: transaction({reconciliation: true, incidents: [incident("effect_uncertain")]})});
  expects("request_compensation", {transaction: transaction({compensation: true, incidents: [incident("compensation_required")]})});
  expects("escalate_to_human", {transaction: transaction({steps: [step("high")]})});
  expects("escalate_to_human", {transaction: transaction({incidents: [incident("manual_intervention_required")]})});

  const created = expects("create_entity", {inspection: [inspection("not_observed", [{kind: "entity_missing", entityType: "fighter"}], "create-missing")], identities: [identity("create_new")], resolution: plan("create", {guard: true})});
  check(created.preconditions.every((item) => item.satisfied));
  equal(created.risk, "medium");
  equal(created.evidenceSufficiency, "sufficient");
  const unsafeCreate = expects("block", {resolution: plan("create", {evidence: false})});
  check(unsafeCreate.blockingReasons.some((item) => item.code === "creation_guard_incomplete"));
  expects("block", {transaction: transaction({steps: [step("low", "create:luchador")]})});
  expects("wait_for_evidence", {identities: [identity("create_new")]});

  expects("repair_reference", {inspection: [inspection("observed", [{kind: "reference_missing", ownerId: "news:a", field: "fighter", targetId: "fighter:a"}], "repair-plan")], resolution: plan("repair_reference")});
  const unplannedRepair = expects("investigate", {inspection: [inspection("observed", [{kind: "reference_missing", ownerId: "news:a", field: "fighter", targetId: "fighter:a"}])]});
  equal(unplannedRepair.evidenceSufficiency, "partial");
  expects("validate", {inspection: [inspection("observed", [{kind: "payload_matches", entityId: "fighter:a", expectedFingerprint: "same", actualFingerprint: "same"}], "validate-plan")], resolution: plan("validate")});
  expects("resume", {resolution: plan("resume"), transaction: transaction()});
  expects("investigate", {resolution: plan("investigate")});

  const observed = inspection("observed", [{kind: "entity_exists", entityType: "fighter", entityId: "fighter:a"}], "exists");
  const first = decide({inspection: [observed], identities: [identity("reuse", "fighter", "fighter:a", "stable")]});
  const second = decide({identities: [identity("reuse", "fighter", "fighter:a", "stable")], inspection: [observed]});
  equal(first.inputFingerprint, second.inputFingerprint, "El orden de fuentes no altera el fingerprint");
  equal(first.decisionFingerprint, second.decisionFingerprint, "La misma evidencia produce la misma decisión");
  equal(first.decision, "reuse_existing");
  check(first.confidence <= 0.9, "La cobertura de dos fuentes limita la confianza");

  const safe = JSON.stringify(created).toLowerCase();
  check(!safe.includes('"payload"'));
  check(!safe.includes('"secret"'));
  check(!safe.includes('"token"'));
  check(!safe.includes('"stack"'));
  check(!safe.includes('"groq"'));
  check(!safe.includes('"candidateid"'));

  equal(autonomousEditorialDecisionSecurity.pure, true);
  equal(autonomousEditorialDecisionSecurity.failClosed, true);
  equal(autonomousEditorialDecisionSecurity.executesOperations, false);
  equal(autonomousEditorialDecisionSecurity.accessesExecutors, false);
  equal(autonomousEditorialDecisionSecurity.accessesSanity, false);
  equal(autonomousEditorialDecisionSecurity.persistsDecisions, false);
  equal(autonomousEditorialDecisionSecurity.confidenceWithoutEvidence, false);

  const source = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/editorialDecision/engine.ts", import.meta.url), "utf8");
  check(!source.includes('from "../transactions/executor"'));
  check(!source.includes("orchestrateTransaction("));
  check(!source.includes("sanityClient"));
  check(!source.includes("addReviewResolution"));
  check(!source.includes("localStorage"));
  check(assertions >= 125, `Se esperaban al menos 125 comprobaciones y hubo ${assertions}`);
  console.log(`AU8 B1 autonomous editorial decision tests: OK (${assertions} assertions; 12 decisions, deterministic fingerprints, fail-closed and zero real writes)`);
}

main();
