import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildEntityOperation} from "../_laboratorio/laboratorio-ia/src/review/entityOperations";
import type {EntityResolutionResult, EntityResolutionStatus} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity";
import type {GlobalResolutionInspectionEvidence} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/types";
import type {GlobalResolutionCapabilityManifest, GlobalResolutionProducerManifest, RegisteredGlobalResolutionProducer} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/producers";
import type {TransversalResolutionPlan} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/transversalPlanning";
import {buildResolutionGraph} from "../_laboratorio/laboratorio-ia/src/review/resolutionGraph";
import type {TransactionOperationalView} from "../_laboratorio/laboratorio-ia/src/review/transactions/orchestrator";
import {
  activeAutonomousSupervisedLoopCount,
  autonomousSupervisedLoopSecurity,
  buildAutonomousSupervisedLoopCheckpoint,
  recoverAutonomousSupervisedLoop,
  runAutonomousSupervisedLoop,
  validateAutonomousSupervisedLoopCheckpoint,
  type AutonomousEditorialStrategyFacadeInput,
  type AutonomousInvestigationAdapter,
  type AutonomousInvestigationIntent,
  type AutonomousLoopAu7Execution,
  type AutonomousLoopCheckpointApplication,
  type AutonomousLoopObservation,
  type AutonomousLoopTransactionHandoff,
  type AutonomousLoopTransactionHandoffAdapter,
  type AutonomousSupervisedLoopRuntime,
  type AutonomyCapabilityBinding,
  type AutonomyOperationDescriptor,
} from "../_laboratorio/laboratorio-ia/src/review/editorialDecision";

const NOW = "2026-08-08T12:00:00.000Z";
const OLD = "2026-08-08T10:00:00.000Z";
const CASE = "case:au8-b5";
let assertions = 0;
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };

function inspection(options: {suffix?: string; old?: boolean; conflict?: boolean} = {}): GlobalResolutionInspectionEvidence {
  const suffix = options.suffix ?? "canonical";
  return {inspectorId: "sanity-read-model", inspectorVersion: "1", inspectionId: `inspection:${suffix}`, producer: "sanity_official", capability: "inspect", operationId: `inspect:${suffix}`, operationFingerprint: `sha256-v1:operation${suffix}`, checkpointFingerprint: "sha256-v1:checkpoint", inspectedAt: options.old ? OLD : NOW, status: "observed", observations: options.conflict ? [{kind: "payload_differs", entityId: "redacted", expectedFingerprint: "sha256-v1:expected", actualFingerprint: "sha256-v1:actual"}] : [{kind: "entity_exists", entityType: "fighter", entityId: "redacted"}], warnings: [], fingerprint: `sha256-v1:inspection${suffix}`};
}

function identity(status: EntityResolutionStatus = "reuse", suffix: string = status): EntityResolutionResult {
  return {status, entityType: "fighter", candidateId: status === "reuse" ? "fighter:canonical" : undefined, candidates: [{candidate: {source: "external_feed"}}], reasonCodes: [`fixture_${status}`], inputFingerprint: `sha256-v1:identityinput${suffix}`, resolutionFingerprint: `sha256-v1:identity${suffix}`} as unknown as EntityResolutionResult;
}

function capability(capabilityId: string, kind: "find_entity" | "reuse_entity" | "create_entity" = "reuse_entity", requiresExplicitAuthorization = false): AutonomyCapabilityBinding {
  const manifest: GlobalResolutionCapabilityManifest = {capabilityId, capabilityVersion: "1.0.0", description: capabilityId, operationKinds: [kind], requirements: ["safe_context"], expectedEvidenceKinds: ["fingerprint"], supportsInspection: true, supportsReconciliation: true, requiresExplicitAuthorization, idempotencyPolicy: "required"};
  return Object.freeze({manifest, fingerprint: `sha256-v1:capability${capabilityId.replace(/[^a-z0-9]/gi, "")}`});
}

const reuseCapability = capability("reuse:luchador");
const createCapability = capability("create:luchador", "create_entity");
const investigateCapability = capability("resolve_identity:fighter", "find_entity");

function producer(options: {supervised?: boolean; authorize?: boolean; allowCreate?: boolean} = {}): RegisteredGlobalResolutionProducer {
  const capabilities = [reuseCapability, createCapability, investigateCapability].map(({manifest}) => ({capabilityId: manifest.capabilityId, capabilityVersion: manifest.capabilityVersion, operationKinds: [...manifest.operationKinds], modes: ["plan", "simulate", "execute", "inspect", "reconcile"] as const, requiresExplicitAuthorization: manifest.requiresExplicitAuthorization, supportsIdempotency: true, supportsInspection: true, supportsReconciliation: true, requiredContext: ["caseId"]}));
  const autonomyPolicy = {policyVersion: "1.0.0", maximumAutonomousRisk: "medium" as const, allowedAutonomousCapabilities: options.supervised || options.authorize || options.allowCreate ? ["resolve_identity:fighter"] : ["reuse:luchador", "resolve_identity:fighter"], supervisedCapabilities: options.supervised ? ["reuse:luchador"] : options.allowCreate ? ["create:luchador"] : [], requiresAuthorizationCapabilities: options.authorize ? ["reuse:luchador"] : [], forbiddenAutonomousCapabilities: []};
  const manifest: GlobalResolutionProducerManifest = {manifestVersion: "1.0.0", producerId: "fixture_producer", producerVersion: "1.0.0", displayName: "Fixture", caseTypes: ["fixture"], capabilities: capabilities as unknown as GlobalResolutionProducerManifest["capabilities"], adapters: [], inspectors: [], executionPolicy: {maximumRisk: "medium", defaultAuthorization: "explicit", retryPolicy: "manual_after_confirmed_absence", allowAutomaticExecution: false}, autonomyPolicy, compatibility: {caseTypes: ["fixture"]}};
  return Object.freeze({manifest, fingerprint: `sha256-v1:producer${options.supervised ? "supervised" : options.authorize ? "authorize" : options.allowCreate ? "create" : "safe"}`, warnings: []});
}

function operation(capabilityId: string, options: {kind?: "find_entity" | "reuse_entity" | "create_entity"; mode?: "read_only" | "pure_transform" | "external_effect"; risk?: "low" | "medium" | "high" | "destructive"; authorization?: "none" | "explicit"; guard?: string} = {}): AutonomyOperationDescriptor {
  const kind = options.kind ?? "reuse_entity";
  return {operationId: `operation:${capabilityId}`, operationKind: kind, capability: capabilityId, entityType: "fighter", mode: options.mode ?? "read_only", risk: options.risk ?? "low", authorization: options.authorization ?? "none", compensation: options.mode === "external_effect" ? "logical_only" : "reversible_transform", reconciliation: options.mode === "external_effect" ? "required_before_retry" : "not_required", reversible: true, creationGuardFingerprint: options.guard, ownership: options.mode === "external_effect" ? "transaction_created" : "pre_existing"};
}

function transactionView(capabilityId = "resolve_identity:fighter"): TransactionOperationalView {
  return {transactionId: "transaction:investigate", state: "ready", progress: {total: 1, completed: 0, executing: 0, blocked: 0, reconciliation: 0, compensation: 0, remaining: 1}, nextReadySteps: [{stepId: "step:investigate", operationId: "operation:investigate", capability: capabilityId, mode: "read_only", risk: "low", state: "ready"}], incidents: [], authorizationRequired: [], reconciliationRequired: [], compensationRequired: [], updatedAt: NOW, transactionFingerprint: "sha256-v1:transactioninvestigate", timeline: []};
}

function createResolution(): TransversalResolutionPlan {
  const evidence = [{id: "evidence:create", kind: "fixture", source: "fixture", confidence: 1, limitations: []}];
  const create = buildEntityOperation({id: "operation:create:luchador", kind: "create_entity", entityType: "luchador", source: "global_resolution", evidence, confidence: 1, risk: "medium", preconditions: [], postconditions: [], dependencyIds: [], requiredCapability: "create:luchador", compensatable: false, explanation: "Create protegido."});
  const graph = buildResolutionGraph({caseId: CASE, caseVersion: 1, producerId: "fixture_producer", originalOperation: "fixture", nodes: [{operation: create}], now: () => NOW});
  return {version: "1.0.0", plan: {schemaVersion: 1, id: "plan:create", caseId: CASE, caseVersion: 1, producer: "fixture_producer", originalOperation: "fixture", operations: [create], graph, status: "ready", structurallyValid: true, executable: false, blockers: [], warnings: [], assumptions: [], policy: {}, fingerprint: "sha256-v1:plancreate", idempotencyKey: "plan:create", createdAt: NOW, requiredCapabilities: ["create:luchador"]}, decisions: [{requirementId: "fighter", entityType: "fighter", decision: "create", operationIds: [create.id], reasonCodes: ["safe_to_create"], evidenceFingerprints: ["sha256-v1:evidencecreate"], creationGuardFingerprint: "sha256-v1:guardcreate", ready: true}], orderedOperationIds: [create.id], layers: [[create.id]], decisionFingerprint: "sha256-v1:resolutioncreate", inputFingerprint: "sha256-v1:resolutioninputcreate", executionAllowed: false, writes: false} as unknown as TransversalResolutionPlan;
}

function facade(options: {suffix?: string; supervised?: boolean; authorize?: boolean; highRisk?: boolean; insufficient?: boolean; contradictory?: boolean; stale?: boolean; investigate?: boolean; create?: boolean} = {}): AutonomousEditorialStrategyFacadeInput {
  const suffix = options.suffix ?? "base";
  const identityStatus: EntityResolutionStatus = options.contradictory ? "conflicting_identity" : options.create ? "create_new" : "reuse";
  const identities = options.insufficient ? [] : [identity(identityStatus, suffix)];
  const inspections = options.insufficient ? [] : [inspection({suffix, old: options.stale, conflict: options.contradictory})];
  const resolution = options.create ? createResolution() : undefined;
  const selectedCapability = options.create ? "create:luchador" : options.investigate ? "resolve_identity:fighter" : "reuse:luchador";
  const selectedOperation = operation(selectedCapability, {kind: options.create ? "create_entity" : options.investigate ? "find_entity" : "reuse_entity", mode: options.create ? "external_effect" : "read_only", risk: options.highRisk ? "high" : options.create ? "medium" : "low", authorization: options.authorize ? "explicit" : "none", guard: options.create ? "sha256-v1:guardcreate" : undefined});
  return {
    decisionInput: {case: {caseId: CASE, caseVersion: 1}, evaluatedAt: NOW, inspection: inspections, identities, resolution, transaction: options.investigate ? transactionView() : undefined},
    autonomy: {operations: [selectedOperation], producer: producer({supervised: options.supervised, authorize: options.authorize, allowCreate: options.create}), capabilities: [reuseCapability, createCapability, investigateCapability], identities, resolution, transactionView: options.investigate ? transactionView() : undefined},
    strategy: {producerId: "fixture_producer", originalOperation: "fixture", generatedAt: NOW, inspection: inspections, identities, resolution},
  };
}

function handoff(options: Partial<AutonomousLoopTransactionHandoff> = {}): AutonomousLoopTransactionHandoff {
  return {status: "ready", strategyFingerprint: "dynamic", transactionFingerprint: "sha256-v1:transactionready", checkpointFingerprint: "sha256-v1:global", transactionState: "ready", readySteps: [{stepId: "step:one", capability: "reuse:luchador", mode: "read_only", risk: "low", authorization: "none"}], pendingMandatoryStepIds: ["step:one"], authorizationRequired: [], reconciliationRequired: [], compensationRequired: [], blockerCodes: [], ...options};
}

function execution(options: Partial<AutonomousLoopAu7Execution> = {}): AutonomousLoopAu7Execution {
  return {status: "paused", stopReason: "max_steps_reached", transactionFingerprint: "sha256-v1:transactionafter", transactionState: "ready", executions: [{stepId: "step:one", status: "succeeded", executorInvoked: true, reconciliationRequired: false}], blockerCodes: [], authorizationRequired: [], reconciliationRequired: [], compensationRequired: [], ...options};
}

function runtime(options: {
  facades?: readonly AutonomousEditorialStrategyFacadeInput[];
  prepare?: (strategyFingerprint: string, call: number) => AutonomousLoopTransactionHandoff;
  execute?: (call: number) => AutonomousLoopAu7Execution;
  persistenceConflict?: boolean;
  investigation?: AutonomousInvestigationAdapter;
  observeDelay?: boolean;
  seed?: ReturnType<typeof buildAutonomousSupervisedLoopCheckpoint>;
} = {}) {
  let globalCounter = 1;
  let stored = options.seed;
  let observes = 0;
  let prepares = 0;
  let executions = 0;
  let investigations = 0;
  const usedModes: string[] = [];
  const application: AutonomousLoopCheckpointApplication = {
    load: () => ({globalCheckpointFingerprint: `sha256-v1:global${globalCounter}`, loop: stored}),
    persist(input) {
      if (options.persistenceConflict) return {persisted: false, conflict: true, reasonCodes: ["checkpoint_conflict"]};
      if (input.expectedGlobalCheckpointFingerprint !== `sha256-v1:global${globalCounter}`) return {persisted: false, conflict: true, reasonCodes: ["checkpoint_changed"]};
      stored = structuredClone(input.checkpoint); globalCounter += 1;
      return {persisted: true, conflict: false, checkpointFingerprint: `sha256-v1:global${globalCounter}`, reasonCodes: []};
    },
  };
  const transactionHandoff: AutonomousLoopTransactionHandoffAdapter = {
    prepareOrReuse({strategy}) { prepares += 1; const value = options.prepare?.(strategy.strategyFingerprint, prepares) ?? handoff({strategyFingerprint: strategy.strategyFingerprint}); return {...value, strategyFingerprint: value.strategyFingerprint === "dynamic" ? strategy.strategyFingerprint : value.strategyFingerprint, checkpointFingerprint: `sha256-v1:global${globalCounter}`}; },
    run(input) { executions += 1; usedModes.push(input.mode); return options.execute?.(executions) ?? execution(); },
  };
  const investigation = options.investigation;
  const loopRuntime: AutonomousSupervisedLoopRuntime = {
    async observe(): Promise<AutonomousLoopObservation> {
      if (options.observeDelay) await new Promise((resolve) => setTimeout(resolve, 10));
      const selected = (options.facades ?? [facade()])[Math.min(observes, (options.facades ?? [facade()]).length - 1)];
      observes += 1;
      return {facadeInput: selected, evidenceFingerprint: `sha256-v1:evidence${selected.decisionInput.inspection?.[0]?.fingerprint.replace(/[^a-z0-9]/gi, "") ?? "absent"}`, checkpointFingerprint: `sha256-v1:global${globalCounter}`, blockerCodes: []};
    },
    transactionHandoff,
    investigationAdapters: {get(intent: AutonomousInvestigationIntent) { if (investigation?.intent === intent) return {...investigation, run: async (input) => { investigations += 1; return investigation.run(input); }}; return undefined; }},
    checkpointApplication: application,
  };
  return {runtime: loopRuntime, counters: () => ({observes, prepares, executions, investigations}), modes: usedModes, checkpoint: () => stored};
}

async function main(): Promise<void> {
  const completeRuntime = runtime({prepare: (strategyFingerprint, call) => call === 1 ? handoff({strategyFingerprint}) : handoff({status: "completed", strategyFingerprint, transactionFingerprint: "sha256-v1:transactionafter", transactionState: "completed", readySteps: [], pendingMandatoryStepIds: []})});
  const complete = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 3, runtime: completeRuntime.runtime});
  equal(complete.phase, "completed");
  equal(complete.stopReason, "completed");
  equal(complete.iteration, 2);
  equal(completeRuntime.counters().executions, 1);
  equal(completeRuntime.modes[0], "single_step");
  equal(complete.iterations[0].effectConfirmed, false, "Reuse read-only no se presenta como efecto real");
  equal(complete.autoResumed, false);
  equal(complete.editorialWritesOutsideAu7, false);
  equal(complete.checkpointWritesViaAu3, true);
  equal(complete.directExecutorCalls, false);
  equal(complete.automaticReconciliation, false);
  equal(complete.automaticCompensation, false);
  equal(complete.persistedAuthorization, false);

  const supervisedRuntime = runtime({facades: [facade({supervised: true})], prepare: (strategyFingerprint) => handoff({strategyFingerprint, readySteps: [{stepId: "step:a", capability: "reuse:luchador", mode: "pure_transform", risk: "low", authorization: "none"}, {stepId: "step:b", capability: "reuse:luchador", mode: "read_only", risk: "low", authorization: "none"}], pendingMandatoryStepIds: ["step:a", "step:b"]})});
  const supervised = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 1, runtime: supervisedRuntime.runtime});
  equal(supervised.governance?.autonomy.level, "autonomous_supervised");
  equal(supervisedRuntime.modes[0], "safe_batch");
  equal(supervised.stopReason, "iteration_budget_reached");
  equal(supervised.phase, "paused");

  const authorizationRuntime = runtime({facades: [facade({authorize: true})]});
  const authorization = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: authorizationRuntime.runtime});
  equal(authorization.stopReason, "authorization_required");
  equal(authorization.phase, "paused");
  equal(authorizationRuntime.counters().prepares, 0);
  equal(authorizationRuntime.counters().executions, 0);

  const humanRuntime = runtime({facades: [facade({highRisk: true})]});
  const human = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: humanRuntime.runtime});
  equal(human.stopReason, "high_risk");
  equal(human.phase, "blocked");
  equal(humanRuntime.counters().executions, 0);

  const unknownRiskFacade = facade();
  const humanRequiredRuntime = runtime({facades: [{...unknownRiskFacade, autonomy: {...unknownRiskFacade.autonomy, operations: unknownRiskFacade.autonomy.operations?.map((item) => ({...item, risk: undefined}))}}]});
  const humanRequired = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: humanRequiredRuntime.runtime});
  equal(humanRequired.stopReason, "human_required");
  equal(humanRequired.governance?.autonomy.level, "human_required");

  const insufficientRuntime = runtime({facades: [facade({insufficient: true})]});
  const insufficient = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: insufficientRuntime.runtime});
  equal(insufficient.stopReason, "insufficient_evidence");
  equal(insufficientRuntime.counters().prepares, 0);

  const contradictionRuntime = runtime({facades: [facade({contradictory: true})]});
  const contradiction = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: contradictionRuntime.runtime});
  equal(contradiction.stopReason, "contradictory_evidence");
  equal(contradiction.phase, "blocked");

  const staleRuntime = runtime({facades: [facade({stale: true})]});
  const stale = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: staleRuntime.runtime});
  equal(stale.stopReason, "stale_evidence");

  const strategyStaleRuntime = runtime({prepare: () => handoff({strategyFingerprint: "sha256-v1:otherstrategy"})});
  const strategyStale = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: strategyStaleRuntime.runtime});
  equal(strategyStale.stopReason, "strategy_stale");
  equal(strategyStaleRuntime.counters().executions, 0);

  const transactionStaleRuntime = runtime({prepare: (strategyFingerprint) => handoff({status: "stale", strategyFingerprint, blockerCodes: ["transaction_stale"]})});
  const transactionStale = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: transactionStaleRuntime.runtime});
  equal(transactionStale.stopReason, "transaction_stale");

  const checkpointConflictRuntime = runtime({prepare: (strategyFingerprint) => handoff({status: "blocked", strategyFingerprint, blockerCodes: ["checkpoint_conflict"]})});
  const checkpointConflict = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: checkpointConflictRuntime.runtime});
  equal(checkpointConflict.stopReason, "checkpoint_conflict");

  const reconciliationRuntime = runtime({prepare: (strategyFingerprint, call) => call === 1 ? handoff({status: "reconciliation_required", strategyFingerprint, reconciliationRequired: ["step:one"]}) : handoff({status: "completed", strategyFingerprint, readySteps: [], pendingMandatoryStepIds: []})});
  const reconciliation = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: reconciliationRuntime.runtime});
  equal(reconciliation.stopReason, "reconciliation_required");
  equal(reconciliation.phase, "paused");
  const reconciliationRecovered = recoverAutonomousSupervisedLoop({checkpoint: reconciliation.checkpoint});
  equal(reconciliationRecovered.canAutoResume, false);
  equal(reconciliationRecovered.explicitContinuationRequired, true);
  const reconciliationResume = await runAutonomousSupervisedLoop({caseId: CASE, intent: "continue", maxIterations: 2, runtime: reconciliationRuntime.runtime});
  equal(reconciliationResume.phase, "completed");

  const compensationRuntime = runtime({prepare: (strategyFingerprint, call) => call === 1 ? handoff({status: "compensation_required", strategyFingerprint, compensationRequired: ["step:one"]}) : handoff({status: "completed", strategyFingerprint, readySteps: [], pendingMandatoryStepIds: []})});
  const compensation = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: compensationRuntime.runtime});
  equal(compensation.stopReason, "compensation_required");
  equal(compensationRuntime.counters().executions, 0);
  const compensationResume = await runAutonomousSupervisedLoop({caseId: CASE, intent: "continue", maxIterations: 2, runtime: compensationRuntime.runtime});
  equal(compensationResume.phase, "completed");

  const createRuntime = runtime({facades: [facade({create: true}), facade({suffix: "aftercreate"}), facade({suffix: "aftercreate"})], prepare: (strategyFingerprint, call) => call === 1 ? handoff({strategyFingerprint, transactionFingerprint: "sha256-v1:transactioncreate", readySteps: [{stepId: "step:create", capability: "create:luchador", mode: "external_effect", risk: "medium", authorization: "none"}], pendingMandatoryStepIds: ["step:create"]}) : handoff({status: "completed", strategyFingerprint, transactionFingerprint: "sha256-v1:transactionreuse", transactionState: "completed", readySteps: [], pendingMandatoryStepIds: []}), execute: () => execution({transactionFingerprint: "sha256-v1:transactionreuse", transactionState: "completed", executions: [{stepId: "step:create", status: "succeeded", executorInvoked: true, reconciliationRequired: false}]})});
  const createThenReuse = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 3, runtime: createRuntime.runtime});
  equal(createThenReuse.phase, "completed");
  equal(createThenReuse.iterations[0].effectConfirmed, true);
  equal(createRuntime.counters().executions, 1);
  check(createRuntime.counters().observes >= 2, "Un efecto confirmado obliga a observar de nuevo");
  equal(createThenReuse.governance?.decision.decision, "reuse_existing");

  const noProgressRuntime = runtime({execute: () => execution({executions: [], transactionFingerprint: "sha256-v1:transactionready"})});
  const noProgress = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 3, runtime: noProgressRuntime.runtime});
  equal(noProgress.stopReason, "no_progress");
  equal(noProgress.iteration, 2);
  equal(noProgressRuntime.counters().executions, 1);

  const cancelledController = new AbortController(); cancelledController.abort();
  const cancelledRuntime = runtime();
  const cancelled = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: cancelledRuntime.runtime, signal: cancelledController.signal});
  equal(cancelled.stopReason, "cancellation");
  equal(cancelled.phase, "cancelled");
  equal(cancelledRuntime.counters().prepares, 0);

  const conflictRuntime = runtime({persistenceConflict: true});
  const conflict = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 1, runtime: conflictRuntime.runtime});
  equal(conflict.stopReason, "persistence_conflict");
  equal(conflict.phase, "blocked");

  const postconditionRuntime = runtime({execute: () => execution({status: "blocked", stopReason: "unexpected_result", blockerCodes: ["postcondition_failed"]})});
  const postcondition = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: postconditionRuntime.runtime});
  equal(postcondition.stopReason, "unexpected_postcondition");
  equal(postcondition.phase, "blocked");

  const strictRuntime = runtime({prepare: (strategyFingerprint) => handoff({status: "completed", strategyFingerprint, readySteps: [], pendingMandatoryStepIds: ["still:pending"]})});
  const strict = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 1, runtime: strictRuntime.runtime});
  equal(strict.phase, "blocked");
  equal(strict.stopReason, "transaction_blocked");

  const concurrencyRuntime = runtime({observeDelay: true, prepare: (strategyFingerprint) => handoff({status: "completed", strategyFingerprint, readySteps: [], pendingMandatoryStepIds: []})});
  const [callerA, callerB] = await Promise.all([
    runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: concurrencyRuntime.runtime}),
    runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: concurrencyRuntime.runtime}),
  ]);
  equal(concurrencyRuntime.counters().prepares, 1);
  equal(concurrencyRuntime.counters().observes, 1);
  equal(callerA.phase, "completed");
  equal(callerA.joinedExistingRun, false);
  equal(callerB.joinedExistingRun, true);
  equal(activeAutonomousSupervisedLoopCount(), 0);

  const investigateAdapter: AutonomousInvestigationAdapter = {intent: "search_candidates", capability: "resolve_identity:fighter", readOnly: true, autonomy: "autonomous_safe", run: () => ({status: "observed", evidenceFingerprint: "sha256-v1:investigated", reasonCodes: []})};
  const investigationRuntime = runtime({facades: [facade({investigate: true}), facade({suffix: "investigated"})], investigation: investigateAdapter, prepare: (strategyFingerprint) => handoff({status: "completed", strategyFingerprint, readySteps: [], pendingMandatoryStepIds: []})});
  const investigated = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 3, runtime: investigationRuntime.runtime});
  equal(investigationRuntime.counters().investigations, 1);
  equal(investigated.iterations[0].action, "investigation");
  equal(investigated.phase, "completed");

  const unsupportedInvestigationRuntime = runtime({facades: [facade({investigate: true})]});
  const unsupportedInvestigation = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: unsupportedInvestigationRuntime.runtime});
  equal(unsupportedInvestigation.stopReason, "unsupported_capability");
  equal(unsupportedInvestigationRuntime.counters().investigations, 0);

  const reloadRuntime = runtime({facades: [facade({authorize: true})]});
  const authBeforeReload = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: reloadRuntime.runtime});
  const recoveredOnly = recoverAutonomousSupervisedLoop({checkpoint: authBeforeReload.checkpoint});
  equal(recoveredOnly.canAutoResume, false);
  const reopened = await runAutonomousSupervisedLoop({caseId: CASE, intent: "start", maxIterations: 2, runtime: reloadRuntime.runtime});
  equal(reopened.stopReason, "explicit_continuation_required");
  equal(reloadRuntime.counters().observes, 1, "Abrir no reanuda ni vuelve a observar");
  const authAfterReload = await runAutonomousSupervisedLoop({caseId: CASE, intent: "continue", maxIterations: 2, runtime: reloadRuntime.runtime});
  equal(authAfterReload.stopReason, "authorization_required");
  equal(reloadRuntime.counters().executions, 0);
  const persistedJson = JSON.stringify(reloadRuntime.checkpoint()).toLowerCase();
  check(!persistedJson.includes("token"));
  check(!persistedJson.includes("approval"));
  check(!persistedJson.includes("payload"));

  const checkpoint = complete.checkpoint!;
  equal(validateAutonomousSupervisedLoopCheckpoint(checkpoint).valid, true);
  equal(checkpoint.history.length, 2);
  check(checkpoint.history.every((entry) => !Object.keys(entry).some((key) => ["payload", "token", "authorization"].includes(key))));
  const staleRecovery = recoverAutonomousSupervisedLoop({checkpoint, current: {strategyFingerprint: "sha256-v1:different"}});
  equal(staleRecovery.status, "stale");
  equal(staleRecovery.canAutoResume, false);
  const absentRecovery = recoverAutonomousSupervisedLoop({});
  equal(absentRecovery.status, "absent");
  equal(absentRecovery.canAutoResume, false);

  equal(autonomousSupervisedLoopSecurity.fullyAutonomous, false);
  equal(autonomousSupervisedLoopSecurity.directExecutorCalls, false);
  equal(autonomousSupervisedLoopSecurity.editorialWritesOutsideAu7, false);
  equal(autonomousSupervisedLoopSecurity.checkpointWritesViaAu3, true);
  equal(autonomousSupervisedLoopSecurity.automaticReconciliation, false);
  equal(autonomousSupervisedLoopSecurity.automaticCompensation, false);
  equal(autonomousSupervisedLoopSecurity.persistsAuthorization, false);
  equal(autonomousSupervisedLoopSecurity.autoResumeOnRecovery, false);
  equal(autonomousSupervisedLoopSecurity.arbitraryNetworkAccess, false);

  const engineSource = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/editorialDecision/supervisedLoop/engine.ts", import.meta.url), "utf8");
  check(!engineSource.includes("executeTransactionStep"));
  check(!engineSource.includes("executeTransactionBatch"));
  check(!engineSource.includes("executeTransactionCompensation"));
  check(!engineSource.includes("sanityClient"));
  check(!engineSource.includes("fetch("));
  check(!engineSource.includes("localStorage"));
  check(assertions >= 90, `Se esperaban al menos 90 comprobaciones y hubo ${assertions}`);
  console.log(`AU8 B5 autonomous supervised loop tests: OK (${assertions} assertions; explicit recovery, AU7-only handoff, reevaluation, no-progress, budget, concurrency and zero real writes)`);
}

void main();
