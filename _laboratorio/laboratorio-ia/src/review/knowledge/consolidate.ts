import type {ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import {createKnowledgeItem, detectKnowledgeConflicts} from "./model";
import {KNOWLEDGE_CONSOLIDATION_VERSION, type KnowledgeConsolidationResult, type KnowledgeExtractionResult, type KnowledgeOccurrence, type KnowledgeRecurrence, type KnowledgeRelation, type KnowledgeRelationKind} from "./extractionTypes";
import type {KnowledgeFingerprint, KnowledgeItem} from "./types";

const fp = (value: unknown): KnowledgeFingerprint => computeUniversalFingerprint(value as ReviewJsonValue);
const unique = <T extends string>(values: readonly T[]): readonly T[] => Object.freeze([...new Set(values)].sort());
const semanticKey = (item: Pick<KnowledgeItem, "domain" | "subjectKey" | "claimCode" | "kind" | "validity">): string => `${item.domain}:${item.subjectKey}:${item.claimCode}:${item.kind}${item.kind === "temporal_knowledge" ? `:${item.validity.validFrom}:${item.validity.validUntil ?? "open"}` : ""}`;
const claimKey = (item: Pick<KnowledgeItem, "domain" | "subjectKey" | "claimCode">): string => `${item.domain}:${item.subjectKey}:${item.claimCode}`;

function relation(kind: KnowledgeRelationKind, fromId: string, toId: string, reasonCodes: readonly string[]): KnowledgeRelation {
  const body = {kind, fromId, toId, reasonCodes: unique(reasonCodes)};
  return Object.freeze({...body, relationFingerprint: fp(body)});
}

function occurrence(input: {item: KnowledgeItem; observationFingerprint: KnowledgeFingerprint; outcomeFingerprint: KnowledgeFingerprint; caseId: string; caseVersion: number; producerId: string; sourceIds: readonly string[]; observedAt: string}): KnowledgeOccurrence {
  const semantic = {knowledgeFingerprint: input.item.contentFingerprint, observationFingerprint: input.observationFingerprint, provenanceFingerprint: input.item.provenance.provenanceFingerprint, outcomeFingerprint: input.outcomeFingerprint, caseId: input.caseId, caseVersion: input.caseVersion, producerId: input.producerId, sourceIds: unique(input.sourceIds)};
  const occurrenceId = `knowledge-occurrence:${fp(semantic).slice(-24)}`;
  return Object.freeze({...semantic, occurrenceId, observedAt: input.observedAt});
}

function materialize(extraction: KnowledgeExtractionResult): readonly {item: KnowledgeItem; occurrence: KnowledgeOccurrence}[] {
  return extraction.observations.map((entry) => {
    const validityState = entry.kind === "invalidated_knowledge" ? "invalidated" as const : entry.temporal.state;
    const item = createKnowledgeItem({domain: entry.domain, kind: entry.kind, subjectKey: entry.observation.subjectKey, claimCode: entry.observation.claimCode, safeSummary: entry.observation.safeSummary, authority: extraction.sources.some((source) => source.authority === "authoritative") ? "authoritative" : extraction.sources.some((source) => source.authority === "editorial_confirmed") ? "editorial_confirmed" : "historical", observations: [entry.observation], sources: extraction.sources, references: [{kind: "case", id: extraction.caseId, relation: "derived_from"}, {kind: "outcome", id: extraction.outcomeId, relation: "derived_from", fingerprint: extraction.outcomeFingerprint}], validity: {state: validityState, validFrom: entry.temporal.validFrom, validUntil: entry.temporal.validUntil, invalidatedAt: validityState === "invalidated" ? entry.observation.observedAt : undefined, invalidationReasonCode: validityState === "invalidated" ? "outcome_superseded" : undefined, evaluatedAt: entry.observation.observedAt}, provenance: entry.provenance, createdAt: entry.observation.observedAt, updatedAt: entry.observation.observedAt});
    return Object.freeze({item, occurrence: occurrence({item, observationFingerprint: entry.observation.observationFingerprint, outcomeFingerprint: entry.outcomeFingerprint, caseId: extraction.caseId, caseVersion: entry.provenance.caseVersion, producerId: entry.provenance.producerId, sourceIds: entry.observation.sourceIds, observedAt: entry.observation.observedAt})});
  });
}

function overlap(left: KnowledgeItem, right: KnowledgeItem): boolean {
  const leftStart = Date.parse(left.validity.validFrom); const rightStart = Date.parse(right.validity.validFrom);
  const leftEnd = left.validity.validUntil ? Date.parse(left.validity.validUntil) : Number.POSITIVE_INFINITY;
  const rightEnd = right.validity.validUntil ? Date.parse(right.validity.validUntil) : Number.POSITIVE_INFINITY;
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

/** Consolidates supplied projections only. It never queries, persists or retrieves for decisions. */
export function consolidateKnowledge(input: {extractions: readonly KnowledgeExtractionResult[]; existing?: readonly KnowledgeItem[]}): KnowledgeConsolidationResult {
  const extracted = [...input.extractions].sort((a, b) => a.extractionFingerprint.localeCompare(b.extractionFingerprint)).flatMap(materialize);
  const existing = [...(input.existing ?? [])].sort((a, b) => a.knowledgeFingerprint.localeCompare(b.knowledgeFingerprint));
  const groups = new Map<string, KnowledgeItem[]>();
  for (const item of [...existing, ...extracted.map((entry) => entry.item)]) groups.set(semanticKey(item), [...(groups.get(semanticKey(item)) ?? []), item]);
  const items: KnowledgeItem[] = [];
  const relations: KnowledgeRelation[] = [];
  let exactDuplicates = 0;
  let reinforcements = 0;
  for (const group of [...groups.values()].sort((a, b) => semanticKey(a[0]).localeCompare(semanticKey(b[0])))) {
    const byContent = new Map<string, KnowledgeItem[]>();
    for (const item of group) byContent.set(item.contentFingerprint, [...(byContent.get(item.contentFingerprint) ?? []), item]);
    exactDuplicates += [...byContent.values()].reduce((total, duplicates) => total + Math.max(0, duplicates.length - 1), 0);
    const uniqueItems = [...byContent.values()].map((values) => [...values].sort((a, b) => a.knowledgeFingerprint.localeCompare(b.knowledgeFingerprint))[0]);
    const primary = [...uniqueItems].sort((a, b) => a.provenance.provenanceFingerprint.localeCompare(b.provenance.provenanceFingerprint) || a.knowledgeFingerprint.localeCompare(b.knowledgeFingerprint))[0];
    if (uniqueItems.length === 1) { items.push(primary); for (const duplicate of group.filter((item) => item.id !== primary.id)) relations.push(relation("exact_duplicate", duplicate.id, primary.id, ["same_content_fingerprint"])); continue; }
    reinforcements += uniqueItems.length - 1;
    const observations = [...new Map(uniqueItems.flatMap((item) => item.observations).map((entry) => [entry.observationFingerprint, entry])).values()];
    const sources = [...new Map(uniqueItems.flatMap((item) => item.sources).map((entry) => [entry.sourceId, entry])).values()];
    const references = [...new Map(uniqueItems.flatMap((item) => item.references).map((entry) => [`${entry.kind}:${entry.id}:${entry.relation}`, entry])).values()];
    const merged = createKnowledgeItem({...primary, revision: Math.max(...uniqueItems.map((item) => item.revision)) + 1, observations, sources, references, createdAt: [...uniqueItems].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0].createdAt, updatedAt: [...uniqueItems].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0].updatedAt});
    items.push(merged);
    for (const item of uniqueItems) relations.push(relation("reinforcement", item.id, merged.id, ["equivalent_claim_additional_observation"]));
  }

  const conflicts = detectKnowledgeConflicts(items);
  for (const conflict of conflicts) for (const fromId of conflict.knowledgeItemIds) for (const toId of conflict.knowledgeItemIds) if (fromId < toId) relations.push(relation("contradiction", fromId, toId, conflict.reasonCodes));
  const byClaim = new Map<string, KnowledgeItem[]>();
  for (const item of items) byClaim.set(claimKey(item), [...(byClaim.get(claimKey(item)) ?? []), item]);
  for (const group of byClaim.values()) for (let left = 0; left < group.length; left += 1) for (let right = left + 1; right < group.length; right += 1) {
    const a = group[left]; const b = group[right];
    if (a.kind === "invalidated_knowledge" || b.kind === "invalidated_knowledge") relations.push(relation("invalidated", a.id, b.id, ["invalidated_knowledge_present"]));
    if (a.validity.state === "superseded" || b.validity.state === "superseded") relations.push(relation("superseded", a.id, b.id, ["superseded_knowledge_present"]));
    if ((a.validity.validUntil || b.validity.validUntil) && overlap(a, b)) relations.push(relation("temporal_overlap", a.id, b.id, ["validity_windows_overlap"]));
  }

  const occurrences = [...new Map(extracted.map((entry) => [entry.occurrence.occurrenceId, entry.occurrence])).values()].sort((a, b) => a.occurrenceId.localeCompare(b.occurrenceId));
  const recurrence: KnowledgeRecurrence[] = items.map((item) => {
    const relatedObservations = new Set(item.observations.map((entry) => entry.observationFingerprint));
    const entries = occurrences.filter((entry) => relatedObservations.has(entry.observationFingerprint));
    const observed = entries.map((entry) => entry.observedAt).sort();
    const body = {knowledgeId: item.id, observationCount: entries.length, independentSourceCount: new Set(entries.flatMap((entry) => entry.sourceIds)).size, producerCount: new Set(entries.map((entry) => entry.producerId)).size, caseCount: new Set(entries.map((entry) => entry.caseId)).size, occurrenceIds: unique(entries.map((entry) => entry.occurrenceId)), replacesCurrentEvidence: false as const};
    return Object.freeze({...body, firstObservedAt: observed[0] ?? item.createdAt, lastObservedAt: observed.at(-1) ?? item.updatedAt, recurrenceFingerprint: fp(body)});
  }).sort((a, b) => a.knowledgeId.localeCompare(b.knowledgeId));
  const sortedItems = Object.freeze(items.sort((a, b) => a.knowledgeFingerprint.localeCompare(b.knowledgeFingerprint)));
  const sortedRelations = Object.freeze([...new Map(relations.map((item) => [item.relationFingerprint, item])).values()].sort((a, b) => a.relationFingerprint.localeCompare(b.relationFingerprint)));
  const consolidationFingerprint = fp({version: KNOWLEDGE_CONSOLIDATION_VERSION, items: sortedItems.map((item) => item.knowledgeFingerprint), relations: sortedRelations.map((item) => item.relationFingerprint), conflicts: conflicts.map((item) => item.conflictFingerprint), occurrences: occurrences.map((item) => item.occurrenceId), recurrence: recurrence.map((item) => item.recurrenceFingerprint)});
  return Object.freeze({schemaVersion: KNOWLEDGE_CONSOLIDATION_VERSION, items: sortedItems, relations: sortedRelations, conflicts, occurrences: Object.freeze(occurrences), recurrence: Object.freeze(recurrence), exactDuplicates, reinforcements, consolidationFingerprint, advisoryOnly: true, retrievesKnowledge: false, modifiesDecisions: false, appliesLearning: false, writes: false});
}

export const knowledgeConsolidationSecurity = Object.freeze({pure: true, deterministic: true, antiDoubleLearning: true, resolvesConflicts: false, retrievesKnowledge: false, modifiesDecisions: false, appliesLearning: false, persists: false, writes: false} as const);
