import type {ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import {buildKnowledgeProvenance, buildKnowledgeSource, createKnowledgeItem} from "./model";
import type {KnowledgeDomain, KnowledgeFingerprint, KnowledgeKind, KnowledgeObservationPolarity, KnowledgeSource} from "./types";
import {KNOWLEDGE_EXTRACTION_VERSION, type ExtractedKnowledgeObservation, type KnowledgeExtractionInput, type KnowledgeExtractionResult} from "./extractionTypes";

const fp = (value: unknown): KnowledgeFingerprint => computeUniversalFingerprint(value as ReviewJsonValue);
const unique = <T extends string>(items: readonly T[]): readonly T[] => Object.freeze([...new Set(items)].sort());
const domain = (value?: string): KnowledgeDomain => ({noticia: "news", news: "news", evento: "event", event: "event", luchador: "fighter", fighter: "fighter", organizacion: "organization", organization: "organization", categoriaPeso: "weight_category", weight_category: "weight_category", combate: "fight", fight: "fight", resultado: "result", result: "result", relation: "relationship", relationship: "relationship"}[value ?? ""] as KnowledgeDomain | undefined) ?? "relationship";

function outcomeFingerprint(input: KnowledgeExtractionInput): KnowledgeFingerprint {
  const outcome = input.outcome;
  return fp({id: outcome.id, caseId: outcome.caseId, issueId: outcome.issueId, resolutionId: outcome.resolutionId, decisionFingerprint: outcome.decisionFingerprint, contextFingerprint: outcome.contextFingerprint, inputFingerprint: outcome.inputFingerprint, evidenceFingerprint: outcome.evidenceFingerprint, producer: outcome.producer, entityType: outcome.entityType, issueType: outcome.issueType, decisionType: outcome.decisionType, statuses: [outcome.currentStatus, outcome.technicalStatus, outcome.structuralStatus, outcome.editorialStatus, outcome.operationalStatus], reconciliationRequired: outcome.reconciliationRequired, conflicts: unique(outcome.conflicts)});
}

function sources(input: KnowledgeExtractionInput): readonly KnowledgeSource[] {
  const values: KnowledgeSource[] = [buildKnowledgeSource({sourceId: `outcome:${input.outcome.id}`, kind: "outcome", authority: input.outcome.editorialStatus === "confirmed" ? "editorial_confirmed" : "historical", sourceVersion: input.outcome.engineVersion, observedAt: input.outcome.updatedAt, independenceGroup: `outcome:${input.outcome.producer}`})];
  if (input.checkpoint) values.push(buildKnowledgeSource({sourceId: `checkpoint:${input.checkpoint.id}`, kind: "checkpoint", authority: "corroborating", sourceVersion: String(input.checkpoint.schemaVersion), observedAt: input.checkpoint.updatedAt, independenceGroup: "au3-checkpoint"}));
  for (const item of input.inspections ?? []) values.push(buildKnowledgeSource({sourceId: `inspection:${item.inspectionId}`, kind: "inspection", authority: item.status === "observed" ? "authoritative" : "corroborating", sourceVersion: item.inspectorVersion, observedAt: item.inspectedAt, independenceGroup: `inspection:${item.inspectorId}`}));
  if (input.decision) values.push(buildKnowledgeSource({sourceId: `decision:${input.decision.decisionFingerprint}`, kind: "decision", authority: "corroborating", sourceVersion: input.decision.version, observedAt: input.outcome.updatedAt, independenceGroup: "au8-decision"}));
  if (input.reconciliation?.length) values.push(buildKnowledgeSource({sourceId: `reconciliation:${fp(input.reconciliation.map((item) => item.assessmentFingerprint).sort())}`, kind: "reconciliation", authority: "authoritative", sourceVersion: "AU4", observedAt: input.outcome.updatedAt, independenceGroup: "au4-reconciliation"}));
  return Object.freeze([...new Map(values.map((item) => [item.sourceId, item])).values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId)));
}

function classification(input: KnowledgeExtractionInput): {kind: KnowledgeKind; polarity: KnowledgeObservationPolarity; confidence: number; reason: string} {
  const outcome = input.outcome;
  const reconciliationNotApplied = input.reconciliation?.some((item) => item.status === "confirmed_not_applied");
  const reconciliationSucceeded = input.reconciliation?.some((item) => item.status === "confirmed_succeeded" || item.status === "already_reconciled");
  const reconciliationConflict = input.reconciliation?.some((item) => !["confirmed_succeeded", "confirmed_not_applied", "already_reconciled"].includes(item.status));
  if (reconciliationConflict) return {kind: "contradiction", polarity: "contradicts", confidence: .9, reason: "outcome_conflict_observed"};
  if (reconciliationNotApplied) return {kind: "negative_evidence", polarity: "contradicts", confidence: 1, reason: "reconciliation_confirmed_not_applied"};
  if (outcome.conflicts.length || (outcome.reconciliationRequired && !reconciliationSucceeded)) return {kind: "contradiction", polarity: "contradicts", confidence: .9, reason: "outcome_conflict_observed"};
  if (outcome.currentStatus === "superseded") return {kind: "invalidated_knowledge", polarity: "contradicts", confidence: .95, reason: "outcome_superseded"};
  if (input.temporal?.validUntil) return {kind: "temporal_knowledge", polarity: "supports", confidence: outcome.editorialStatus === "confirmed" ? .95 : .7, reason: "outcome_temporal"};
  if (outcome.editorialStatus === "rejected" || outcome.currentStatus === "rejected" || outcome.currentStatus === "failed" || outcome.technicalStatus === "failed" || outcome.structuralStatus === "invalid" || outcome.operationalStatus === "failed") return {kind: "negative_evidence", polarity: "contradicts", confidence: outcome.editorialStatus === "rejected" ? .95 : .75, reason: "outcome_negative"};
  if (outcome.editorialStatus === "confirmed" || outcome.currentStatus === "editorially_confirmed" || outcome.currentStatus === "operationally_confirmed") return {kind: "confirmed_fact", polarity: "supports", confidence: outcome.operationalStatus === "completed" ? 1 : .95, reason: "outcome_confirmed"};
  if (["technically_succeeded", "structurally_validated"].includes(outcome.currentStatus)) return {kind: "historical_experience", polarity: "supports", confidence: .65, reason: "outcome_historical_only"};
  return {kind: "historical_experience", polarity: "unknown", confidence: .4, reason: "outcome_not_final"};
}

/** Outcome → KnowledgeObservation[]. No store or source system is accessed. */
export function extractKnowledgeFromOutcome(input: KnowledgeExtractionInput): KnowledgeExtractionResult {
  if (!Number.isInteger(input.caseVersion) || input.caseVersion < 0 || input.outcome.caseId.trim() === "") throw new Error("knowledge_extraction_input_invalid");
  const outcomeFp = outcomeFingerprint(input);
  const provenance = buildKnowledgeProvenance({caseId: input.outcome.caseId, caseVersion: input.caseVersion, producerId: input.outcome.producer, engineVersions: {checkpoint: input.checkpoint ? String(input.checkpoint.schemaVersion) : undefined, inspection: input.inspections?.[0]?.inspectorVersion, identity: input.identities?.length ? "AU5" : undefined, resolution: input.resolution?.version, transaction: input.transaction ? String(input.transaction.schemaVersion) : undefined, decision: input.decision?.version, sufficiency: input.sufficiency?.version, autonomy: input.autonomy?.schemaVersion, strategy: input.strategy?.schemaVersion, loop: input.loop ? String(input.loop.schemaVersion) : undefined, outcome: input.outcome.engineVersion}, checkpointFingerprint: input.checkpoint?.checkpointFingerprint as KnowledgeFingerprint | undefined, inspectionFingerprints: (input.inspections ?? []).map((item) => item.fingerprint as KnowledgeFingerprint), identityFingerprints: (input.identities ?? []).map((item) => item.resolutionFingerprint as KnowledgeFingerprint), resolutionFingerprint: input.resolution?.decisionFingerprint as KnowledgeFingerprint | undefined, transactionFingerprint: input.transaction?.transactionFingerprint as KnowledgeFingerprint | undefined, decisionFingerprint: (input.decision?.decisionFingerprint ?? input.outcome.decisionFingerprint) as KnowledgeFingerprint, sufficiencyFingerprint: input.sufficiency?.evaluationFingerprint as KnowledgeFingerprint | undefined, autonomyFingerprint: input.autonomy?.policyFingerprint as KnowledgeFingerprint | undefined, strategyFingerprint: input.strategy?.strategyFingerprint as KnowledgeFingerprint | undefined, outcomeFingerprints: [outcomeFp], memoryFingerprints: []});
  const sourceValues = sources(input);
  const selected = classification(input);
  const observedAt = input.outcome.updatedAt;
  const entityDomain = domain(input.outcome.entityType);
  const subjectKey = `${entityDomain}:${input.outcome.entityType ?? input.outcome.issueType}:${input.outcome.issueId}`;
  const claimCode = `outcome.${input.outcome.decisionType}`;
  const evidenceFingerprints = unique([input.outcome.evidenceFingerprint as KnowledgeFingerprint, outcomeFp, ...(input.inspections ?? []).map((item) => item.fingerprint as KnowledgeFingerprint), ...(input.identities ?? []).map((item) => item.resolutionFingerprint as KnowledgeFingerprint)]);
  const bare = {claimCode, subjectKey, polarity: selected.polarity, safeSummary: `Resultado ${selected.reason} para ${entityDomain}; estado editorial ${input.outcome.editorialStatus} y operacional ${input.outcome.operationalStatus}.`, valueFingerprint: fp({decision: input.outcome.decisionType, current: input.outcome.currentStatus, editorial: input.outcome.editorialStatus, operational: input.outcome.operationalStatus}), evidenceFingerprints, sourceIds: sourceValues.map((item) => item.sourceId), observedAt};
  const materialized = createKnowledgeItem({domain: entityDomain, kind: selected.kind, subjectKey, claimCode, safeSummary: bare.safeSummary, authority: input.outcome.editorialStatus === "confirmed" ? "editorial_confirmed" : "historical", observations: [bare], sources: sourceValues, references: [{kind: "case", id: input.outcome.caseId, relation: "derived_from"}, {kind: "outcome", id: input.outcome.id, relation: "derived_from", fingerprint: outcomeFp}], validity: {state: input.temporal?.validUntil ? "temporal" : selected.kind === "invalidated_knowledge" ? "invalidated" : "current", validFrom: input.temporal?.validFrom ?? observedAt, validUntil: input.temporal?.validUntil, invalidatedAt: selected.kind === "invalidated_knowledge" ? observedAt : undefined, invalidationReasonCode: selected.kind === "invalidated_knowledge" ? selected.reason : undefined, evaluatedAt: observedAt}, provenance});
  const observation = materialized.observations[0];
  const extractionSemantic = {version: KNOWLEDGE_EXTRACTION_VERSION, outcomeFingerprint: outcomeFp, observationFingerprint: observation.observationFingerprint, provenanceFingerprint: provenance.provenanceFingerprint, kind: selected.kind, confidence: selected.confidence, temporal: {state: input.temporal?.validUntil ? "temporal" : "current", validFrom: input.temporal?.validFrom, validUntil: input.temporal?.validUntil}};
  const extractionFingerprint = fp(extractionSemantic);
  const extracted: ExtractedKnowledgeObservation = Object.freeze({observation, domain: entityDomain, entityType: input.outcome.entityType, kind: selected.kind, confidence: selected.confidence, temporal: Object.freeze({state: input.temporal?.validUntil ? "temporal" : "current", validFrom: input.temporal?.validFrom ?? observedAt, validUntil: input.temporal?.validUntil}), provenance, outcomeFingerprint: outcomeFp, extractionFingerprint});
  const eligible = !["pending"].includes(input.outcome.currentStatus);
  return Object.freeze({schemaVersion: KNOWLEDGE_EXTRACTION_VERSION, caseId: input.outcome.caseId, outcomeId: input.outcome.id, observations: eligible ? Object.freeze([extracted]) : Object.freeze([]), sources: sourceValues, provenance, outcomeFingerprint: outcomeFp, extractionFingerprint, eligible, reasonCodes: Object.freeze([eligible ? selected.reason : "outcome_pending"]), readsOnly: true, writes: false});
}

export const knowledgeExtractorSecurity = Object.freeze({pure: true, input: "outcome", output: "knowledge_observation", readsOnly: true, writes: false, retrievesKnowledge: false, modifiesDecisions: false, appliesLearning: false, payloads: false, chainOfThought: false, prompts: false, secrets: false} as const);
