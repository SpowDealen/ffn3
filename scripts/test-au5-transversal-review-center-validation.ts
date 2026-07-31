import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parse as parseGroq} from "groq-js";
import {
  AU5_TRANSVERSAL_FIXTURES, AU5_TRANSVERSAL_READ_STATES, buildTransversalVolume,
} from "../_laboratorio/laboratorio-ia/src/review/entityReconciliation/fixtures/transversal";
import {
  CORPUS_READ_STATUS_LABELS, ENTITY_CAPABILITY_MATRIX, ENTITY_KIND_LABELS,
  ENTITY_RECONCILIATION_CAPABILITIES, ENTITY_RECONCILIATION_RULES_VERSION,
  RECONCILIATION_STATE_LABELS, applyReconciliationDecision, assessReconciliationFreshness,
  createInMemoryCorpusAdapter, executeReconciliationDecisionAction, executeReconciliationScanAction,
  getEntityCapability, getEntityRelationships, readReconciliationCheckpoint,
  registerReconciliationReviewCase, requireEntityCapability, scanExistingEntities,
  type EntityKind, type ReconciliationDecisionRequest,
} from "../_laboratorio/laboratorio-ia/src/review/entityReconciliation";
import {getReviewCase, getReviewCases, setReviewCaseRepositoryForTests, updateReviewCaseContextIfCurrent} from "../_laboratorio/laboratorio-ia/src/review/store/reviewStore";
import type {ReviewCase, ReviewJsonObject} from "../_laboratorio/laboratorio-ia/src/review/types";
import {POST as validateDecisionRoute} from "../app/api/review/entity-reconciliation/decision/route";

const kinds = ["fighter", "event", "organization", "weight_category"] as const;
const now = new Date("2026-07-31T15:00:00.000Z");
const scanRequest = (kind: EntityKind, extra: Record<string, unknown> = {}) => ({version: 1 as const, kind, scope: "all" as const, limit: 100, maxGroups: 30, maxBlockSize: 20, ...extra});
const decisionRequest = (reviewCase: ReviewCase): ReconciliationDecisionRequest => {
  const checkpoint = readReconciliationCheckpoint(reviewCase);
  return {version: 1, caseId: reviewCase.id, entityKind: checkpoint.group.kind, expectedCaseVersion: reviewCase.version, expectedRulesVersion: checkpoint.rulesVersion, expectedGroupFingerprint: checkpoint.groupFingerprint, decision: "confirm_duplicate", actor: "auditor-transversal", canonicalLogicalId: checkpoint.group.canonical.logicalId, reason: "Fixture transversal validado"};
};

async function main() {
  assert.equal(ENTITY_CAPABILITY_MATRIX.length, kinds.length * ENTITY_RECONCILIATION_CAPABILITIES.length);
  for (const kind of kinds) {
    for (const capability of ["identity_contract", "reconciliation_scan", "impact_analysis", "decision_workflow"] as const) assert.equal(getEntityCapability(kind, capability).level, "supported", `${kind}:${capability}`);
    assert.equal(getEntityCapability(kind, "identity_discovery").level, kind === "fighter" ? "supported" : "contract_only");
    assert.equal(getEntityCapability(kind, "guarded_creation").level, kind === "fighter" ? "supported" : "out_of_scope");
    assert.equal(getEntityCapability(kind, "canonical_intake").level, kind === "fighter" ? "supported" : "out_of_scope");
    assert.equal(getEntityRelationships(kind).length >= 2, true);
  }
  assert.throws(() => requireEntityCapability("event", "guarded_creation"), /not_authorized:event/);
  assert.throws(() => getEntityCapability("other" as EntityKind, "reconciliation_scan"), /unknown/);

  let stored: ReviewCase[] = [];
  const restore = setReviewCaseRepositoryForTests({load: () => structuredClone(stored), save: (items) => { stored = structuredClone([...items]); }});
  try {
    for (const kind of kinds) {
      const adapter = createInMemoryCorpusAdapter({[kind]: [...AU5_TRANSVERSAL_FIXTURES[kind]]});
      const action = await executeReconciliationScanAction(adapter, scanRequest(kind), undefined, now);
      assert.equal(action.ok, true); assert.equal(action.scan.kind, kind); assert.equal(action.scan.status, "complete"); assert.equal(action.cases.length > 0, true, kind);
      const explainable = action.scan.groups.find((group) => group.pairs.some((pair) => pair.evidence.some((item) => item.strategy === "external_id")) && (group.state === "candidate" || group.state === "needs_review")); assert.ok(explainable, `${kind}: grupo revisable`);
      assert.equal(explainable.pairs.some((pair) => pair.evidence.length > 0), true); assert.notEqual(explainable.state, "confirmed_duplicate");
      const conflict = action.scan.groups.find((group) => group.state === "blocked"); assert.ok(conflict, `${kind}: conflicto bloqueante`); assert.equal(conflict.pairs.some((pair) => pair.conflicts.some((item) => item.blocking)), true);
      const variantMember = action.scan.groups.flatMap((group) => group.members).find((member) => member.variants.length === 2); assert.ok(variantMember, `${kind}: draft/publicado`); assert.equal(variantMember.contexts.draftPublishedDifference, true);
      assert.deepEqual(explainable.referenceImpact.relationKinds, [...getEntityRelationships(kind)].sort()); assert.equal(explainable.referenceImpact.sampleDocumentIds.length <= 12, true);

      const reviewCase = action.cases.find((item) => item.subject.id === explainable.groupId)!;
      const serialized = JSON.stringify(reviewCase); assert.equal(serialized.includes("token"), false); assert.equal(serialized.includes("*[_type"), false);
      const rehydrated = JSON.parse(serialized) as ReviewCase; assert.equal(readReconciliationCheckpoint(rehydrated).group.kind, kind);
      assert.equal(registerReconciliationReviewCase(rehydrated).status, "accepted"); assert.equal(registerReconciliationReviewCase(rehydrated).status, "already_registered");

      const request = decisionRequest(rehydrated);
      const routeResponse = await validateDecisionRoute(new Request("http://localhost/api/review/entity-reconciliation/decision", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(request)}));
      assert.equal(routeResponse.status, 200); assert.equal((await routeResponse.json() as {ok?: boolean}).ok, true);
      const decision = executeReconciliationDecisionAction(rehydrated, request, now); const saved = updateReviewCaseContextIfCurrent(rehydrated.id, rehydrated.version, decision.context); assert.ok(saved);
      const decided = readReconciliationCheckpoint(saved!); assert.equal(decided.state, "confirmed_duplicate"); assert.equal(decided.decision?.actor, "auditor-transversal"); assert.equal(decided.proposedPlan?.status, decided.group.referenceImpact.status === "known" ? "proposed" : "blocked");
      assert.throws(() => applyReconciliationDecision(saved!, request, now), /case_changed/);
      assert.throws(() => applyReconciliationDecision(rehydrated, {...request, entityKind: kinds.find((item) => item !== kind)!}, now), /kind_changed/);
      assert.throws(() => applyReconciliationDecision(rehydrated, {...request, expectedRulesVersion: "0.0.0"}, now), /rules_changed/);
      assert.throws(() => applyReconciliationDecision(rehydrated, {...request, caseId: `${request.caseId}:forged`}, now), /case_changed/);
      assert.throws(() => applyReconciliationDecision(rehydrated, {...request, canonicalLogicalId: `${kind}:outside`}, now), /canonical_not_in_group/);

      const changedLogicalId = explainable.members[0].logicalId;
      const changedRecords = [...AU5_TRANSVERSAL_FIXTURES[kind]].map((record) => {
        if (String(record._id).replace(/^drafts\./, "") !== changedLogicalId) return record;
        const currentImpact = record.referenceImpact as {count?: number};
        return {...record, _rev: "snapshot-revised", referenceImpact: {...(record.referenceImpact as object), count: (currentImpact.count ?? 0) + 1}};
      });
      const changed = await executeReconciliationScanAction(createInMemoryCorpusAdapter({[kind]: changedRecords}), scanRequest(kind), undefined, new Date("2026-07-31T15:05:00.000Z"));
      const changedCase = changed.cases.find((item) => readReconciliationCheckpoint(item).group.members.map((member) => member.logicalId).sort().join("|") === explainable.members.map((member) => member.logicalId).sort().join("|"));
      assert.ok(changedCase, `${kind}: reanálisis`); assert.equal(registerReconciliationReviewCase(changedCase!).status, "accepted");
      assert.equal(getReviewCase(rehydrated.id)?.status, "stale"); assert.equal(assessReconciliationFreshness(rehydrated, readReconciliationCheckpoint(changedCase!).groupFingerprint), "stale");
    }
  } finally { restore(); }

  for (const kind of kinds) {
    const partial = await scanExistingEntities(createInMemoryCorpusAdapter({[kind]: [...AU5_TRANSVERSAL_FIXTURES[kind]]}, "partial"), scanRequest(kind), undefined, now); assert.equal(partial.status, "partial"); assert.equal(partial.groups.every((group) => ["needs_review", "blocked", "inconclusive"].includes(group.state)), true);
    const unavailable = await scanExistingEntities(createInMemoryCorpusAdapter({[kind]: []}, "unavailable"), scanRequest(kind), undefined, now); assert.equal(unavailable.status, "unavailable"); assert.equal(unavailable.groups.length, 0);
    const volume = await scanExistingEntities(createInMemoryCorpusAdapter({[kind]: buildTransversalVolume(kind, 40)}), scanRequest(kind, {limit: 10}), undefined, now); assert.equal(volume.status, "truncated"); assert.equal(volume.cursor, "10");
    const controller = new AbortController(); controller.abort(); const cancelled = await scanExistingEntities(createInMemoryCorpusAdapter({[kind]: []}), scanRequest(kind), controller.signal, now); assert.equal(cancelled.status, "cancelled");
  }
  assert.deepEqual(AU5_TRANSVERSAL_READ_STATES, ["complete", "partial", "truncated", "unavailable", "cancelled"]);

  const baseAction = await executeReconciliationScanAction(createInMemoryCorpusAdapter({fighter: [...AU5_TRANSVERSAL_FIXTURES.fighter]}), scanRequest("fighter"), undefined, now); const validCase = baseAction.cases[0];
  const wrongKind = structuredClone(validCase); wrongKind.subject.type = "event";
  const wrongVersion = structuredClone(validCase); (wrongVersion.context.entityReconciliation as ReviewJsonObject).version = 999;
  const wrongFingerprint = structuredClone(validCase); (wrongFingerprint.context.entityReconciliation as ReviewJsonObject).groupFingerprint = "forged";
  for (const corrupt of [wrongKind, wrongVersion, wrongFingerprint]) assert.throws(() => readReconciliationCheckpoint(corrupt), /reconciliation_/);

  const invalidRoute = await validateDecisionRoute(new Request("http://localhost/api/review/entity-reconciliation/decision", {method: "POST", body: JSON.stringify({...decisionRequest(validCase), groq: "*[]"})}));
  assert.equal(invalidRoute.status, 400); const invalidBody = await invalidRoute.json() as {reasonCode?: string}; assert.equal(invalidBody.reasonCode, "unexpected_decision_field");

  const panel = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/entityReconciliation/components/ReconciliationCasePanel.tsx"), "utf8");
  for (const token of ["ENTITY_KIND_LABELS", "RECONCILIATION_STATE_LABELS", "CORPUS_READ_STATUS_LABELS", "reconciliationNoMutationMessage", "Confirmar duplicado", "Descartar duplicado", "Aplazar", "Solicitar nuevo scan"]) assert.equal(panel.includes(token), true, token);
  assert.equal(Object.keys(ENTITY_KIND_LABELS).length, 4); assert.equal(Object.keys(RECONCILIATION_STATE_LABELS).length, 8); assert.equal(Object.keys(CORPUS_READ_STATUS_LABELS).length, 5);

  const scanRoute = readFileSync(resolve("app/api/review/entity-reconciliation/scan/route.ts"), "utf8"); const decisionRoute = readFileSync(resolve("app/api/review/entity-reconciliation/decision/route.ts"), "utf8");
  for (const source of [scanRoute, decisionRoute]) { for (const forbidden of [".create(", ".patch(", ".delete(", ".transaction(", ".mutate(", ".upsert(", "fighterCreationExecutor", "editorial-agent/entities"]) assert.equal(source.includes(forbidden), false, forbidden); assert.equal(source.includes('"Cache-Control": "no-store"'), true); }
  assert.equal(scanRoute.includes("executeReconciliationScanAction"), true); assert.equal(scanRoute.includes("[0...251]"), true); assert.equal(scanRoute.includes("records.slice(0, scanRequest.limit + 1)"), true); assert.equal(scanRoute.includes("scope: scanRequest.scope"), true);
  const fixedQueries = [...scanRoute.matchAll(/(?:fighter|event|organization|weight_category): `([^`]+)`/g)].map((match) => match[1]); assert.equal(fixedQueries.length, 4); fixedQueries.forEach((query) => assert.doesNotThrow(() => parseGroq(query)));
  assert.equal(ENTITY_RECONCILIATION_RULES_VERSION, "1.0.0");
  assert.equal(getReviewCases().length, 0, "el store de test se restauró sin efectos");
  console.log("AU5 transversal Review Center validation: OK (4 entities, E2E, capability matrix, stale and read-only)");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
