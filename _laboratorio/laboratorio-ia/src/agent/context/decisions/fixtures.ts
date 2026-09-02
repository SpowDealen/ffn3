import {createStructuredProposalFixture} from "../proposals/fixtures";
import type {AgentProposalAlternative, AgentStructuredProposal} from "../proposals/types";
import {buildDecisionSupport} from "./builder";

function clearRecommendationFixture(base: AgentStructuredProposal): AgentStructuredProposal {
  const id = "agent-structured-proposal:fixture:bkfc:clear";
  const sourceAlternative = base.alternatives.find((alternative) => alternative.kind === "candidate")!;
  const alternative: AgentProposalAlternative = Object.freeze({...sourceAlternative, id: `${id}:alternative:candidate:organization:bkfc`, limitations: Object.freeze([]), viable: true, unavailableReason: null});
  return Object.freeze({
    ...base,
    id,
    sourcePriority: "normal",
    issue: Object.freeze({codes: Object.freeze(["identity_confirmed"]), label: "Identidad confirmada", summary: "La evidencia existente identifica una única organización.", reason: "La presentación Review contiene una opción recomendada con evidencia suficiente."}),
    hypotheses: Object.freeze([]),
    alternatives: Object.freeze([alternative]),
    recommendation: Object.freeze({alternativeId: alternative.id, sourceRecommendationId: base.recommendation?.sourceRecommendationId, summary: "La evidencia existente favorece BKFC.", confidence: alternative.confidence, rationale: Object.freeze({primaryReasons: Object.freeze(["La presentación Review identifica BKFC como opción recomendada."]), rejectedAlternatives: Object.freeze([]), caveats: Object.freeze([])})}),
    confidence: Object.freeze({status: "known", entries: Object.freeze(alternative.confidence ? [alternative.confidence] : []), aggregated: false}),
    sufficiency: Object.freeze({status: "sufficient" as const, entries: Object.freeze([{status: "sufficient" as const, source: "review_nucleus" as const, determinesReadiness: false as const}]), determinesReadiness: false as const}),
    humanDecision: Object.freeze({status: "not_required", reasons: Object.freeze([])}),
    expectedOutcome: Object.freeze({kind: "expected", summary: "Review recibiría la identidad confirmada para su evaluación posterior.", observed: false}),
    unresolvedQuestions: Object.freeze([]),
    trace: Object.freeze({...base.trace, contextItemId: "fixture:bkfc:clear", reviewCaseId: "case:fixture:bkfc:clear", sourceReferences: Object.freeze([...base.trace.sourceReferences].sort())}),
  });
}

function equivalentAlternativesFixture(base: AgentStructuredProposal): AgentStructuredProposal {
  const id = "agent-structured-proposal:fixture:ufc:equivalent-alternatives";
  const alternatives = Object.freeze(base.alternatives.filter((alternative) => alternative.kind === "candidate").map((alternative) => Object.freeze({...alternative, id: `${id}:alternative:candidate:${alternative.optionId}`, role: "possible" as const})).sort((left, right) => left.id.localeCompare(right.id)));
  return Object.freeze({
    ...base,
    id,
    issue: Object.freeze({codes: Object.freeze(["ambiguous_reference"]), label: "Identidad aún ambigua", summary: "Existen dos opciones documentadas, pero B2 no dispone de una recomendación defendible.", reason: "La decisión permanece abierta en la propuesta estructurada."}),
    alternatives,
    recommendation: null,
    humanDecision: Object.freeze({status: "required", reasons: Object.freeze(["ambiguous_reference", "explicit_human_decision_required"])}),
    expectedOutcome: null,
    trace: Object.freeze({...base.trace, contextItemId: "fixture:ufc:equivalent-alternatives", reviewCaseId: "case:fixture:ufc:equivalent-alternatives", sourceReferences: Object.freeze([...base.trace.sourceReferences].sort())}),
  });
}

export function createDecisionSupportFixture() {
  const b2 = createStructuredProposalFixture();
  const clearBase = b2.proposals.find((proposal) => proposal.trace.contextItemId === "review:case:bkfc:ready")!;
  const ambiguousBase = b2.proposals.find((proposal) => proposal.trace.contextItemId === "review:case:ufc:identity")!;
  const proposals = Object.freeze([...b2.proposals, clearRecommendationFixture(clearBase), equivalentAlternativesFixture(ambiguousBase)].sort((left, right) => left.id.localeCompare(right.id)));
  return Object.freeze({context: b2.context, proposals, decisions: buildDecisionSupport(proposals)});
}

export const decisionSupportFixtureSecurity = Object.freeze({pure: true, deterministic: true, devOnly: true, createsStore: false, persists: false, fetches: false, writes: false, executes: false, sanity: false, telegram: false, externalApis: false} as const);
