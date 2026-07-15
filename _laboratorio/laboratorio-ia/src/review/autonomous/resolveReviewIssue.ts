import {validateReviewResolution} from "../cases/validateResolution";
import type {ReviewCandidate, ReviewCase, ReviewIssue, ReviewJsonObject, ReviewJsonValue, ReviewResolution} from "../types";
import {collectEvidence} from "./collectEvidence";
import {AUTONOMOUS_THRESHOLDS, comparableValue, normalizeConfidence} from "./normalization";
import type {AutonomousResolutionDecision, AutonomousResolverOptions, AutonomousStrategy} from "./types";
import {validateAutonomousDecision} from "./validateAutonomousDecision";

const AMBIGUOUS_KINDS = new Set<ReviewIssue["kind"]>(["ambiguous_reference", "contradictory_data", "invalid_value", "invalid_url", "missing_image", "required_field"]);
const REFERENCE_KINDS = new Set(["sanityReference", "discipline", "organization", "event", "fighter", "fight", "category"]);

function candidateResolution(issue: ReviewIssue, candidate: ReviewCandidate): ReviewResolution {
  if (issue.kind === "duplicate_candidate") return {type: "confirm_duplicate", issueId: issue.id, duplicateId: candidate.sanityId ?? ""};
  if (REFERENCE_KINDS.has(issue.valueKind ?? "") && candidate.sanityId) return {type: "link_reference", issueId: issue.id, sanityId: candidate.sanityId};
  if (issue.valueKind === "image") {
    const value = candidate.value;
    if (typeof value === "string") return {type: "select_image", issueId: issue.id, url: value};
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const url = typeof value.url === "string" ? value.url : undefined;
      const assetId = typeof value.assetId === "string" ? value.assetId : undefined;
      return {type: "select_image", issueId: issue.id, url, assetId};
    }
  }
  return {type: "select_candidate", issueId: issue.id, candidateId: candidate.id};
}

function validCandidate(caseData: ReviewCase, issue: ReviewIssue, candidate: ReviewCandidate): boolean {
  return validateReviewResolution(caseData, candidateResolution(issue, candidate)).valid;
}

function base(issue: ReviewIssue, generatedAt: string, strategy: AutonomousStrategy, status: AutonomousResolutionDecision["status"], confidence: number, summary: string): AutonomousResolutionDecision {
  return {issueId: issue.id, status, confidence, strategy, evidence: [], reasoningSummary: summary, alternativesRejected: [], warnings: [], validation: {valid: true, errors: []}, generatedAt};
}

function safeDraft(issue: ReviewIssue, caseData: ReviewCase): {entityType: string; draft: ReviewJsonObject} | undefined {
  const entityType = typeof issue.expected?.entityType === "string" ? issue.expected.entityType : undefined;
  const draft = issue.expected?.draft ?? caseData.context.preparedEntityDraft;
  return entityType && draft && typeof draft === "object" && !Array.isArray(draft) ? {entityType, draft: draft as ReviewJsonObject} : undefined;
}

export function resolveReviewIssue(caseData: ReviewCase, issue: ReviewIssue, options: AutonomousResolverOptions = {}): AutonomousResolutionDecision {
  const generatedAt = options.now?.() ?? new Date().toISOString();
  const minimum = options.minimumConfidence ?? AUTONOMOUS_THRESHOLDS.minimumConfidence;
  const evidence = collectEvidence(caseData, issue);
  const finish = (decision: AutonomousResolutionDecision): AutonomousResolutionDecision => validateAutonomousDecision(caseData, {...decision, evidence});
  const existing = caseData.resolutions.find((item) => item.issueId === issue.id);
  if (existing && validateReviewResolution(caseData, existing).valid) return finish({...base(issue, generatedAt, "exact_match", "resolved", 1, "La resolución existente sigue siendo válida e idéntica para esta incidencia."), proposedResolution: existing});

  const candidates = (issue.candidates ?? []).filter((candidate) => validCandidate(caseData, issue, candidate));
  const exact = candidates.filter((candidate) => (issue.currentValue !== undefined && comparableValue(candidate.value) === comparableValue(issue.currentValue)) || candidate.id === caseData.subject.id || (caseData.subject.sanityId !== undefined && candidate.sanityId === caseData.subject.sanityId));
  if (exact.length === 1) return finish({...base(issue, generatedAt, "exact_match", "resolved", AUTONOMOUS_THRESHOLDS.exactMatch, "Una única opción coincide exactamente con los datos persistidos."), proposedResolution: candidateResolution(issue, exact[0]), alternativesRejected: candidates.filter((item) => item.id !== exact[0].id).map((item) => ({id: item.id, label: item.label, reason: "No presenta la coincidencia exacta."}))});

  const ranked = candidates.map((candidate) => ({candidate, score: normalizeConfidence(candidate.confidence)})).sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));
  if (issue.kind === "duplicate_candidate") {
    const top = ranked[0]; const second = ranked[1];
    if (top?.candidate.sanityId && top.score >= AUTONOMOUS_THRESHOLDS.duplicate && (!second || top.score - second.score >= AUTONOMOUS_THRESHOLDS.dominantGap)) return finish({...base(issue, generatedAt, "duplicate_analysis", "resolved", top.score, "Un único duplicado con ID persistido supera el umbral estricto."), proposedResolution: candidateResolution(issue, top.candidate), alternativesRejected: ranked.slice(1).map(({candidate}) => ({id: candidate.id, label: candidate.label, reason: "Evidencia inferior o demasiado próxima."}))});
    return finish({...base(issue, generatedAt, "retry", "needs_more_evidence", top?.score ?? 0, "La posible duplicidad no es inequívoca o carece de target ID."), proposedResolution: {type: "retry", issueId: issue.id}, warnings: ["No se confirma ningún duplicado sin evidencia >= 0,97 y target ID."]});
  }

  if (ranked.length === 1 && ranked[0].score >= Math.max(minimum, AUTONOMOUS_THRESHOLDS.uniqueCandidate)) return finish({...base(issue, generatedAt, REFERENCE_KINDS.has(issue.valueKind ?? "") ? "reference_match" : "candidate_ranking", "resolved", ranked[0].score, "El único candidato válido supera el umbral conservador."), proposedResolution: candidateResolution(issue, ranked[0].candidate)});
  if (ranked[0] && ranked[0].score >= Math.max(minimum, AUTONOMOUS_THRESHOLDS.dominantCandidate) && ranked[0].score - (ranked[1]?.score ?? 0) >= AUTONOMOUS_THRESHOLDS.dominantGap) return finish({...base(issue, generatedAt, "candidate_ranking", "resolved", ranked[0].score, "El candidato principal supera el umbral absoluto y aventaja claramente al siguiente."), proposedResolution: candidateResolution(issue, ranked[0].candidate), alternativesRejected: ranked.slice(1).map(({candidate, score}) => ({id: candidate.id, label: candidate.label, reason: `Confianza normalizada inferior (${score.toFixed(2)}).`}))});

  if (issue.currentValue !== undefined && !AMBIGUOUS_KINDS.has(issue.kind)) {
    const proposed: ReviewResolution = issue.valueKind === "image" ? candidateResolution(issue, {id: "current", label: "Valor actual", value: issue.currentValue}) : {type: "accept_value", issueId: issue.id, reason: "El valor actual es válido y no existe evidencia contradictoria."};
    if (validateReviewResolution(caseData, proposed).valid && candidates.length === 0) return finish({...base(issue, generatedAt, "current_value", "resolved", AUTONOMOUS_THRESHOLDS.currentValue, "El valor actual es válido y no compite con otros candidatos."), proposedResolution: proposed});
  }

  if (issue.currentValue !== undefined && ["text", "date", "number", "boolean", "url"].includes(issue.valueKind ?? "")) {
    const proposed: ReviewResolution = {type: "set_value", issueId: issue.id, value: issue.currentValue as ReviewJsonValue};
    if (!AMBIGUOUS_KINDS.has(issue.kind) && validateReviewResolution(caseData, proposed).valid) return finish({...base(issue, generatedAt, "primitive_validation", "resolved", 0.9, "El valor primitivo cumple el tipo y las restricciones persistidas."), proposedResolution: proposed});
  }

  if (issue.kind === "missing_entity" && options.allowPreparedEntity) {
    const prepared = safeDraft(issue, caseData);
    if (prepared) return finish({...base(issue, generatedAt, "combined", "resolved", 0.9, "Los datos persistidos permiten preparar una entidad sin crearla."), proposedResolution: {type: "create_entity", issueId: issue.id, ...prepared}});
  }
  if (!issue.required && !issue.blocking && options.allowOptionalDiscard) return finish({...base(issue, generatedAt, "optional_discard", "resolved", 0.9, "La incidencia es opcional, no bloqueante y no contiene una corrección segura."), proposedResolution: {type: "discard", issueId: issue.id, reason: "Sin evidencia suficiente; incidencia opcional no bloqueante."}});
  const closeScores = ranked.length > 1 && ranked[0].score - ranked[1].score < AUTONOMOUS_THRESHOLDS.dominantGap;
  return finish({...base(issue, generatedAt, "retry", "needs_more_evidence", ranked[0]?.score ?? 0, closeScores ? "Los candidatos están demasiado próximos para decidir con seguridad." : "Los datos persistidos no bastan para una resolución segura."), proposedResolution: {type: "retry", issueId: issue.id}, alternativesRejected: ranked.map(({candidate}) => ({id: candidate.id, label: candidate.label, reason: "No supera las reglas de selección inequívoca."}))});
}
