import type {ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import type {CreateKnowledgeItemInput, CreateKnowledgeObservationInput, CreateKnowledgeProvenanceInput, CreateKnowledgeSourceInput, KnowledgeConflict, KnowledgeFingerprint, KnowledgeItem, KnowledgeObservation, KnowledgeProvenance, KnowledgeRecommendation, KnowledgeSource, KnowledgeValidity, KnowledgeValidityState} from "./types";
import {UNIVERSAL_EDITORIAL_KNOWLEDGE_FINGERPRINT_VERSION, UNIVERSAL_EDITORIAL_KNOWLEDGE_VERSION} from "./types";

const fp = (value: unknown): KnowledgeFingerprint => computeUniversalFingerprint(value as ReviewJsonValue);
const unique = <T extends string>(items: readonly T[]): readonly T[] => Object.freeze([...new Set(items)].sort());
const iso = (value: string, code: string): string => { if (!value || Number.isNaN(Date.parse(value))) throw new Error(code); return new Date(value).toISOString(); };
const safe = (value: string, code: string, max = 500): string => { const normalized = value.trim().replace(/\s+/g, " "); if (!normalized || normalized.length > max) throw new Error(code); return normalized; };

export function buildKnowledgeSource(input: CreateKnowledgeSourceInput): KnowledgeSource {
  const body = {sourceId: safe(input.sourceId, "knowledge_source_id_invalid", 180), kind: input.kind, authority: input.authority, sourceVersion: safe(input.sourceVersion, "knowledge_source_version_invalid", 80), observedAt: iso(input.observedAt, "knowledge_source_observed_at_invalid"), independenceGroup: safe(input.independenceGroup, "knowledge_independence_group_invalid", 120)};
  return Object.freeze({...body, provenanceFingerprint: fp({...body, observedAt: undefined})});
}

export function buildKnowledgeProvenance(input: CreateKnowledgeProvenanceInput): KnowledgeProvenance {
  const body = {caseId: safe(input.caseId, "knowledge_case_id_invalid", 180), caseVersion: input.caseVersion, producerId: safe(input.producerId, "knowledge_producer_id_invalid", 180), engineVersions: Object.freeze({...input.engineVersions}), checkpointFingerprint: input.checkpointFingerprint, inspectionFingerprints: unique(input.inspectionFingerprints), identityFingerprints: unique(input.identityFingerprints), resolutionFingerprint: input.resolutionFingerprint, transactionFingerprint: input.transactionFingerprint, decisionFingerprint: input.decisionFingerprint, sufficiencyFingerprint: input.sufficiencyFingerprint, autonomyFingerprint: input.autonomyFingerprint, strategyFingerprint: input.strategyFingerprint, outcomeFingerprints: unique(input.outcomeFingerprints), memoryFingerprints: unique(input.memoryFingerprints)};
  if (!Number.isInteger(body.caseVersion) || body.caseVersion < 0) throw new Error("knowledge_case_version_invalid");
  return Object.freeze({...body, provenanceFingerprint: fp(body)});
}

function observation(input: KnowledgeObservation | CreateKnowledgeObservationInput): KnowledgeObservation {
  const semantic = {claimCode: safe(input.claimCode, "knowledge_claim_code_invalid", 120), subjectKey: safe(input.subjectKey, "knowledge_subject_key_invalid", 180), polarity: input.polarity, safeSummary: safe(input.safeSummary, "knowledge_observation_summary_invalid"), valueFingerprint: input.valueFingerprint, evidenceFingerprints: unique(input.evidenceFingerprints), sourceIds: unique(input.sourceIds), observedAt: iso(input.observedAt, "knowledge_observed_at_invalid")};
  const observationFingerprint = fp({...semantic, observedAt: undefined});
  if ("observationFingerprint" in input && input.observationFingerprint !== observationFingerprint) throw new Error("knowledge_observation_fingerprint_mismatch");
  return Object.freeze({...semantic, observationId: `knowledge-observation:${observationFingerprint.slice(-24)}`, observationFingerprint});
}

function validityAt(validity: KnowledgeValidity, at: string): KnowledgeValidityState {
  if (validity.state === "invalidated" || validity.invalidatedAt) return "invalidated";
  if (validity.state === "superseded" || validity.supersededAt || validity.supersededBy) return "superseded";
  if (validity.state === "contradictory") return "contradictory";
  if (validity.state === "under_review") return "under_review";
  const instant = Date.parse(at);
  if (validity.validUntil && instant > Date.parse(validity.validUntil)) return "expired";
  if (validity.state === "temporal" || validity.validUntil) return "temporal";
  return "current";
}

export function evaluateKnowledgeValidity(item: Pick<KnowledgeItem, "validity">, evaluatedAt: string): KnowledgeValidity {
  const at = iso(evaluatedAt, "knowledge_evaluated_at_invalid");
  return Object.freeze({...item.validity, state: validityAt(item.validity, at), evaluatedAt: at});
}

function normalizeValidity(validity: KnowledgeValidity): KnowledgeValidity {
  const normalized: KnowledgeValidity = {...validity, validFrom: iso(validity.validFrom, "knowledge_valid_from_invalid"), validUntil: validity.validUntil ? iso(validity.validUntil, "knowledge_valid_until_invalid") : undefined, invalidatedAt: validity.invalidatedAt ? iso(validity.invalidatedAt, "knowledge_invalidated_at_invalid") : undefined, supersededAt: validity.supersededAt ? iso(validity.supersededAt, "knowledge_superseded_at_invalid") : undefined, evaluatedAt: iso(validity.evaluatedAt, "knowledge_evaluated_at_invalid")};
  if (normalized.validUntil && Date.parse(normalized.validUntil) < Date.parse(normalized.validFrom)) throw new Error("knowledge_validity_range_invalid");
  return Object.freeze({...normalized, state: validityAt(normalized, normalized.evaluatedAt)});
}

function semantic(item: Omit<KnowledgeItem, "id" | "knowledgeFingerprint" | "createdAt" | "updatedAt">): ReviewJsonValue {
  return {...item, observations: item.observations.map((entry) => ({...entry, observedAt: undefined})), sources: item.sources.map((entry) => ({...entry, observedAt: undefined})), validity: {state: item.validity.state, validFrom: item.validity.state === "temporal" ? item.validity.validFrom : undefined, validUntil: item.validity.state === "temporal" ? item.validity.validUntil : undefined, invalidationReasonCode: item.validity.invalidationReasonCode, supersededBy: item.validity.supersededBy}} as unknown as ReviewJsonValue;
}

export function createKnowledgeItem(input: CreateKnowledgeItemInput, now: () => string = () => new Date().toISOString()): KnowledgeItem {
  const observations = Object.freeze(input.observations.map(observation).sort((a, b) => a.observationFingerprint.localeCompare(b.observationFingerprint)));
  const sources = Object.freeze([...input.sources].map((item) => buildKnowledgeSource(item)).sort((a, b) => a.sourceId.localeCompare(b.sourceId)));
  const sourceIds = new Set(sources.map((item) => item.sourceId));
  if (!observations.length || observations.some((item) => item.sourceIds.some((id) => !sourceIds.has(id)))) throw new Error("knowledge_observation_source_invalid");
  const validity = normalizeValidity(input.validity);
  const createdAt = iso(input.createdAt ?? now(), "knowledge_created_at_invalid");
  const updatedAt = iso(input.updatedAt ?? createdAt, "knowledge_updated_at_invalid");
  const subjectKey = safe(input.subjectKey, "knowledge_subject_key_invalid", 180);
  const claimCode = safe(input.claimCode, "knowledge_claim_code_invalid", 120);
  const provenance = buildKnowledgeProvenance(input.provenance);
  const base = Object.freeze({schemaVersion: UNIVERSAL_EDITORIAL_KNOWLEDGE_VERSION, fingerprintVersion: UNIVERSAL_EDITORIAL_KNOWLEDGE_FINGERPRINT_VERSION, revision: input.revision ?? 1, domain: input.domain, kind: input.kind, subjectKey, claimCode, safeSummary: safe(input.safeSummary, "knowledge_summary_invalid"), authority: input.authority, observations, sources, references: Object.freeze([...input.references].sort((a, b) => `${a.kind}:${a.id}:${a.relation}`.localeCompare(`${b.kind}:${b.id}:${b.relation}`))), conflicts: Object.freeze([...(input.conflicts ?? [])].sort((a, b) => a.conflictFingerprint.localeCompare(b.conflictFingerprint))), recommendations: Object.freeze([...(input.recommendations ?? [])].sort((a, b) => a.recommendationFingerprint.localeCompare(b.recommendationFingerprint))), validity, provenance, contentFingerprint: fp({domain: input.domain, kind: input.kind, subjectKey, claimCode, observations: observations.map((item) => item.observationFingerprint)}), serializable: true as const, advisoryOnly: true as const, replacesCurrentEvidence: false as const});
  if (!Number.isInteger(base.revision) || base.revision < 1) throw new Error("knowledge_revision_invalid");
  const knowledgeFingerprint = fp(semantic(base));
  return Object.freeze({...base, id: `knowledge:${knowledgeFingerprint.slice(-24)}`, knowledgeFingerprint, createdAt, updatedAt});
}

export function deduplicateKnowledgeItems(items: readonly KnowledgeItem[]): readonly KnowledgeItem[] {
  const byFingerprint = new Map<string, KnowledgeItem>();
  for (const item of [...items].sort((a, b) => a.knowledgeFingerprint.localeCompare(b.knowledgeFingerprint) || b.revision - a.revision || b.updatedAt.localeCompare(a.updatedAt))) if (!byFingerprint.has(item.knowledgeFingerprint)) byFingerprint.set(item.knowledgeFingerprint, item);
  return Object.freeze([...byFingerprint.values()]);
}

export function detectKnowledgeConflicts(items: readonly KnowledgeItem[]): readonly KnowledgeConflict[] {
  const groups = new Map<string, KnowledgeItem[]>();
  for (const item of deduplicateKnowledgeItems(items)) { const key = `${item.domain}:${item.subjectKey}:${item.claimCode}`; groups.set(key, [...(groups.get(key) ?? []), item]); }
  const conflicts: KnowledgeConflict[] = [];
  for (const group of groups.values()) {
    const observations = group.flatMap((item) => item.observations);
    const supports = observations.filter((item) => item.polarity === "supports");
    const contradicts = observations.filter((item) => item.polarity === "contradicts");
    if (!supports.length || !contradicts.length) continue;
    const knowledgeItemIds = unique(group.map((item) => item.id));
    const observationFingerprints = unique([...supports, ...contradicts].map((item) => item.observationFingerprint));
    const body = {subjectKey: group[0].subjectKey, claimCode: group[0].claimCode, knowledgeItemIds, observationFingerprints, severity: group.some((item) => item.authority === "authoritative") ? "critical" as const : "blocking" as const, reasonCodes: unique(["knowledge_polarity_conflict"]), requiresCurrentEvidence: true as const};
    const conflictFingerprint = fp(body);
    conflicts.push(Object.freeze({...body, conflictId: `knowledge-conflict:${conflictFingerprint.slice(-24)}`, conflictFingerprint}));
  }
  return Object.freeze(conflicts.sort((a, b) => a.conflictFingerprint.localeCompare(b.conflictFingerprint)));
}

export function buildKnowledgeRecommendation(input: Omit<KnowledgeRecommendation, "recommendationId" | "recommendationFingerprint" | "advisoryOnly" | "requiresCurrentEvidence">): KnowledgeRecommendation {
  const body = {action: input.action, safeSummary: safe(input.safeSummary, "knowledge_recommendation_summary_invalid"), reasonCodes: unique(input.reasonCodes), supportingKnowledgeIds: unique(input.supportingKnowledgeIds), advisoryOnly: true as const, requiresCurrentEvidence: true as const};
  const recommendationFingerprint = fp(body);
  return Object.freeze({...body, recommendationId: `knowledge-recommendation:${recommendationFingerprint.slice(-24)}`, recommendationFingerprint});
}

export function invalidateKnowledgeItem(item: KnowledgeItem, input: {reasonCode: string; invalidatedAt: string}): KnowledgeItem {
  return createKnowledgeItem({...item, kind: "invalidated_knowledge", revision: item.revision + 1, validity: {...item.validity, state: "invalidated", invalidatedAt: iso(input.invalidatedAt, "knowledge_invalidated_at_invalid"), invalidationReasonCode: safe(input.reasonCode, "knowledge_invalidation_reason_invalid", 120), evaluatedAt: input.invalidatedAt}, createdAt: item.createdAt, updatedAt: input.invalidatedAt});
}

export function supersedeKnowledgeItem(item: KnowledgeItem, input: {supersededBy: string; supersededAt: string}): KnowledgeItem {
  return createKnowledgeItem({...item, revision: item.revision + 1, validity: {...item.validity, state: "superseded", supersededAt: iso(input.supersededAt, "knowledge_superseded_at_invalid"), supersededBy: safe(input.supersededBy, "knowledge_superseded_by_invalid", 180), evaluatedAt: input.supersededAt}, references: [...item.references, {kind: "knowledge", id: input.supersededBy, relation: "supersedes"}], createdAt: item.createdAt, updatedAt: input.supersededAt});
}

export function validateKnowledgeItem(item: KnowledgeItem): Readonly<{valid: boolean; reasonCodes: readonly string[]}> {
  const reasons: string[] = [];
  try {
    const rebuilt = createKnowledgeItem({...item, createdAt: item.createdAt, updatedAt: item.updatedAt});
    if (rebuilt.id !== item.id || rebuilt.knowledgeFingerprint !== item.knowledgeFingerprint || rebuilt.contentFingerprint !== item.contentFingerprint) reasons.push("knowledge_fingerprint_mismatch");
    if (item.schemaVersion !== UNIVERSAL_EDITORIAL_KNOWLEDGE_VERSION || item.fingerprintVersion !== UNIVERSAL_EDITORIAL_KNOWLEDGE_FINGERPRINT_VERSION) reasons.push("knowledge_version_unsupported");
    if (!item.serializable || !item.advisoryOnly || item.replacesCurrentEvidence) reasons.push("knowledge_security_contract_invalid");
  } catch (error) { reasons.push(error instanceof Error ? error.message : "knowledge_item_invalid"); }
  return Object.freeze({valid: reasons.length === 0, reasonCodes: unique(reasons)});
}

export function serializeKnowledgeItem(item: KnowledgeItem): string { const checked = validateKnowledgeItem(item); if (!checked.valid) throw new Error(`knowledge_item_invalid:${checked.reasonCodes.join(",")}`); return JSON.stringify(item); }
export function parseKnowledgeItem(serialized: string): KnowledgeItem { const value = JSON.parse(serialized) as KnowledgeItem; const checked = validateKnowledgeItem(value); if (!checked.valid) throw new Error(`knowledge_item_invalid:${checked.reasonCodes.join(",")}`); return createKnowledgeItem({...value, createdAt: value.createdAt, updatedAt: value.updatedAt}); }
