import type {
  AgentContext,
  AgentContextAuthorityHint,
  AgentContextConfidence,
  AgentContextItem,
  AgentContextStatement,
  AgentContextSufficiency,
} from "../types";
import {
  AGENT_STRUCTURED_PROPOSAL_VERSION,
  type AgentExpectedOutcome,
  type AgentHumanDecisionRequirement,
  type AgentProposalAlternative,
  type AgentProposalClass,
  type AgentProposalConfidence,
  type AgentProposalEvidence,
  type AgentProposalRecommendation,
  type AgentProposalRisk,
  type AgentProposalSubjectKind,
  type AgentProposalSufficiency,
  type AgentStructuredProposal,
  type AgentUnresolvedQuestion,
} from "./types";

const EPISTEMIC_LABELS = Object.freeze({fact: "Hecho observado", inference: "Inferencia", hypothesis: "Hipótesis"} as const);

const unique = (values: readonly (string | undefined)[]): readonly string[] => Object.freeze([...new Set(values.filter((value): value is string => Boolean(value)))].sort());

function copyAuthorityHint(value: AgentContextAuthorityHint): AgentContextAuthorityHint {
  return Object.freeze({...value, invokes: false as const});
}

function proposalId(item: AgentContextItem): string {
  return `agent-structured-proposal:${item.id}`;
}

function proposalClass(item: AgentContextItem): AgentProposalClass {
  if (item.state === "no_action" || item.state === "resolved") return "no_action";
  const codes = (item.issueCodes ?? []).join("|").toLocaleLowerCase("es");
  if (codes.includes("duplicate")) return "duplicate_resolution";
  if (codes.includes("identity") || codes.includes("ambiguous_reference") || codes.includes("low_confidence")) return "identity_resolution";
  if (codes.includes("relationship") || codes.includes("missing_reference")) return "relationship_resolution";
  if (codes.includes("missing_entity") || codes.includes("news_missing_relevant_entity")) return "missing_entity";
  if (codes.includes("incomplete_event")) return "incomplete_event";
  if (item.kind === "process") return "resume_flow";
  if (item.state === "blocked" || codes.includes("blocked") || codes.includes("dependency_blocks") || item.kind === "dependency") return "blocked_review";
  return "other";
}

function subjectKind(item: AgentContextItem): AgentProposalSubjectKind {
  const kind = item.entity.type.toLocaleLowerCase("es");
  const normalized: Readonly<Record<string, AgentProposalSubjectKind>> = Object.freeze({
    noticia: "news",
    news: "news",
    evento: "event",
    event: "event",
    luchador: "fighter",
    fighter: "fighter",
    organizacion: "organization",
    organización: "organization",
    organization: "organization",
    disciplina: "discipline",
    discipline: "discipline",
    categoria_peso: "weight_category",
    weight_category: "weight_category",
    relacion: "relationship",
    relación: "relationship",
    relationship: "relationship",
    process: "process",
    dependency: "dependency",
  });
  if (item.kind === "review_case" && !normalized[kind]) return "review_case";
  return normalized[kind] ?? "unknown";
}

function statementConfidence(statement: AgentContextStatement, item: AgentContextItem): AgentContextConfidence | undefined {
  const source = statement.source.toLocaleLowerCase("es");
  const expectedSource = source.includes("ag1") ? "ag1_diagnosis" : source.includes("ag2") ? "ag2_editorial" : undefined;
  if (!expectedSource) return undefined;
  const matches = item.confidences.filter((entry) => entry.source === expectedSource);
  return matches.length === 1 ? matches[0] : undefined;
}

function evidenceFor(statement: AgentContextStatement, item: AgentContextItem): AgentProposalEvidence {
  const status = statement.epistemicStatus as AgentProposalEvidence["epistemicStatus"];
  return Object.freeze({
    id: statement.id,
    epistemicStatus: status,
    label: EPISTEMIC_LABELS[status],
    summary: statement.summary,
    source: statement.source,
    referenceIds: unique(statement.evidenceIds),
    confidence: statementConfidence(statement, item),
  });
}

function evidencePackage(context: AgentContext, item: AgentContextItem): Readonly<{
  facts: readonly AgentProposalEvidence[];
  inferences: readonly AgentProposalEvidence[];
  hypotheses: readonly AgentProposalEvidence[];
}> {
  const related = context.statements
    .filter((statement) => statement.relatedItemId === item.id && statement.epistemicStatus !== "recommendation")
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((statement) => evidenceFor(statement, item));
  return Object.freeze({
    facts: Object.freeze(related.filter((entry) => entry.epistemicStatus === "fact")),
    inferences: Object.freeze(related.filter((entry) => entry.epistemicStatus === "inference")),
    hypotheses: Object.freeze(related.filter((entry) => entry.epistemicStatus === "hypothesis")),
  });
}

function confidenceFor(item: AgentContextItem): AgentProposalConfidence {
  const entries = Object.freeze([...item.confidences].sort((left, right) => left.source.localeCompare(right.source) || left.level.localeCompare(right.level) || (left.value ?? -1) - (right.value ?? -1)));
  if (!entries.length) return Object.freeze({status: item.decisionNeed === "none" ? "not_applicable" as const : "unknown" as const, entries, aggregated: false as const});
  const semanticValues = new Set(entries.map((entry) => `${entry.level}:${entry.value ?? "categorical"}`));
  return Object.freeze({status: semanticValues.size > 1 ? "mixed" as const : "known" as const, entries, aggregated: false as const});
}

function riskFor(item: AgentContextItem): AgentProposalRisk {
  return Object.freeze({
    status: item.risk.level === "unavailable" ? "unknown" as const : "known" as const,
    value: item.risk.level,
    source: item.risk.source,
    inferredFromConfidence: false as const,
  });
}

function sufficiencyFor(item: AgentContextItem): AgentProposalSufficiency {
  const entries = Object.freeze([...item.sufficiency].sort((left, right) => left.source.localeCompare(right.source) || left.status.localeCompare(right.status)));
  const statuses = new Set(entries.map((entry) => entry.status).filter((status) => status !== "unknown"));
  const status = statuses.size > 1 ? "mixed" as const : statuses.values().next().value ?? "unknown";
  return Object.freeze({status, entries, determinesReadiness: false as const});
}

function humanDecisionFor(item: AgentContextItem): AgentHumanDecisionRequirement {
  const contradiction = item.sufficiency.some((entry) => entry.status === "conflicting" || entry.status === "contradictory");
  const staleBlock = item.state === "blocked" || item.freshness.status === "stale";
  const status = staleBlock || contradiction
    ? "blocked" as const
    : item.decisionNeed === "human_decision_required"
      ? "required" as const
      : item.decisionNeed === "review_recommended"
        ? "recommended" as const
        : "not_required" as const;
  const reasons = unique([
    ...(item.issueCodes ?? []),
    staleBlock ? "context_or_item_blocked" : undefined,
    contradiction ? "contradictory_evidence" : undefined,
    item.decisionNeed === "human_decision_required" ? "explicit_human_decision_required" : undefined,
    item.decisionNeed === "review_recommended" ? "review_recommended" : undefined,
  ]);
  return Object.freeze({status, reasons});
}

function limitationLabels(sufficiency: readonly AgentContextSufficiency[]): readonly string[] {
  return unique(sufficiency.filter((entry) => entry.status !== "sufficient").map((entry) => `Suficiencia ${entry.status} según ${entry.source}.`));
}

function noAuthority(): AgentContextAuthorityHint {
  return Object.freeze({target: "none", source: "No action", invokes: false as const});
}

function alternativesFor(item: AgentContextItem, facts: readonly AgentProposalEvidence[], hasLinkedRecommendation: boolean): readonly AgentProposalAlternative[] {
  const id = proposalId(item);
  const decisionOptions = item.decisionOptions ?? [];
  const alternatives: AgentProposalAlternative[] = decisionOptions.map((option) => Object.freeze({
    id: `${id}:alternative:candidate:${option.id}`,
    kind: "candidate" as const,
    optionId: option.id,
    role: option.role,
    label: `Usar ${option.label}`,
    summary: option.role === "recommended"
      ? `${option.label} figura como opción recomendada en la presentación Review.`
      : `${option.label} figura como ${option.role === "alternative" ? "alternativa" : "opción posible"} en la presentación Review.`,
    capability: null,
    authorityHint: copyAuthorityHint(item.authorityHint),
    confidence: option.confidence,
    benefits: Object.freeze(option.confidence?.value !== undefined ? [`Confidence Review conservada: ${option.confidence.value}%.`] : ["La opción procede de la presentación Review existente."]),
    risks: Object.freeze(option.role === "recommended" ? [] : ["La presentación Review no identifica esta opción como recomendada."]),
    limitations: limitationLabels(item.sufficiency),
    supportedByEvidence: Boolean(option.confidence || facts.length),
    viable: item.freshness.status !== "stale" && item.state !== "blocked",
    unavailableReason: item.freshness.status === "stale" ? "context_stale" : item.state === "blocked" ? "item_blocked" : null,
  }));

  if (!decisionOptions.length && (hasLinkedRecommendation || item.decisionNeed === "human_decision_required" || item.decisionNeed === "review_recommended") && item.authorityHint.target !== "none") {
    alternatives.push(Object.freeze({
      id: `${id}:alternative:authority-review`,
      kind: "authority_review" as const,
      label: "Solicitar evaluación a la autoridad existente",
      summary: `Presentar el contexto a ${item.authorityHint.source} sin ejecutar ninguna acción.`,
      capability: null,
      authorityHint: copyAuthorityHint(item.authorityHint),
      benefits: Object.freeze(["Conserva la decisión en la autoridad existente."]),
      risks: Object.freeze([]),
      limitations: limitationLabels(item.sufficiency),
      supportedByEvidence: Boolean(facts.length || item.references.evidenceIds.length),
      viable: item.freshness.status !== "stale" && item.state !== "blocked",
      unavailableReason: item.freshness.status === "stale" ? "context_stale" : item.state === "blocked" ? "item_blocked" : null,
    }));
  }

  if (item.state === "blocked") {
    alternatives.push(Object.freeze({
      id: `${id}:alternative:maintain-block`,
      kind: "maintain_state" as const,
      label: "Mantener el bloqueo",
      summary: "Conservar el bloqueo hasta disponer de contexto suficiente y vigente.",
      capability: null,
      authorityHint: noAuthority(),
      benefits: Object.freeze(["Evita actuar sobre contexto bloqueado o desactualizado."]),
      risks: Object.freeze([]),
      limitations: limitationLabels(item.sufficiency),
      supportedByEvidence: Boolean(item.blocked),
      viable: true,
      unavailableReason: null,
    }));
  }

  if (item.state === "no_action" || item.state === "resolved" || item.state === "in_progress") {
    alternatives.push(Object.freeze({
      id: `${id}:alternative:no-action`,
      kind: "no_action" as const,
      label: item.state === "in_progress" ? "Mantener el flujo actual" : "No intervenir",
      summary: item.state === "in_progress" ? "El flujo observado continúa bajo su autoridad actual." : "El estado observado no requiere una intervención de AG3.",
      capability: null,
      authorityHint: noAuthority(),
      benefits: Object.freeze(["Preserva el estado canónico sin introducir efectos." ]),
      risks: Object.freeze([]),
      limitations: Object.freeze([]),
      supportedByEvidence: true,
      viable: true,
      unavailableReason: null,
    }));
  }

  return Object.freeze(alternatives.sort((left, right) => left.id.localeCompare(right.id)));
}

function linkedRecommendations(context: AgentContext, item: AgentContextItem) {
  const ids = new Set(item.recommendationIds);
  return context.recommendations
    .filter((entry) => ids.has(entry.id) || entry.relatedItemId === item.id)
    .sort((left, right) => Number(right.source === "Review") - Number(left.source === "Review") || left.id.localeCompare(right.id));
}

function recommendationFor(
  item: AgentContextItem,
  alternatives: readonly AgentProposalAlternative[],
  linked: ReturnType<typeof linkedRecommendations>,
  evidence: Readonly<{facts: readonly AgentProposalEvidence[]; inferences: readonly AgentProposalEvidence[]; hypotheses: readonly AgentProposalEvidence[]}>,
  confidence: AgentProposalConfidence,
): AgentProposalRecommendation | null {
  const conflicting = item.sufficiency.some((entry) => entry.status === "conflicting" || entry.status === "contradictory");
  if (item.state === "blocked" || item.freshness.status === "stale" || conflicting) return null;

  const noAction = alternatives.find((entry) => entry.kind === "no_action");
  if (noAction && (item.state === "no_action" || item.state === "resolved")) {
    return Object.freeze({
      alternativeId: noAction.id,
      summary: noAction.summary,
      rationale: Object.freeze({primaryReasons: Object.freeze([item.summary]), rejectedAlternatives: Object.freeze([]), caveats: Object.freeze([])}),
    });
  }

  const sourceRecommendation = linked.find((entry) => entry.clarity === "clear");
  if (!sourceRecommendation) return null;
  const recommendedCandidate = item.decisionOptions?.find((entry) => entry.role === "recommended");
  const selected = recommendedCandidate
    ? alternatives.find((entry) => entry.optionId === recommendedCandidate.id)
    : alternatives.find((entry) => entry.kind === "authority_review");
  if (!selected?.viable) return null;

  const primaryReasons = unique([
    ...evidence.facts.map((entry) => entry.summary),
    ...evidence.inferences.map((entry) => entry.summary),
    sourceRecommendation.summary,
  ]);
  const rejectedAlternatives = Object.freeze(alternatives.filter((entry) => entry.id !== selected.id).map((entry) => Object.freeze({
    alternativeId: entry.id,
    reason: entry.kind === "candidate" ? "No figura como opción recomendada en la presentación Review." : "No corresponde a la recomendación existente.",
  })));
  const caveats = unique([
    ...evidence.hypotheses.map((entry) => entry.summary),
    ...item.sufficiency.filter((entry) => entry.status !== "sufficient").map((entry) => `Suficiencia ${entry.status} según ${entry.source}.`),
    confidence.status === "mixed" ? "La propuesta conserva confidences distintas por origen; no se han promediado." : undefined,
  ]);
  return Object.freeze({
    alternativeId: selected.id,
    sourceRecommendationId: sourceRecommendation.id,
    summary: sourceRecommendation.summary,
    confidence: sourceRecommendation.confidence,
    rationale: Object.freeze({primaryReasons, rejectedAlternatives, caveats}),
  });
}

function expectedOutcomeFor(recommendation: AgentProposalRecommendation | null, alternatives: readonly AgentProposalAlternative[]): AgentExpectedOutcome | null {
  if (!recommendation) return null;
  const selected = alternatives.find((entry) => entry.id === recommendation.alternativeId);
  if (!selected) return null;
  const summary = selected.kind === "candidate"
    ? `Review recibiría la opción ${selected.label.replace(/^Usar /, "")} para evaluarla; el flujo original solo podría continuar después de una autorización válida.`
    : selected.kind === "authority_review"
      ? "La autoridad existente recibiría un contexto trazable para decidir sin que AG3 ejecute la acción."
      : "El estado observado se conservaría sin intervención de AG3.";
  return Object.freeze({kind: "expected" as const, summary, observed: false as const});
}

function unresolvedQuestionsFor(item: AgentContextItem, hypotheses: readonly AgentProposalEvidence[], confidence: AgentProposalConfidence, risk: AgentProposalRisk): readonly AgentUnresolvedQuestion[] {
  const questions: AgentUnresolvedQuestion[] = hypotheses.map((entry) => Object.freeze({
    id: `question:${entry.id}`,
    question: `¿Debe resolverse esta hipótesis antes de decidir: ${entry.summary.replace(/[.?]+$/, "")}?`,
    sourceStatementIds: Object.freeze([entry.id]),
  }));
  const sufficiencyStatuses = new Set(item.sufficiency.map((entry) => entry.status));
  if (sufficiencyStatuses.has("conflicting") || sufficiencyStatuses.has("contradictory")) questions.push(Object.freeze({id: `question:${item.id}:contradiction`, question: "¿Qué evidencia debe prevalecer ante la contradicción detectada?", sourceStatementIds: Object.freeze([])}));
  else if ([...sufficiencyStatuses].some((status) => ["insufficient", "partial", "unavailable", "unknown"].includes(status))) questions.push(Object.freeze({id: `question:${item.id}:sufficiency`, question: `¿Existe evidencia suficiente para decidir sobre ${item.title}?`, sourceStatementIds: Object.freeze([])}));
  if (item.freshness.status === "stale") questions.push(Object.freeze({id: `question:${item.id}:freshness`, question: "¿Se ha actualizado la evidencia desde este snapshot?", sourceStatementIds: Object.freeze([])}));
  if (confidence.status === "unknown" && item.decisionNeed !== "none") questions.push(Object.freeze({id: `question:${item.id}:confidence`, question: "¿Existe confidence canónica para respaldar una recomendación?", sourceStatementIds: Object.freeze([])}));
  if (risk.status === "unknown" && item.decisionNeed !== "none") questions.push(Object.freeze({id: `question:${item.id}:risk`, question: "¿Existe una evaluación canónica de riesgo para esta decisión?", sourceStatementIds: Object.freeze([])}));
  return Object.freeze([...new Map(questions.map((entry) => [entry.id, entry])).values()].sort((left, right) => left.id.localeCompare(right.id)));
}

function buildOne(context: AgentContext, item: AgentContextItem): AgentStructuredProposal {
  const evidence = evidencePackage(context, item);
  const confidence = confidenceFor(item);
  const risk = riskFor(item);
  const sufficiency = sufficiencyFor(item);
  const linked = linkedRecommendations(context, item);
  const alternatives = alternativesFor(item, evidence.facts, linked.length > 0);
  const recommendation = recommendationFor(item, alternatives, linked, evidence, confidence);
  const sourceReferences = unique([
    ...item.references.evidenceIds,
    ...item.references.fingerprints,
    ...evidence.facts.flatMap((entry) => entry.referenceIds),
    ...evidence.inferences.flatMap((entry) => entry.referenceIds),
    ...evidence.hypotheses.flatMap((entry) => entry.referenceIds),
  ]);
  return Object.freeze({
    id: proposalId(item),
    version: AGENT_STRUCTURED_PROPOSAL_VERSION,
    proposalClass: proposalClass(item),
    sourcePriority: item.domainPriority,
    subject: Object.freeze({kind: subjectKind(item), id: item.entity.id ?? null, label: item.entity.label, source: item.source.id || null}),
    issue: Object.freeze({codes: unique(item.issueCodes ?? []), label: item.title, summary: item.summary, reason: evidence.inferences[0]?.summary ?? evidence.facts[0]?.summary ?? item.summary}),
    facts: evidence.facts,
    inferences: evidence.inferences,
    hypotheses: evidence.hypotheses,
    alternatives,
    recommendation,
    confidence,
    risk,
    sufficiency,
    humanDecision: humanDecisionFor(item),
    authorityHint: copyAuthorityHint(item.authorityHint),
    expectedOutcome: expectedOutcomeFor(recommendation, alternatives),
    unresolvedQuestions: unresolvedQuestionsFor(item, evidence.hypotheses, confidence, risk),
    trace: Object.freeze({
      agentContextSnapshotIdentity: context.snapshotIdentity,
      contextItemId: item.id,
      reviewCaseId: item.references.reviewCaseId,
      observationIds: unique(item.references.observationIds),
      diagnosisIds: unique(item.references.diagnosisIds),
      proposalIds: unique(item.references.proposalIds),
      insightIds: unique(item.references.insightIds),
      sourceReferences,
    }),
    freshness: Object.freeze({status: item.freshness.status, agentContextGeneratedAt: context.generatedAt, itemUpdatedAt: item.freshness.updatedAt, itemVersion: item.freshness.version, fingerprints: unique([context.snapshotIdentity, ...item.references.fingerprints])}),
    durable: false as const,
    boundary: Object.freeze({decisionSupportOnly: true as const, executes: false as const, persists: false as const, plans: false as const, createsAuthority: false as const, mutatesReview: false as const, decidesAutonomy: false as const}),
  });
}

export function buildStructuredProposals(context: AgentContext): readonly AgentStructuredProposal[] {
  return Object.freeze([...context.items].sort((left, right) => left.id.localeCompare(right.id)).map((item) => buildOne(context, item)));
}

export const structuredProposalBuilderSecurity = Object.freeze({
  pure: true,
  deterministic: true,
  decisionSupportOnly: true,
  consumesAgentContextOnly: true,
  createsStore: false,
  createsProposalStore: false,
  persists: false,
  fetches: false,
  writes: false,
  executes: false,
  createsPlanner: false,
  createsExecutor: false,
  createsAuthority: false,
  mutatesReview: false,
  mutatesAg1: false,
  mutatesAg2: false,
  mutatesLes8: false,
  invokesReview: false,
  invokesAu7: false,
  invokesAu8: false,
  decidesAutonomy: false,
  determinesReadiness: false,
  usesClock: false,
  usesRandomness: false,
} as const);
