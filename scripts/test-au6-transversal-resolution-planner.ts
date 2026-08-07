import assert from "node:assert/strict";
import {CandidateDiscoveryRegistry, CandidateDiscoveryService, createSanityFighterCandidateDiscoveryAdapter, createSanityMultiEntityCandidateDiscoveryAdapter, type EntityResolutionResult, type UniversalEntityType} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity";
import {createInMemoryCandidateReader} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity/discovery/devFixture";
import {buildTransversalResolutionPlan, createGlobalResolutionCheckpoint, identityCreationGuardForCreation, pilotCapabilityRegistry, resolveIdentityCreationPreflight, transversalResolutionPlannerSecurity, type IdentityCreationPreflight, type TransversalPlanningRequirement} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import type {ReviewCase, ReviewJsonObject} from "../_laboratorio/laboratorio-ia/src/review/types";

const now = "2026-08-07T14:00:00.000Z";
const evidence = (id: string) => ({id, kind: "source", source: "fixture", confidence: .99, limitations: []});
const reviewCase = (id: string, finalType = "noticia"): ReviewCase => ({schemaVersion: 1, id, dedupeKey: id, module: "external.news", title: id, status: "open", priority: "high", subject: {type: finalType}, issues: [], resolutions: [], context: {producer: "review_center", operation: "resume_case", payloadSnapshot: {id}}, createdAt: now, updatedAt: now, version: 1, resumeAttempts: 0});
const resolution = (entityType: UniversalEntityType, status: EntityResolutionResult["status"], candidateId?: string): EntityResolutionResult => ({status, entityType, candidateId, candidates: [], reasonCodes: [status === "reuse" ? "unique_exact_match" : status === "create_new" ? "search_complete_no_relevant_match" : status], inputFingerprint: `sha256-v1:input${entityType}`, resolutionFingerprint: `sha256-v1:resolution${entityType}${status}`});
const provisionalProof = (operationId: string, entityType: UniversalEntityType): IdentityCreationPreflight => ({operationId, entityType, state: "safe_to_create", decision: "create_new", guardFingerprint: `sha256-v1:provisional${operationId}`} as IdentityCreationPreflight);
const fighterPayload = (name: string): ReviewJsonObject => ({nombre: name, disciplineId: "discipline:mma", organizationIds: ["organization:ufc"]});

function discoveryService() {
  const registry = new CandidateDiscoveryRegistry();
  registry.register(createSanityFighterCandidateDiscoveryAdapter(createInMemoryCandidateReader([])));
  const reader = {readCandidates: async () => ({status: "complete" as const, records: []})};
  registry.register(createSanityMultiEntityCandidateDiscoveryAdapter("event", reader));
  registry.register(createSanityMultiEntityCandidateDiscoveryAdapter("organization", reader));
  registry.register(createSanityMultiEntityCandidateDiscoveryAdapter("weight_category", reader));
  return new CandidateDiscoveryService(registry);
}

async function authorizeCreates(caseValue: ReviewCase, requirements: readonly TransversalPlanningRequirement[], finalEntityType: "noticia" | "combate" = "noticia") {
  const provisional = buildTransversalResolutionPlan({reviewCase: caseValue, requirements, finalEntityType, policy: {availableCapabilities: ["resolve_identity:fighter", "resolve_identity:event", "resolve_identity:organization", "resolve_identity:weight_category", "create:luchador", "create:evento", "create:organizacion", "create:categoriaPeso", "validate:noticia", "validate:combate", "resume:review_center"]}, now: () => now});
  assert.equal(provisional.ok, true); if (!provisional.ok) throw new Error("provisional_plan_failed");
  const service = discoveryService(); const proofs = new Map<string, IdentityCreationPreflight>();
  for (const requirement of requirements.filter((item) => item.creationPreflight?.state === "safe_to_create")) {
    const guard = identityCreationGuardForCreation(provisional.value.plan.operations, requirement.creationPreflight!.operationId); assert.ok(guard, requirement.id);
    proofs.set(requirement.id, await resolveIdentityCreationPreflight({plan: provisional.value.plan, guardOperationId: guard!.id, service, now: () => now}));
  }
  const authorizedRequirements = requirements.map((item) => proofs.has(item.id) ? {...item, creationPreflight: proofs.get(item.id)!} : item);
  const authorized = buildTransversalResolutionPlan({reviewCase: caseValue, requirements: authorizedRequirements, finalEntityType, policy: {availableCapabilities: ["resolve_identity:fighter", "resolve_identity:event", "resolve_identity:organization", "resolve_identity:weight_category", "create:luchador", "create:evento", "create:organizacion", "create:categoriaPeso", "validate:noticia", "validate:combate", "resume:review_center"]}, now: () => now});
  assert.equal(authorized.ok, true); if (!authorized.ok) throw new Error("authorized_plan_failed");
  return authorized.value;
}

async function main() {
  const newsRequirements: TransversalPlanningRequirement[] = [
    {id: "organization", role: "entity", entityType: "organization", resolution: resolution("organization", "reuse", "organization:ufc"), evidence: [evidence("org")]},
    {id: "fighter-a", role: "entity", entityType: "fighter", resolution: resolution("fighter", "create_new"), creationPreflight: provisionalProof("create:fighter-a", "fighter"), preparedPayload: fighterPayload("Ada Alpha"), fieldPath: "luchadoresRelacionados[0]", dependsOn: ["organization"], evidence: [evidence("fighter-a")]},
    {id: "fighter-b", role: "entity", entityType: "fighter", resolution: resolution("fighter", "create_new"), creationPreflight: provisionalProof("create:fighter-b", "fighter"), preparedPayload: fighterPayload("Bea Beta"), fieldPath: "luchadoresRelacionados[1]", dependsOn: ["organization"], evidence: [evidence("fighter-b")]},
  ];
  const news = await authorizeCreates(reviewCase("case:b5:news"), newsRequirements);
  assert.deepEqual(news.decisions.filter((item) => item.decision === "create").map((item) => item.requirementId), ["fighter-a", "fighter-b"]);
  assert.equal(news.decisions.find((item) => item.requirementId === "organization")?.decision, "reuse");
  assert.equal(news.plan.operations.filter((item) => item.kind === "create_entity").every((item) => item.dependencyIds.some((id) => id.startsWith("identity-guard:"))), true);
  assert.equal(news.plan.operations.find((item) => item.payload && typeof item.payload === "object" && !Array.isArray(item.payload) && item.payload.scope === "resume")?.dependencyIds.some((id) => news.plan.operations.some((operation) => operation.id === id && operation.payload && typeof operation.payload === "object" && !Array.isArray(operation.payload) && operation.payload.scope === "final_payload")), true);
  assert.equal(news.executionAllowed, false); assert.equal(news.writes, false);
  const repeated = await authorizeCreates(reviewCase("case:b5:news"), newsRequirements);
  assert.equal(repeated.plan.fingerprint, news.plan.fingerprint); assert.equal(repeated.decisionFingerprint, news.decisionFingerprint); assert.deepEqual(repeated.orderedOperationIds, news.orderedOperationIds);

  const eventRequirements: TransversalPlanningRequirement[] = [
    {id: "org", role: "entity", entityType: "organization", resolution: resolution("organization", "reuse", "organization:ufc"), evidence: [evidence("event-org")]},
    {id: "category-light", role: "entity", entityType: "weight_category", resolution: resolution("weight_category", "reuse", "category:light"), evidence: [evidence("cat-light")]},
    {id: "category-heavy", role: "entity", entityType: "weight_category", resolution: resolution("weight_category", "reuse", "category:heavy"), evidence: [evidence("cat-heavy")]},
    ...[1, 2, 3].map((index): TransversalPlanningRequirement => ({id: `fight-${index}`, role: "entity", entityType: "fight", resolution: resolution("fight", "reuse", `fight:${index}`), dependsOn: ["org", index === 3 ? "category-heavy" : "category-light"], evidence: [evidence(`fight-${index}`)]})),
  ];
  const event = buildTransversalResolutionPlan({reviewCase: reviewCase("case:b5:event", "evento"), requirements: eventRequirements, finalEntityType: "evento", completionMode: "entity_resolution", now: () => now});
  assert.equal(event.ok, true, JSON.stringify(event)); if (!event.ok) throw new Error("event_plan_failed");
  assert.equal(event.value.decisions.filter((item) => item.decision === "reuse").length, 6);
  for (const fight of event.value.plan.operations.filter((item) => item.entityType === "combate")) assert.equal(fight.dependencyIds.length >= 2, true);

  const resultRequirements: TransversalPlanningRequirement[] = [
    {id: "event", role: "entity", entityType: "event", resolution: resolution("event", "reuse", "event:308"), evidence: [evidence("result-event")]},
    {id: "fighter", role: "entity", entityType: "fighter", resolution: resolution("fighter", "create_new"), creationPreflight: provisionalProof("create:result-fighter", "fighter"), preparedPayload: fighterPayload("New Result Fighter"), dependsOn: ["event"], evidence: [evidence("result-fighter")]},
    {id: "broken-reference", role: "repair_reference", entityType: "event", referenceId: "event:308", fieldPath: "evento", dependsOn: ["event"], evidence: [evidence("broken-reference")]},
    {id: "editorial-validation", role: "validate", entityType: "fight", dependsOn: ["event", "fighter"], evidence: [evidence("validation")]},
  ];
  const resultPlan = await authorizeCreates(reviewCase("case:b5:result", "combate"), resultRequirements, "combate");
  assert.equal(resultPlan.decisions.find((item) => item.requirementId === "event")?.decision, "reuse");
  assert.equal(resultPlan.decisions.find((item) => item.requirementId === "fighter")?.decision, "create");
  assert.equal(resultPlan.decisions.find((item) => item.requirementId === "broken-reference")?.decision, "repair_reference");
  assert.equal(resultPlan.decisions.find((item) => item.requirementId === "editorial-validation")?.decision, "validate");

  const ambiguous = buildTransversalResolutionPlan({reviewCase: reviewCase("case:b5:ambiguous"), requirements: [{id: "ambiguous", role: "entity", entityType: "organization", resolution: resolution("organization", "ambiguous"), evidence: [evidence("ambiguous")]}], completionMode: "entity_resolution", now: () => now});
  assert.equal(ambiguous.ok, true); if (!ambiguous.ok) throw new Error("ambiguous_plan_failed");
  assert.equal(ambiguous.value.decisions[0].decision, "blocked"); assert.equal(ambiguous.value.plan.blockers.some((item) => item.code === "ambiguous_entity_candidate"), true);
  const investigate = buildTransversalResolutionPlan({reviewCase: reviewCase("case:b5:investigate"), requirements: [{id: "unknown", role: "entity", entityType: "fighter", evidence: [evidence("unknown")]}], completionMode: "entity_resolution", now: () => now});
  assert.equal(investigate.ok, true); if (!investigate.ok) throw new Error("investigation_plan_failed"); assert.equal(investigate.value.decisions[0].decision, "investigate");
  const reconciled = buildTransversalResolutionPlan({reviewCase: reviewCase("case:b5:reconciled"), requirements: [{id: "reconciled", role: "entity", entityType: "event", reconciliation: {status: "confirmed_succeeded", outcome: {outcome: "created", documentId: "event:reconciled"}, assessmentFingerprint: "sha256-v1:reconciled"} as never, evidence: [evidence("reconciled")]}], completionMode: "entity_resolution", now: () => now});
  assert.equal(reconciled.ok, true); if (!reconciled.ok) throw new Error("reconciled_plan_failed"); assert.equal(reconciled.value.decisions[0].decision, "reuse"); assert.equal(reconciled.value.decisions[0].candidateId, "event:reconciled");

  const fixtureCapabilities = new Map(pilotCapabilityRegistry.list().map((item) => [item.id, item]));
  for (const id of news.plan.requiredCapabilities) if (!fixtureCapabilities.has(id)) fixtureCapabilities.set(id, {id, support: "contract_only", operationKinds: ["find_entity", "create_entity", "reuse_entity", "replace_reference", "validate_entity"], description: "B5 fixture"});
  const checkpoint = createGlobalResolutionCheckpoint({reviewCase: reviewCase("case:b5:news"), plan: news.plan, capabilities: [...fixtureCapabilities.values()], phase: "planned", now: () => now});
  assert.equal(checkpoint.planFingerprint, news.plan.fingerprint); assert.equal(checkpoint.phase, "planned");
  assert.deepEqual(transversalResolutionPlannerSecurity, {writes: false, executes: false, mutatesCase: false, callerDecision: false, reuseBeforeCreate: true, creationGuardRequired: true, ambiguityBlocks: true, validationBeforeResume: true});
  console.log("AU6 B5 transversal resolution planner tests: OK (multi-entity, reuse/create/investigate/repair/validate/resume, determinism and checkpoint)");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
