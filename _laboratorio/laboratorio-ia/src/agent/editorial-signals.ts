import type {EditorialAnomalyCategory, EditorialConfidence, EditorialContext, EditorialEntityReference, EditorialEpistemicStatus, EditorialEvidenceObservation, EditorialEvidenceReference, EditorialPriority, EditorialSignal, EditorialSuggestedAuthority} from "./editorial-model";

type Rule = Readonly<{dimension: EditorialEvidenceObservation["dimension"]; assessment: EditorialEvidenceObservation["assessment"]; category: EditorialAnomalyCategory; entityKind?: EditorialEntityReference["kind"]; requiresRelated?: boolean}>;

const RULES: readonly Rule[] = Object.freeze([
  {dimension: "identity", assessment: "duplicate_candidate", category: "possible_duplicate_entity"},
  {dimension: "identity", assessment: "duplicate_candidate", category: "fighter_possible_duplicate", entityKind: "luchador"},
  {dimension: "identity", assessment: "insufficient", category: "identity_insufficient"},
  {dimension: "identity", assessment: "conflicting", category: "identity_conflict"},
  {dimension: "relation", assessment: "missing", category: "missing_relation"},
  {dimension: "relation", assessment: "ambiguous", category: "ambiguous_relation"},
  {dimension: "relation", assessment: "conflicting", category: "conflicting_relation", requiresRelated: true},
  {dimension: "relation", assessment: "orphaned", category: "orphan_relation"},
  {dimension: "news_relevant_entity", assessment: "missing", category: "news_missing_relevant_entity", entityKind: "noticia"},
  {dimension: "news_subject", assessment: "ambiguous", category: "news_ambiguous_subject", entityKind: "noticia"},
  {dimension: "news_relationship", assessment: "conflicting", category: "news_relationship_conflict", entityKind: "noticia", requiresRelated: true},
  {dimension: "event_completeness", assessment: "incomplete", category: "event_incomplete", entityKind: "evento"},
  {dimension: "event_organization", assessment: "missing", category: "event_missing_organization", entityKind: "evento"},
  {dimension: "event_card", assessment: "inconsistent", category: "event_card_inconsistent", entityKind: "evento", requiresRelated: true},
  {dimension: "fighter_weight_category", assessment: "missing", category: "fighter_missing_weight_category", entityKind: "luchador"},
  {dimension: "fighter_identity", assessment: "ambiguous", category: "fighter_identity_ambiguous", entityKind: "luchador"},
  {dimension: "organization_consistency", assessment: "inconsistent", category: "organization_inconsistent", entityKind: "organizacion"},
  {dimension: "discipline_consistency", assessment: "inconsistent", category: "discipline_inconsistent", entityKind: "disciplina"},
  {dimension: "weight_category_consistency", assessment: "inconsistent", category: "weight_category_inconsistent", entityKind: "categoria_peso"},
  {dimension: "evidence_sufficiency", assessment: "insufficient", category: "evidence_insufficient"},
  {dimension: "evidence_consistency", assessment: "conflicting", category: "evidence_conflicting"},
  {dimension: "evidence_freshness", assessment: "stale", category: "evidence_stale"},
]);

const BASE_PRIORITY: Readonly<Record<EditorialAnomalyCategory, EditorialPriority>> = Object.freeze({
  possible_duplicate_entity: "high", identity_insufficient: "high", identity_conflict: "critical",
  missing_relation: "medium", ambiguous_relation: "high", conflicting_relation: "critical", orphan_relation: "high",
  news_missing_relevant_entity: "medium", news_ambiguous_subject: "high", news_relationship_conflict: "critical",
  event_incomplete: "high", event_missing_organization: "high", event_card_inconsistent: "critical",
  fighter_possible_duplicate: "high", fighter_missing_weight_category: "medium", fighter_identity_ambiguous: "high",
  organization_inconsistent: "high", discipline_inconsistent: "high", weight_category_inconsistent: "high",
  evidence_insufficient: "medium", evidence_conflicting: "critical", evidence_stale: "medium",
  review_required: "high", review_blocked_by_dependency: "critical",
});

const EXPLANATIONS: Readonly<Record<EditorialAnomalyCategory, string>> = Object.freeze({
  possible_duplicate_entity: "La evidencia identifica una posible entidad duplicada; sigue siendo una hipótesis hasta su revisión.",
  identity_insufficient: "La evidencia de identidad disponible no alcanza para confirmar una identidad editorial.",
  identity_conflict: "Existen referencias estructuradas incompatibles sobre la identidad de la entidad.",
  missing_relation: "Una relación editorial requerida no aparece respaldada por la evidencia proyectada.",
  ambiguous_relation: "La evidencia admite más de una relación editorial posible.",
  conflicting_relation: "Los dos extremos observados de la relación presentan evidencia incompatible.",
  orphan_relation: "La relación observada no dispone de un extremo editorial válido.",
  news_missing_relevant_entity: "La noticia no tiene una entidad relevante respaldada por la evidencia disponible.",
  news_ambiguous_subject: "El sujeto editorial de la noticia permanece ambiguo.",
  news_relationship_conflict: "El sujeto observado y la relación proyectada de la noticia no coinciden.",
  event_incomplete: "La evidencia estructurada marca el evento como incompleto.",
  event_missing_organization: "No existe una organización respaldada para el evento.",
  event_card_inconsistent: "La cartelera y sus relaciones observadas son incompatibles.",
  fighter_possible_duplicate: "El luchador presenta coincidencias compatibles con un posible duplicado, todavía no confirmado.",
  fighter_missing_weight_category: "No hay categoría de peso suficientemente respaldada para el luchador.",
  fighter_identity_ambiguous: "La evidencia no discrimina de forma suficiente la identidad del luchador.",
  organization_inconsistent: "La organización presenta datos editoriales incompatibles entre evidencias.",
  discipline_inconsistent: "La disciplina observada no es coherente entre las evidencias disponibles.",
  weight_category_inconsistent: "La categoría de peso observada entra en conflicto con el contexto editorial proyectado.",
  evidence_insufficient: "La evidencia es insuficiente; no se puede convertir la hipótesis en hecho.",
  evidence_conflicting: "Dos o más referencias de evidencia sostienen conclusiones incompatibles.",
  evidence_stale: "La evidencia proyectada está marcada como obsoleta.",
  review_required: "Una anomalía editorial actual requiere evaluación por la autoridad Review Center.",
  review_blocked_by_dependency: "El review pendiente está bloqueado por una dependencia no saludable.",
});

function entityKey(entity?: EditorialEntityReference): string {
  return entity ? `${entity.kind}:${entity.id}` : "global";
}

function priority(category: EditorialAnomalyCategory, temporal: EditorialEvidenceObservation["temporal"]): EditorialPriority {
  const base = BASE_PRIORITY[category];
  if (temporal === "current") return base;
  const downgrade: Readonly<Record<EditorialPriority, EditorialPriority>> = Object.freeze({critical: "high", high: "medium", medium: "low", low: "informational", informational: "informational"});
  return downgrade[base];
}

function confidence(observation: EditorialEvidenceObservation): EditorialConfidence {
  if (["insufficient", "ambiguous", "duplicate_candidate"].includes(observation.assessment)) return "low";
  if (["conflicting", "inconsistent"].includes(observation.assessment) && observation.evidence.length >= 2) return "high";
  return observation.evidence.some((reference) => reference.inspectionId || reference.fingerprint) ? "high" : "medium";
}

function conclusive(observation: EditorialEvidenceObservation): boolean {
  if (["insufficient", "ambiguous", "duplicate_candidate"].includes(observation.assessment)) return false;
  if (["conflicting", "inconsistent"].includes(observation.assessment)) return observation.evidence.length >= 2;
  return observation.evidence.length > 0;
}

function epistemic(observation: EditorialEvidenceObservation): Exclude<EditorialEpistemicStatus, "observed_fact" | "recommendation"> {
  return ["duplicate_candidate", "ambiguous"].includes(observation.assessment) ? "hypothesis" : "inference";
}

function authority(category: EditorialAnomalyCategory): EditorialSuggestedAuthority {
  if (category === "evidence_stale") return "Inspection";
  if (category === "evidence_insufficient" || category === "evidence_conflicting") return "Evidence/Sufficiency";
  return "Review Center";
}

function makeSignal(category: EditorialAnomalyCategory, observation: EditorialEvidenceObservation): EditorialSignal {
  const derivedPriority = priority(category, observation.temporal);
  return Object.freeze({id: `ag2-signal:${category}:${entityKey(observation.entity)}:${observation.id}`, category, entity: observation.entity, relatedEntity: observation.relatedEntity, priority: derivedPriority, severity: derivedPriority, confidence: confidence(observation), temporal: observation.temporal, epistemicStatus: epistemic(observation), evidence: observation.evidence, explanation: EXPLANATIONS[category], conclusive: conclusive(observation), suggestedAuthority: authority(category)});
}

function reviewEntity(context: EditorialContext, reviewId: string): EditorialEntityReference | undefined {
  return context.observations.find((observation) => observation.reviewId === reviewId)?.entity;
}

function reviewSignals(context: EditorialContext): EditorialSignal[] {
  const signals: EditorialSignal[] = [];
  for (const review of context.review) {
    if (review.temporal !== "current") continue;
    const evidence = Object.freeze([...review.evidenceRefs.map((id) => Object.freeze({id, source: "LES 8:review"})), ...review.checkpointIds.map((id) => Object.freeze({id, source: "LES 8:checkpoint", checkpointId: id}))]);
    if (evidence.length === 0) continue;
    const entity = reviewEntity(context, review.id);
    const observation: EditorialEvidenceObservation = Object.freeze({id: `review:${review.id}`, epistemicStatus: "observed_fact", dimension: "evidence_sufficiency", assessment: "observed", entity, temporal: "current", evidence, reviewId: review.id});
    signals.push(makeSignal("review_required", observation));
    const blockingDiagnosis = context.agentEvidence.diagnosisIds.find((id) => id.includes("dependency_blocks_review"));
    if (review.blocked && context.unhealthyDependencies.length > 0 && blockingDiagnosis) {
      const blockerEvidence = Object.freeze([...evidence, Object.freeze({id: blockingDiagnosis, source: "AG1 diagnosis"}), ...context.unhealthyDependencies.map((dependency) => Object.freeze({id: dependency.reasonCode ?? dependency.id, source: "LES 4:global_status"}))]);
      signals.push(makeSignal("review_blocked_by_dependency", Object.freeze({...observation, id: `review-blocked:${review.id}`, assessment: "conflicting", evidence: blockerEvidence})));
    }
  }
  return signals;
}

export function buildEditorialSignals(context: EditorialContext): readonly EditorialSignal[] {
  const signals: EditorialSignal[] = [];
  for (const observation of context.observations) {
    if (observation.evidence.length === 0) continue;
    for (const rule of RULES) {
      if (rule.dimension !== observation.dimension || rule.assessment !== observation.assessment) continue;
      if (rule.entityKind && observation.entity?.kind !== rule.entityKind) continue;
      if (rule.requiresRelated && !observation.relatedEntity) continue;
      signals.push(makeSignal(rule.category, observation));
    }
  }
  signals.push(...reviewSignals(context));
  return Object.freeze(signals.sort((left, right) => left.id.localeCompare(right.id)));
}

export const editorialSignalsSecurity = Object.freeze({pure: true, deterministic: true, ruleBased: true, usesLlm: false, inventsRelations: false, fetches: false, persists: false, writes: false, executes: false, usesClock: false, usesRandomness: false} as const);
