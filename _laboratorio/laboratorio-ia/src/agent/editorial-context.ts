import {AGENT_EDITORIAL_INTELLIGENCE_VERSION, type EditorialContext, type EditorialContextEntity, type EditorialContextInput, type EditorialCrossEntityRelation, type EditorialEntityReference, type EditorialEvidenceObservation, type EditorialEvidenceReference} from "./editorial-model";

const SECRET = /\b(token|secret|password|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi;
const BEARER = /\bBearer\s+[^\s,;]+/gi;

function safe(value: string): string {
  return value.replace(BEARER, "Bearer [redacted]").replace(SECRET, "$1=[redacted]").slice(0, 240);
}

function entityKey(entity: EditorialEntityReference): string {
  return `${entity.kind}:${safe(entity.id)}`;
}

function projectReference(reference: EditorialEvidenceReference): EditorialEvidenceReference {
  return Object.freeze({id: safe(reference.id), source: safe(reference.source), fingerprint: reference.fingerprint ? safe(reference.fingerprint) : undefined, inspectionId: reference.inspectionId ? safe(reference.inspectionId) : undefined, checkpointId: reference.checkpointId ? safe(reference.checkpointId) : undefined});
}

function projectObservation(observation: EditorialEvidenceObservation): EditorialEvidenceObservation {
  const projectEntity = (entity: EditorialEntityReference | undefined): EditorialEntityReference | undefined => entity ? Object.freeze({kind: entity.kind, id: safe(entity.id)}) : undefined;
  return Object.freeze({id: safe(observation.id), epistemicStatus: "observed_fact" as const, dimension: observation.dimension, assessment: observation.assessment, entity: projectEntity(observation.entity), relatedEntity: projectEntity(observation.relatedEntity), temporal: observation.temporal, evidence: Object.freeze(observation.evidence.map(projectReference).sort((left, right) => left.id.localeCompare(right.id))), reviewId: observation.reviewId ? safe(observation.reviewId) : undefined, reasonCodes: observation.reasonCodes ? Object.freeze(observation.reasonCodes.map(safe).sort()) : undefined});
}

function contextEntities(observations: readonly EditorialEvidenceObservation[]): EditorialContextEntity[] {
  const grouped = new Map<string, {entity: EditorialEntityReference; observationIds: Set<string>; reviewIds: Set<string>}>();
  for (const observation of observations) {
    for (const entity of [observation.entity, observation.relatedEntity]) {
      if (!entity) continue;
      const key = entityKey(entity);
      const entry = grouped.get(key) ?? {entity, observationIds: new Set<string>(), reviewIds: new Set<string>()};
      entry.observationIds.add(observation.id);
      if (observation.reviewId) entry.reviewIds.add(observation.reviewId);
      grouped.set(key, entry);
    }
  }
  return [...grouped.values()].map((entry) => Object.freeze({entity: entry.entity, observationIds: Object.freeze([...entry.observationIds].sort()), reviewIds: Object.freeze([...entry.reviewIds].sort())})).sort((left, right) => entityKey(left.entity).localeCompare(entityKey(right.entity)));
}

function crossRelations(observations: readonly EditorialEvidenceObservation[]): EditorialCrossEntityRelation[] {
  return observations.filter((observation) => observation.entity && observation.relatedEntity).map((observation) => Object.freeze({id: `ag2-relation:${observation.dimension}:${entityKey(observation.entity!)}:${entityKey(observation.relatedEntity!)}:${observation.id}`, left: observation.entity!, right: observation.relatedEntity!, dimension: observation.dimension, assessment: observation.assessment, evidenceRefs: Object.freeze(observation.evidence.map((reference) => reference.id).sort())})).sort((left, right) => left.id.localeCompare(right.id));
}

export function buildEditorialContext(input: EditorialContextInput): EditorialContext {
  const observations = Object.freeze((input.evidence ?? []).map(projectObservation).sort((left, right) => left.id.localeCompare(right.id)));
  const review = Object.freeze(input.snapshot.review.map((entry) => Object.freeze({id: safe(entry.id), status: entry.status, temporal: entry.temporal, blocked: entry.blocked, evidenceRefs: Object.freeze(entry.evidenceReferences.map(safe).sort()), checkpointIds: Object.freeze([entry.checkpoint?.id, entry.checkpoint?.checkpointFingerprint, entry.checkpoint?.transaction?.id, entry.checkpoint?.supervisedLoop?.id].filter((value): value is string => Boolean(value)).map(safe).sort())})).sort((left, right) => left.id.localeCompare(right.id)));
  const unhealthyDependencies = Object.freeze(input.snapshot.dependencies.filter((dependency) => ["unavailable", "blocked", "degraded"].includes(dependency.state)).map((dependency) => Object.freeze({id: safe(dependency.id), state: dependency.state, reasonCode: dependency.reason?.code ? safe(dependency.reason.code) : undefined})).sort((left, right) => left.id.localeCompare(right.id)));
  return Object.freeze({contractVersion: AGENT_EDITORIAL_INTELLIGENCE_VERSION, observationId: safe(input.snapshot.observationId), observationFingerprint: safe(input.snapshot.observationFingerprint), observations, entities: Object.freeze(contextEntities(observations)), relations: Object.freeze(crossRelations(observations)), review, unhealthyDependencies, agentEvidence: Object.freeze({eventIds: Object.freeze(input.events.map((event) => safe(event.id)).sort()), diagnosisIds: Object.freeze(input.diagnoses.map((diagnosis) => safe(diagnosis.id)).sort())}), boundary: Object.freeze({readOnly: true as const, projectionOnly: true as const, executes: false as const, persists: false as const, decidesAutonomy: false as const})});
}

export const editorialContextSecurity = Object.freeze({pure: true, deterministic: true, jsonSafe: true, minimizesEvidence: true, fetches: false, persists: false, writes: false, executes: false, usesClock: false, usesRandomness: false} as const);
