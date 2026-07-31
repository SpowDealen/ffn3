import assert from "node:assert/strict";
import {createEntityOperationRegistry, fighterEntityOperationAdapter, type EntityOperationAdapter, type OperationEvidence} from "../_laboratorio/laboratorio-ia/src/review/entityOperations";
import {topologicalSortResolutionGraph} from "../_laboratorio/laboratorio-ia/src/review/resolutionGraph";
import {buildGlobalResolutionPlan, validateGlobalResolutionPlan, type GlobalResolutionPlanningInput, type PreparedEntityPlanningInput} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";
import type {ReviewEffect} from "../_laboratorio/laboratorio-ia/src/review/universal/types";

const now = "2026-07-27T14:00:00.000Z";
const evidence: OperationEvidence[] = [{id: "evidence:prepared", kind: "controlled_source", source: "test", value: {source: "controlled"}, confidence: .98, limitations: []}];

function reviewCase(options: {snapshot?: boolean; producer?: boolean; operation?: boolean; resolutions?: ReviewCase["resolutions"]} = {}): ReviewCase {
  return {
    schemaVersion: 1,
    id: "case:au2:planner",
    dedupeKey: "case:au2:planner",
    module: "external.news",
    title: "Pilot fighter planning",
    status: "open",
    priority: "high",
    subject: {type: "external_news", id: "news:1"},
    issues: [{id: "issue:fighter", kind: "missing_entity", valueKind: "fighter", fieldPath: "fighter", label: "Fighter", message: "Missing fighter", required: true, blocking: true}],
    resolutions: options.resolutions ?? [{type: "create_entity", issueId: "issue:fighter", entityType: "fighter", draft: {name: "Ada Fighter", disciplineId: "discipline:boxing", organizationIds: ["organization:test"], identityKey: "fighter:ada-fighter:boxing"}}],
    context: {
      ...(options.producer === false ? {} : {producer: "external_news"}),
      ...(options.operation === false ? {} : {operation: "create_draft"}),
      ...(options.snapshot === false ? {} : {payloadSnapshot: {id: "news:1", title: "News"}}),
    },
    createdAt: now,
    updatedAt: now,
    version: 1,
    resumeAttempts: 0,
  };
}

function prepared(overrides: Partial<PreparedEntityPlanningInput> = {}): PreparedEntityPlanningInput {
  return {
    issueId: "issue:fighter",
    entityType: "fighter",
    draft: {name: "Ada Fighter", disciplineId: "discipline:boxing", organizationIds: ["organization:test"], identityKey: "fighter:ada-fighter:boxing"},
    identityKey: "fighter:ada-fighter:boxing",
    valid: true,
    evidence: [...evidence],
    ...overrides,
  };
}

function pilot(overrides: Partial<GlobalResolutionPlanningInput> = {}) {
  return buildGlobalResolutionPlan({reviewCase: reviewCase(), preparedEntities: [prepared()], evidence: evidence.map((item) => ({...item, issueId: "issue:fighter"})), finalEntityType: "noticia", now: () => now, ...overrides});
}

function blockerCodes(result: ReturnType<typeof buildGlobalResolutionPlan>): string[] {
  return result.ok ? result.plan.blockers.map((blocker) => blocker.code) : result.issues.map((blocker) => blocker.code);
}

function contractAdapter(entityType: EntityOperationAdapter["entityType"]): EntityOperationAdapter {
  return {entityType, knownOperations: ["find_entity", "create_entity", "reuse_entity", "replace_reference", "validate_entity"], support: {find_entity: "contract_only", create_entity: "contract_only", reuse_entity: "contract_only", replace_reference: "contract_only", validate_entity: "contract_only"}, minimumRequirements: [], identityFields: ["identity"], futureCapability: `future:${entityType}`};
}

function testPilot(): void {
  const result = pilot();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const plan = result.plan;
  assert.equal(plan.structurallyValid, true);
  assert.equal(plan.executable, false);
  assert.equal(plan.status, "blocked");
  assert.equal(validateGlobalResolutionPlan(plan).valid, true);
  assert.deepEqual(plan.operations.map((operation) => operation.kind).sort(), ["create_entity", "find_entity", "find_entity", "replace_reference", "validate_entity", "validate_entity", "validate_entity"].sort());
  const create = plan.operations.find((operation) => operation.kind === "create_entity" && operation.entityType === "luchador");
  const identityGuard = plan.operations.find((operation) => operation.requiredCapability === "resolve_identity:fighter");
  assert.ok(create && identityGuard && create.dependencyIds.includes(identityGuard.id));
  const ordered = topologicalSortResolutionGraph(plan.graph);
  assert.equal(ordered.valid, true);
  const resume = plan.graph.nodes.find((node) => node.isResumeNode);
  assert.ok(resume);
  assert.equal(ordered.nodeIds.at(-1), resume?.id);
  assert.equal(plan.blockers.some((blocker) => blocker.code === "operation_not_executable"), true);

  const reuse = pilot({preparedEntities: [prepared({existingEntityId: "fighter:existing"})]});
  assert.equal(reuse.ok, true);
  if (reuse.ok) { assert.equal(reuse.plan.operations.some((operation) => operation.kind === "reuse_entity"), true); assert.notEqual(plan.fingerprint, reuse.plan.fingerprint); }
}

function testBlockers(): void {
  const lowEvidence = [{...evidence[0], confidence: .4}];
  assert.equal(blockerCodes(pilot({preparedEntities: [prepared({evidence: lowEvidence})], evidence: lowEvidence.map((item) => ({...item, issueId: "issue:fighter"}))})).includes("insufficient_confidence"), true);
  assert.equal(blockerCodes(pilot({preparedEntities: [prepared({candidateEntityIds: ["fighter:a", "fighter:b"]})]})).includes("ambiguous_entity_candidate"), true);
  assert.equal(blockerCodes(pilot({preparedEntities: [prepared({draft: {name: "Ada", identityKey: "fighter:ada"}})]})).includes("missing_required_reference"), true);
  assert.equal(blockerCodes(pilot({reviewCase: reviewCase({snapshot: false})})).includes("missing_snapshot"), true);
  assert.equal(blockerCodes(pilot({reviewCase: reviewCase({producer: false, operation: false})})).includes("missing_producer"), true);
  assert.equal(blockerCodes(pilot({finalEntityType: undefined})).includes("missing_final_validation"), true);
  assert.equal(blockerCodes(buildGlobalResolutionPlan({reviewCase: reviewCase(), effects: [{id: "unknown", type: "set_field", path: "title", value: "X"}], now: () => now})).includes("ambiguous_effect_mapping"), true);
  assert.equal(blockerCodes(buildGlobalResolutionPlan({reviewCase: reviewCase(), effects: [{id: "danger", type: "merge_entities", entityType: "fighter", sourceIds: ["a"], targetId: "b"}], finalEntityType: "luchador", policy: {maximumRisk: "low"}, now: () => now})).includes("risk_exceeds_policy"), true);

  const missingAdapter = buildGlobalResolutionPlan({reviewCase: reviewCase(), effects: [{id: "discipline", type: "create_entity", entityType: "disciplina", payload: {name: "Boxeo"}}], finalEntityType: "noticia", now: () => now});
  assert.equal(blockerCodes(missingAdapter).includes("missing_entity_adapter"), true);
  const registry = createEntityOperationRegistry();
  registry.register({...fighterEntityOperationAdapter, knownOperations: ["find_entity"], support: {find_entity: "contract_only"}}, {replace: true});
  assert.equal(blockerCodes(pilot({entityRegistry: registry})).includes("unsupported_operation"), true);
}

function testDeterminismAndDependencies(): void {
  const first = pilot(); const second = pilot();
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.plan.fingerprint, second.plan.fingerprint);
  assert.equal(first.plan.id, second.plan.id);
  const changedPolicy = pilot({policy: {minimumCreateConfidence: .95}});
  assert.equal(changedPolicy.ok, true);
  if (changedPolicy.ok) assert.notEqual(first.plan.fingerprint, changedPolicy.plan.fingerprint);
  const changedVersion = pilot({reviewCase: {...reviewCase(), version: 2}});
  assert.equal(changedVersion.ok, true);
  if (changedVersion.ok) assert.notEqual(first.plan.fingerprint, changedVersion.plan.fingerprint);
  const secondEvidence: OperationEvidence = {id: "evidence:second", kind: "controlled_source", source: "test", value: {source: "second"}, confidence: .98, limitations: []};
  const evidenceForward = [...evidence, secondEvidence];
  const evidenceReverse = [...evidenceForward].reverse();
  const reorderedEvidenceA = pilot({preparedEntities: [prepared({evidence: evidenceForward})], evidence: evidenceForward.map((item) => ({...item, issueId: "issue:fighter"}))});
  const reorderedEvidenceB = pilot({preparedEntities: [prepared({evidence: evidenceReverse})], evidence: evidenceReverse.map((item) => ({...item, issueId: "issue:fighter"}))});
  assert.equal(reorderedEvidenceA.ok && reorderedEvidenceB.ok, true);
  if (reorderedEvidenceA.ok && reorderedEvidenceB.ok) assert.equal(reorderedEvidenceA.plan.fingerprint, reorderedEvidenceB.plan.fingerprint);

  const registry = createEntityOperationRegistry();
  ["categoriaPeso", "luchador", "combate", "evento", "noticia"].forEach((entityType) => registry.register(contractAdapter(entityType as EntityOperationAdapter["entityType"])));
  const effects: ReviewEffect[] = [
    {id: "category", type: "create_entity", entityType: "categoriaPeso", payload: {name: "Lightweight"}},
    {id: "fighter", type: "create_entity", entityType: "luchador", payload: {name: "Ada"}},
    {id: "fight", type: "create_entity", entityType: "combate", payload: {name: "Fight"}},
    {id: "event", type: "create_entity", entityType: "evento", payload: {name: "Event"}},
    {id: "duplicate-fighter", type: "create_entity", entityType: "luchador", payload: {name: "Ada"}},
    {id: "reference", type: "replace_reference", path: "fighter", referenceId: "fighter:ada"},
  ];
  const result = buildGlobalResolutionPlan({reviewCase: reviewCase({resolutions: []}), effects, finalEntityType: "luchador", entityRegistry: registry, dependencyHints: [{consumerEntityType: "luchador", dependencyEntityType: "categoriaPeso", reason: "Categoría requerida."}, {consumerEntityType: "combate", dependencyEntityType: "luchador", reason: "Participante requerido."}, {consumerEntityType: "evento", dependencyEntityType: "combate", reason: "Cartelera preparada."}], now: () => now});
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const creates = result.plan.operations.filter((operation) => operation.kind === "create_entity");
  assert.equal(creates.filter((operation) => operation.entityType === "luchador").length, 1);
  const category = creates.find((operation) => operation.entityType === "categoriaPeso");
  const fighter = creates.find((operation) => operation.entityType === "luchador");
  const fight = creates.find((operation) => operation.entityType === "combate");
  const event = creates.find((operation) => operation.entityType === "evento");
  assert.ok(category && fighter && fight && event);
  assert.equal(fighter?.dependencyIds.includes(category!.id), true);
  assert.equal(fight?.dependencyIds.includes(fighter!.id), true);
  assert.equal(event?.dependencyIds.includes(fight!.id), true);
  const reference = result.plan.operations.find((operation) => operation.kind === "replace_reference");
  assert.equal(reference?.dependencyIds.includes(fighter!.id), true);

  const duplicateEffects = effects.filter((effect) => effect.id === "fighter" || effect.id === "duplicate-fighter");
  const forward = buildGlobalResolutionPlan({reviewCase: reviewCase({resolutions: []}), effects: duplicateEffects, finalEntityType: "luchador", entityRegistry: registry, now: () => now});
  const reverse = buildGlobalResolutionPlan({reviewCase: reviewCase({resolutions: []}), effects: [...duplicateEffects].reverse(), finalEntityType: "luchador", entityRegistry: registry, now: () => now});
  assert.equal(forward.ok && reverse.ok, true);
  if (forward.ok && reverse.ok) assert.equal(forward.plan.fingerprint, reverse.plan.fingerprint);

  const immutableCase = reviewCase(); const before = JSON.parse(JSON.stringify(immutableCase));
  buildGlobalResolutionPlan({reviewCase: immutableCase, preparedEntities: [prepared()], evidence: evidence.map((item) => ({...item, issueId: "issue:fighter"})), finalEntityType: "noticia", now: () => now});
  assert.deepEqual(immutableCase, before);
}

function main(): void {
  testPilot();
  testBlockers();
  testDeterminismAndDependencies();
  console.log("AU2 global resolution planner tests: OK");
}

main();
