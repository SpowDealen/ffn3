import type {EditorialAnomalyCategory} from "../../agent/editorial-model";
import type {ReviewIssueKind, ReviewPriority} from "../types";
import type {ReviewIntakeIssueType} from "./types";

export type ReviewIntakeTaxonomyEntry = Readonly<{
  issueKind: ReviewIssueKind;
  label: string;
  defaultPriority: ReviewPriority;
  ag2Category: EditorialAnomalyCategory;
}>;

export const REVIEW_INTAKE_TAXONOMY: Readonly<
  Record<ReviewIntakeIssueType, ReviewIntakeTaxonomyEntry>
> = Object.freeze({
  missing_entity: {issueKind: "missing_entity", label: "Entidad requerida ausente", defaultPriority: "high", ag2Category: "identity_insufficient"},
  ambiguous_entity: {issueKind: "ambiguous_reference", label: "Identidad ambigua", defaultPriority: "high", ag2Category: "identity_insufficient"},
  duplicate_entity: {issueKind: "duplicate_candidate", label: "Posible entidad duplicada", defaultPriority: "high", ag2Category: "possible_duplicate_entity"},
  missing_relation: {issueKind: "missing_reference", label: "Relación requerida ausente", defaultPriority: "normal", ag2Category: "missing_relation"},
  ambiguous_relation: {issueKind: "ambiguous_reference", label: "Relación ambigua", defaultPriority: "high", ag2Category: "ambiguous_relation"},
  conflicting_relation: {issueKind: "contradictory_data", label: "Relación en conflicto", defaultPriority: "critical", ag2Category: "conflicting_relation"},
  insufficient_evidence: {issueKind: "low_confidence", label: "Evidencia insuficiente", defaultPriority: "normal", ag2Category: "evidence_insufficient"},
  conflicting_evidence: {issueKind: "contradictory_data", label: "Evidencia contradictoria", defaultPriority: "critical", ag2Category: "evidence_conflicting"},
  missing_required_field: {issueKind: "required_field", label: "Dato obligatorio ausente", defaultPriority: "high", ag2Category: "review_required"},
  incomplete_event: {issueKind: "blocked_dependency", label: "Evento incompleto", defaultPriority: "high", ag2Category: "event_incomplete"},
  unresolved_fighter: {issueKind: "missing_entity", label: "Luchador no identificado", defaultPriority: "high", ag2Category: "fighter_identity_ambiguous"},
  unresolved_category: {issueKind: "missing_reference", label: "Categoría de peso sin resolver", defaultPriority: "high", ag2Category: "fighter_missing_weight_category"},
  review_required: {issueKind: "recoverable_error", label: "Decisión editorial requerida", defaultPriority: "high", ag2Category: "review_required"},
});
