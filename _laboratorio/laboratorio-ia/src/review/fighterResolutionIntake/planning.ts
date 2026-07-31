import {buildGlobalResolutionPlan, fighterIdentityGuardForCreation} from "../globalResolution";
import type {GlobalResolutionPlanningEvidence, PreparedEntityPlanningInput} from "../globalResolution";
import type {ReviewCase, ReviewJsonObject, ReviewModule} from "../types";
import {computeUniversalFingerprint} from "../universal";
import type {FighterResolutionIntakeResponse, FighterResolutionProposal, FighterResolutionRequest} from "./types";

const moduleByProducer: Record<FighterResolutionRequest["producer"], ReviewModule> = {ufc_events: "ufc.events", one_events: "one.events", bkfc_events: "bkfc.events", fekm_participants: "fekm.participants"};
const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 96);
export function buildFighterResolutionProposal(request: FighterResolutionRequest): {ok: true; proposal: FighterResolutionProposal} | {ok: false; reasonCode: string} {
  const caseId = `fighter-resolution-case:${request.requestFingerprint.slice(-20)}`;
  const issueId = `fighter-resolution-issue:${request.requestFingerprint.slice(-20)}`;
  const draft: ReviewJsonObject = {entityType: "fighter", name: request.identity.primaryLabel, aliases: [...request.identity.aliases], externalIdentifiers: request.identity.externalIdentifiers.map((item) => ({...item})), identityKey: `fighter:${slug(request.identity.primaryLabel)}`, disciplineId: request.creation.disciplineId, organizationIds: [request.creation.organizationId], sourceEvidence: [{source: request.source, producer: request.producer, sourceReference: request.sourceReference, confidence: .98}]};
  const reviewCase: ReviewCase = {schemaVersion: 1, id: caseId, dedupeKey: request.idempotencyKey, module: moduleByProducer[request.producer], title: `Resolver identidad: ${request.identity.primaryLabel}`, status: "open", priority: "high", source: request.source.toUpperCase(), subject: {type: "fighter_resolution", id: request.requestId, label: request.identity.primaryLabel}, issues: [{id: issueId, kind: "missing_entity", valueKind: "fighter", fieldPath: "fighter", label: request.identity.primaryLabel, message: "Resolver identidad antes de crear el luchador.", required: true, blocking: true, expected: {entityType: "fighter", mentionedLabel: request.identity.primaryLabel}}], resolutions: [{type: "create_entity", issueId, entityType: "fighter", draft}], context: {producer: request.producer, operation: "request_fighter_resolution", requestVersion: request.requestVersion, requestId: request.requestId, requestFingerprint: request.requestFingerprint, sourceReference: {...request.sourceReference}, payloadSnapshot: {requestId: request.requestId, identity: {primaryLabel: request.identity.primaryLabel, normalizedLabel: request.identity.normalizedLabel, aliases: [...request.identity.aliases], externalIdentifiers: request.identity.externalIdentifiers.map((item) => ({...item}))}, creation: {...request.creation}}}, createdAt: request.requestedAt, updatedAt: request.requestedAt, version: 1, resumeAttempts: 0};
  const evidence: GlobalResolutionPlanningEvidence = {issueId, id: `fighter-source:${request.requestFingerprint}`, kind: "producer_identity", source: request.source, value: {requestId: request.requestId, sourceReference: request.sourceReference}, confidence: .98, limitations: []};
  const operationEvidence = {id: evidence.id, kind: evidence.kind, source: evidence.source, value: evidence.value, confidence: evidence.confidence, limitations: [...evidence.limitations]};
  const prepared: PreparedEntityPlanningInput = {issueId, entityType: "fighter", draft, identityKey: `fighter:${slug(request.identity.primaryLabel)}`, valid: true, evidence: [operationEvidence]};
  const built = buildGlobalResolutionPlan({reviewCase, preparedEntities: [prepared], evidence: [evidence], producer: request.producer, originalOperation: "request_fighter_resolution", completionMode: "entity_resolution", policy: {availableCapabilities: ["validate:luchador_prepared", "find:luchador", "resolve_identity:fighter", "create:luchador"]}, now: () => request.requestedAt});
  if (!built.ok || !built.plan.structurallyValid) return {ok: false, reasonCode: "fighter_resolution_planning_blocked"};
  const creation = built.plan.operations.find((operation) => operation.kind === "create_entity" && operation.entityType === "luchador");
  const guard = creation ? fighterIdentityGuardForCreation(built.plan.operations, creation.id) : undefined;
  if (!creation || !guard || creation.dependencyIds.filter((id) => id === guard.id).length !== 1) return {ok: false, reasonCode: "fighter_resolution_guard_missing"};
  return {ok: true, proposal: Object.freeze({request, reviewCase, plan: built.plan, guardOperationId: guard.id, creationOperationId: creation.id})};
}

export function planProducerFighterResolutionBatch(producer: FighterResolutionRequest["producer"], requests: readonly FighterResolutionRequest[]): FighterResolutionIntakeResponse {
  const items = requests.map((request) => { const built = buildFighterResolutionProposal(request); return built.ok ? {status: "planned" as const, requestId: request.requestId, caseId: built.proposal.reviewCase.id, operationId: built.proposal.creationOperationId, guardOperationId: built.proposal.guardOperationId, proposal: built.proposal} : {status: "blocked" as const, requestId: request.requestId, reasonCode: built.reasonCode}; });
  const planned = items.filter((item) => item.status === "planned").length; const blocked = items.length - planned;
  return Object.freeze({ok: planned > 0, outcome: planned ? "planned" : "blocked", producer, items, summary: {received: requests.length, planned, blocked, rejected: 0, created: 0 as const}, registrationRequired: true as const, action: {kind: "open_review_center" as const, path: "/revision" as const}});
}

export const fighterResolutionProposalFingerprint = (proposal: FighterResolutionProposal) => computeUniversalFingerprint({request: proposal.request.requestFingerprint, caseId: proposal.reviewCase.id, plan: proposal.plan.fingerprint} as never);
