import {agentSafeText} from "../../agent-ready/adapters";
import type {AgentAuthorityOwner} from "../../agent-ready/model";
import {selectReviewInbox, type ReviewInboxBucket} from "../../review/inbox";
import {buildNucleusResolutionViewModel, type NucleusResolutionViewModel} from "../../review/nucleus";
import {buildSimplifiedReviewCasePresentation, type SimplifiedReviewCasePresentation} from "../../review/presentation";
import type {ReviewCase} from "../../review/types";
import {computeUniversalFingerprint} from "../../review/universal";
import type {EditorialInsight, EditorialPriority, EditorialSignal} from "../editorial-model";
import type {AgentDiagnosis, AgentProposal} from "../model";
import {
  AGENT_CONTEXT_CONTRACT_VERSION,
  type AgentContext,
  type AgentContextAggregation,
  type AgentContextAuthorityHint,
  type AgentContextAuthorityTarget,
  type AgentContextConfidence,
  type AgentContextInput,
  type AgentContextItem,
  type AgentContextRecommendation,
  type AgentContextReferences,
  type AgentContextState,
  type AgentContextStatement,
  type AgentContextSufficiency,
} from "./types";

const STATE_LABELS: Readonly<Record<AgentContextState, string>> = Object.freeze({ready: "Listo", no_action: "Sin acción necesaria", needs_attention: "Necesita atención", in_progress: "En proceso", resolved: "Resuelto", blocked: "Bloqueado"});
const STATE_RANK: Readonly<Record<AgentContextState, number>> = Object.freeze({blocked: 0, needs_attention: 1, ready: 2, in_progress: 3, resolved: 4, no_action: 5});
const PRIORITY_RANK: Readonly<Record<string, number>> = Object.freeze({critical: 5, high: 4, normal: 3, medium: 3, low: 2, informational: 1, unavailable: 0});
const CONFLICTING_CATEGORIES = /conflict|inconsistent/;

const safe = (value: string | undefined, fallback: string): string => agentSafeText(value) ?? fallback;
const unique = (values: readonly (string | undefined)[]): readonly string[] => Object.freeze([...new Set(values.filter((value): value is string => Boolean(value)))].sort());

function sourceId(reviewCase: ReviewCase): string {
  if (reviewCase.module.startsWith("ufc.")) return "ufc";
  if (reviewCase.module.startsWith("one.")) return "one";
  if (reviewCase.module.startsWith("bkfc.")) return "bkfc";
  if (reviewCase.module === "external.news") return "external_news";
  const producer = reviewCase.context.producer;
  if (typeof producer === "string" && producer.trim()) return producer.trim();
  return reviewCase.source?.trim() || reviewCase.module.replace(".", "_");
}

function operationalSourceId(value: string): string {
  const normalized = value.toLocaleLowerCase("es");
  if (normalized.includes("ufc")) return "ufc";
  if (normalized.includes("one")) return "one";
  if (normalized.includes("bkfc")) return "bkfc";
  if (normalized.includes("external")) return "external_news";
  return value;
}

function proposalTarget(proposal?: AgentProposal): AgentContextAuthorityTarget {
  if (!proposal) return "unknown";
  if (proposal.authority === "Review Center") return "Review";
  if (proposal.authority === "AU7") return "AU7";
  if (proposal.authority === "AU8") return "AU8";
  return "unknown";
}

function ownerTarget(owner?: AgentAuthorityOwner): AgentContextAuthorityTarget {
  if (owner === "review_center") return "Review";
  if (owner === "au7_transaction") return "AU7";
  if (owner === "au8_supervised") return "AU8";
  return owner ? "unknown" : "none";
}

function authorityHint(target: AgentContextAuthorityTarget, source: string, destination?: string): AgentContextAuthorityHint {
  return Object.freeze({target, source: safe(source, "Autoridad existente"), destination, invokes: false as const});
}

function reviewAuthority(nucleus: NucleusResolutionViewModel, proposal?: AgentProposal): AgentContextAuthorityHint {
  const proposed = proposalTarget(proposal);
  if (proposed !== "unknown") return authorityHint(proposed, proposal!.authority, proposal!.destination);
  if (nucleus.state === "completed" || nucleus.primaryAction.kind === "none") return authorityHint("none", "Caso sin acción pendiente");
  if (nucleus.primaryAction.kind === "authorize") return authorityHint("AU8", "AU8 Supervised Authority", "/revision");
  if (["continue", "reconcile", "compensate"].includes(nucleus.primaryAction.kind)) return authorityHint("AU7", "AU7 Transaction Authority", "/revision");
  return authorityHint("Review", "Review Store / Centro de Revisión", "/revision");
}

function editorialAuthority(insight: EditorialInsight): AgentContextAuthorityHint {
  return insight.suggestedAuthority === "Review Center"
    ? authorityHint("Review", insight.suggestedAuthority, "/revision")
    : authorityHint("unknown", insight.suggestedAuthority);
}

function diagnosisAuthority(diagnosis: AgentDiagnosis, proposal?: AgentProposal): AgentContextAuthorityHint {
  const target = proposalTarget(proposal);
  return authorityHint(target === "unknown" ? ownerTarget(diagnosis.authority) : target, proposal?.authority ?? diagnosis.authority ?? "Existing authority", proposal?.destination);
}

function diagnosisPriority(diagnosis: AgentDiagnosis): EditorialPriority {
  if (diagnosis.severity === "critical" || diagnosis.severity === "high") return diagnosis.severity;
  if (diagnosis.severity === "medium") return "medium";
  if (diagnosis.severity === "low") return "low";
  return "informational";
}

function reviewState(reviewCase: ReviewCase, bucket: ReviewInboxBucket | undefined, presentation: SimplifiedReviewCasePresentation): AgentContextState {
  if (reviewCase.status === "dismissed") return "no_action";
  if (reviewCase.status === "stale" || reviewCase.status === "resume_failed") return "blocked";
  if (reviewCase.status === "resumed") return "resolved";
  if (bucket === "in_process" || reviewCase.status === "resuming" || reviewCase.status === "in_review") return "in_progress";
  if (bucket === "resolved" || reviewCase.status === "resolved") return "resolved";
  if (presentation.actions.approve) return "ready";
  return "needs_attention";
}

function reviewDecision(reviewCase: ReviewCase, state: AgentContextState, presentation: SimplifiedReviewCasePresentation): AgentContextItem["decisionNeed"] {
  if (state === "resolved" || state === "no_action" || state === "in_progress") return "none";
  if (state === "blocked") return "blocked";
  const unresolved = reviewCase.issues.filter((issue) => !reviewCase.resolutions.some((resolution) => resolution.issueId === issue.id));
  if (presentation.actions.approve || unresolved.some((issue) => issue.blocking || ["ambiguous_reference", "contradictory_data", "duplicate_candidate", "low_confidence"].includes(issue.kind))) return "human_decision_required";
  return "review_recommended";
}

function presentationConfidence(presentation: SimplifiedReviewCasePresentation): AgentContextConfidence | undefined {
  const confidence = presentation.recommendation.confidence;
  if (!confidence) return undefined;
  const level = confidence.label === "Alta" ? "high" : confidence.label === "Media" ? "medium" : "low";
  return Object.freeze({source: "review_presentation" as const, level, value: confidence.value});
}

function presentationDecisionOptions(presentation: SimplifiedReviewCasePresentation): NonNullable<AgentContextItem["decisionOptions"]> {
  return Object.freeze([...presentation.why.candidates].sort((left, right) => left.id.localeCompare(right.id)).map((candidate) => Object.freeze({
    id: candidate.id,
    label: candidate.label,
    role: candidate.role,
    confidence: candidate.confidence ? Object.freeze({
      source: "review_presentation" as const,
      level: candidate.confidence.label === "Alta" ? "high" as const : candidate.confidence.label === "Media" ? "medium" as const : "low" as const,
      value: candidate.confidence.value,
    }) : undefined,
  })));
}

function insightConfidence(insight: EditorialInsight): AgentContextConfidence {
  return Object.freeze({source: "ag2_editorial" as const, level: insight.confidence});
}

function diagnosisConfidence(diagnosis: AgentDiagnosis): AgentContextConfidence {
  return Object.freeze({source: "ag1_diagnosis" as const, level: diagnosis.confidence});
}

function sortConfidences(values: readonly AgentContextConfidence[]): readonly AgentContextConfidence[] {
  return Object.freeze([...values].sort((left, right) => left.source.localeCompare(right.source) || left.level.localeCompare(right.level) || (left.value ?? -1) - (right.value ?? -1)));
}

function sortSufficiency(values: readonly AgentContextSufficiency[]): readonly AgentContextSufficiency[] {
  return Object.freeze([...values].sort((left, right) => left.source.localeCompare(right.source) || left.status.localeCompare(right.status)));
}

function signalSufficiency(signal: EditorialSignal | undefined): AgentContextSufficiency | undefined {
  if (!signal) return undefined;
  const status = signal.category === "evidence_insufficient" ? "insufficient"
    : signal.category === "evidence_conflicting" ? "conflicting"
      : signal.category === "evidence_stale" ? "stale"
        : undefined;
  return status ? Object.freeze({status, source: "ag2_editorial" as const, determinesReadiness: false as const}) : undefined;
}

function reviewSufficiency(nucleus: NucleusResolutionViewModel): AgentContextSufficiency {
  return Object.freeze({status: nucleus.evidence.status, source: "review_nucleus" as const, determinesReadiness: false as const});
}

function reviewIdForSignal(signal: EditorialSignal | undefined, input: AgentContextInput): string | undefined {
  if (!signal) return undefined;
  const direct = input.editorial.context.review.filter((review) => signal.id.includes(`review:${review.id}`));
  if (direct.length === 1) return direct[0]!.id;
  const evidence = new Set(signal.evidence.map((entry) => entry.id));
  const observations = input.editorial.context.observations.filter((observation) => observation.reviewId && (signal.id.endsWith(`:${observation.id}`) || observation.evidence.some((entry) => evidence.has(entry.id))));
  const explicit = unique(observations.map((observation) => observation.reviewId));
  if (explicit.length === 1) return explicit[0];
  const evidenceMatches = input.editorial.context.review.filter((review) => [...review.evidenceRefs, ...review.checkpointIds].some((id) => evidence.has(id)));
  return evidenceMatches.length === 1 ? evidenceMatches[0]!.id : undefined;
}

function itemIdForDiagnosis(diagnosis: AgentDiagnosis, input: AgentContextInput): string | undefined {
  const evidence = new Set(diagnosis.evidence.map((entry) => entry.id));
  const matches = unique(input.reasoning.diff.events.filter((event) => ["review", "process", "dependency"].includes(event.entity) && evidence.has(event.id)).map((event) => event.entity === "review" ? `review:${event.entityId}` : event.entity === "process" ? `process:${event.entityId}` : `dependency:${event.entityId}`));
  return matches.length === 1 ? matches[0] : undefined;
}

function references(input: Partial<AgentContextReferences>): AgentContextReferences {
  return Object.freeze({
    reviewCaseId: input.reviewCaseId,
    observationIds: unique(input.observationIds ?? []),
    diagnosisIds: unique(input.diagnosisIds ?? []),
    proposalIds: unique(input.proposalIds ?? []),
    insightIds: unique(input.insightIds ?? []),
    evidenceIds: unique(input.evidenceIds ?? []),
    fingerprints: unique(input.fingerprints ?? []),
  });
}

function recommendationClarity(insight: EditorialInsight): AgentContextRecommendation["clarity"] {
  if (!insight.conclusive || insight.confidence === "low") return "insufficient";
  return CONFLICTING_CATEGORIES.test(insight.category) ? "requires_review" : "clear";
}

function buildRecommendations(input: AgentContextInput, reviewPresentations: ReadonlyMap<string, SimplifiedReviewCasePresentation>, insightReviewIds: ReadonlyMap<string, string | undefined>): readonly AgentContextRecommendation[] {
  const result: AgentContextRecommendation[] = [];
  for (const [reviewId, presentation] of reviewPresentations) {
    if (!presentation.recommendation.available) continue;
    const confidence = presentationConfidence(presentation);
    result.push(Object.freeze({
      id: `ag3-recommendation:review:${reviewId}`,
      summary: presentation.recommendation.summary,
      source: "Review" as const,
      relatedItemId: `review:${reviewId}`,
      confidence,
      basis: "fact" as const,
      clarity: confidence?.level === "high" ? "clear" as const : "requires_review" as const,
      authorityHint: authorityHint("Review", "Review presentation", "/revision"),
    }));
  }
  for (const insight of input.editorial.insights) {
    const reviewId = insightReviewIds.get(insight.id);
    result.push(Object.freeze({
      id: `ag3-recommendation:editorial:${insight.id}`,
      summary: safe(insight.summary, "Revisar la señal editorial existente."),
      source: "AG2" as const,
      relatedItemId: reviewId ? `review:${reviewId}` : `editorial:${insight.id}`,
      confidence: insightConfidence(insight),
      basis: insight.basisEpistemicStatus,
      clarity: recommendationClarity(insight),
      authorityHint: editorialAuthority(insight),
    }));
  }
  return Object.freeze(result.sort((left, right) => left.id.localeCompare(right.id)));
}

function inboxBuckets(reviewCases: readonly ReviewCase[]): Map<string, ReviewInboxBucket> {
  const inbox = selectReviewInbox(reviewCases);
  return new Map((Object.entries(inbox.groups) as [ReviewInboxBucket, typeof inbox.groups[ReviewInboxBucket]][]).flatMap(([bucket, items]) => items.map((item) => [item.caseId, bucket] as const)));
}

function buildReviewItems(input: AgentContextInput, recommendations: readonly AgentContextRecommendation[], insightReviewIds: ReadonlyMap<string, string | undefined>, diagnosisItemIds: ReadonlyMap<string, string | undefined>, presentations: ReadonlyMap<string, SimplifiedReviewCasePresentation>): AgentContextItem[] {
  const buckets = inboxBuckets(input.reviewCases);
  const snapshotReviews = new Map(input.snapshot.review.map((review) => [review.id, review]));
  const proposals = new Map(input.proposals.map((proposal) => [proposal.diagnosisId, proposal]));
  const signals = new Map(input.editorial.signals.map((signal) => [signal.id, signal]));
  return [...input.reviewCases].sort((left, right) => left.id.localeCompare(right.id)).map((reviewCase) => {
    const presentation = presentations.get(reviewCase.id)!;
    const nucleus = buildNucleusResolutionViewModel({reviewCase, evaluatedAt: input.generatedAt});
    const snapshotReview = snapshotReviews.get(reviewCase.id);
    const linkedDiagnoses = input.diagnoses.filter((diagnosis) => diagnosisItemIds.get(diagnosis.id) === `review:${reviewCase.id}`).sort((left, right) => left.id.localeCompare(right.id));
    const linkedInsights = input.editorial.insights.filter((insight) => insightReviewIds.get(insight.id) === reviewCase.id).sort((left, right) => left.id.localeCompare(right.id));
    const linkedProposals = linkedDiagnoses.map((diagnosis) => proposals.get(diagnosis.id)).filter((proposal): proposal is AgentProposal => Boolean(proposal)).sort((left, right) => left.id.localeCompare(right.id));
    const linkedObservations = input.editorial.context.observations.filter((observation) => observation.reviewId === reviewCase.id);
    const state = reviewState(reviewCase, buckets.get(reviewCase.id), presentation);
    const blocked = Boolean(snapshotReview?.blocked || state === "blocked" || nucleus.facts.blocked || nucleus.facts.contradiction || nucleus.facts.reconciliationPending || nucleus.facts.compensationPending);
    const confidenceValues = [presentationConfidence(presentation), ...linkedDiagnoses.map(diagnosisConfidence), ...linkedInsights.map(insightConfidence)].filter((entry): entry is AgentContextConfidence => Boolean(entry));
    const sufficiencyValues = [reviewSufficiency(nucleus), ...linkedInsights.map((insight) => signalSufficiency(signals.get(insight.sourceSignalId))).filter((entry): entry is AgentContextSufficiency => Boolean(entry))];
    const recommendationIds = recommendations.filter((entry) => entry.relatedItemId === `review:${reviewCase.id}`).map((entry) => entry.id);
    const firstProposal = linkedProposals[0];
    return Object.freeze({
      id: `review:${reviewCase.id}`,
      kind: "review_case" as const,
      durable: true,
      title: presentation.problem.title,
      summary: presentation.problem.summary,
      issueCodes: unique(reviewCase.issues.map((issue) => issue.kind)),
      decisionOptions: presentationDecisionOptions(presentation),
      source: Object.freeze({id: sourceId(reviewCase), label: presentation.sourceLabel}),
      entity: Object.freeze({type: reviewCase.subject.type || "unknown", label: presentation.entityLabel, id: reviewCase.subject.id}),
      state,
      stateLabel: STATE_LABELS[state],
      domainPriority: reviewCase.priority,
      blocked,
      decisionNeed: reviewDecision(reviewCase, state, presentation),
      confidences: sortConfidences(confidenceValues),
      risk: Object.freeze({level: nucleus.autonomy.risk, source: "review_nucleus" as const}),
      sufficiency: sortSufficiency(sufficiencyValues),
      recommendationIds: unique(recommendationIds),
      authorityHint: reviewAuthority(nucleus, firstProposal),
      freshness: Object.freeze({status: reviewCase.status === "stale" || nucleus.evidence.status === "stale" ? "stale" as const : snapshotReview?.version === reviewCase.version ? "fresh" as const : "unknown" as const, updatedAt: reviewCase.updatedAt, version: reviewCase.version}),
      references: references({reviewCaseId: reviewCase.id, observationIds: linkedObservations.map((entry) => entry.id), diagnosisIds: linkedDiagnoses.map((entry) => entry.id), proposalIds: linkedProposals.map((entry) => entry.id), insightIds: linkedInsights.map((entry) => entry.id), evidenceIds: [...(snapshotReview?.evidenceReferences ?? []), ...linkedDiagnoses.flatMap((entry) => entry.evidence.map((evidence) => evidence.id)), ...linkedInsights.flatMap((entry) => entry.evidenceRefs)], fingerprints: unique([snapshotReview?.checkpoint?.checkpointFingerprint, snapshotReview?.checkpoint?.planFingerprint, snapshotReview?.checkpoint?.graphFingerprint, snapshotReview?.checkpoint?.snapshotFingerprint])}),
    });
  });
}

function buildEditorialItems(input: AgentContextInput, recommendations: readonly AgentContextRecommendation[], insightReviewIds: ReadonlyMap<string, string | undefined>): AgentContextItem[] {
  return input.editorial.insights.filter((insight) => !insightReviewIds.get(insight.id)).map((insight) => {
    const signal = input.editorial.signals.find((entry) => entry.id === insight.sourceSignalId);
    const blocked = CONFLICTING_CATEGORIES.test(insight.category);
    const state: AgentContextState = insight.requiresReview ? "needs_attention" : "no_action";
    const recommendationIds = recommendations.filter((entry) => entry.relatedItemId === `editorial:${insight.id}`).map((entry) => entry.id);
    const sufficiency = signal ? signalSufficiency(signal) : undefined;
    return Object.freeze({
      id: `editorial:${insight.id}`,
      kind: "editorial_insight" as const,
      durable: false,
      title: insight.entity ? `${insight.entity.kind}: ${insight.entity.id}` : "Señal editorial",
      summary: safe(insight.summary, "Existe una recomendación editorial pendiente de revisión."),
      issueCodes: Object.freeze([insight.category]),
      decisionOptions: Object.freeze([]),
      source: Object.freeze({id: "ag2_editorial_intelligence", label: "Inteligencia editorial"}),
      entity: Object.freeze({type: insight.entity?.kind ?? "unknown", label: insight.entity?.kind ?? "Entidad desconocida", id: insight.entity?.id}),
      state,
      stateLabel: STATE_LABELS[state],
      domainPriority: insight.priority,
      blocked,
      decisionNeed: blocked || insight.basisEpistemicStatus === "hypothesis" ? "human_decision_required" as const : "review_recommended" as const,
      confidences: Object.freeze([insightConfidence(insight)]),
      risk: Object.freeze({level: "unavailable" as const, source: "unavailable" as const}),
      sufficiency: Object.freeze(sufficiency ? [sufficiency] : [{status: "unknown" as const, source: "unknown" as const, determinesReadiness: false as const}]),
      recommendationIds: unique(recommendationIds),
      authorityHint: editorialAuthority(insight),
      freshness: Object.freeze({status: signal?.temporal === "historical" ? "stale" as const : "fresh" as const}),
      references: references({insightIds: [insight.id], observationIds: signal ? [signal.id] : [], evidenceIds: insight.evidenceRefs}),
    });
  });
}

function buildDiagnosisItems(input: AgentContextInput, diagnosisItemIds: ReadonlyMap<string, string | undefined>): AgentContextItem[] {
  const proposals = new Map(input.proposals.map((proposal) => [proposal.diagnosisId, proposal]));
  return input.diagnoses.filter((diagnosis) => !diagnosisItemIds.get(diagnosis.id)).map((diagnosis) => {
    const proposal = proposals.get(diagnosis.id);
    const blocked = Boolean(diagnosis.actionable && proposal?.blocked);
    const state: AgentContextState = blocked ? "blocked" : diagnosis.actionable ? "needs_attention" : "no_action";
    return Object.freeze({
      id: `diagnosis:${diagnosis.id}`,
      kind: "diagnosis" as const,
      durable: false,
      title: safe(diagnosis.title, "Diagnóstico observado"),
      summary: safe(diagnosis.summary, "El diagnóstico no dispone de un resumen seguro."),
      issueCodes: Object.freeze([diagnosis.category]),
      decisionOptions: Object.freeze([]),
      source: Object.freeze({id: "ag1_reasoning", label: "Observación y razonamiento"}),
      entity: Object.freeze({type: "unknown", label: "Contexto operativo"}),
      state,
      stateLabel: STATE_LABELS[state],
      domainPriority: diagnosisPriority(diagnosis),
      blocked,
      decisionNeed: blocked ? "blocked" as const : diagnosis.actionable ? "review_recommended" as const : "none" as const,
      confidences: Object.freeze([diagnosisConfidence(diagnosis)]),
      risk: Object.freeze({level: "unavailable" as const, source: "unavailable" as const}),
      sufficiency: Object.freeze([{status: diagnosis.conclusive ? "unknown" as const : "insufficient" as const, source: "unknown" as const, determinesReadiness: false as const}]),
      recommendationIds: Object.freeze([]),
      authorityHint: diagnosisAuthority(diagnosis, proposal),
      freshness: Object.freeze({status: diagnosis.evidence.length ? "fresh" as const : "unknown" as const}),
      references: references({diagnosisIds: [diagnosis.id], proposalIds: proposal ? [proposal.id] : [], evidenceIds: diagnosis.evidence.map((entry) => entry.id)}),
    });
  });
}

function buildOperationalItems(input: AgentContextInput): AgentContextItem[] {
  const processes: AgentContextItem[] = input.snapshot.processes.map((process) => {
    const blocked = process.state === "blocked" || process.state === "error";
    const state: AgentContextState = blocked ? "blocked" : process.active ? "in_progress" : process.temporal === "historical" || process.temporal === "recent" ? "resolved" : "no_action";
    return Object.freeze({id: `process:${process.id}`, kind: "process" as const, durable: false, title: process.title, summary: safe(process.reason?.text, process.active ? "Proceso actualmente en curso." : "Proceso sin actividad pendiente."), issueCodes: Object.freeze([`process_${process.state}`]), decisionOptions: Object.freeze([]), source: Object.freeze({id: operationalSourceId(process.source), label: process.source}), entity: Object.freeze({type: "process", label: "Proceso", id: process.id}), state, stateLabel: STATE_LABELS[state], domainPriority: "unavailable" as const, blocked, decisionNeed: blocked ? "blocked" as const : "none" as const, confidences: Object.freeze([]), risk: Object.freeze({level: "unavailable" as const, source: "unavailable" as const}), sufficiency: Object.freeze([{status: "unknown" as const, source: "unknown" as const, determinesReadiness: false as const}]), recommendationIds: Object.freeze([]), authorityHint: authorityHint(ownerTarget(process.authority.owner), process.authority.source, process.destination), freshness: Object.freeze({status: process.temporal === "historical" ? "stale" as const : "fresh" as const, updatedAt: process.updatedAt}), references: references({observationIds: [process.id]})});
  });
  const dependencies: AgentContextItem[] = input.snapshot.dependencies.filter((dependency) => dependency.current && ["unavailable", "blocked", "degraded"].includes(dependency.state)).map((dependency) => Object.freeze({id: `dependency:${dependency.id}`, kind: "dependency" as const, durable: false, title: dependency.label, summary: safe(dependency.reason?.text, "La dependencia necesita atención antes de continuar."), issueCodes: Object.freeze([`dependency_${dependency.state}`]), decisionOptions: Object.freeze([]), source: Object.freeze({id: dependency.id, label: dependency.label}), entity: Object.freeze({type: "dependency", label: "Dependencia", id: dependency.id}), state: "blocked" as const, stateLabel: STATE_LABELS.blocked, domainPriority: dependency.state === "degraded" ? "high" as const : "critical" as const, blocked: true, decisionNeed: "blocked" as const, confidences: Object.freeze([]), risk: Object.freeze({level: "unavailable" as const, source: "unavailable" as const}), sufficiency: Object.freeze([{status: "unknown" as const, source: "unknown" as const, determinesReadiness: false as const}]), recommendationIds: Object.freeze([]), authorityHint: authorityHint("unknown", "LES 4 live checks", dependency.destination), freshness: Object.freeze({status: dependency.checkedAt ? "fresh" as const : "unknown" as const, updatedAt: dependency.checkedAt}), references: references({observationIds: [dependency.id], evidenceIds: unique([dependency.reason?.code])})}));
  return [...processes, ...dependencies];
}

function statements(input: AgentContextInput, insightReviewIds: ReadonlyMap<string, string | undefined>, diagnosisItemIds: ReadonlyMap<string, string | undefined>): readonly AgentContextStatement[] {
  const result: AgentContextStatement[] = [];
  for (const fact of input.reasoning.facts) result.push(Object.freeze({id: `ag3-statement:fact:${fact.id}`, epistemicStatus: "fact" as const, summary: `${fact.subjectId}: ${fact.predicate} = ${fact.value}`, source: fact.source, relatedItemId: fact.subject === "review" ? `review:${fact.subjectId}` : fact.subject === "process" ? `process:${fact.subjectId}` : fact.subject === "dependency" ? `dependency:${fact.subjectId}` : undefined, evidenceIds: unique(fact.evidenceIds)}));
  for (const observation of input.editorial.context.observations) {
    const signal = input.editorial.signals.find((entry) => entry.id.endsWith(`:${observation.id}`));
    const insight = signal ? input.editorial.insights.find((entry) => entry.sourceSignalId === signal.id) : undefined;
    const reviewId = observation.reviewId ?? (insight ? insightReviewIds.get(insight.id) : undefined);
    result.push(Object.freeze({id: `ag3-statement:fact:${observation.id}`, epistemicStatus: "fact" as const, summary: `${observation.dimension}: ${observation.assessment}`, source: "AG2 evidence", relatedItemId: reviewId ? `review:${reviewId}` : insight ? `editorial:${insight.id}` : undefined, evidenceIds: unique(observation.evidence.map((entry) => entry.id))}));
  }
  for (const signal of input.editorial.signals) {
    const reviewId = reviewIdForSignal(signal, input);
    const insight = input.editorial.insights.find((entry) => entry.sourceSignalId === signal.id);
    result.push(Object.freeze({id: `ag3-statement:${signal.epistemicStatus}:${signal.id}`, epistemicStatus: signal.epistemicStatus, summary: safe(signal.explanation, signal.category), source: "AG2 signal", relatedItemId: reviewId ? `review:${reviewId}` : insight ? `editorial:${insight.id}` : undefined, evidenceIds: unique(signal.evidence.map((entry) => entry.id))}));
  }
  for (const insight of input.editorial.insights) result.push(Object.freeze({id: `ag3-statement:recommendation:${insight.id}`, epistemicStatus: "recommendation" as const, summary: safe(insight.summary, insight.category), source: "AG2 insight", relatedItemId: insightReviewIds.get(insight.id) ? `review:${insightReviewIds.get(insight.id)}` : `editorial:${insight.id}`, evidenceIds: unique(insight.evidenceRefs)}));
  for (const diagnosis of input.diagnoses) result.push(Object.freeze({id: `ag3-statement:inference:${diagnosis.id}`, epistemicStatus: "inference" as const, summary: safe(diagnosis.summary, diagnosis.category), source: "AG1 diagnosis", relatedItemId: diagnosisItemIds.get(diagnosis.id) ?? `diagnosis:${diagnosis.id}`, evidenceIds: unique(diagnosis.evidence.map((entry) => entry.id))}));
  return Object.freeze([...new Map(result.map((entry) => [entry.id, entry])).values()].sort((left, right) => left.id.localeCompare(right.id)));
}

function aggregate(items: readonly AgentContextItem[], key: (item: AgentContextItem) => Readonly<{id: string; label: string}>): readonly AgentContextAggregation[] {
  const grouped = new Map<string, {label: string; items: AgentContextItem[]}>();
  for (const item of items) {
    const selected = key(item);
    const entry = grouped.get(selected.id) ?? {label: selected.label, items: []};
    entry.items.push(item);
    grouped.set(selected.id, entry);
  }
  return Object.freeze([...grouped.entries()].map(([id, entry]) => Object.freeze({id, label: entry.label, total: entry.items.length, ready: entry.items.filter((item) => item.state === "ready").length, noAction: entry.items.filter((item) => item.state === "no_action").length, needsAttention: entry.items.filter((item) => item.state === "needs_attention").length, inProgress: entry.items.filter((item) => item.state === "in_progress").length, resolved: entry.items.filter((item) => item.state === "resolved").length, blocked: entry.items.filter((item) => item.blocked).length})).sort((left, right) => left.id.localeCompare(right.id)));
}

function semanticIdentity(input: AgentContextInput): string {
  return computeUniversalFingerprint({
    contractVersion: AGENT_CONTEXT_CONTRACT_VERSION,
    observationFingerprint: input.snapshot.observationFingerprint,
    reasoningFingerprint: input.reasoning.observationFingerprint,
    eventIds: input.reasoning.diff.events.map((event) => event.id).sort(),
    diagnosisIds: input.diagnoses.map((diagnosis) => diagnosis.id).sort(),
    proposalIds: input.proposals.map((proposal) => proposal.id).sort(),
    insightIds: input.editorial.insights.map((insight) => insight.id).sort(),
    review: input.reviewCases.map((reviewCase) => ({id: reviewCase.id, version: reviewCase.version, status: reviewCase.status})).sort((left, right) => left.id.localeCompare(right.id)),
  });
}

export function composeAgentContext(input: AgentContextInput): AgentContext {
  const presentations = new Map(input.reviewCases.map((reviewCase) => [reviewCase.id, buildSimplifiedReviewCasePresentation(reviewCase)]));
  const insightReviewIds = new Map(input.editorial.insights.map((insight) => [insight.id, reviewIdForSignal(input.editorial.signals.find((signal) => signal.id === insight.sourceSignalId), input)]));
  const diagnosisItemIds = new Map(input.diagnoses.map((diagnosis) => [diagnosis.id, itemIdForDiagnosis(diagnosis, input)]));
  const recommendations = buildRecommendations(input, presentations, insightReviewIds);
  const draftItems = [...buildReviewItems(input, recommendations, insightReviewIds, diagnosisItemIds, presentations), ...buildEditorialItems(input, recommendations, insightReviewIds), ...buildDiagnosisItems(input, diagnosisItemIds), ...buildOperationalItems(input)];
  const items = Object.freeze([...new Map(draftItems.map((item) => [item.id, item])).values()].sort((left, right) => STATE_RANK[left.state] - STATE_RANK[right.state] || (PRIORITY_RANK[right.domainPriority] ?? 0) - (PRIORITY_RANK[left.domainPriority] ?? 0) || left.id.localeCompare(right.id)));
  const groups = Object.freeze(Object.fromEntries((Object.keys(STATE_LABELS) as AgentContextState[]).map((state) => [state, Object.freeze(items.filter((item) => item.state === state).map((item) => item.id))])) as Record<AgentContextState, readonly string[]>);
  const snapshotIdentity = semanticIdentity(input);
  const aligned = input.reasoning.observationFingerprint === input.snapshot.observationFingerprint && input.editorial.context.observationFingerprint === input.snapshot.observationFingerprint;
  const freshnessStatus = !aligned ? "unknown" as const : items.some((item) => item.freshness.status === "stale") ? "stale" as const : "fresh" as const;
  const highConfidenceItems = new Set(recommendations.filter((recommendation) => recommendation.clarity === "clear" && recommendation.confidence?.level === "high" && recommendation.relatedItemId).map((recommendation) => recommendation.relatedItemId));
  return Object.freeze({
    contractVersion: AGENT_CONTEXT_CONTRACT_VERSION,
    generatedAt: input.generatedAt,
    snapshotIdentity,
    summary: Object.freeze({totalRelevantItems: items.length, readyCount: groups.ready.length, noActionCount: groups.no_action.length, needsAttentionCount: groups.needs_attention.length, inProgressCount: groups.in_progress.length, resolvedCount: groups.resolved.length, blockedStateCount: groups.blocked.length, blockedCount: items.filter((item) => item.blocked).length, highConfidenceRecommendationCount: highConfidenceItems.size, humanDecisionRequiredCount: items.filter((item) => item.decisionNeed === "human_decision_required").length}),
    items,
    groups,
    sourceSummaries: aggregate(items, (item) => item.source),
    prioritySummaries: aggregate(items, (item) => ({id: item.domainPriority, label: item.domainPriority === "unavailable" ? "Prioridad no disponible" : item.domainPriority})),
    entitySummaries: aggregate(items, (item) => ({id: item.entity.type, label: item.entity.label})),
    statements: statements(input, insightReviewIds, diagnosisItemIds),
    recommendations,
    changes: Object.freeze({changed: input.reasoning.diff.changed, eventIds: unique(input.reasoning.diff.events.map((event) => event.id))}),
    editorialSufficiency: input.editorial.sufficiency,
    freshness: Object.freeze({status: freshnessStatus, observationId: input.snapshot.observationId, observationFingerprint: input.snapshot.observationFingerprint, snapshotIdentity}),
    boundary: Object.freeze({readOnly: true as const, projectionOnly: true as const, executes: false as const, persists: false as const, plans: false as const, createsAuthority: false as const, decidesAutonomy: false as const}),
  });
}

export const agentContextComposerSecurity = Object.freeze({pure: true, deterministic: true, projectionOnly: true, readsOnlyArguments: true, createsStore: false, persists: false, fetches: false, writes: false, executes: false, createsPlanner: false, createsExecutor: false, createsAuthority: false, invokesReview: false, invokesAu7: false, invokesAu8: false, determinesReadiness: false, usesClock: false, usesRandomness: false} as const);
