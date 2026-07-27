import assert from "node:assert/strict";
import * as entity from "../_laboratorio/laboratorio-ia/src/review/entityOperations";
import * as graph from "../_laboratorio/laboratorio-ia/src/review/resolutionGraph";

const now = "2026-07-27T12:00:00.000Z";

function operation(kind: entity.EntityOperationKind, entityType: entity.EntityOperationEntityType, dependencyIds: string[] = [], payload: Record<string, unknown> = {}): entity.EntityOperation {
  return entity.buildEntityOperation({
    kind,
    entityType,
    source: "global_resolution",
    evidence: [{id: "evidence:source", kind: "source_snapshot", source: "controlled-test", value: {label: "known"}, confidence: .95, limitations: ["controlled"]}],
    confidence: .95,
    risk: "low",
    preconditions: [{id: "pre:valid", kind: "schema_valid", description: "Entrada válida.", required: true}],
    postconditions: [{id: "post:valid", kind: "schema_valid", description: "Resultado válido.", required: true}],
    dependencyIds,
    requiredCapability: "future.capability",
    compensatable: false,
    explanation: `Operación ${kind} controlada.`,
    payload: payload as unknown as import("../_laboratorio/laboratorio-ia/src/review/types").ReviewJsonValue,
  });
}

function pilotInput(states: Partial<Record<string, graph.ResolutionNodeState>> = {}): graph.BuildResolutionGraphInput {
  const find = operation("find_entity", "luchador", [], {name: "Ada Fighter"});
  const createOrReuse = operation("create_entity", "luchador", ["find-fighter"], {name: "Ada Fighter", strategy: "create_or_reuse"});
  const replaceReference = operation("replace_reference", "noticia", ["create-or-reuse-fighter"], {path: "luchadoresRelacionados"});
  const validateNews = operation("validate_entity", "noticia", ["replace-news-reference"], {scope: "news_payload"});
  const resume = operation("validate_entity", "noticia", ["validate-news"], {scope: "resume_external_news"});
  return {
    caseId: "case:au2:pilot",
    caseVersion: 1,
    producerId: "external_news",
    originalOperation: "create_draft",
    now: () => now,
    metadata: {pilot: "fighter-reference-resume"},
    nodes: [
      {id: "find-fighter", operation: find, state: states["find-fighter"]},
      {id: "create-or-reuse-fighter", operation: createOrReuse, state: states["create-or-reuse-fighter"]},
      {id: "replace-news-reference", operation: replaceReference, state: states["replace-news-reference"]},
      {id: "validate-news", operation: validateNews, state: states["validate-news"]},
      {id: "resume-external-news", operation: resume, state: states["resume-external-news"], isResumeNode: true},
    ],
  };
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function hasCode(result: graph.ResolutionGraphValidationResult, code: string): boolean { return result.errors.some((entry) => entry.code === code); }

function testEntityOperations(): void {
  const first = operation("create_entity", "luchador", ["dependency:one"], {a: 1, b: 2});
  assert.equal(entity.validateEntityOperation(first).valid, true);
  const reordered = operation("create_entity", "luchador", ["dependency:one"], {b: 2, a: 1});
  assert.equal(entity.fingerprintEntityOperation(first), entity.fingerprintEntityOperation(reordered));
  const evidenceReordered = entity.buildEntityOperation({...first, id: undefined, idempotencyKey: undefined, evidence: [...first.evidence, {id: "evidence:second", kind: "source_snapshot", source: "controlled-test", confidence: .8, limitations: []}].reverse()});
  const evidenceOrdered = entity.buildEntityOperation({...first, id: undefined, idempotencyKey: undefined, evidence: [...evidenceReordered.evidence].reverse()});
  assert.equal(entity.fingerprintEntityOperation(evidenceReordered), entity.fingerprintEntityOperation(evidenceOrdered));
  assert.notEqual(entity.fingerprintEntityOperation(first), entity.fingerprintEntityOperation(operation("create_entity", "luchador", ["dependency:one"], {a: 2, b: 1})));
  assert.notEqual(entity.fingerprintEntityOperation(first), entity.fingerprintEntityOperation(operation("create_entity", "noticia", ["dependency:one"], {a: 1, b: 2})));
  assert.notEqual(entity.fingerprintEntityOperation(first), entity.fingerprintEntityOperation(operation("create_entity", "luchador", ["dependency:two"], {a: 1, b: 2})));
  assert.notEqual(entity.fingerprintEntityOperation(first), entity.fingerprintEntityOperation(entity.buildEntityOperation({...first, id: undefined, idempotencyKey: undefined, risk: "high"})));
  const invalidConfidence = {...first, confidence: 1.1};
  assert.equal(entity.validateEntityOperation(invalidConfidence).errors.some((entry) => entry.code === "entity_operation_confidence_invalid"), true);
  const duplicateDependencies = {...first, dependencyIds: ["dependency:one", "dependency:one"]};
  assert.equal(entity.validateEntityOperation(duplicateDependencies).errors.some((entry) => entry.code === "entity_operation_dependencies_duplicated"), true);
  const registry = entity.createEntityOperationRegistry();
  const unregister = registry.register(entity.fighterEntityOperationAdapter);
  assert.equal(registry.supports("luchador", "create_entity"), "executable");
  assert.equal(registry.supports("luchador", "merge_entities"), undefined);
  assert.equal(registry.list()[0].futureCapability, "editorial.entity.luchador.write");
  unregister();
  assert.equal(registry.get("luchador"), undefined);
  assert.equal(entity.entityOperationRegistry.supports("luchador", "create_entity"), "executable");
}

function testResolutionGraph(): void {
  const pilot = graph.buildResolutionGraph(pilotInput());
  assert.equal(graph.validateResolutionGraph(pilot).valid, true);
  assert.deepEqual(graph.topologicalSortResolutionGraph(pilot).nodeIds, ["find-fighter", "create-or-reuse-fighter", "replace-news-reference", "validate-news", "resume-external-news"]);
  assert.equal(graph.deriveResolutionNodeReadiness(pilot, "find-fighter").ready, true);
  assert.equal(graph.deriveResolutionNodeReadiness(pilot, "create-or-reuse-fighter").ready, false);
  assert.equal(graph.deriveResolutionNodeReadiness(pilot, "resume-external-news").ready, false);

  const complete = graph.buildResolutionGraph(pilotInput({"find-fighter": "succeeded", "create-or-reuse-fighter": "succeeded", "replace-news-reference": "succeeded", "validate-news": "succeeded", "resume-external-news": "succeeded"}));
  assert.equal(complete.state, "succeeded");
  assert.equal(graph.validateResolutionGraph(complete).valid, true);

  const branchedA = operation("find_entity", "disciplina", [], {name: "Boxeo"});
  const branchedB = operation("find_entity", "organizacion", [], {name: "UFC"});
  const branchedC = operation("validate_entity", "evento", ["A", "B"], {name: "Event"});
  const branched = graph.buildResolutionGraph({caseId: "case:branch", caseVersion: 1, producerId: "test", originalOperation: "prepare", now: () => now, nodes: [{id: "A", operation: branchedA}, {id: "B", operation: branchedB}, {id: "C", operation: branchedC}]});
  assert.deepEqual(graph.topologicalSortResolutionGraph(branched).nodeIds, ["A", "B", "C"]);

  const missing = clone(pilot); missing.nodes[1].dependencyIds = ["missing"]; missing.nodes[1].operation.dependencyIds = ["missing"];
  assert.equal(hasCode(graph.validateResolutionGraph(missing), "missing_dependency"), true);
  const self = clone(pilot); self.nodes[1].dependencyIds = [self.nodes[1].id]; self.nodes[1].operation.dependencyIds = [self.nodes[1].id];
  assert.equal(hasCode(graph.validateResolutionGraph(self), "self_dependency"), true);
  const duplicateDependency = clone(pilot); duplicateDependency.nodes[1].dependencyIds = ["find-fighter", "find-fighter"]; duplicateDependency.nodes[1].operation.dependencyIds = ["find-fighter", "find-fighter"];
  assert.equal(hasCode(graph.validateResolutionGraph(duplicateDependency), "resolution_node_dependencies_duplicated"), true);
  const duplicateNode = clone(pilot); duplicateNode.nodes[1].id = duplicateNode.nodes[0].id;
  assert.equal(hasCode(graph.validateResolutionGraph(duplicateNode), "duplicate_node_id"), true);
  const duplicateOperation = clone(pilot); duplicateOperation.nodes[1].operation = clone(duplicateOperation.nodes[0].operation); duplicateOperation.nodes[1].idempotencyKey = duplicateOperation.nodes[0].idempotencyKey; duplicateOperation.nodes[1].dependencyIds = []; duplicateOperation.nodes[1].operation.dependencyIds = [];
  assert.equal(hasCode(graph.validateResolutionGraph(duplicateOperation), "duplicate_operation_idempotency_key"), true);
  const cycle = clone(pilot); cycle.nodes[0].dependencyIds = [cycle.nodes[1].id]; cycle.nodes[0].operation.dependencyIds = [cycle.nodes[1].id];
  assert.equal(hasCode(graph.validateResolutionGraph(cycle), "resolution_graph_cycle"), true);
  const orphan = clone(pilot); const detached = operation("validate_entity", "noticia", [], {detached: true}); orphan.nodes.push({id: "detached", operation: detached, dependencyIds: [], state: "pending", evidence: detached.evidence, risk: detached.risk, confidence: detached.confidence, preconditions: detached.preconditions, postconditions: detached.postconditions, idempotencyKey: detached.idempotencyKey, isResumeNode: false, requiredForCompletion: true});
  assert.equal(hasCode(graph.validateResolutionGraph(orphan), "orphan_node"), true);
  const premature = clone(pilot); premature.nodes[4].state = "ready";
  assert.equal(hasCode(graph.validateResolutionGraph(premature), "ready_node_dependencies_incomplete"), true);
  const invalidResume = clone(pilot); invalidResume.nodes[4].dependencyIds = []; invalidResume.nodes[4].operation.dependencyIds = [];
  assert.equal(hasCode(graph.validateResolutionGraph(invalidResume), "resume_node_without_dependencies"), true);
  const incompleteSucceeded = clone(pilot); incompleteSucceeded.state = "succeeded";
  assert.equal(hasCode(graph.validateResolutionGraph(incompleteSucceeded), "succeeded_graph_incomplete"), true);

  const sameIntentDifferentOrder = graph.buildResolutionGraph({...pilotInput(), nodes: [...pilotInput().nodes].reverse()});
  assert.equal(pilot.fingerprint, sameIntentDifferentOrder.fingerprint);
  const differentCaseVersion = graph.buildResolutionGraph({...pilotInput(), caseVersion: 2});
  assert.notEqual(pilot.fingerprint, differentCaseVersion.fingerprint);
  const changedDependencyInput = pilotInput(); changedDependencyInput.nodes[3].operation = operation("validate_entity", "noticia", ["replace-news-reference", "create-or-reuse-fighter"], {scope: "news_payload"});
  const changedDependency = graph.buildResolutionGraph(changedDependencyInput);
  assert.notEqual(pilot.fingerprint, changedDependency.fingerprint);
}

function main(): void {
  testEntityOperations();
  testResolutionGraph();
  console.log("AU2 entity operations and resolution graph tests: OK");
}

main();
