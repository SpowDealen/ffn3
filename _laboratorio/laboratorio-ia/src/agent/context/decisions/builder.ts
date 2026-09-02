import type {AgentProposalAlternative, AgentStructuredProposal} from "../proposals/types";
import {
  AGENT_DECISION_SUPPORT_VERSION,
  type AgentAmbiguity,
  type AgentContradiction,
  type AgentDecisionAttentionPriority,
  type AgentDecisionOptionAssessment,
  type AgentDecisionQuestion,
  type AgentDecisionState,
  type AgentDecisionSupport,
  type AgentEvidenceAssessment,
  type AgentEvidenceStrength,
  type AgentMissingInformation,
  type AgentTradeoff,
} from "./types";

const unique = (values: readonly (string | undefined)[]): readonly string[] => Object.freeze([...new Set(values.filter((value): value is string => Boolean(value)))].sort());

function decisionId(proposal: AgentStructuredProposal): string {
  return `agent-decision-support:${proposal.id}`;
}

function isNoActionIntent(proposal: AgentStructuredProposal): boolean {
  return proposal.proposalClass === "no_action" || (proposal.humanDecision.status === "not_required" && !proposal.recommendation && proposal.alternatives.length > 0 && proposal.alternatives.every((alternative) => alternative.kind === "no_action"));
}

function evidenceReferences(proposal: AgentStructuredProposal, kind: "facts" | "inferences" | "hypotheses"): readonly string[] {
  return unique(proposal[kind].flatMap((entry) => entry.referenceIds));
}

function contradictionsFor(proposal: AgentStructuredProposal): readonly AgentContradiction[] {
  const statuses = proposal.sufficiency.entries.filter((entry) => entry.status === "conflicting" || entry.status === "contradictory");
  const codes = proposal.issue.codes.filter((code) => /conflict|contradict/i.test(code)).sort();
  if (!statuses.length && !codes.length) return Object.freeze([]);
  return Object.freeze([Object.freeze({
    code: codes[0] ?? `evidence_${statuses[0]!.status}`,
    summary: proposal.issue.summary,
    evidenceRefs: unique(proposal.trace.sourceReferences),
    impact: proposal.humanDecision.status === "blocked" ? "blocks_decision" as const : "requires_human_decision" as const,
  })]);
}

function ambiguitiesFor(proposal: AgentStructuredProposal): readonly AgentAmbiguity[] {
  const candidates = proposal.alternatives.filter((alternative) => alternative.kind === "candidate");
  const codes = proposal.issue.codes.filter((code) => /ambiguous|identity_insufficient|low_confidence|non_unique/i.test(code)).sort();
  if (!codes.length && candidates.length < 2) return Object.freeze([]);
  return Object.freeze([Object.freeze({
    code: codes[0] ?? "multiple_plausible_alternatives",
    summary: proposal.issue.summary,
    alternativeIds: Object.freeze(candidates.map((alternative) => alternative.id).sort()),
    evidenceRefs: unique(proposal.trace.sourceReferences),
    impact: proposal.humanDecision.status === "required" || proposal.humanDecision.status === "blocked" ? "requires_human_decision" as const : "reduces_confidence" as const,
  })]);
}

function referencesForQuestions(proposal: AgentStructuredProposal, statementIds: readonly string[]): readonly string[] {
  const wanted = new Set(statementIds);
  return unique([...proposal.facts, ...proposal.inferences, ...proposal.hypotheses].filter((entry) => wanted.has(entry.id)).flatMap((entry) => entry.referenceIds));
}

function missingInformationFor(proposal: AgentStructuredProposal): readonly AgentMissingInformation[] {
  if (isNoActionIntent(proposal)) return Object.freeze([]);
  const result: AgentMissingInformation[] = proposal.unresolvedQuestions.map((question) => Object.freeze({
    code: question.id.replace(/^question:/, ""),
    summary: question.question,
    sourceQuestionIds: Object.freeze([question.id]),
    evidenceRefs: referencesForQuestions(proposal, question.sourceStatementIds),
  }));
  if (!result.length && ["insufficient", "partial", "stale", "unavailable", "unknown"].includes(proposal.sufficiency.status)) {
    result.push(Object.freeze({
      code: `sufficiency_${proposal.sufficiency.status}`,
      summary: `Falta evidencia suficiente y vigente para cerrar ${proposal.issue.label}.`,
      sourceQuestionIds: Object.freeze([]),
      evidenceRefs: unique(proposal.trace.sourceReferences),
    }));
  }
  return Object.freeze(result.sort((left, right) => left.code.localeCompare(right.code)));
}

function evidenceStrength(proposal: AgentStructuredProposal, contradictions: readonly AgentContradiction[]): AgentEvidenceStrength {
  if (contradictions.length) return "contradictory";
  if (proposal.confidence.status === "mixed" || proposal.sufficiency.status === "mixed") return "mixed";
  const recommendationLevel = proposal.recommendation?.confidence?.level;
  if (recommendationLevel === "high" && proposal.facts.length) return "strong";
  if (recommendationLevel === "medium" || (proposal.facts.length && proposal.inferences.length)) return "moderate";
  if (recommendationLevel === "low" || proposal.hypotheses.length || proposal.sufficiency.status === "insufficient") return "weak";
  if (proposal.facts.length || proposal.inferences.length) return "moderate";
  return "unknown";
}

function evidenceAssessmentFor(proposal: AgentStructuredProposal, contradictions: readonly AgentContradiction[]): AgentEvidenceAssessment {
  const strength = evidenceStrength(proposal, contradictions);
  const factRefs = evidenceReferences(proposal, "facts");
  const hypothesisRefs = evidenceReferences(proposal, "hypotheses");
  const contradictoryEvidenceRefs = unique(contradictions.flatMap((entry) => entry.evidenceRefs));
  return Object.freeze({
    strength,
    strongestEvidenceRefs: strength === "strong" || strength === "moderate" || strength === "mixed" ? factRefs : Object.freeze([]),
    weakEvidenceRefs: unique([...hypothesisRefs, ...(proposal.confidence.entries.some((entry) => entry.level === "low") ? evidenceReferences(proposal, "inferences") : [])]),
    contradictoryEvidenceRefs,
    confidence: Object.freeze({...proposal.confidence, entries: Object.freeze([...proposal.confidence.entries].sort((left, right) => left.source.localeCompare(right.source) || left.level.localeCompare(right.level) || (left.value ?? -1) - (right.value ?? -1)))}),
    synthesizedConfidence: false as const,
  });
}

function decisionStateFor(proposal: AgentStructuredProposal, contradictions: readonly AgentContradiction[], missing: readonly AgentMissingInformation[]): AgentDecisionState {
  if (isNoActionIntent(proposal)) return "no_action_needed";
  if (contradictions.some((entry) => entry.impact === "blocks_decision")) return "blocked_by_contradiction";
  if (proposal.humanDecision.status === "blocked") return "blocked_by_missing_information";
  if (proposal.recommendation) {
    const caveats = proposal.recommendation.rationale.caveats.length || proposal.hypotheses.length || missing.length || proposal.humanDecision.status === "required";
    return caveats ? "recommendation_with_caveats" : "clear_recommendation";
  }
  if (proposal.humanDecision.status === "required" || proposal.humanDecision.status === "recommended") return "human_decision_required";
  return proposal.facts.length || proposal.inferences.length ? "human_decision_required" : "insufficient_basis";
}

function confidenceLabel(alternative: AgentProposalAlternative): string {
  if (!alternative.confidence) return "Confidence no disponible";
  return alternative.confidence.value === undefined
    ? `Confidence ${alternative.confidence.level} (${alternative.confidence.source})`
    : `Confidence ${alternative.confidence.level}: ${alternative.confidence.value}% (${alternative.confidence.source})`;
}

function optionAssessments(
  proposal: AgentStructuredProposal,
  contradictions: readonly AgentContradiction[],
): readonly AgentDecisionOptionAssessment[] {
  const preferredId = proposal.recommendation?.alternativeId;
  const rejected = new Map(proposal.recommendation?.rationale.rejectedAlternatives.map((entry) => [entry.alternativeId, entry.reason]) ?? []);
  const supportingRefs = unique([...evidenceReferences(proposal, "facts"), ...evidenceReferences(proposal, "inferences")]);
  const contradictionRefs = unique(contradictions.flatMap((entry) => entry.evidenceRefs));
  return Object.freeze([...proposal.alternatives].sort((left, right) => left.id.localeCompare(right.id)).map((alternative) => {
    const relativeAssessment: AgentDecisionOptionAssessment["relativeAssessment"] = !alternative.viable
      ? "not_viable"
      : alternative.id === preferredId
        ? "preferred"
        : preferredId
          ? alternative.role === "alternative" ? "weaker" : "competitive"
          : proposal.alternatives.filter((entry) => entry.viable).length > 1 ? "competitive" : "unknown";
    return Object.freeze({
      alternativeId: alternative.id,
      label: alternative.label,
      strengths: unique([
        ...alternative.benefits,
        ...(alternative.id === preferredId ? proposal.recommendation?.rationale.primaryReasons ?? [] : []),
      ]),
      weaknesses: unique([...alternative.risks, ...alternative.limitations, rejected.get(alternative.id)]),
      supportingEvidenceRefs: alternative.supportedByEvidence ? supportingRefs : Object.freeze([]),
      contradictingEvidenceRefs: contradictionRefs,
      unknowns: unique([
        ...proposal.unresolvedQuestions.map((question) => question.question),
        alternative.unavailableReason ?? undefined,
      ]),
      confidence: alternative.confidence ?? (alternative.id === preferredId ? proposal.recommendation?.confidence : undefined),
      risk: proposal.risk,
      viable: alternative.viable,
      relativeAssessment,
    });
  }));
}

function tradeoffsFor(proposal: AgentStructuredProposal, assessments: readonly AgentDecisionOptionAssessment[]): readonly AgentTradeoff[] {
  if (assessments.length < 2) return Object.freeze([]);
  const anchor = assessments.find((entry) => entry.relativeAssessment === "preferred") ?? assessments[0]!;
  const result = assessments.filter((entry) => entry.alternativeId !== anchor.alternativeId).map((other) => Object.freeze({
    id: `tradeoff:${anchor.alternativeId}:${other.alternativeId}`,
    alternativeIds: Object.freeze([anchor.alternativeId, other.alternativeId]) as readonly [string, string],
    dimensions: Object.freeze([
      Object.freeze({kind: "confidence" as const, first: confidenceLabel(proposal.alternatives.find((entry) => entry.id === anchor.alternativeId)!), second: confidenceLabel(proposal.alternatives.find((entry) => entry.id === other.alternativeId)!)}),
      Object.freeze({kind: "evidence_support" as const, first: anchor.supportingEvidenceRefs.length ? "Con soporte de evidencia" : "Sin soporte trazable", second: other.supportingEvidenceRefs.length ? "Con soporte de evidencia" : "Sin soporte trazable"}),
      Object.freeze({kind: "viability" as const, first: anchor.viable ? "Viable" : "No viable", second: other.viable ? "Viable" : "No viable"}),
    ]),
    evidenceRefs: unique([...anchor.supportingEvidenceRefs, ...other.supportingEvidenceRefs, ...anchor.contradictingEvidenceRefs, ...other.contradictingEvidenceRefs]),
  }));
  return Object.freeze(result.sort((left, right) => left.id.localeCompare(right.id)));
}

function questionsFor(proposal: AgentStructuredProposal, alternatives: readonly AgentDecisionOptionAssessment[]): readonly AgentDecisionQuestion[] {
  if (isNoActionIntent(proposal)) return Object.freeze([]);
  const questions: AgentDecisionQuestion[] = proposal.unresolvedQuestions.map((question) => Object.freeze({
    id: `decision-${question.id}`,
    prompt: question.question,
    relatedAlternativeIds: Object.freeze([]),
    sourceQuestionIds: Object.freeze([question.id]),
  }));
  if ((proposal.humanDecision.status === "required" || proposal.humanDecision.status === "recommended") && alternatives.filter((entry) => entry.viable).length > 1) {
    const viable = alternatives.filter((entry) => entry.viable);
    questions.push(Object.freeze({
      id: `decision-question:${proposal.id}:choose-alternative`,
      prompt: `¿Qué opción debe considerar la autoridad para ${proposal.issue.label}: ${viable.map((entry) => entry.label).join(" o ")}?`,
      relatedAlternativeIds: Object.freeze(viable.map((entry) => entry.alternativeId).sort()),
      sourceQuestionIds: Object.freeze([]),
    }));
  }
  return Object.freeze([...new Map(questions.map((entry) => [entry.id, entry])).values()].sort((left, right) => left.id.localeCompare(right.id)));
}

function attentionPriority(proposal: AgentStructuredProposal, state: AgentDecisionState): AgentDecisionAttentionPriority {
  if (state === "no_action_needed") return "no_attention";
  if (state === "blocked_by_contradiction" || proposal.sourcePriority === "critical") return "critical_attention";
  if (state === "blocked_by_missing_information" || proposal.humanDecision.status === "required" || proposal.sourcePriority === "high") return "high_attention";
  if (proposal.sourcePriority === "low" || proposal.sourcePriority === "informational") return "low_attention";
  return "normal_attention";
}

const HEADLINES: Readonly<Record<AgentDecisionState, string>> = Object.freeze({
  clear_recommendation: "Recomendación clara",
  recommendation_with_caveats: "Recomendación con reservas",
  human_decision_required: "Necesita tu decisión",
  blocked_by_missing_information: "Bloqueado por información pendiente",
  blocked_by_contradiction: "Bloqueado por evidencia contradictoria",
  no_action_needed: "No requiere intervención",
  insufficient_basis: "No hay base suficiente para recomendar",
});

function humanExplanation(proposal: AgentStructuredProposal, state: AgentDecisionState, ambiguities: readonly AgentAmbiguity[], missing: readonly AgentMissingInformation[]): string | null {
  if (proposal.humanDecision.status === "not_required") return null;
  if (state === "blocked_by_contradiction") return "La evidencia contiene contradicciones que deben resolverse antes de confiar en una opción.";
  if (state === "blocked_by_missing_information") return `La decisión está bloqueada porque queda información pendiente: ${missing[0]?.summary ?? proposal.issue.summary}`;
  if (ambiguities.length && proposal.alternatives.length > 1) return "La decisión requiere confirmación humana porque siguen existiendo varias alternativas plausibles.";
  return proposal.humanDecision.status === "required"
    ? "La autoridad humana debe confirmar la opción antes de que el flujo pueda continuar."
    : "Se recomienda revisión humana antes de continuar.";
}

function buildOne(proposal: AgentStructuredProposal): AgentDecisionSupport {
  const contradictions = contradictionsFor(proposal);
  const ambiguities = ambiguitiesFor(proposal);
  const missingInformation = missingInformationFor(proposal);
  const evidenceAssessment = evidenceAssessmentFor(proposal, contradictions);
  const decisionState = decisionStateFor(proposal, contradictions, missingInformation);
  const alternatives = optionAssessments(proposal, contradictions);
  const preferredOption = proposal.recommendation ? alternatives.find((entry) => entry.alternativeId === proposal.recommendation?.alternativeId && entry.viable) ?? null : null;
  const id = decisionId(proposal);
  const humanInput = humanExplanation(proposal, decisionState, ambiguities, missingInformation);
  const why = unique(proposal.recommendation?.rationale.primaryReasons ?? [...proposal.facts, ...proposal.inferences].map((entry) => entry.summary));
  const caveats = unique([
    ...(proposal.recommendation?.rationale.caveats ?? []),
    ...contradictions.map((entry) => entry.summary),
    ...missingInformation.map((entry) => entry.summary),
    proposal.freshness.status === "stale" ? "La propuesta procede de un contexto desactualizado y requiere refresh antes de un futuro handoff." : undefined,
  ]);
  return Object.freeze({
    id,
    version: AGENT_DECISION_SUPPORT_VERSION,
    proposalId: proposal.id,
    subject: Object.freeze({...proposal.subject}),
    issue: Object.freeze({...proposal.issue, codes: unique(proposal.issue.codes)}),
    decisionState,
    preferredOption,
    alternatives,
    evidenceAssessment,
    tradeoffs: tradeoffsFor(proposal, alternatives),
    contradictions,
    ambiguities,
    missingInformation,
    humanDecision: Object.freeze({...proposal.humanDecision, reasons: unique(proposal.humanDecision.reasons), explanation: humanInput}),
    decisionQuestions: questionsFor(proposal, alternatives),
    explanation: Object.freeze({
      headline: HEADLINES[decisionState],
      summary: proposal.recommendation?.summary ?? proposal.issue.summary,
      why,
      whyNot: Object.freeze([...(proposal.recommendation?.rationale.rejectedAlternatives ?? [])].sort((left, right) => left.alternativeId.localeCompare(right.alternativeId))),
      caveats,
      whatNeedsHumanInput: humanInput,
      whatWouldHappenNext: proposal.expectedOutcome?.summary ?? null,
    }),
    priority: attentionPriority(proposal, decisionState),
    authorityHint: Object.freeze({...proposal.authorityHint, invokes: false as const}),
    expectedOutcome: proposal.expectedOutcome,
    trace: Object.freeze({decisionSupportId: id, structuredProposalId: proposal.id, agentContextSnapshotIdentity: proposal.trace.agentContextSnapshotIdentity, contextItemId: proposal.trace.contextItemId, reviewCaseId: proposal.trace.reviewCaseId, sourceReferences: unique(proposal.trace.sourceReferences)}),
    freshness: Object.freeze({...proposal.freshness, fingerprints: unique(proposal.freshness.fingerprints), refreshPerformed: false as const}),
    boundary: Object.freeze({derived: true as const, readOnly: true as const, explains: true as const, compares: true as const, executes: false as const, persists: false as const, plans: false as const, createsAuthority: false as const, mutatesProposal: false as const, mutatesReview: false as const, decidesAutonomy: false as const}),
  });
}

export function buildDecisionSupport(proposals: readonly AgentStructuredProposal[]): readonly AgentDecisionSupport[] {
  return Object.freeze([...proposals].sort((left, right) => left.id.localeCompare(right.id)).map(buildOne));
}

export const decisionSupportBuilderSecurity = Object.freeze({pure: true, deterministic: true, consumesStructuredProposalsOnly: true, explanationAndComparisonOnly: true, createsStore: false, createsDecisionStore: false, persists: false, fetches: false, writes: false, executes: false, createsPlanner: false, createsExecutor: false, createsAuthority: false, mutatesProposal: false, mutatesReview: false, invokesReview: false, invokesAu7: false, invokesAu8: false, decidesAutonomy: false, determinesReadiness: false, refreshes: false, usesClock: false, usesRandomness: false, usesLlm: false} as const);
