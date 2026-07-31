import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  buildFighterResolutionProposal,
  normalizeProducerFighterResolutionRequests,
  planProducerFighterResolutionBatch,
  registerFighterResolutionProposal,
  type FighterResolutionProducer,
} from "../_laboratorio/laboratorio-ia/src/review/fighterResolutionIntake";
import {registerExternalNewsGlobalResolutionRuntime} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import {getReviewCases, setReviewCaseRepositoryForTests} from "../_laboratorio/laboratorio-ia/src/review/store/reviewStore";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";

const now = "2026-07-31T10:00:00.000Z";
const producers: FighterResolutionProducer[] = ["ufc_events", "one_events", "bkfc_events", "fekm_participants"];
const eventPayload = (name = "Ada Fighter", externalId = "same-42") => ({
  confirm: true,
  event: {id: "event:42", name: "Fight Night", fightCard: [{redFighter: name, blueFighter: "Bea Fighter"}]},
  resolutionContext: {disciplineId: "drafts.discipline:mma", organizationId: "organization:source"},
  fighters: [{name, aliases: ["A. Fighter"], externalId}],
});
const fekmPayload = (name = "Ada Fighter", externalId = "same-42") => ({
  confirm: true,
  sourceReference: "fekm:event:42",
  participants: [{source: {id: "participant:42", athleteId: externalId, name}, resolutionContext: {disciplineId: "discipline:kickboxing", organizationId: "organization:fekm", categoryId: "category:60"}}],
});

async function main() {
  const requests = producers.map((producer) => {
    const normalized = normalizeProducerFighterResolutionRequests(producer, producer === "fekm_participants" ? fekmPayload() : eventPayload(), now);
    assert.equal(normalized.ok, true, producer);
    if (!normalized.ok) throw new Error(producer);
    assert.equal(normalized.requests.length, 1, producer);
    const request = normalized.requests[0];
    assert.equal(request.producer, producer);
    assert.match(request.idempotencyKey, new RegExp(`^fighter-resolution:${producer}:`));
    assert.equal(request.requestedAt, now);
    const built = buildFighterResolutionProposal(request);
    assert.equal(built.ok, true, producer);
    if (!built.ok) throw new Error(producer);
    const creation = built.proposal.plan.operations.filter((item) => item.kind === "create_entity" && item.entityType === "luchador");
    const guards = built.proposal.plan.operations.filter((item) => item.requiredCapability === "resolve_identity:fighter");
    assert.equal(creation.length, 1, producer);
    assert.equal(guards.length, 1, producer);
    assert.deepEqual(creation[0].dependencyIds.filter((id) => id === guards[0].id), [guards[0].id], producer);
    assert.equal(built.proposal.plan.operations.some((item) => item.kind === "replace_reference" || item.payload && typeof item.payload === "object" && !Array.isArray(item.payload) && item.payload.scope === "resume"), false, producer);
    const response = planProducerFighterResolutionBatch(producer, normalized.requests);
    assert.equal(response.outcome, "planned");
    assert.equal(response.summary.created, 0);
    assert.equal(response.summary.planned, 1);
    return built.proposal;
  });

  const namespaces = requests.map((item) => item.request.identity.externalIdentifiers[0]?.namespace);
  assert.deepEqual(namespaces, ["ufc:fighter", "one:fighter", "bkfc:fighter", "fekm:athlete"]);
  assert.equal(new Set(requests.map((item) => item.reviewCase.id)).size, 4, "la procedencia impide fusionar casos en el borde");

  const firstAgain = normalizeProducerFighterResolutionRequests("ufc_events", eventPayload(), now);
  assert.equal(firstAgain.ok, true);
  if (firstAgain.ok) assert.equal(firstAgain.requests[0].requestFingerprint, requests[0].request.requestFingerprint);
  for (const invalid of [
    {...eventPayload(), producer: "external_news"},
    {...eventPayload(), token: "forged"},
    {...eventPayload(), arbitrary: true},
    {...eventPayload(), fighters: [{name: "Madonna"}]},
  ]) assert.equal(normalizeProducerFighterResolutionRequests("ufc_events", invalid, now).ok, false);

  let cases: ReviewCase[] = [];
  const restoreStore = setReviewCaseRepositoryForTests({load: () => structuredClone(cases), save: (next) => { cases = structuredClone([...next]); }});
  const disposeRuntime = registerExternalNewsGlobalResolutionRuntime({fighter: {entityCreationExecutor: {checkDuplicate: async () => ({status: "none", candidates: []}), createEntity: async () => ({success: true, entityId: "never"})}}, resume: {} as never, now: () => now});
  try {
    const accepted = registerFighterResolutionProposal(requests[0]);
    assert.equal(accepted.status, "accepted");
    assert.equal(getReviewCases().length, 1);
    assert.ok(getReviewCases()[0].globalResolution);
    const repeated = registerFighterResolutionProposal(requests[0]);
    assert.equal(repeated.status, "already_registered");
    assert.equal(getReviewCases().length, 1);
    assert.equal(getReviewCases()[0].globalResolution?.plan.operations.filter((item) => item.requiredCapability === "resolve_identity:fighter").length, 1);
  } finally { disposeRuntime(); restoreStore(); }

  for (const path of ["ufc", "one", "bkfc"].map((source) => `app/api/sources/${source}/events/create-fighters/route.ts`).concat("app/api/sources/fekm/participants/create/route.ts")) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /normalizeProducerFighterResolutionRequests/);
    for (const forbidden of ["@sanity/client", "fighterCreationExecutor", "CandidateDiscovery", "checkDuplicate", "editorial-agent/entities", ".create(", ".patch(", ".delete(", ".transaction(", ".mutate("]) assert.equal(source.includes(forbidden), false, `${path}:${forbidden}`);
  }
  console.log("AU5 producer fighter intake tests: OK");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
