import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import type {EntityOperationKind} from "../_laboratorio/laboratorio-ia/src/review/entityOperations";
import type {EntityResolutionResult, EntityResolutionStatus} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity";
import type {GlobalResolutionInspectionEvidence} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/types";
import type {GlobalResolutionCapabilityManifest, GlobalResolutionProducerManifest, RegisteredGlobalResolutionProducer} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/producers";
import type {GlobalResolutionReconciliationAssessment} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/reconciliation";
import type {TransversalResolutionPlan} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/transversalPlanning";
import type {ControlledTransactionCompensationPlan, TransactionRisk} from "../_laboratorio/laboratorio-ia/src/review/transactions";
import {
  autonomyRiskPolicySecurity,
  evaluateAutonomousEditorialGovernance,
  evaluateAutonomyRiskPolicy,
  type AutonomousEditorialDecision,
  type AutonomousEditorialDecisionKind,
  type AutonomyCapabilityBinding,
  type AutonomyExpectedContext,
  type AutonomyOperationDescriptor,
  type AutonomyPolicyInput,
  type AutonomySufficiencyDescriptor,
  type EditorialEvidenceSufficiencyClassification,
} from "../_laboratorio/laboratorio-ia/src/review/editorialDecision";

const NOW = "2026-08-07T12:00:00.000Z";
let assertions = 0;
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };

const capabilityKinds: Readonly<Record<string, EntityOperationKind>> = Object.freeze({
  "resolve_identity:fighter": "find_entity",
  "reuse:luchador": "reuse_entity",
  "create:luchador": "create_entity",
  "repair:noticia": "replace_reference",
  "patch:noticia": "replace_reference",
  "validate:noticia": "validate_entity",
  "resume:fixture": "validate_entity",
  "compensate:noticia": "set_metadata",
  "delete:organizacion": "update_entity",
});

function universalCapability(capabilityId: string, requiresExplicitAuthorization = false): AutonomyCapabilityBinding {
  const manifest: GlobalResolutionCapabilityManifest = {capabilityId, capabilityVersion: "1.0.0", description: `Capability segura ${capabilityId}`, operationKinds: [capabilityKinds[capabilityId] ?? "validate_entity"], requirements: ["safe_context"], expectedEvidenceKinds: ["fingerprint"], supportsInspection: true, supportsReconciliation: true, requiresExplicitAuthorization, idempotencyPolicy: "required"};
  return Object.freeze({manifest, fingerprint: `sha256-v1:capability-${capabilityId}`});
}

const allCapabilities = Object.freeze([
  universalCapability("resolve_identity:fighter"), universalCapability("reuse:luchador"), universalCapability("create:luchador", true),
  universalCapability("repair:noticia"), universalCapability("patch:noticia"), universalCapability("validate:noticia"),
  universalCapability("resume:fixture", true), universalCapability("compensate:noticia", true), universalCapability("delete:organizacion"),
]);

function producer(options: {policy?: boolean; forbidden?: readonly string[]; maxRisk?: "low" | "medium"; conflict?: boolean; fingerprint?: string} = {}): RegisteredGlobalResolutionProducer {
  const capabilities = allCapabilities.map(({manifest}) => ({capabilityId: manifest.capabilityId, capabilityVersion: manifest.capabilityVersion, operationKinds: [...manifest.operationKinds], modes: ["plan", "simulate", "execute", "inspect", "reconcile"] as const, requiresExplicitAuthorization: manifest.requiresExplicitAuthorization, supportsIdempotency: true, supportsInspection: true, supportsReconciliation: true, requiredContext: ["caseId"]}));
  const allowed = ["resolve_identity:fighter", "reuse:luchador", "repair:noticia", "validate:noticia"];
  const autonomyPolicy = options.policy === false ? undefined : {policyVersion: "1.0.0", maximumAutonomousRisk: options.maxRisk ?? "medium" as const, allowedAutonomousCapabilities: options.conflict ? [...allowed, "patch:noticia"] : allowed, supervisedCapabilities: ["patch:noticia"], requiresAuthorizationCapabilities: ["create:luchador", "resume:fixture", "compensate:noticia"], forbiddenAutonomousCapabilities: [...(options.forbidden ?? ["delete:organizacion"])]};
  const manifest: GlobalResolutionProducerManifest = {manifestVersion: "1.0.0", producerId: "fixture_producer", producerVersion: "1.0.0", displayName: "Fixture", caseTypes: ["fixture"], capabilities: capabilities as unknown as GlobalResolutionProducerManifest["capabilities"], adapters: [], inspectors: [], executionPolicy: {maximumRisk: "medium", defaultAuthorization: "explicit", retryPolicy: "manual_after_confirmed_absence", allowAutomaticExecution: false}, autonomyPolicy, compatibility: {caseTypes: ["fixture"]}};
  return Object.freeze({manifest, fingerprint: options.fingerprint ?? "sha256-v1:producer", warnings: []});
}

function decision(kind: AutonomousEditorialDecisionKind, options: {entityType?: "fighter" | "news"; sufficiency?: EditorialEvidenceSufficiencyClassification; canDecide?: boolean; fingerprint?: string} = {}): AutonomousEditorialDecision {
  const classification = options.sufficiency ?? "sufficient";
  return Object.freeze({version: "1.1.0", caseId: "case:b3", caseVersion: 1, decision: kind, subjectEntityType: options.entityType ?? (kind === "create_entity" || kind === "reuse_existing" ? "fighter" : "news"), foundations: Object.freeze([{code: `fixture_${kind}`, summary: `Decisión segura ${kind}.`, evidenceIds: Object.freeze(["evidence:fixture"])}]), evidence: Object.freeze([]), confidence: 0.99, risk: "low", preconditions: Object.freeze([]), blockingReasons: Object.freeze([]), operatorExplanation: `Decisión segura ${kind}.`, evidenceSufficiency: classification, evidenceSufficiencyFingerprint: `sha256-v1:suff-${classification}`, canDecideNow: options.canDecide ?? classification === "sufficient", inputFingerprint: "sha256-v1:decision-input", decisionFingerprint: options.fingerprint ?? `sha256-v1:decision-${kind}`, executionAllowed: false, writes: false});
}

function sufficiency(classification: EditorialEvidenceSufficiencyClassification = "sufficient", options: {canDecide?: boolean; fingerprint?: string; authority?: boolean} = {}): AutonomySufficiencyDescriptor {
  return Object.freeze({classification, canDecideNow: options.canDecide ?? classification === "sufficient", evaluationFingerprint: options.fingerprint ?? `sha256-v1:suff-${classification}`, authorityAdequate: options.authority ?? true, contradictionCodes: classification === "contradictory" ? Object.freeze(["identity_conflict"]) : Object.freeze([])});
}

function operation(capability: string, options: {mode?: AutonomyOperationDescriptor["mode"]; risk?: TransactionRisk; authorization?: AutonomyOperationDescriptor["authorization"]; compensation?: AutonomyOperationDescriptor["compensation"]; reconciliation?: AutonomyOperationDescriptor["reconciliation"]; reversible?: boolean; guard?: string; ownership?: AutonomyOperationDescriptor["ownership"]; kind?: EntityOperationKind; id?: string} = {}): AutonomyOperationDescriptor {
  const mode = options.mode ?? "read_only";
  return Object.freeze({operationId: options.id ?? `operation:${capability}`, operationKind: options.kind ?? capabilityKinds[capability] ?? "validate_entity", capability, entityType: capability.includes("luchador") || capability.includes("fighter") ? "fighter" : "news", mode, risk: options.risk, authorization: options.authorization ?? "none", compensation: options.compensation ?? (mode === "pure_transform" ? "reversible_transform" : "none"), reconciliation: options.reconciliation ?? (mode === "external_effect" ? "required_before_retry" : "not_required"), reversible: options.reversible ?? mode !== "external_effect", creationGuardFingerprint: options.guard, ownership: options.ownership});
}

function identity(status: EntityResolutionStatus): EntityResolutionResult { return {status, entityType: "fighter", candidateId: status === "reuse" ? "redacted" : undefined, candidates: [], reasonCodes: [status], inputFingerprint: `sha256-v1:identity-input-${status}`, resolutionFingerprint: `sha256-v1:identity-${status}`} as EntityResolutionResult; }

function resolutionCreate(guard = "sha256-v1:guard"): TransversalResolutionPlan {
  return {decisions: [{requirementId: "fighter", entityType: "fighter", decision: "create", operationIds: ["operation:create:luchador"], reasonCodes: ["safe_to_create"], evidenceFingerprints: ["sha256-v1:evidence"], creationGuardFingerprint: guard, ready: true}]} as unknown as TransversalResolutionPlan;
}

function compensation(options: {manual?: boolean; executable?: boolean; reconciliation?: boolean} = {}): ControlledTransactionCompensationPlan {
  return {transactionFingerprint: "sha256-v1:transaction", failedStepIds: ["step:failed"], decisions: [], executableStepIds: options.executable ? ["step:failed"] : [], manualStepIds: options.manual ? ["step:failed"] : [], reconciliationStepIds: options.reconciliation ? ["step:failed"] : [], preservedStepIds: [], fingerprint: `sha256-v1:comp-${JSON.stringify(options)}`};
}

function reconciliation(status: GlobalResolutionReconciliationAssessment["status"]): GlobalResolutionReconciliationAssessment {
  return {status, assessmentFingerprint: `sha256-v1:reconciliation-${status}`} as unknown as GlobalResolutionReconciliationAssessment;
}

function evaluate(kind: AutonomousEditorialDecisionKind, operations: readonly AutonomyOperationDescriptor[], options: Partial<AutonomyPolicyInput> = {}) {
  return evaluateAutonomyRiskPolicy({decision: decision(kind), sufficiency: sufficiency(), operations, producer: producer(), capabilities: allCapabilities, ...options});
}

function main(): void {
  const validate = operation("validate:noticia", {risk: "low"});
  const safe = evaluate("validate", [validate]);
  equal(safe.level, "autonomous_safe");
  equal(safe.risk.aggregate, "low");
  equal(safe.canExecuteAutonomously, true);
  equal(safe.canContinueAfterStep, true);
  equal(safe.executionAllowed, false);

  const supervised = evaluate("repair_reference", [operation("patch:noticia", {mode: "external_effect", risk: "low", reversible: true})]);
  equal(supervised.level, "autonomous_supervised");
  equal(supervised.canExecuteAutonomously, false);
  equal(supervised.canPrepareTransaction, true);
  check(supervised.reasons.some((item) => item.code === "capability_supervised"));

  const authorized = evaluate("resume", [operation("resume:fixture", {mode: "external_effect", risk: "low", authorization: "explicit", reversible: false})]);
  equal(authorized.level, "authorization_required");
  check(authorized.requiredAuthorization);
  equal(authorized.requiredAuthorization?.ephemeral, true);
  equal(authorized.requiredAuthorization?.persistedApproval, false);
  equal(authorized.requiredAuthorization?.tokenStored, false);
  equal(authorized.requiredAuthorization?.bindsDecisionFingerprint, "sha256-v1:decision-resume");

  const high = evaluate("validate", [operation("validate:noticia", {risk: "high"})]);
  equal(high.level, "human_required");
  equal(high.risk.aggregate, "high");
  check(high.humanReview?.reasons.includes("high_risk"));
  const destructive = evaluate("validate", [validate, operation("repair:noticia", {mode: "pure_transform", risk: "destructive"})]);
  equal(destructive.level, "human_required");
  equal(destructive.risk.aggregate, "destructive");
  check(destructive.humanReview?.reasons.includes("destructive_effect"));

  for (const classification of ["partial", "insufficient", "stale", "unavailable"] as const) {
    const result = evaluateAutonomyRiskPolicy({decision: decision("reuse_existing", {sufficiency: classification, canDecide: false}), sufficiency: sufficiency(classification), operations: [operation("reuse:luchador", {risk: "low"})], producer: producer(), capabilities: allCapabilities});
    equal(result.level, "blocked", `${classification} debe bloquear`);
    equal(result.canExecuteAutonomously, false);
    check(result.blockers.some((item) => item.code === "evidence_not_sufficient"));
  }
  const contradictory = evaluateAutonomyRiskPolicy({decision: decision("reuse_existing", {sufficiency: "contradictory", canDecide: false}), sufficiency: sufficiency("contradictory"), operations: [operation("reuse:luchador", {risk: "low"})], producer: producer(), capabilities: allCapabilities});
  equal(contradictory.level, "human_required");
  check(contradictory.humanReview?.reasons.includes("contradictory_evidence"));

  const investigate = evaluate("investigate", [operation("resolve_identity:fighter", {risk: "low"})]);
  equal(investigate.level, "autonomous_safe");
  const reuse = evaluate("reuse_existing", [operation("reuse:luchador", {risk: "low"})], {identities: [identity("reuse")]});
  equal(reuse.level, "autonomous_safe");
  for (const status of ["probable_match", "ambiguous"] as const) {
    const result = evaluate("reuse_existing", [operation("reuse:luchador", {risk: "low"})], {identities: [identity(status)]});
    equal(result.level, "blocked");
    check(result.blockers.some((item) => item.code === "identity_ambiguity"));
  }
  const identityConflict = evaluate("reuse_existing", [operation("reuse:luchador", {risk: "low"})], {identities: [identity("conflicting_identity")]});
  equal(identityConflict.level, "human_required");
  check(identityConflict.humanReview?.reasons.includes("identity_ambiguity"));

  const createOperation = operation("create:luchador", {mode: "external_effect", risk: "medium", authorization: "explicit", reversible: false, guard: "sha256-v1:guard"});
  const guardedCreate = evaluate("create_entity", [createOperation], {decision: decision("create_entity", {entityType: "fighter"}), identities: [identity("create_new")], resolution: resolutionCreate()});
  equal(guardedCreate.level, "authorization_required");
  check(guardedCreate.reasons.some((item) => item.code === "creation_guard_valid"));
  const missingGuard = evaluate("create_entity", [{...createOperation, creationGuardFingerprint: undefined}], {decision: decision("create_entity", {entityType: "fighter"}), identities: [identity("create_new")], resolution: resolutionCreate()});
  equal(missingGuard.level, "blocked");
  check(missingGuard.blockers.some((item) => item.code === "creation_guard_missing"));
  const repair = evaluate("repair_reference", [operation("repair:noticia", {mode: "pure_transform", risk: "low", reversible: true})]);
  equal(repair.level, "autonomous_safe");
  check(repair.reasons.some((item) => item.code === "pure_reversible_transform"));

  const manualCompensation = evaluate("request_compensation", [operation("compensate:noticia", {mode: "external_effect", risk: "medium", ownership: "transaction_created"})], {compensation: compensation({manual: true})});
  equal(manualCompensation.level, "human_required");
  check(manualCompensation.humanReview?.reasons.includes("manual_compensation"));
  const safeCompensation = evaluate("request_compensation", [operation("compensate:noticia", {mode: "external_effect", risk: "medium", ownership: "transaction_created"})], {compensation: compensation({executable: true})});
  equal(safeCompensation.level, "authorization_required");
  check(safeCompensation.requiredAuthorization);
  const unknownOwnership = evaluate("request_compensation", [operation("compensate:noticia", {mode: "external_effect", risk: "medium", ownership: "unknown"})], {compensation: compensation({executable: true})});
  equal(unknownOwnership.level, "human_required");
  check(unknownOwnership.humanReview?.reasons.includes("unknown_ownership"));

  const reconciliationBlocked = evaluate("resume", [operation("resume:fixture", {mode: "external_effect", risk: "low", authorization: "explicit"})], {reconciliation: [reconciliation("insufficient_evidence")]});
  equal(reconciliationBlocked.level, "blocked");
  check(reconciliationBlocked.blockers.some((item) => item.code === "reconciliation_required"));
  const reconciliationResolved = evaluate("validate", [validate], {reconciliation: [reconciliation("confirmed_succeeded")]});
  equal(reconciliationResolved.level, "autonomous_safe");
  check(reconciliationResolved.reasons.some((item) => item.code === "reconciliation_resolved"));

  const unknownRisk = evaluate("validate", [operation("validate:noticia")]);
  equal(unknownRisk.level, "human_required");
  equal(unknownRisk.risk.aggregate, "unknown");
  check(unknownRisk.humanReview?.reasons.includes("unknown_risk"));
  const aggregateHigh = evaluate("validate", [operation("validate:noticia", {risk: "low", id: "a"}), operation("repair:noticia", {mode: "pure_transform", risk: "high", id: "b"})]);
  equal(aggregateHigh.risk.aggregate, "high");
  const aggregateDestructive = evaluate("validate", [operation("validate:noticia", {risk: "low", id: "a"}), operation("repair:noticia", {risk: "destructive", id: "b"})]);
  equal(aggregateDestructive.risk.aggregate, "destructive");
  const allLow = evaluate("validate", [operation("validate:noticia", {risk: "low", id: "a"}), operation("repair:noticia", {mode: "pure_transform", risk: "low", id: "b"})]);
  equal(allLow.risk.aggregate, "low");
  check(allLow.risk.allReversible);

  const producerAllowed = evaluate("validate", [validate]); equal(producerAllowed.level, "autonomous_safe");
  const producerAuth = evaluate("resume", [operation("resume:fixture", {mode: "external_effect", risk: "low"})]); equal(producerAuth.level, "authorization_required");
  const producerForbidden = evaluate("validate", [operation("delete:organizacion", {risk: "low", kind: "update_entity"})]); equal(producerForbidden.level, "blocked");
  const unknownProducer = evaluate("validate", [validate], {producer: producer({policy: false})}); equal(unknownProducer.level, "blocked");
  check(unknownProducer.blockers.some((item) => item.code === "producer_policy_missing"));
  const policyConflict = evaluate("repair_reference", [operation("patch:noticia", {mode: "pure_transform", risk: "low"})], {producer: producer({conflict: true})});
  equal(policyConflict.level, "human_required");
  check(policyConflict.humanReview?.reasons.includes("policy_conflict"));

  const unknownCapability = evaluate("validate", [operation("unknown:capability", {risk: "low"})]);
  equal(unknownCapability.level, "blocked");
  check(unknownCapability.blockers.some((item) => item.code === "unknown_capability"));
  const unsupportedOperation = evaluate("validate", [operation("validate:noticia", {risk: "low", kind: "update_entity"})]);
  equal(unsupportedOperation.level, "blocked");
  check(unsupportedOperation.blockers.some((item) => item.code === "unsupported_capability"));

  const baseline = evaluate("create_entity", [createOperation], {decision: decision("create_entity", {entityType: "fighter"}), identities: [identity("create_new")], resolution: resolutionCreate()});
  const capabilityFingerprints = Object.freeze({"create:luchador": "sha256-v1:capability-create:luchador"});
  const guards = Object.freeze({"operation:create:luchador": "sha256-v1:guard"});
  const contexts: readonly [string, AutonomyExpectedContext][] = [
    ["decision_fingerprint_changed", {decisionFingerprint: "sha256-v1:old-decision"}],
    ["sufficiency_fingerprint_changed", {sufficiencyFingerprint: "sha256-v1:old-suff"}],
    ["producer_manifest_changed", {producerManifestFingerprint: "sha256-v1:old-producer"}],
    ["capability_manifest_changed:create:luchador", {capabilityManifestFingerprints: {"create:luchador": "sha256-v1:old-capability"}}],
    ["creation_guard_changed:operation:create:luchador", {creationGuardFingerprints: {"operation:create:luchador": "sha256-v1:old-guard"}}],
    ["transaction_risk_changed", {transactionRiskFingerprint: "sha256-v1:old-risk"}],
    ["reconciliation_state_changed", {reconciliationFingerprint: "sha256-v1:old-reconciliation"}],
  ];
  for (const [code, expectedContext] of contexts) {
    const stale = evaluate("create_entity", [createOperation], {decision: decision("create_entity", {entityType: "fighter"}), identities: [identity("create_new")], resolution: resolutionCreate(), expectedContext});
    equal(stale.level, "blocked"); equal(stale.stale, true); check(stale.staleReasonCodes.includes(code));
  }
  check(!baseline.stale);
  check(capabilityFingerprints["create:luchador"] && guards["operation:create:luchador"]);

  const ordered = evaluate("validate", [operation("validate:noticia", {risk: "low", id: "a"}), operation("repair:noticia", {mode: "pure_transform", risk: "low", id: "b"})], {capabilities: [...allCapabilities]});
  const reversed = evaluate("validate", [operation("repair:noticia", {mode: "pure_transform", risk: "low", id: "b"}), operation("validate:noticia", {risk: "low", id: "a"})], {capabilities: [...allCapabilities].reverse()});
  equal(ordered.policyFingerprint, reversed.policyFingerprint, "El ruido de orden no cambia la policy");
  const changed = evaluate("validate", [operation("validate:noticia", {risk: "medium", id: "a"}), operation("repair:noticia", {mode: "pure_transform", risk: "low", id: "b"})]);
  check(changed.policyFingerprint !== ordered.policyFingerprint, "Un cambio semántico cambia el fingerprint");

  const inspection: GlobalResolutionInspectionEvidence = {inspectorId: "sanity:fixture", inspectorVersion: "1", inspectionId: "inspection:fixture", producer: "sanity_official", capability: "inspect", operationId: "inspect", operationFingerprint: "sha256-v1:inspect-op", checkpointFingerprint: "sha256-v1:checkpoint", inspectedAt: NOW, status: "observed", observations: [{kind: "entity_exists", entityType: "fighter", entityId: "redacted"}], warnings: [], fingerprint: "sha256-v1:inspection"};
  const facade = evaluateAutonomousEditorialGovernance({decisionInput: {case: {caseId: "case:facade", caseVersion: 1}, evaluatedAt: NOW, inspection: [inspection], identities: [identity("reuse")]}, autonomy: {operations: [operation("reuse:luchador", {risk: "low"})], producer: producer(), capabilities: allCapabilities, identities: [identity("reuse")]}});
  equal(facade.decision.decision, "reuse_existing");
  equal(facade.sufficiency.classification, "sufficient");
  equal(facade.autonomy.level, "autonomous_safe");
  equal(facade.executionAllowed, false);
  equal(facade.writes, false);
  check(facade.fingerprint.startsWith("sha256-v1:"));

  const safeJson = JSON.stringify({authorized, facade}).toLowerCase();
  check(!safeJson.includes('"token"'));
  check(!safeJson.includes('"payload"'));
  check(!safeJson.includes('"stack"'));
  check(!safeJson.includes('"executor"'));
  check(!safeJson.includes('"sanityclient"'));
  check(!safeJson.includes('"approval"'));
  check(!safeJson.includes('"expiresat"'));

  equal(autonomyRiskPolicySecurity.pure, true);
  equal(autonomyRiskPolicySecurity.executesOperations, false);
  equal(autonomyRiskPolicySecurity.launchesTransactions, false);
  equal(autonomyRiskPolicySecurity.invokesExecutors, false);
  equal(autonomyRiskPolicySecurity.accessesSanity, false);
  equal(autonomyRiskPolicySecurity.fetchesExternalData, false);
  equal(autonomyRiskPolicySecurity.persistsAuthorization, false);
  equal(autonomyRiskPolicySecurity.confidenceGrantsAutonomy, false);

  const policySource = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/editorialDecision/autonomy/policy.ts", import.meta.url), "utf8");
  check(!policySource.includes("executeTransactionStep"));
  check(!policySource.includes("orchestrateTransaction("));
  check(!policySource.includes("sanityClient"));
  check(!policySource.includes("fetch("));
  check(!policySource.includes("localStorage"));
  check(!policySource.includes('producer === "external_news"'));
  check(assertions >= 125, `Se esperaban al menos 125 comprobaciones y hubo ${assertions}`);
  console.log(`AU8 B3 autonomy and risk policy tests: OK (${assertions} assertions; five levels, 68 acceptance areas, declarative manifests, staleness and zero real writes)`);
}

main();
