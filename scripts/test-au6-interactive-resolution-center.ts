import assert from "node:assert/strict";
import {
  buildTransversalInteractiveRecoveryEnvironment,
  deriveTransversalPlanningRequirements,
  generateTransversalPlanForReviewCase,
  recoverGlobalResolutionCheckpoint,
  recoverTransversalPlanView,
  transversalInteractiveSecurity,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";

const now = "2026-08-07T15:00:00.000Z";
const base = (id: string, overrides: Partial<ReviewCase> = {}): ReviewCase => ({
  schemaVersion: 1,
  id,
  dedupeKey: id,
  module: "external.news",
  title: "Caso transversal",
  status: "open",
  priority: "high",
  subject: {type: "noticia"},
  issues: [{id: "fighter", kind: "missing_entity", valueKind: "fighter", label: "Luchador", message: "Resolver luchador", required: true, candidates: [{id: "candidate:ada", sanityId: "fighter:ada", label: "Ada", value: "Ada", entityType: "fighter", confidence: .99}]}],
  resolutions: [{type: "select_candidate", issueId: "fighter", candidateId: "candidate:ada"}],
  context: {producer: "review_center", operation: "transversal_resolution"},
  createdAt: now,
  updatedAt: now,
  version: 1,
  resumeAttempts: 0,
  ...overrides,
});

function main(): void {
  const reviewCase = base("case:b6:interactive");
  const requirements = deriveTransversalPlanningRequirements(reviewCase);
  assert.equal(requirements[0]?.resolution?.status, "reuse");

  const generated = generateTransversalPlanForReviewCase(reviewCase, () => now);
  assert.equal(generated.transversal.executionAllowed, false);
  assert.equal(generated.transversal.writes, false);
  assert.equal(generated.checkpoint.phase, "planned");
  assert.equal(generated.view.operations.some((operation) => operation.action === "reuse"), true);
  assert.equal(generated.view.executionAllowed, false);
  assert.equal(generated.view.writes, false);

  const persisted = {...reviewCase, globalResolution: generated.checkpoint};
  const recovery = recoverGlobalResolutionCheckpoint(persisted, buildTransversalInteractiveRecoveryEnvironment(generated.checkpoint));
  assert.equal(recovery.status, "valid");
  const recoveredView = recoverTransversalPlanView(persisted);
  assert.equal(recoveredView.status, "fresh");
  assert.equal(recoveredView.operations.length, generated.view.operations.length);

  const stale = recoverTransversalPlanView({...persisted, context: {...persisted.context, editorialRevision: "changed"}});
  assert.equal(stale.status, "stale");
  assert.equal(stale.recoveryReasons.includes("case_fingerprint_changed"), true);

  const createCase = base("case:b6:create", {
    issues: [{id: "new-fighter", kind: "missing_entity", valueKind: "fighter", label: "Luchador", message: "Crear solo tras guard", required: true}],
    resolutions: [{type: "create_entity", issueId: "new-fighter", entityType: "fighter", draft: {nombre: "Nueva"}}],
  });
  const blocked = generateTransversalPlanForReviewCase(createCase, () => now);
  assert.equal(blocked.transversal.decisions.find((decision) => decision.requirementId === "issue:new-fighter")?.decision, "blocked");
  assert.equal(blocked.view.blockers.length > 0, true);
  assert.equal(blocked.transversal.plan.operations.some((operation) => operation.kind === "create_entity"), false);

  assert.deepEqual(transversalInteractiveSecurity, {writes: false, executes: false, automaticOperations: false, persistsOnlyCheckpoint: true, payloadsExposed: false});
  console.log("AU6 B6 interactive resolution center tests: OK (generate, checkpoint recovery, staleness, creation guard and no execution)");
}

main();
