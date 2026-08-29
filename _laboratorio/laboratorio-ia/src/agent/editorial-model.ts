import type {AgentDiagnosis, AgentObservationEvent} from "./model";
import type {AgentSnapshot} from "../agent-ready/model";

export const AGENT_EDITORIAL_INTELLIGENCE_VERSION = "ag2-editorial-intelligence/1" as const;

export const EDITORIAL_ENTITY_KINDS = Object.freeze(["noticia", "evento", "combate", "luchador", "organizacion", "disciplina", "categoria_peso", "resultado", "relacion_editorial"] as const);
export type EditorialEntityKind = typeof EDITORIAL_ENTITY_KINDS[number];
export type EditorialEntityReference = Readonly<{kind: EditorialEntityKind; id: string}>;

export type EditorialEvidenceDimension =
  | "identity"
  | "relation"
  | "news_relevant_entity"
  | "news_subject"
  | "news_relationship"
  | "event_completeness"
  | "event_organization"
  | "event_card"
  | "fighter_weight_category"
  | "fighter_identity"
  | "organization_consistency"
  | "discipline_consistency"
  | "weight_category_consistency"
  | "evidence_sufficiency"
  | "evidence_consistency"
  | "evidence_freshness";

export type EditorialEvidenceAssessment = "observed" | "sufficient" | "insufficient" | "duplicate_candidate" | "missing" | "ambiguous" | "conflicting" | "orphaned" | "incomplete" | "inconsistent" | "stale";
export type EditorialTemporal = "current" | "historical";
export type EditorialConfidence = "low" | "medium" | "high";
export type EditorialPriority = "critical" | "high" | "medium" | "low" | "informational";
export type EditorialEpistemicStatus = "observed_fact" | "inference" | "hypothesis" | "recommendation";
export type EditorialSuggestedAuthority = "Review Center" | "Inspection" | "Evidence/Sufficiency" | "Existing authority";

export type EditorialEvidenceReference = Readonly<{
  id: string;
  source: string;
  fingerprint?: string;
  inspectionId?: string;
  checkpointId?: string;
}>;

export type EditorialEvidenceObservation = Readonly<{
  id: string;
  epistemicStatus: "observed_fact";
  dimension: EditorialEvidenceDimension;
  assessment: EditorialEvidenceAssessment;
  entity?: EditorialEntityReference;
  relatedEntity?: EditorialEntityReference;
  temporal: EditorialTemporal;
  evidence: readonly EditorialEvidenceReference[];
  reviewId?: string;
  reasonCodes?: readonly string[];
}>;

export type EditorialAnomalyCategory =
  | "possible_duplicate_entity"
  | "identity_insufficient"
  | "identity_conflict"
  | "missing_relation"
  | "ambiguous_relation"
  | "conflicting_relation"
  | "orphan_relation"
  | "news_missing_relevant_entity"
  | "news_ambiguous_subject"
  | "news_relationship_conflict"
  | "event_incomplete"
  | "event_missing_organization"
  | "event_card_inconsistent"
  | "fighter_possible_duplicate"
  | "fighter_missing_weight_category"
  | "fighter_identity_ambiguous"
  | "organization_inconsistent"
  | "discipline_inconsistent"
  | "weight_category_inconsistent"
  | "evidence_insufficient"
  | "evidence_conflicting"
  | "evidence_stale"
  | "review_required"
  | "review_blocked_by_dependency";

export type EditorialSignal = Readonly<{
  id: string;
  category: EditorialAnomalyCategory;
  entity?: EditorialEntityReference;
  relatedEntity?: EditorialEntityReference;
  priority: EditorialPriority;
  severity: EditorialPriority;
  confidence: EditorialConfidence;
  temporal: EditorialTemporal;
  epistemicStatus: Exclude<EditorialEpistemicStatus, "observed_fact" | "recommendation">;
  evidence: readonly EditorialEvidenceReference[];
  explanation: string;
  conclusive: boolean;
  suggestedAuthority: EditorialSuggestedAuthority;
}>;

export type EditorialContextEntity = Readonly<{
  entity: EditorialEntityReference;
  observationIds: readonly string[];
  reviewIds: readonly string[];
}>;

export type EditorialCrossEntityRelation = Readonly<{
  id: string;
  left: EditorialEntityReference;
  right: EditorialEntityReference;
  dimension: EditorialEvidenceDimension;
  assessment: EditorialEvidenceAssessment;
  evidenceRefs: readonly string[];
}>;

export type EditorialContext = Readonly<{
  contractVersion: typeof AGENT_EDITORIAL_INTELLIGENCE_VERSION;
  observationId: string;
  observationFingerprint: string;
  observations: readonly EditorialEvidenceObservation[];
  entities: readonly EditorialContextEntity[];
  relations: readonly EditorialCrossEntityRelation[];
  review: readonly Readonly<{id: string; status: string; temporal: EditorialTemporal; blocked: boolean; evidenceRefs: readonly string[]; checkpointIds: readonly string[]}>[];
  unhealthyDependencies: readonly Readonly<{id: string; state: string; reasonCode?: string}>[];
  agentEvidence: Readonly<{eventIds: readonly string[]; diagnosisIds: readonly string[]}>;
  boundary: Readonly<{readOnly: true; projectionOnly: true; executes: false; persists: false; decidesAutonomy: false}>;
}>;

export type EditorialContextInput = Readonly<{
  snapshot: AgentSnapshot;
  events: readonly AgentObservationEvent[];
  diagnoses: readonly AgentDiagnosis[];
  evidence?: readonly EditorialEvidenceObservation[];
}>;

export type EditorialEntityIntelligence = Readonly<{
  entity: EditorialEntityReference;
  signalIds: readonly string[];
  categories: readonly EditorialAnomalyCategory[];
  evidenceRefs: readonly string[];
  priority: EditorialPriority;
  suggestedAuthority: EditorialSuggestedAuthority;
}>;

export type EditorialSufficiencyView = Readonly<{
  status: "sufficient" | "insufficient" | "conflicting" | "unknown";
  reasons: readonly string[];
  evidenceRefs: readonly string[];
  projectionOnly: true;
  decidesAutonomy: false;
  determinesReadiness: false;
}>;

export type EditorialInsight = Readonly<{
  id: string;
  entity?: EditorialEntityReference;
  relatedEntity?: EditorialEntityReference;
  category: EditorialAnomalyCategory;
  priority: EditorialPriority;
  severity: EditorialPriority;
  confidence: EditorialConfidence;
  epistemicStatus: "recommendation";
  basisEpistemicStatus: Exclude<EditorialEpistemicStatus, "observed_fact" | "recommendation">;
  conclusive: boolean;
  summary: string;
  evidenceRefs: readonly string[];
  suggestedAuthority: EditorialSuggestedAuthority;
  suggestedAction?: "review_editorial_anomaly" | "inspect_evidence" | "collect_more_evidence";
  requiresReview: boolean;
  sourceSignalId: string;
}>;

export type EditorialIntelligence = Readonly<{
  context: EditorialContext;
  signals: readonly EditorialSignal[];
  entities: readonly EditorialEntityIntelligence[];
  insights: readonly EditorialInsight[];
  sufficiency: EditorialSufficiencyView;
}>;

export const editorialIntelligenceModelSecurity = Object.freeze({taxonomyOnly: true, extendsSanityDomain: false, readOnly: true, pure: true, createsStore: false, persists: false, fetches: false, writes: false, executes: false, retries: false, plans: false, schedules: false, watches: false, polls: false, decidesAutonomy: false, determinesReadiness: false} as const);
