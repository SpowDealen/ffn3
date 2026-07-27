import assert from "node:assert/strict";
import {
  buildGlobalResolutionPlan,
  extractResolvedFighterReference,
  prepareExternalNewsResume,
  replaceProjectedFighterReference,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import {computeUniversalFingerprint, type UniversalPlanExecution} from "../_laboratorio/laboratorio-ia/src/review/universal";
import {getExternalNewsResumeSnapshot} from "../_laboratorio/laboratorio-ia/src/review/resume/externalNews";
import type {ReviewCase, ReviewJsonObject, ReviewJsonValue} from "../_laboratorio/laboratorio-ia/src/review/types";

const now = "2026-07-27T17:00:00.000Z";
const identityKey = "fighter:ada-fighter";
const draft: ReviewJsonObject = {
  entityType: "fighter",
  name: "Ada Fighter",
  identityKey,
  disciplineId: "discipline:boxing",
  organizationIds: ["organization:test"],
  sourceEvidence: [{source: "test"}],
};

function reviewCase(marker: string): ReviewCase {
  return {
    schemaVersion: 1,
    id: "case:reference",
    dedupeKey: "case:reference",
    module: "external.news",
    title: "Reference",
    status: "open",
    priority: "high",
    subject: {type: "external_news", id: "news:1"},
    issues: [{id: "issue:fighter", kind: "missing_entity", valueKind: "fighter", fieldPath: "fighter", label: "Fighter", message: "Missing", required: true, blocking: true}],
    resolutions: [{type: "create_entity", issueId: "issue:fighter", entityType: "fighter", draft: {name: "Ada Fighter"}}],
    context: {
      producer: "external_news",
      operation: "create_draft",
      sourceId: "source:1",
      sourceName: "Source",
      sourceUrl: "https://example.test/source",
      externalItemId: "external:1",
      createdAt: now,
      canonicalUrl: "https://example.test/news",
      payloadSnapshot: {id: "external:1", title: "Noticia válida", excerpt: "Extracto", bodyText: "Contenido válido", publishedAt: now, canonicalUrl: "https://example.test/news", image: {url: "https://example.test/image.jpg"}},
      analysisSnapshot: {analysis: {relevancia: "alta"}, resolved: {disciplina: {id: "discipline:boxing"}, organizacion: {id: "organization:test"}, luchadoresPrincipales: [{id: marker}, {id: "fighter:existing"}], luchadoresSecundarios: []}},
    },
    createdAt: now,
    updatedAt: now,
    version: 1,
    resumeAttempts: 0,
  };
}

function build() {
  const provisional = reviewCase("projected:luchador:placeholder");
  const first = buildGlobalResolutionPlan({
    reviewCase: provisional,
    preparedEntities: [{issueId: "issue:fighter", entityType: "fighter", draft, identityKey, valid: true, evidence: [{id: "e", kind: "source", source: "test", confidence: .98, limitations: []}]}],
    evidence: [{issueId: "issue:fighter", id: "e", kind: "source", source: "test", confidence: .98, limitations: []}],
    finalEntityType: "noticia",
    policy: {availableCapabilities: ["create:luchador", "replace_reference:noticia:luchador"]},
    now: () => now,
  });
  assert.equal(first.ok, true);
  if (!first.ok) throw new Error("first_plan_failed");
  const operation = first.plan.operations.find((item) => item.kind === "create_entity" && item.entityType === "luchador");
  assert.ok(operation);
  const currentCase = reviewCase(`projected:luchador:${operation.id}`);
  const rebuilt = buildGlobalResolutionPlan({
    reviewCase: currentCase,
    preparedEntities: [{issueId: "issue:fighter", entityType: "fighter", draft, identityKey, valid: true, evidence: [{id: "e", kind: "source", source: "test", confidence: .98, limitations: []}]}],
    evidence: [{issueId: "issue:fighter", id: "e", kind: "source", source: "test", confidence: .98, limitations: []}],
    finalEntityType: "noticia",
    policy: {availableCapabilities: ["create:luchador", "replace_reference:noticia:luchador"]},
    now: () => now,
  });
  assert.equal(rebuilt.ok, true);
  if (!rebuilt.ok) throw new Error("rebuilt_plan_failed");
  return {reviewCase: currentCase, plan: rebuilt.plan, operationId: operation.id};
}

function execution(operationId: string, outcome: "created" | "reused_existing" = "created", entityId = "fighter:ada", identity = identityKey): UniversalPlanExecution {
  const idempotencyKey = "universal-operation:key";
  return {
    schemaVersion: 1,
    planId: "universal-plan:reference",
    planFingerprint: "sha256-v1:plan",
    simulationFingerprint: "sha256-v1:simulation",
    stateFingerprint: "sha256-v1:state",
    status: "succeeded",
    allocations: [],
    results: [{executorId: "fighter", executorVersion: 1, executorManifestFingerprint: "sha256-v1:executor", capability: "create:luchador", status: "succeeded", effectIndexes: [0], idempotencyKey, references: [{type: "luchador", id: entityId}], output: {operationId, planId: "universal-plan:reference", idempotencyKey, entityType: "luchador", identityKey: identity, entityId, outcome, pendingFlow: "reference_replacement_and_resume", warnings: [], completedAt: now}}],
    validations: [{valid: true, planFingerprint: "sha256-v1:plan", executorId: "fighter", executionIdempotencyKey: idempotencyKey, checkedPostconditionIds: ["post"], checkedEffectIndexes: [0], errors: [], warnings: [], validatedAt: now}],
    compensations: [],
    startedAt: now,
    completedAt: now,
  };
}

function main(): void {
  const fixture = build();
  const created = extractResolvedFighterReference({execution: execution(fixture.operationId), expectedOperationId: fixture.operationId, expectedIdentityKey: identityKey});
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const reused = extractResolvedFighterReference({execution: execution(fixture.operationId, "reused_existing"), expectedOperationId: fixture.operationId, expectedIdentityKey: identityKey});
  assert.equal(reused.ok, true);
  assert.equal(extractResolvedFighterReference({execution: {...execution(fixture.operationId), status: "reconciliation_required"}, expectedOperationId: fixture.operationId, expectedIdentityKey: identityKey}).ok, false);
  assert.equal(extractResolvedFighterReference({execution: execution(fixture.operationId, "created", ""), expectedOperationId: fixture.operationId, expectedIdentityKey: identityKey}).ok, false);
  assert.equal(extractResolvedFighterReference({execution: execution(fixture.operationId, "created", "projected:luchador:x"), expectedOperationId: fixture.operationId, expectedIdentityKey: identityKey}).ok, false);
  assert.equal(extractResolvedFighterReference({execution: execution(fixture.operationId, "created", "fighter:ada", "fighter:other"), expectedOperationId: fixture.operationId, expectedIdentityKey: identityKey}).ok, false);

  const originalPayload = fixture.reviewCase.context.analysisSnapshot as ReviewJsonObject;
  const marker = `projected:luchador:${fixture.operationId}`;
  const snapshot = getExternalNewsResumeSnapshot(fixture.reviewCase.context);
  assert.equal(snapshot.complete, true);
  assert.ok(snapshot.snapshot);
  const payload = structuredClone(snapshot.snapshot.payload);
  const untouched = structuredClone(payload);
  const replaced = replaceProjectedFighterReference({payload, reference: created.reference, sourceOperationId: fixture.operationId, caseId: fixture.reviewCase.id, caseVersion: fixture.reviewCase.version, planFingerprint: fixture.plan.fingerprint, expectedPlanFingerprint: fixture.plan.fingerprint, expectedInputFingerprint: computeUniversalFingerprint(payload as ReviewJsonValue)});
  assert.equal(replaced.ok, true);
  assert.deepEqual(payload, untouched);
  if (!replaced.ok) return;
  assert.deepEqual(replaced.payload.luchadoresRelacionados, ["fighter:ada", "fighter:existing"]);
  assert.equal(replaced.changes[0].status, "replaced");
  const repeated = replaceProjectedFighterReference({payload: replaced.payload, reference: created.reference, sourceOperationId: fixture.operationId, caseId: fixture.reviewCase.id, caseVersion: fixture.reviewCase.version, planFingerprint: fixture.plan.fingerprint, expectedPlanFingerprint: fixture.plan.fingerprint});
  assert.equal(repeated.ok, true);
  if (repeated.ok) { assert.equal(repeated.status, "already_applied"); assert.equal(repeated.fingerprint, replaced.fingerprint); }
  assert.equal(replaceProjectedFighterReference({payload: {...payload, luchadoresRelacionados: ["fighter:existing"]}, reference: created.reference, sourceOperationId: fixture.operationId, caseId: fixture.reviewCase.id, caseVersion: 1, planFingerprint: fixture.plan.fingerprint, expectedPlanFingerprint: fixture.plan.fingerprint}).ok, false);
  assert.equal(replaceProjectedFighterReference({payload: {...payload, luchadoresRelacionados: [marker, marker]}, reference: created.reference, sourceOperationId: fixture.operationId, caseId: fixture.reviewCase.id, caseVersion: 1, planFingerprint: fixture.plan.fingerprint, expectedPlanFingerprint: fixture.plan.fingerprint}).ok, false);

  const prepared = prepareExternalNewsResume({reviewCase: fixture.reviewCase, plan: fixture.plan, replacement: replaced, references: [created.reference], expectedCaseVersion: 1, expectedPlanFingerprint: fixture.plan.fingerprint, now: () => now});
  assert.equal(prepared.ready, true, prepared.blockers.map((item) => item.message).join(" "));
  assert.equal(prepared.validation.valid, true);
  assert.equal(prepared.projectedGraph.nodes.find((node) => node.isResumeNode)?.state, "ready");
  assert.equal(prepared.projectedGraph.nodes.filter((node) => !node.isResumeNode).every((node) => node.state === "succeeded"), true);
  assert.equal(JSON.stringify(prepared.payload).includes("projected:"), false);
  const preparedAgain = prepareExternalNewsResume({reviewCase: fixture.reviewCase, plan: fixture.plan, replacement: replaced, references: [created.reference], expectedCaseVersion: 1, expectedPlanFingerprint: fixture.plan.fingerprint, now: () => now});
  assert.equal(preparedAgain.previewFingerprint, prepared.previewFingerprint);
  const stale = prepareExternalNewsResume({reviewCase: fixture.reviewCase, plan: fixture.plan, replacement: replaced, references: [created.reference], expectedCaseVersion: 2, expectedPlanFingerprint: fixture.plan.fingerprint, now: () => now});
  assert.equal(stale.ready, false);
  assert.equal(stale.blockers.some((item) => item.code === "stale_case"), true);
  assert.ok(originalPayload);
  console.log("AU2 fighter reference resolution tests: OK");
}

main();
