import {buildEditorialContext} from "./editorial-context";
import {buildEditorialSignals} from "./editorial-signals";
import type {EditorialContext, EditorialContextInput, EditorialEntityIntelligence, EditorialEntityReference, EditorialInsight, EditorialIntelligence, EditorialPriority, EditorialSignal, EditorialSufficiencyView} from "./editorial-model";

const PRIORITY_RANK: Readonly<Record<EditorialPriority, number>> = Object.freeze({critical: 5, high: 4, medium: 3, low: 2, informational: 1});

function entityKey(entity: EditorialEntityReference): string {
  return `${entity.kind}:${entity.id}`;
}

function strongest(left: EditorialPriority, right: EditorialPriority): EditorialPriority {
  return PRIORITY_RANK[left] >= PRIORITY_RANK[right] ? left : right;
}

export function groupEditorialSignalsByEntity(signals: readonly EditorialSignal[]): readonly EditorialEntityIntelligence[] {
  const grouped = new Map<string, {entity: EditorialEntityReference; signals: EditorialSignal[]}>();
  for (const signal of signals) {
    if (!signal.entity) continue;
    const key = entityKey(signal.entity);
    const entry = grouped.get(key) ?? {entity: signal.entity, signals: []};
    entry.signals.push(signal);
    grouped.set(key, entry);
  }
  const result = [...grouped.values()].map((entry) => {
    const ordered = [...entry.signals].sort((left, right) => left.id.localeCompare(right.id));
    const priority = ordered.reduce<EditorialPriority>((current, signal) => strongest(current, signal.priority), "informational");
    const authority = ordered.find((signal) => signal.suggestedAuthority === "Review Center")?.suggestedAuthority ?? ordered[0]?.suggestedAuthority ?? "Existing authority";
    return Object.freeze({entity: entry.entity, signalIds: Object.freeze(ordered.map((signal) => signal.id)), categories: Object.freeze([...new Set(ordered.map((signal) => signal.category))].sort()), evidenceRefs: Object.freeze([...new Set(ordered.flatMap((signal) => signal.evidence.map((reference) => reference.id)))].sort()), priority, suggestedAuthority: authority});
  });
  return Object.freeze(result.sort((left, right) => entityKey(left.entity).localeCompare(entityKey(right.entity))));
}

function appliesTo(observation: EditorialContext["observations"][number], entity?: EditorialEntityReference): boolean {
  if (!entity) return true;
  return Boolean(observation.entity && entityKey(observation.entity) === entityKey(entity));
}

export function buildEditorialSufficiencyView(context: EditorialContext, entity?: EditorialEntityReference): EditorialSufficiencyView {
  const observations = context.observations.filter((observation) => appliesTo(observation, entity));
  const conflicting = observations.filter((observation) => observation.assessment === "conflicting");
  const insufficient = observations.filter((observation) => observation.assessment === "insufficient" || observation.assessment === "ambiguous" || observation.assessment === "missing");
  const sufficient = observations.filter((observation) => observation.assessment === "sufficient");
  const selected = conflicting.length > 0 ? conflicting : insufficient.length > 0 ? insufficient : sufficient;
  const status: EditorialSufficiencyView["status"] = conflicting.length > 0 ? "conflicting" : insufficient.length > 0 ? "insufficient" : sufficient.length > 0 ? "sufficient" : "unknown";
  const reasons = Object.freeze(selected.map((observation) => `${observation.dimension}:${observation.assessment}`).sort());
  const evidenceRefs = Object.freeze([...new Set(selected.flatMap((observation) => observation.evidence.map((reference) => reference.id)))].sort());
  return Object.freeze({status, reasons, evidenceRefs, projectionOnly: true as const, decidesAutonomy: false as const, determinesReadiness: false as const});
}

function suggestedAction(signal: EditorialSignal): EditorialInsight["suggestedAction"] {
  if (signal.suggestedAuthority === "Inspection") return "inspect_evidence";
  if (signal.suggestedAuthority === "Evidence/Sufficiency" && !signal.conclusive) return "collect_more_evidence";
  return "review_editorial_anomaly";
}

export function buildEditorialInsights(signals: readonly EditorialSignal[]): readonly EditorialInsight[] {
  return Object.freeze([...signals].sort((left, right) => left.id.localeCompare(right.id)).map((signal) => Object.freeze({
    id: `ag2-insight:${signal.id}`,
    entity: signal.entity,
    relatedEntity: signal.relatedEntity,
    category: signal.category,
    priority: signal.priority,
    severity: signal.severity,
    confidence: signal.confidence,
    epistemicStatus: "recommendation" as const,
    basisEpistemicStatus: signal.epistemicStatus,
    conclusive: signal.conclusive,
    summary: signal.explanation,
    evidenceRefs: Object.freeze(signal.evidence.map((reference) => reference.id).sort()),
    suggestedAuthority: signal.suggestedAuthority,
    suggestedAction: suggestedAction(signal),
    requiresReview: true,
    sourceSignalId: signal.id,
  })));
}

export function buildEditorialIntelligence(input: EditorialContextInput): EditorialIntelligence {
  const context = buildEditorialContext(input);
  const signals = buildEditorialSignals(context);
  return Object.freeze({context, signals, entities: groupEditorialSignalsByEntity(signals), insights: buildEditorialInsights(signals), sufficiency: buildEditorialSufficiencyView(context)});
}

export const editorialInsightsSecurity = Object.freeze({pure: true, deterministic: true, projectionOnly: true, handoffOnly: true, createsReviewCase: false, fetches: false, persists: false, writes: false, executes: false, invokesAu7: false, invokesAu8: false, decidesAutonomy: false, determinesReadiness: false, usesClock: false, usesRandomness: false} as const);
