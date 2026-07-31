import assert from "node:assert/strict";
import {readFileSync, readdirSync, statSync} from "node:fs";
import {join, resolve} from "node:path";
import {
  applyReconciliationDecision, assessReconciliationFreshness, buildReconciliationReviewCase,
  buildReconciliationReviewCases, createInMemoryCorpusAdapter, getEntityIdentityProfile,
  readReconciliationCheckpoint, registerReconciliationReviewCase, scanExistingEntities, validateCorpusScanRequest,
  validateReconciliationDecisionRequest, type EntityKind,
} from "../_laboratorio/laboratorio-ia/src/review/entityReconciliation";
import {getReviewCases, setReviewCaseRepositoryForTests} from "../_laboratorio/laboratorio-ia/src/review/store/reviewStore";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";

const now = new Date("2026-07-31T12:00:00.000Z");
const request = (kind: EntityKind) => ({version: 1 as const, kind, scope: "all" as const, limit: 100, maxGroups: 20, maxBlockSize: 10});
const refs = (count = 0) => ({status: "known", count, sampleDocumentIds: count ? ["ref-1"] : []});
const scan = (kind: EntityKind, records: unknown[], status: "complete" | "partial" | "truncated" | "unavailable" = "complete") => scanExistingEntities(createInMemoryCorpusAdapter({[kind]: records}, status), request(kind), undefined, now);

async function main() {
  const fighters = await scan("fighter", [
    {_id: "fighter-a", _rev: "1", nombre: "Ada Fighter", slug: {current: "ada-fighter"}, externalIds: [{namespace: "ufc", value: "42"}], disciplina: "mma", organizacion: "ufc", referenceImpact: refs(3)},
    {_id: "fighter-b", _rev: "2", nombre: "Ada Fighter", slug: {current: "ada-fighter-ufc"}, externalIds: [{namespace: "ufc", value: "42"}], disciplina: "mma", organizacion: "ufc", referenceImpact: refs(1)},
  ]);
  assert.equal(fighters.groups.length, 1);
  assert.equal(fighters.groups[0].state, "candidate");
  assert.equal(fighters.groups[0].pairs[0].evidence.some((item) => item.strategy === "external_id"), true);
  assert.notEqual(fighters.groups[0].state, "confirmed_duplicate");
  assert.equal(fighters.groups[0].canonical.reasons.length > 0, true);

  const conflictingFighters = await scan("fighter", [
    {_id: "fa", nombre: "Alex Lee", externalIds: [{namespace: "ufc", value: "1"}], disciplina: "mma", referenceImpact: refs()},
    {_id: "fb", nombre: "Alex Lee", externalIds: [{namespace: "ufc", value: "2"}], disciplina: "kickboxing", referenceImpact: refs()},
  ]);
  assert.equal(conflictingFighters.groups[0].state, "blocked");
  assert.equal(conflictingFighters.groups[0].pairs[0].conflicts.length >= 2, true);

  const events = await scan("event", [
    {_id: "event-a", nombre: "Fight Night 10", fecha: "2026-10-01", organizacion: "org", externalIds: [{namespace: "ufc:event", value: "10"}], referenceImpact: refs()},
    {_id: "event-b", nombre: "Fight Night Ten", fecha: "2026-10-01", organizacion: "org", externalIds: [{namespace: "ufc:event", value: "10"}], referenceImpact: refs()},
  ]);
  assert.equal(events.groups.length, 1);
  const recurring = await scan("event", [{_id: "e1", nombre: "Fight Night", fecha: "2025-01-01", organizacion: "one", referenceImpact: refs()}, {_id: "e2", nombre: "Fight Night", fecha: "2026-01-01", organizacion: "ufc", referenceImpact: refs()}]);
  assert.equal(recurring.groups[0].state, "blocked");
  assert.equal(recurring.groups[0].pairs[0].conflicts.some((item) => item.code === "date_conflict"), true);

  const organizations = await scan("organization", [{_id: "o1", nombre: "ACA", aliases: ["Absolute Championship"], paisOrigen: "España", sitioWeb: "https://aca.es", referenceImpact: refs()}, {_id: "o2", nombre: "ACA", aliases: ["Absolute Championship"], paisOrigen: "USA", sitioWeb: "https://aca.com", referenceImpact: refs()}]);
  assert.equal(organizations.groups[0].state, "blocked");
  assert.equal(organizations.groups[0].pairs[0].conflicts.some((item) => item.code === "country_conflict"), true);
  const categories = await scan("weight_category", [{_id: "c1", nombre: "Ligero", disciplina: "mma", limitePeso: 70, unidad: "kg", tipoLimite: "hasta", sexo: "masculino", referenceImpact: refs()}, {_id: "c2", nombre: "Ligero", disciplina: "boxeo", limitePeso: 61, unidad: "kg", tipoLimite: "hasta", sexo: "masculino", referenceImpact: refs()}]);
  assert.equal(categories.groups[0].state, "blocked");
  assert.equal(categories.groups[0].pairs[0].conflicts.some((item) => item.code.includes("weight_")), true);

  const variants = await scan("fighter", [{_id: "drafts.same", _rev: "draft", nombre: "Sam Same", slug: {current: "sam-same"}, externalIds: [{namespace: "one", value: "same"}], disciplina: "mma", referenceImpact: refs()}, {_id: "same", _rev: "published", nombre: "Samuel Same", slug: {current: "sam-same"}, externalIds: [{namespace: "one", value: "same"}], disciplina: "mma", referenceImpact: refs()}, {_id: "other", nombre: "Sam Same", externalIds: [{namespace: "one", value: "same"}], disciplina: "mma", referenceImpact: refs()}]);
  assert.equal(variants.groups[0].members.find((item) => item.logicalId === "same")?.variants.length, 2);
  assert.equal(variants.groups[0].members.find((item) => item.logicalId === "same")?.contexts.draftPublishedDifference, true);
  const repeated = await scan("fighter", [{_id: "fighter-a", nombre: "Ada Fighter", externalIds: [{namespace: "ufc", value: "42"}], referenceImpact: refs()}, {_id: "fighter-b", nombre: "Ada Fighter", externalIds: [{namespace: "ufc", value: "42"}], referenceImpact: refs()}]);
  const repeatedAgain = await scan("fighter", [{_id: "fighter-b", nombre: "Ada Fighter", externalIds: [{namespace: "ufc", value: "42"}], referenceImpact: refs()}, {_id: "fighter-a", nombre: "Ada Fighter", externalIds: [{namespace: "ufc", value: "42"}], referenceImpact: refs()}]);
  assert.equal(repeated.scanFingerprint, repeatedAgain.scanFingerprint);
  assert.equal(buildReconciliationReviewCases(repeated)[0].id, buildReconciliationReviewCases(repeatedAgain)[0].id);
  let storedCases: ReviewCase[] = []; const restoreStore = setReviewCaseRepositoryForTests({load: () => structuredClone(storedCases), save: (items) => { storedCases = structuredClone([...items]); }});
  try {
    assert.equal(registerReconciliationReviewCase(buildReconciliationReviewCases(repeated)[0]).status, "accepted");
    assert.equal(registerReconciliationReviewCase(buildReconciliationReviewCases(repeatedAgain)[0]).status, "already_registered");
    const changed = await scan("fighter", [{_id: "fighter-a", nombre: "Ada Fighter updated", externalIds: [{namespace: "ufc", value: "42"}], referenceImpact: refs()}, {_id: "fighter-b", nombre: "Ada Fighter", externalIds: [{namespace: "ufc", value: "42"}], referenceImpact: refs()}]);
    assert.equal(registerReconciliationReviewCase(buildReconciliationReviewCases(changed)[0]).status, "accepted");
    assert.equal(getReviewCases().some((item) => item.id !== buildReconciliationReviewCases(changed)[0].id && item.status === "stale"), true);
  } finally { restoreStore(); }

  const partial = await scan("fighter", [{_id: "pa", nombre: "Partial", externalIds: [{namespace: "x", value: "p"}], referenceImpact: refs()}, {_id: "pb", nombre: "Partial", externalIds: [{namespace: "x", value: "p"}], referenceImpact: refs()}], "partial");
  assert.equal(partial.groups[0].state, "needs_review");
  const unavailable = await scan("fighter", [], "unavailable"); assert.equal(unavailable.status, "unavailable"); assert.equal(unavailable.groups.length, 0);
  const aborted = new AbortController(); aborted.abort(); const cancelled = await scanExistingEntities(createInMemoryCorpusAdapter({fighter: []}), request("fighter"), aborted.signal, now); assert.equal(cancelled.status, "cancelled");
  assert.throws(() => validateCorpusScanRequest({...request("fighter"), limit: 1000}), /limits/);
  assert.throws(() => validateCorpusScanRequest({...request("fighter"), groq: "*[]"}), /unexpected/);

  const reviewCase = buildReconciliationReviewCase(fighters.groups[0], fighters);
  const checkpoint = readReconciliationCheckpoint(reviewCase); assert.equal(checkpoint.groupFingerprint, fighters.groups[0].groupFingerprint);
  const confirm = {version: 1 as const, caseId: reviewCase.id, entityKind: checkpoint.group.kind, expectedCaseVersion: 1, expectedRulesVersion: checkpoint.rulesVersion, expectedGroupFingerprint: checkpoint.groupFingerprint, decision: "confirm_duplicate" as const, actor: "operator-1", canonicalLogicalId: checkpoint.group.canonical.logicalId};
  const confirmedContext = applyReconciliationDecision(reviewCase, confirm, now); const confirmed = readReconciliationCheckpoint({...reviewCase, context: confirmedContext});
  assert.equal(confirmed.state, "confirmed_duplicate"); assert.equal(confirmed.proposedPlan?.status, "proposed"); assert.equal(confirmed.decision?.actor, "operator-1");
  for (const decision of ["mark_not_duplicate", "defer"] as const) { const result = readReconciliationCheckpoint({...reviewCase, context: applyReconciliationDecision(reviewCase, {...confirm, decision, canonicalLogicalId: undefined}, now)}); assert.equal(result.state, decision === "mark_not_duplicate" ? "not_duplicate" : "deferred"); }
  assert.throws(() => applyReconciliationDecision(reviewCase, {...confirm, expectedCaseVersion: 2}, now), /changed/);
  assert.throws(() => applyReconciliationDecision(reviewCase, {...confirm, expectedGroupFingerprint: "sha256-v1:forged"}, now), /evidence/);
  assert.throws(() => applyReconciliationDecision(reviewCase, {...confirm, canonicalLogicalId: "outsider"}, now), /canonical/);
  const partialCase = buildReconciliationReviewCase(partial.groups[0], partial);
  assert.throws(() => applyReconciliationDecision(partialCase, {...confirm, caseId: partialCase.id, expectedGroupFingerprint: partial.groups[0].groupFingerprint, canonicalLogicalId: partial.groups[0].canonical.logicalId}, now), /incomplete/);
  assert.equal(assessReconciliationFreshness(reviewCase, checkpoint.groupFingerprint), "fresh"); assert.equal(assessReconciliationFreshness(reviewCase, "changed"), "stale");
  assert.throws(() => validateReconciliationDecisionRequest({...confirm, members: ["forged"]}), /unexpected/);
  assert.equal(confirmed.proposedPlan?.steps.length, 4); assert.equal(confirmed.proposedPlan?.referenceImpact.status, "known");

  for (const kind of ["fighter", "event", "organization", "weight_category"] as const) { const profile = getEntityIdentityProfile(kind); assert.equal(profile.kind, kind); assert.equal(profile.allowedStrategies.length > 2, true); assert.equal(profile.requiredProjectionFields.length > 2, true); }
  const domain = resolve("_laboratorio/laboratorio-ia/src/review/entityReconciliation"); const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => { const path = join(dir, name); return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : []; });
  const sources = files(domain).concat([resolve("app/api/review/entity-reconciliation/scan/route.ts"), resolve("app/api/review/entity-reconciliation/decision/route.ts")]);
  for (const path of sources) { const source = readFileSync(path, "utf8"); for (const forbidden of [".create(", ".patch(", ".delete(", ".transaction(", ".mutate(", ".upsert("]) assert.equal(source.includes(forbidden), false, `${path}:${forbidden}`); }
  const scanRoute = readFileSync(resolve("app/api/review/entity-reconciliation/scan/route.ts"), "utf8"); assert.equal(scanRoute.includes("export async function POST"), true); assert.equal(scanRoute.includes("MAX_BODY_BYTES"), true); assert.equal(scanRoute.includes("[0...251]"), true); assert.equal(scanRoute.includes("records.slice(0, scanRequest.limit + 1)"), true);
  const center = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/components/ReviewCenter.tsx"), "utf8"); assert.equal(center.includes("ReconciliationScanControls"), true);
  const details = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/components/ReviewCaseDetails.tsx"), "utf8"); assert.equal(details.includes("ReconciliationCasePanel"), true);
  console.log("AU5 existing entity reconciliation tests: OK (read-only, 4 profiles, workflow and UI contracts)");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
