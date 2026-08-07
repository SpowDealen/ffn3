import type {EntityResolutionResult, UniversalEntityType} from "../../entityIdentity";
import type {GlobalResolutionInspectionEvidence} from "../../globalResolution/inspection/types";
import type {ReviewJsonValue} from "../../types";
import {computeUniversalFingerprint} from "../../universal";
import {projectAutonomousEditorialEvidence} from "../evidenceProjection";
import type {AutonomousEditorialDecisionKind, AutonomousEditorialEvidence, AutonomousEditorialRisk, EditorialEvidenceSufficiencyClassification} from "../types";
import {
  EDITORIAL_EVIDENCE_SUFFICIENCY_VERSION,
  type EditorialEvidenceAuthorityAssessment,
  type EditorialEvidenceContradiction,
  type EditorialEvidenceCoverage,
  type EditorialEvidenceDimension,
  type EditorialEvidenceFreshnessAssessment,
  type EditorialEvidenceIndependenceAssessment,
  type EditorialEvidenceSourceAssessment,
  type EditorialEvidenceSufficiencyEvaluation,
  type EditorialEvidenceSufficiencyInput,
  type EditorialInvestigationRecommendation,
  type EditorialInvestigationRecommendationKind,
  type EditorialMissingEvidence,
  type EditorialSourceAuthority,
} from "./types";

const DEFAULT_MAXIMUM_AGE_MS = 30 * 60 * 1000;
const freeze = <T>(values: readonly T[]): readonly T[] => Object.freeze([...values]);
const unique = (values: readonly string[]): readonly string[] => freeze([...new Set(values)].sort());
const fp = (value: unknown): string => computeUniversalFingerprint(value as ReviewJsonValue);
const opaque = (prefix: string, value: unknown): string => `${prefix}:${fp(value).slice(-16)}`;

const dimensionsForDecision: Readonly<Partial<Record<AutonomousEditorialDecisionKind, readonly EditorialEvidenceDimension[]>>> = Object.freeze({
  reuse_existing: ["inspection", "identity"] as const,
  create_entity: ["inspection", "identity", "resolution"] as const,
  repair_reference: ["inspection", "resolution"] as const,
  validate: ["inspection", "resolution"] as const,
  resume: ["resolution", "transaction"] as const,
  request_authorization: ["transaction"] as const,
  request_reconciliation: ["transaction"] as const,
  request_compensation: ["transaction"] as const,
});

function requiredDimensions(intent?: AutonomousEditorialDecisionKind): readonly EditorialEvidenceDimension[] {
  return dimensionsForDecision[intent ?? "investigate"] ?? Object.freeze(["inspection", "identity"]);
}

function projected(input: EditorialEvidenceSufficiencyInput, source: AutonomousEditorialEvidence["source"], fingerprint: string): AutonomousEditorialEvidence | undefined {
  return projectAutonomousEditorialEvidence(input).find((item) => item.source === source && item.fingerprint === fingerprint);
}

function official(value: string): boolean { return /sanity|official|canonical|federation|federacion|catalog|registry/i.test(value); }

function inspectionAuthority(item: GlobalResolutionInspectionEvidence): EditorialSourceAuthority {
  if (item.status === "unavailable" || item.status === "unsupported" || item.status === "ambiguous") return "weak";
  return official(`${item.inspectorId} ${item.producer} ${item.capability}`) ? "authoritative" : "corroborating";
}

function identityAuthority(item: EntityResolutionResult): EditorialSourceAuthority {
  if (["ambiguous", "probable_match", "conflicting_identity", "insufficient_evidence", "unsupported"].includes(item.status)) return "weak";
  const candidateSources = item.candidates.map((candidate) => candidate.candidate.source);
  if (candidateSources.some(official) || (item.comparison && item.comparison.score >= 0.9 && ["exact_match", "strong_match"].includes(item.comparison.decision))) return "authoritative";
  return "corroborating";
}

function sourceAssessments(input: EditorialEvidenceSufficiencyInput): readonly EditorialEvidenceSourceAssessment[] {
  const assessments: EditorialEvidenceSourceAssessment[] = [];
  for (const item of input.inspection ?? []) {
    const evidence = projected(input, "inspection", item.fingerprint);
    if (!evidence) continue;
    const groupSemantic = item.producer.trim().toLowerCase() || item.inspectorId.trim().toLowerCase();
    assessments.push(Object.freeze({sourceId: opaque("source", {dimension: "inspection", fingerprint: item.fingerprint}), dimension: "inspection", authority: inspectionAuthority(item), independent: true, independenceGroup: opaque("group", groupSemantic), evidenceIds: Object.freeze([evidence.id])}));
  }
  for (const item of input.identities ?? []) {
    const evidence = projected(input, "identity", item.resolutionFingerprint);
    if (!evidence) continue;
    const candidateSources = unique(item.candidates.map((candidate) => candidate.candidate.source.trim().toLowerCase()).filter(Boolean));
    const groupSemantic = candidateSources.length ? candidateSources.join("|") : `identity:${item.entityType}:${item.inputFingerprint}`;
    assessments.push(Object.freeze({sourceId: opaque("source", {dimension: "identity", fingerprint: item.resolutionFingerprint}), dimension: "identity", authority: identityAuthority(item), independent: true, independenceGroup: opaque("group", groupSemantic), evidenceIds: Object.freeze([evidence.id])}));
  }
  if (input.resolution) {
    const evidence = projected(input, "resolution", input.resolution.decisionFingerprint);
    if (evidence) assessments.push(Object.freeze({sourceId: opaque("source", {dimension: "resolution", fingerprint: input.resolution.decisionFingerprint}), dimension: "resolution", authority: input.resolution.plan.structurallyValid ? "authoritative" : "weak", independent: false, independenceGroup: opaque("group", "derived:resolution"), evidenceIds: Object.freeze([evidence.id])}));
  }
  if (input.transaction) {
    const evidence = projected(input, "transaction", input.transaction.transactionFingerprint);
    if (evidence) assessments.push(Object.freeze({sourceId: opaque("source", {dimension: "transaction", fingerprint: input.transaction.transactionFingerprint}), dimension: "transaction", authority: "authoritative", independent: true, independenceGroup: opaque("group", `transaction:${input.transaction.transactionId}`), evidenceIds: Object.freeze([evidence.id])}));
  }
  return freeze([...new Map(assessments.map((item) => [item.sourceId, item])).values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId)));
}

function observedDimensions(input: EditorialEvidenceSufficiencyInput): readonly EditorialEvidenceDimension[] {
  const dimensions: EditorialEvidenceDimension[] = [];
  if ((input.inspection ?? []).some((item) => ["observed", "not_observed", "ambiguous"].includes(item.status))) dimensions.push("inspection");
  if ((input.identities ?? []).some((item) => !["insufficient_evidence", "unsupported"].includes(item.status))) dimensions.push("identity");
  if (input.resolution) dimensions.push("resolution");
  if (input.transaction) dimensions.push("transaction");
  return unique(dimensions) as readonly EditorialEvidenceDimension[];
}

function coverage(input: EditorialEvidenceSufficiencyInput): EditorialEvidenceCoverage {
  const required = requiredDimensions(input.decisionIntent);
  const observed = observedDimensions(input);
  const missing = required.filter((dimension) => !observed.includes(dimension));
  return Object.freeze({requiredDimensions: required, observedDimensions: observed, missingDimensions: freeze(missing), ratio: required.length ? Number(((required.length - missing.length) / required.length).toFixed(3)) : 1});
}

function missingEvidence(value: EditorialEvidenceCoverage, intent?: AutonomousEditorialDecisionKind): readonly EditorialMissingEvidence[] {
  const descriptions: Readonly<Record<EditorialEvidenceDimension, string>> = {inspection: "Falta observación verificable del estado actual.", identity: "Falta una resolución de identidad utilizable.", resolution: "Falta un plan resolutivo AU6 compatible.", transaction: "Falta el estado operacional AU7 recuperado."};
  return freeze(value.missingDimensions.map((dimension) => Object.freeze({dimension, reasonCode: `missing_${dimension}_evidence`, description: descriptions[dimension], requiredFor: intent ?? "generic_decision"})));
}

function conflictTargets(identities: readonly EntityResolutionResult[]): readonly UniversalEntityType[] {
  const targets = new Map<UniversalEntityType, Set<string>>();
  for (const identity of identities) {
    if (identity.status !== "reuse" || !identity.candidateId) continue;
    const current = targets.get(identity.entityType) ?? new Set<string>();
    current.add(identity.candidateId);
    targets.set(identity.entityType, current);
  }
  return freeze([...targets.entries()].filter(([, ids]) => ids.size > 1).map(([type]) => type).sort());
}

function contradictions(input: EditorialEvidenceSufficiencyInput, evidence: readonly AutonomousEditorialEvidence[]): readonly EditorialEvidenceContradiction[] {
  const values: EditorialEvidenceContradiction[] = [];
  const ids = (source: AutonomousEditorialEvidence["source"]) => unique(evidence.filter((item) => item.source === source).map((item) => item.id));
  if ((input.identities ?? []).some((item) => item.status === "conflicting_identity")) values.push(Object.freeze({code: "identity_conflict", severity: "critical", summary: "Las evidencias de identidad contienen atributos incompatibles.", evidenceIds: ids("identity")}));
  const conflictingTargets = conflictTargets(input.identities ?? []);
  if (conflictingTargets.length) values.push(Object.freeze({code: "multiple_resolved_targets", severity: "critical", summary: `Existen destinos resueltos incompatibles para ${conflictingTargets.join(", ")}.`, evidenceIds: ids("identity")}));
  if ((input.inspection ?? []).some((item) => item.observations.some((observation) => observation.kind === "payload_differs"))) values.push(Object.freeze({code: "payload_conflict", severity: "critical", summary: "El estado observado contradice el fingerprint esperado.", evidenceIds: ids("inspection")}));
  const existence = new Map<string, Set<string>>();
  for (const item of input.inspection ?? []) for (const observation of item.observations) {
    if (observation.kind !== "entity_exists" && observation.kind !== "entity_missing") continue;
    const state = existence.get(observation.entityType) ?? new Set<string>(); state.add(observation.kind); existence.set(observation.entityType, state);
  }
  if ([...existence.values()].some((states) => states.size > 1)) values.push(Object.freeze({code: "existence_conflict", severity: "blocking", summary: "Las inspecciones discrepan sobre la existencia de una entidad.", evidenceIds: ids("inspection")}));
  return freeze(values.sort((left, right) => left.code.localeCompare(right.code)));
}

function freshness(input: EditorialEvidenceSufficiencyInput, evidence: readonly AutonomousEditorialEvidence[], maximumAgeMs: number): EditorialEvidenceFreshnessAssessment {
  const evaluatedAt = Date.parse(input.evaluatedAt);
  const timestamps = new Map<string, string>();
  for (const item of input.inspection ?? []) { const value = projected(input, "inspection", item.fingerprint); if (value) timestamps.set(value.id, item.inspectedAt); }
  if (input.resolution) { const value = projected(input, "resolution", input.resolution.decisionFingerprint); if (value) timestamps.set(value.id, input.resolution.plan.createdAt); }
  if (input.transaction) { const value = projected(input, "transaction", input.transaction.transactionFingerprint); if (value) timestamps.set(value.id, input.transaction.updatedAt); }
  const freshIds: string[] = []; const staleIds: string[] = []; const unknownIds: string[] = [];
  for (const item of evidence) {
    const observedAt = timestamps.get(item.id); const timestamp = observedAt ? Date.parse(observedAt) : Number.NaN;
    if (!Number.isFinite(evaluatedAt) || !Number.isFinite(timestamp)) unknownIds.push(item.id);
    else if (evaluatedAt - timestamp > maximumAgeMs || timestamp - evaluatedAt > maximumAgeMs) staleIds.push(item.id);
    else freshIds.push(item.id);
  }
  return Object.freeze({evaluatedAt: input.evaluatedAt, maximumAgeMs, freshEvidenceIds: unique(freshIds), staleEvidenceIds: unique(staleIds), unknownEvidenceIds: unique(unknownIds), current: Number.isFinite(evaluatedAt) && staleIds.length === 0});
}

function authority(sources: readonly EditorialEvidenceSourceAssessment[], required: readonly EditorialEvidenceDimension[]): EditorialEvidenceAuthorityAssessment {
  const relevant = sources.filter((item) => required.includes(item.dimension));
  const authoritative = relevant.filter((item) => item.authority === "authoritative").length;
  const corroborating = relevant.filter((item) => item.authority === "corroborating").length;
  const weak = relevant.filter((item) => item.authority === "weak").length;
  return Object.freeze({authoritative, corroborating, weak, adequate: authoritative > 0 || corroborating >= 2});
}

function independence(sources: readonly EditorialEvidenceSourceAssessment[], required: readonly EditorialEvidenceDimension[]): EditorialEvidenceIndependenceAssessment {
  const eligible = sources.filter((item) => item.independent && required.includes(item.dimension) && item.authority !== "weak");
  const groups = unique(eligible.map((item) => item.independenceGroup));
  const factualDimensions = required.filter((dimension) => dimension !== "resolution");
  const requiredIndependentSources = Math.min(2, Math.max(1, factualDimensions.length));
  return Object.freeze({independentSourceCount: groups.length, requiredIndependentSources, groups, adequate: groups.length >= requiredIndependentSources});
}

function addRecommendation(target: Map<EditorialInvestigationRecommendationKind, EditorialInvestigationRecommendation>, kind: EditorialInvestigationRecommendationKind, priority: number, blocking: boolean, reasonCode: string, explanation: string): void {
  const existing = target.get(kind);
  target.set(kind, Object.freeze({kind, priority: Math.min(priority, existing?.priority ?? priority), blocking: blocking || Boolean(existing?.blocking), reasonCodes: unique([...(existing?.reasonCodes ?? []), reasonCode]), explanation}));
}

function recommendations(input: EditorialEvidenceSufficiencyInput, value: EditorialEvidenceCoverage, conflicts: readonly EditorialEvidenceContradiction[], current: EditorialEvidenceFreshnessAssessment, authorityValue: EditorialEvidenceAuthorityAssessment, independenceValue: EditorialEvidenceIndependenceAssessment, classification: EditorialEvidenceSufficiencyClassification, riskGate: "open" | "blocked"): readonly EditorialInvestigationRecommendation[] {
  const result = new Map<EditorialInvestigationRecommendationKind, EditorialInvestigationRecommendation>();
  const ambiguous = (input.inspection ?? []).some((item) => item.status === "ambiguous" || item.observations.some((observation) => observation.kind === "multiple_candidates")) || (input.identities ?? []).some((item) => item.status === "ambiguous" || item.status === "probable_match");
  if (conflicts.length) { addRecommendation(result, "compare_entities", 10, true, "contradictory_evidence", "Comparar las entidades y sus claves antes de continuar."); addRecommendation(result, "request_human", 20, true, "contradictory_evidence", "Solicitar criterio humano para resolver la contradicción."); }
  if (riskGate === "blocked") addRecommendation(result, "request_human", 5, true, "high_risk_decision", "El riesgo exige una decisión humana explícita.");
  if (!current.current) { addRecommendation(result, "inspect_sanity", 15, true, "stale_or_unknown_freshness", "Obtener una inspección actual del estado canónico."); addRecommendation(result, "inspect_source", 25, true, "stale_or_unknown_freshness", "Renovar la evidencia de la fuente original."); }
  if (value.missingDimensions.includes("inspection")) { addRecommendation(result, "inspect_sanity", 20, true, "missing_inspection", "Inspeccionar el estado canónico sin escribir."); addRecommendation(result, "inspect_source", 30, true, "missing_inspection", "Contrastar el dato con su fuente de origen."); }
  if (value.missingDimensions.includes("identity")) addRecommendation(result, "search_candidates", 20, true, "missing_identity", "Buscar candidatos mediante AU5 antes de decidir.");
  if (ambiguous) { addRecommendation(result, "search_candidates", 10, true, "ambiguous_identity", "Ampliar la búsqueda de candidatos discriminantes."); addRecommendation(result, "compare_entities", 15, true, "ambiguous_identity", "Comparar candidatos con claves fuertes y contexto."); }
  const unavailable = (input.inspection ?? []).some((item) => item.status === "unavailable" || item.observations.some((observation) => observation.kind === "service_unavailable"));
  if (unavailable || classification === "unavailable") { addRecommendation(result, "wait_for_evidence", 10, true, "evidence_unavailable", "Esperar a que la fuente vuelva a estar disponible."); addRecommendation(result, "inspect_source", 20, true, "evidence_unavailable", "Reintentar una lectura segura de la fuente."); }
  if (!authorityValue.adequate || authorityValue.authoritative === 0) addRecommendation(result, "inspect_sanity", authorityValue.adequate ? 80 : 35, !authorityValue.adequate, authorityValue.adequate ? "canonical_corroboration_recommended" : "authority_insufficient", "Corroborar la evidencia con una fuente canónica.");
  if (!independenceValue.adequate) addRecommendation(result, "inspect_source", 40, true, "source_independence_insufficient", "Añadir una fuente independiente; los duplicados no cuentan como corroboración.");
  if (classification === "insufficient" && !result.has("wait_for_evidence")) addRecommendation(result, "wait_for_evidence", 50, true, "evidence_insufficient", "No decidir hasta reunir evidencia suficiente.");
  if (classification === "sufficient" && riskGate === "open") addRecommendation(result, "ready_to_decide", 100, false, "evidence_sufficient", "La evidencia satisface cobertura, autoridad, independencia y actualidad.");
  return freeze([...result.values()].sort((left, right) => left.priority - right.priority || left.kind.localeCompare(right.kind)));
}

function classify(input: EditorialEvidenceSufficiencyInput, evidence: readonly AutonomousEditorialEvidence[], value: EditorialEvidenceCoverage, conflicts: readonly EditorialEvidenceContradiction[], current: EditorialEvidenceFreshnessAssessment, authorityValue: EditorialEvidenceAuthorityAssessment, independenceValue: EditorialEvidenceIndependenceAssessment): EditorialEvidenceSufficiencyClassification {
  if (conflicts.length) return "contradictory";
  if (input.resolution && (input.resolution.plan.caseId !== input.case.caseId || input.resolution.plan.caseVersion !== input.case.caseVersion)) return "stale";
  if (!current.current && current.staleEvidenceIds.length) return "stale";
  const invalidTemporalContext = !Number.isFinite(Date.parse(input.evaluatedAt)) || (input.inspection ?? []).some((item) => !Number.isFinite(Date.parse(item.inspectedAt))) || Boolean(input.resolution && !Number.isFinite(Date.parse(input.resolution.plan.createdAt))) || Boolean(input.transaction && !Number.isFinite(Date.parse(input.transaction.updatedAt)));
  if (invalidTemporalContext) return "unavailable";
  const unavailable = (input.inspection ?? []).some((item) => item.status === "unavailable" || item.status === "unsupported" || item.observations.some((observation) => observation.kind === "service_unavailable"));
  if (unavailable && value.missingDimensions.includes("inspection")) return "unavailable";
  if (!evidence.length || value.ratio === 0) return "insufficient";
  const ambiguous = (input.inspection ?? []).some((item) => item.status === "ambiguous" || item.observations.some((observation) => observation.kind === "multiple_candidates")) || (input.identities ?? []).some((item) => item.status === "ambiguous" || item.status === "probable_match");
  if (ambiguous) return "partial";
  if (value.ratio < 1) return authorityValue.weak > 0 && authorityValue.authoritative + authorityValue.corroborating === 0 ? "insufficient" : "partial";
  if (!authorityValue.adequate || !independenceValue.adequate) return authorityValue.weak > 0 && authorityValue.authoritative + authorityValue.corroborating === 0 ? "insufficient" : "partial";
  return "sufficient";
}

function safeExplanation(classification: EditorialEvidenceSufficiencyClassification, canDecideNow: boolean): string {
  const explanations: Readonly<Record<EditorialEvidenceSufficiencyClassification, string>> = {
    sufficient: "La evidencia cubre las dimensiones requeridas con autoridad, independencia y actualidad suficientes.",
    insufficient: "La evidencia disponible no alcanza el mínimo verificable para decidir.",
    contradictory: "Existen señales incompatibles; decidir ahora podría consolidar un error editorial.",
    stale: "Parte del contexto verificable está obsoleto o pertenece a otra versión del caso.",
    unavailable: "Una fuente necesaria no está disponible y no existe corroboración suficiente.",
    partial: "Existe evidencia útil, pero faltan cobertura, independencia, autoridad o resolución de ambigüedad.",
  };
  return `${explanations[classification]} ${canDecideNow ? "Puede emitirse una decisión ahora." : "No debe emitirse una decisión final ahora."}`;
}

export function evaluateEditorialEvidenceSufficiency(input: EditorialEvidenceSufficiencyInput): EditorialEvidenceSufficiencyEvaluation {
  const maximumAgeMs = Number.isFinite(input.maximumAgeMs) && (input.maximumAgeMs ?? 0) > 0 ? Math.floor(input.maximumAgeMs!) : DEFAULT_MAXIMUM_AGE_MS;
  const evidence = projectAutonomousEditorialEvidence(input);
  const sources = sourceAssessments(input);
  const coverageValue = coverage(input);
  const missing = missingEvidence(coverageValue, input.decisionIntent);
  const conflicts = contradictions(input, evidence);
  const freshnessValue = freshness(input, evidence, maximumAgeMs);
  const authorityValue = authority(sources, coverageValue.requiredDimensions);
  const independenceValue = independence(sources, coverageValue.requiredDimensions);
  const classification = classify(input, evidence, coverageValue, conflicts, freshnessValue, authorityValue, independenceValue);
  const inferredRisk: AutonomousEditorialRisk = input.decisionRisk ?? "low";
  const riskyStep = input.transaction?.nextReadySteps.some((step) => step.risk === "high" || step.risk === "destructive") ?? false;
  const riskGate = inferredRisk === "high" || inferredRisk === "critical" || riskyStep ? "blocked" as const : "open" as const;
  const canDecideNow = classification === "sufficient" && riskGate === "open";
  const policy = recommendations(input, coverageValue, conflicts, freshnessValue, authorityValue, independenceValue, classification, riskGate);
  const inputSemantic = {version: EDITORIAL_EVIDENCE_SUFFICIENCY_VERSION, case: input.case, evaluatedAt: input.evaluatedAt, maximumAgeMs, decisionIntent: input.decisionIntent, decisionRisk: inferredRisk, inspectionFingerprints: unique((input.inspection ?? []).map((item) => item.fingerprint)), identityFingerprints: unique((input.identities ?? []).map((item) => item.resolutionFingerprint)), resolutionFingerprint: input.resolution?.decisionFingerprint, transactionFingerprint: input.transaction?.transactionFingerprint};
  const inputFingerprint = fp(inputSemantic);
  const semantic = {version: EDITORIAL_EVIDENCE_SUFFICIENCY_VERSION, caseId: input.case.caseId, caseVersion: input.case.caseVersion, classification, canDecideNow, riskGate, evidenceUsed: evidence, missingEvidence: missing, sources, independence: independenceValue, authority: authorityValue, freshness: freshnessValue, contradictions: conflicts, coverage: coverageValue, recommendations: policy, safeExplanation: safeExplanation(classification, canDecideNow), inputFingerprint, executesInvestigation: false as const, executionAllowed: false as const, writes: false as const};
  return Object.freeze({...semantic, evaluationFingerprint: fp(semantic)});
}
