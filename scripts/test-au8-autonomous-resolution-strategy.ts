import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildEntityOperation, type EntityOperation, type EntityOperationEntityType, type EntityOperationKind} from "../_laboratorio/laboratorio-ia/src/review/entityOperations";
import type {EntityResolutionResult, EntityResolutionStatus, UniversalEntityType} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity";
import type {GlobalResolutionInspectionEvidence} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/types";
import type {TransversalResolutionPlan} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/transversalPlanning";
import {buildResolutionGraph, topologicalSortResolutionGraph} from "../_laboratorio/laboratorio-ia/src/review/resolutionGraph";
import {
  autonomousResolutionStrategySecurity,
  buildAutonomousResolutionStrategy,
  evaluateAutonomousEditorialResolutionStrategy,
  type AggregatedAutonomyRisk,
  type AutonomousEditorialDecision,
  type AutonomousEditorialDecisionKind,
  type AutonomousResolutionStrategyInput,
  type AutonomyLevel,
  type AutonomyPolicyResult,
  type EditorialEvidenceSufficiencyClassification,
} from "../_laboratorio/laboratorio-ia/src/review/editorialDecision";

const NOW = "2026-08-07T12:00:00.000Z";
const CASE = "case:au8-b4";
let assertions = 0;
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };

function decision(kind: AutonomousEditorialDecisionKind, options: {entityType?: UniversalEntityType; classification?: EditorialEvidenceSufficiencyClassification; canDecide?: boolean; conflict?: boolean} = {}): AutonomousEditorialDecision {
  const classification = options.classification ?? "sufficient";
  const sufficiencyFingerprint = `sha256-v1:sufficiency-${classification}`;
  return Object.freeze({
    version: "1.1.0", caseId: CASE, caseVersion: 4, decision: kind, subjectEntityType: options.entityType,
    foundations: Object.freeze([{code: options.conflict ? "identity_conflict" : `fixture_${kind}`, summary: "Fundamento seguro.", evidenceIds: Object.freeze(["evidence:safe"])}]),
    evidence: Object.freeze([{id: "evidence:safe", source: "resolution" as const, kind: "fixture", summary: "Evidencia proyectada.", fingerprint: "sha256-v1:evidence", confidence: 1}]),
    confidence: 1, risk: options.conflict ? "critical" : "low", preconditions: Object.freeze(kind === "create_entity" ? [{code: "creation_guard_valid", description: "Guard AU6 válido.", satisfied: true, evidenceIds: Object.freeze(["evidence:safe"])}] : []),
    blockingReasons: Object.freeze(options.conflict ? [{code: "identity_conflict", severity: "critical" as const, summary: "Identidades contradictorias.", evidenceIds: Object.freeze(["evidence:safe"])}] : []),
    operatorExplanation: "Explicación segura.", evidenceSufficiency: classification, evidenceSufficiencyFingerprint: sufficiencyFingerprint,
    canDecideNow: options.canDecide ?? classification === "sufficient", inputFingerprint: "sha256-v1:decision-input",
    decisionFingerprint: `sha256-v1:decision-${kind}-${classification}`, executionAllowed: false, writes: false,
  });
}

function autonomy(decisionValue: AutonomousEditorialDecision, level: AutonomyLevel = "autonomous_safe", risk: AggregatedAutonomyRisk = "low"): AutonomyPolicyResult {
  return Object.freeze({
    schemaVersion: "1.0.0", level, decisionKind: decisionValue.decision, decisionFingerprint: decisionValue.decisionFingerprint,
    sufficiencyFingerprint: decisionValue.evidenceSufficiencyFingerprint, capabilities: Object.freeze([]), entityType: decisionValue.subjectEntityType,
    risk: Object.freeze({aggregate: risk, drivers: Object.freeze([]), hasExternalEffects: false, allReversible: true, uncertaintyCodes: Object.freeze([]), fingerprint: `sha256-v1:risk-${risk}`}),
    reasons: Object.freeze([]), blockers: Object.freeze(level === "blocked" ? [{code: "evidence_not_sufficient" as const, severity: "blocking" as const, summary: "Bloqueado."}] : []),
    canPreparePlan: level !== "blocked" && level !== "human_required", canPrepareTransaction: ["autonomous_safe", "autonomous_supervised", "authorization_required"].includes(level),
    canExecuteAutonomously: level === "autonomous_safe", canContinueAfterStep: level === "autonomous_safe", stale: false, staleReasonCodes: Object.freeze([]),
    policyFingerprint: `sha256-v1:autonomy-${level}-${decisionValue.decision}`, executionAllowed: false, writes: false,
  });
}

function identity(status: EntityResolutionStatus, entityType: UniversalEntityType = "fighter"): EntityResolutionResult {
  return {status, entityType, candidateId: status === "reuse" ? `${entityType}:canonical` : undefined, candidates: [], reasonCodes: [`fixture_${status}`], inputFingerprint: `sha256-v1:identity-input-${status}-${entityType}`, resolutionFingerprint: `sha256-v1:identity-${status}-${entityType}`} as EntityResolutionResult;
}

type OperationSpec = {id: string; kind: EntityOperationKind; entityType: EntityOperationEntityType; dependencies?: readonly string[]; capability?: string; risk?: EntityOperation["risk"]};
function sourceOperation(spec: OperationSpec): EntityOperation {
  return buildEntityOperation({id: spec.id, kind: spec.kind, entityType: spec.entityType, source: "global_resolution", evidence: [{id: `evidence:${spec.id}`, kind: "fixture", source: "fixture", confidence: 1, limitations: []}], confidence: 1, risk: spec.risk ?? (spec.kind === "create_entity" ? "medium" : "low"), preconditions: [], postconditions: [], dependencyIds: [...(spec.dependencies ?? [])], requiredCapability: spec.capability ?? `${spec.kind}:${spec.entityType}`, compensatable: false, explanation: "Operación autoritativa AU6."});
}

function resolution(specs: readonly OperationSpec[], suffix = "fixture"): TransversalResolutionPlan {
  const operations = specs.map(sourceOperation);
  const graph = buildResolutionGraph({caseId: CASE, caseVersion: 4, producerId: "fixture", originalOperation: "resolve_case", nodes: operations.map((operation) => ({operation})), now: () => NOW});
  return {
    version: "1.0.0",
    plan: {schemaVersion: 1, id: `plan:${suffix}`, caseId: CASE, caseVersion: 4, producer: "fixture", originalOperation: "resolve_case", operations, graph, status: "ready", structurallyValid: true, executable: false, blockers: [], warnings: [], assumptions: [], policy: {}, fingerprint: `sha256-v1:plan-${suffix}`, idempotencyKey: `plan:${suffix}`, createdAt: NOW, requiredCapabilities: []},
    decisions: operations.map((operation) => ({requirementId: `requirement:${operation.id}`, entityType: operation.entityType === "luchador" ? "fighter" : operation.entityType === "organizacion" ? "organization" : operation.entityType === "categoriaPeso" ? "weight_category" : operation.entityType === "evento" ? "event" : operation.entityType === "combate" ? "fight" : "news", decision: operation.kind === "create_entity" ? "create" : operation.kind === "reuse_entity" ? "reuse" : operation.kind === "replace_reference" ? "repair_reference" : "validate", operationIds: [operation.id], reasonCodes: ["fixture_ready"], evidenceFingerprints: [`sha256-v1:evidence-${operation.id}`], creationGuardFingerprint: operation.kind === "create_entity" ? `sha256-v1:guard-${operation.id}` : undefined, ready: true})), orderedOperationIds: topologicalSortResolutionGraph(graph).nodeIds, layers: topologicalSortResolutionGraph(graph).layers,
    decisionFingerprint: `sha256-v1:resolution-${suffix}`, inputFingerprint: `sha256-v1:resolution-input-${suffix}`, executionAllowed: false, writes: false,
  } as unknown as TransversalResolutionPlan;
}

function input(kind: AutonomousEditorialDecisionKind, options: {entityType?: UniversalEntityType; classification?: EditorialEvidenceSufficiencyClassification; canDecide?: boolean; level?: AutonomyLevel; risk?: AggregatedAutonomyRisk; resolution?: TransversalResolutionPlan; identities?: readonly EntityResolutionResult[]; conflict?: boolean} = {}): AutonomousResolutionStrategyInput {
  const selected = decision(kind, options);
  return {
    caseId: CASE, caseVersion: 4, producerId: "fixture", originalOperation: "resolve_case", generatedAt: NOW,
    decision: selected,
    sufficiency: {classification: selected.evidenceSufficiency, canDecideNow: selected.canDecideNow, evaluationFingerprint: selected.evidenceSufficiencyFingerprint, contradictionCodes: options.conflict ? ["identity_conflict"] : []},
    autonomy: autonomy(selected, options.level ?? "autonomous_safe", options.risk ?? "low"), resolution: options.resolution, identities: options.identities,
  };
}

function indexOfKind(result: ReturnType<typeof buildAutonomousResolutionStrategy>, kind: string): number {
  return result.steps.findIndex((item) => item.kind === kind);
}

function assertCoreInvariants(result: ReturnType<typeof buildAutonomousResolutionStrategy>): void {
  const topology = topologicalSortResolutionGraph(result.graph);
  equal(topology.valid, true);
  equal(JSON.stringify(topology.nodeIds), JSON.stringify(result.orderedStepIds));
  equal(result.executionAllowed, false);
  equal(result.launchesTransactions, false);
  equal(result.writes, false);
  for (const create of result.steps.filter((item) => item.kind === "create_entity")) {
    const ancestors = new Set<string>();
    const visit = (id: string): void => { const step = result.steps.find((item) => item.id === id); for (const dependency of step?.dependencyIds ?? []) if (!ancestors.has(dependency)) { ancestors.add(dependency); visit(dependency); } };
    visit(create.id);
    check([...ancestors].some((id) => result.steps.find((item) => item.id === id)?.kind === "compare_entities"), "Create exige compare_entities como ancestro");
  }
  const prepare = result.steps.find((item) => item.kind === "prepare_transaction");
  if (prepare) check(prepare.dependencyIds.some((id) => result.steps.find((item) => item.id === id)?.kind === "validate"), "Prepare depende de validate");
}

function main(): void {
  const completeNewsPlan = resolution([
    {id: "reuse:organization", kind: "reuse_entity", entityType: "organizacion"},
    {id: "create:fighter:a", kind: "create_entity", entityType: "luchador"},
    {id: "create:fighter:b", kind: "create_entity", entityType: "luchador"},
    {id: "repair:news:organization", kind: "replace_reference", entityType: "noticia", dependencies: ["reuse:organization"]},
    {id: "repair:news:fighters", kind: "replace_reference", entityType: "noticia", dependencies: ["create:fighter:a", "create:fighter:b"]},
  ], "complete-news");
  const completeNews = buildAutonomousResolutionStrategy(input("create_entity", {entityType: "fighter", resolution: completeNewsPlan, identities: [identity("create_new"), identity("reuse", "organization")]}));
  equal(completeNews.status, "ready");
  equal(completeNews.steps.filter((item) => item.kind === "create_entity").length, 2);
  equal(completeNews.steps.filter((item) => item.kind === "reuse_entity").length, 1);
  check(indexOfKind(completeNews, "validate") < indexOfKind(completeNews, "prepare_transaction"));
  assertCoreInvariants(completeNews);

  const eventPlan = resolution([
    {id: "reuse:event-org", kind: "reuse_entity", entityType: "organizacion"},
    {id: "reuse:category", kind: "reuse_entity", entityType: "categoriaPeso"},
    {id: "repair:fight:1", kind: "replace_reference", entityType: "combate", dependencies: ["reuse:event-org", "reuse:category"]},
    {id: "repair:fight:2", kind: "replace_reference", entityType: "combate", dependencies: ["reuse:event-org", "reuse:category"]},
    {id: "repair:fight:3", kind: "replace_reference", entityType: "combate", dependencies: ["reuse:event-org", "reuse:category"]},
  ], "complete-event");
  const completeEvent = buildAutonomousResolutionStrategy(input("repair_reference", {entityType: "event", resolution: eventPlan}));
  equal(completeEvent.steps.filter((item) => item.kind === "repair_reference").length, 3);
  equal(completeEvent.steps.filter((item) => item.kind === "reuse_entity").length, 2);
  equal(completeEvent.status, "ready");
  assertCoreInvariants(completeEvent);

  for (const [entityType, schema] of [["fighter", "luchador"], ["organization", "organizacion"], ["weight_category", "categoriaPeso"]] as const) {
    const creationPlan = resolution([{id: `create:${entityType}`, kind: "create_entity", entityType: schema}], `new-${entityType}`);
    const strategy = buildAutonomousResolutionStrategy(input("create_entity", {entityType, resolution: creationPlan, identities: [identity("create_new", entityType)]}));
    equal(strategy.steps.filter((item) => item.kind === "create_entity").length, 1, `${entityType} mantiene create`);
    check(indexOfKind(strategy, "search_candidates") < indexOfKind(strategy, "compare_entities"));
    check(indexOfKind(strategy, "compare_entities") < indexOfKind(strategy, "create_entity"));
    assertCoreInvariants(strategy);
  }

  const duplicatePlan = resolution([{id: "reuse:canonical", kind: "reuse_entity", entityType: "luchador"}, {id: "repair:canonical", kind: "replace_reference", entityType: "noticia", dependencies: ["reuse:canonical"]}], "duplicate");
  const duplicate = buildAutonomousResolutionStrategy(input("reuse_existing", {entityType: "fighter", resolution: duplicatePlan, identities: [identity("reuse")]}));
  equal(duplicate.steps.some((item) => item.kind === "create_entity"), false);
  equal(duplicate.steps.some((item) => item.kind === "reuse_entity"), true);
  assertCoreInvariants(duplicate);

  const ambiguous = buildAutonomousResolutionStrategy(input("investigate", {entityType: "fighter", classification: "partial", canDecide: false, level: "blocked", identities: [identity("ambiguous")]}));
  equal(ambiguous.status, "investigation_required");
  equal(ambiguous.steps.some((item) => item.kind === "search_candidates"), true);
  equal(ambiguous.steps.some((item) => item.kind === "compare_entities"), true);
  equal(ambiguous.steps.some((item) => item.kind === "create_entity"), false);
  equal(ambiguous.steps.at(-1)?.kind, "stop");
  assertCoreInvariants(ambiguous);

  const insufficient = buildAutonomousResolutionStrategy(input("wait_for_evidence", {classification: "insufficient", canDecide: false, level: "blocked"}));
  equal(insufficient.status, "investigation_required");
  equal(insufficient.steps.some((item) => item.kind === "inspect_sanity"), true);
  equal(insufficient.steps.some((item) => item.kind === "inspect_source"), true);
  equal(insufficient.steps.some((item) => item.kind === "prepare_transaction"), false);
  assertCoreInvariants(insufficient);

  const authorization = buildAutonomousResolutionStrategy(input("create_entity", {entityType: "fighter", resolution: resolution([{id: "create:authorized", kind: "create_entity", entityType: "luchador"}], "authorization"), level: "authorization_required", risk: "medium"}));
  equal(authorization.status, "authorization_required");
  check(indexOfKind(authorization, "prepare_transaction") < indexOfKind(authorization, "wait_authorization"));
  equal(authorization.steps.at(-1)?.kind, "stop");
  assertCoreInvariants(authorization);

  const guardPlan = resolution([{id: "create:without-guard", kind: "create_entity", entityType: "luchador"}], "without-guard");
  const missingGuard = buildAutonomousResolutionStrategy(input("create_entity", {entityType: "fighter", resolution: {...guardPlan, decisions: guardPlan.decisions.map((item) => ({...item, creationGuardFingerprint: undefined}))} as TransversalResolutionPlan}));
  equal(missingGuard.status, "blocked");
  equal(missingGuard.steps.some((item) => item.kind === "create_entity"), false);
  check(missingGuard.blockers.some((item) => item.startsWith("creation_guard_missing:")));

  const reconciliationInput = input("request_reconciliation", {level: "blocked", risk: "high"});
  const reconciliation = buildAutonomousResolutionStrategy({...reconciliationInput, transactionView: {transactionId: "transaction", state: "reconciliation_required", progress: {total: 1, completed: 0, executing: 0, blocked: 0, reconciliation: 1, compensation: 0, remaining: 1}, nextReadySteps: [], incidents: [{incidentId: "incident", transactionId: "transaction", stepId: "step", kind: "effect_uncertain", severity: "critical", reasonCodes: ["effect_uncertain"], safeSummary: "Efecto incierto.", actionRequired: "reconcile", fingerprint: "sha256-v1:incident"}], authorizationRequired: [], reconciliationRequired: ["step"], compensationRequired: [], updatedAt: NOW, transactionFingerprint: "sha256-v1:transaction", timeline: []}});
  equal(reconciliation.status, "reconciliation_required");
  equal(reconciliation.steps[0].kind, "wait_reconciliation");
  equal(reconciliation.steps.some((item) => item.kind === "prepare_transaction"), false);
  assertCoreInvariants(reconciliation);

  const contradictory = buildAutonomousResolutionStrategy(input("block", {classification: "contradictory", canDecide: false, level: "human_required", conflict: true, identities: [identity("conflicting_identity")]}));
  equal(contradictory.status, "blocked");
  equal(contradictory.steps[0].kind, "request_human");
  equal(contradictory.steps.at(-1)?.kind, "stop");
  equal(contradictory.steps.some((item) => item.kind === "create_entity"), false);
  assertCoreInvariants(contradictory);

  const mismatchBase = input("validate");
  const mismatch = buildAutonomousResolutionStrategy({...mismatchBase, checkpoint: {caseId: "other-case", caseVersion: 4, checkpointFingerprint: "sha256-v1:checkpoint"} as AutonomousResolutionStrategyInput["checkpoint"]});
  equal(mismatch.status, "blocked");
  check(mismatch.blockers.includes("checkpoint_context_mismatch"));
  equal(mismatch.steps[0].kind, "request_human");

  const ordered = buildAutonomousResolutionStrategy(input("repair_reference", {resolution: eventPlan}));
  const reversedPlan = resolution([...eventPlan.plan.operations].reverse().map((operation) => ({id: operation.id, kind: operation.kind, entityType: operation.entityType, dependencies: operation.dependencyIds, capability: operation.requiredCapability, risk: operation.risk})), "complete-event");
  const reversed = buildAutonomousResolutionStrategy(input("repair_reference", {resolution: reversedPlan}));
  equal(ordered.strategyFingerprint, reversed.strategyFingerprint, "El ruido de orden no cambia el fingerprint");
  equal(ordered.graph.fingerprint, reversed.graph.fingerprint, "El grafo AU2 es determinista");
  const changed = buildAutonomousResolutionStrategy(input("repair_reference", {resolution: resolution([{id: "reuse:event-org", kind: "reuse_entity", entityType: "organizacion"}], "changed")}));
  check(changed.strategyFingerprint !== ordered.strategyFingerprint, "Un cambio semántico cambia el fingerprint");

  const canonicalInspection: GlobalResolutionInspectionEvidence = {inspectorId: "sanity-read-model", inspectorVersion: "1", inspectionId: "inspection:facade", producer: "sanity_official", capability: "inspect", operationId: "inspect", operationFingerprint: "sha256-v1:inspect", checkpointFingerprint: "sha256-v1:checkpoint", inspectedAt: NOW, status: "observed", observations: [{kind: "entity_exists", entityType: "fighter", entityId: "redacted"}], warnings: [], fingerprint: "sha256-v1:inspection-facade"};
  const resolvedIdentity = {...identity("reuse"), candidates: [{candidate: {source: "external_feed"}}]} as unknown as EntityResolutionResult;
  const facade = evaluateAutonomousEditorialResolutionStrategy({decisionInput: {case: {caseId: CASE, caseVersion: 4}, evaluatedAt: NOW, inspection: [canonicalInspection], identities: [resolvedIdentity]}, autonomy: {}, strategy: {producerId: "fixture", originalOperation: "resolve_case", generatedAt: NOW}});
  equal(facade.decision.caseId, facade.strategy.caseId);
  equal(facade.sufficiency.evaluationFingerprint, facade.strategy.sufficiencyFingerprint);
  equal(facade.autonomy.policyFingerprint, facade.strategy.autonomyFingerprint);
  equal(facade.executionAllowed, false);
  equal(facade.launchesTransactions, false);
  equal(facade.writes, false);
  check(facade.fingerprint.startsWith("sha256-v1:"));

  equal(autonomousResolutionStrategySecurity.pure, true);
  equal(autonomousResolutionStrategySecurity.reusesResolutionGraph, true);
  equal(autonomousResolutionStrategySecurity.createsParallelPlanner, false);
  equal(autonomousResolutionStrategySecurity.executesOperations, false);
  equal(autonomousResolutionStrategySecurity.launchesTransactions, false);
  equal(autonomousResolutionStrategySecurity.invokesExecutors, false);
  equal(autonomousResolutionStrategySecurity.accessesSanity, false);
  equal(autonomousResolutionStrategySecurity.persistsStrategy, false);
  equal(autonomousResolutionStrategySecurity.writes, false);

  const safeJson = JSON.stringify({completeNews, authorization, reconciliation, facade}).toLowerCase();
  check(!safeJson.includes('"payload"'));
  check(!safeJson.includes('"secret"'));
  check(!safeJson.includes('"token"'));
  check(!safeJson.includes('"approval"'));
  const source = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/editorialDecision/strategy/engine.ts", import.meta.url), "utf8");
  check(!source.includes("executeTransactionStep"));
  check(!source.includes("orchestrateTransaction("));
  check(!source.includes("sanityClient"));
  check(!source.includes("fetch("));
  check(!source.includes("localStorage"));
  check(assertions >= 100, `Se esperaban al menos 100 comprobaciones y hubo ${assertions}`);
  console.log(`AU8 B4 autonomous resolution strategy tests: OK (${assertions} assertions; topological AU2 graph, identity gates, validation-before-transaction and zero writes)`);
}

main();
