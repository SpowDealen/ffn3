import type {AgentDecisionSupport} from "../context/decisions";
import type {AgentStructuredProposal} from "../context/proposals";
import type {AgentWorkspaceModel} from "../workspace";
import type {
  AgentConversationAlternative,
  AgentConversationEvidenceItem,
  AgentConversationExplainabilityItem,
  AgentConversationIntentType,
  AgentConversationMessage,
  AgentConversationMessageSection,
  AgentConversationReferenceResolution,
  AgentConversationResponse,
} from "./types";

const SOURCE_LABELS: Readonly<Record<string, string>> = Object.freeze({ufc: "UFC", one: "ONE Championship", bkfc: "BKFC", external_news: "Noticias externas", ag2_editorial_intelligence: "Análisis editorial", ag1_reasoning: "Análisis del laboratorio", references: "Entidades de referencia"});

function stableIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "empty";
}

function humanize(value: string): string {
  const clean = value.trim();
  if (/review_pending\s*=\s*open/i.test(clean)) return "El caso está abierto y pendiente de revisión.";
  if (/review_pending\s*=\s*stale/i.test(clean)) return "El caso pendiente de revisión está desactualizado.";
  if (/fighter_identity\s*:\s*ambiguous/i.test(clean)) return "La identidad del luchador figura como ambigua.";
  if (/presenta review_pending/i.test(clean)) return "El caso presenta una revisión pendiente.";
  if (/^confidence review conservada:/i.test(clean)) return clean.replace(/^confidence review conservada:/i, "Confianza registrada en Review:");
  if (/suficiencia insufficient seg[uú]n review_nucleus/i.test(clean)) return "La evidencia de Review es insuficiente.";
  if (/suficiencia stale seg[uú]n review_nucleus/i.test(clean)) return "La evidencia de Review está desactualizada.";
  if (/la propuesta conserva confidences distintas por origen/i.test(clean)) return "La propuesta conserva niveles de confianza distintos según su origen; no se han promediado.";
  if (clean === "context_stale") return "El contexto está desactualizado.";
  return clean;
}

function humanizeSource(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "les 8:review") return "Estado de revisión";
  if (normalized === "ag2 evidence") return "Evidencia editorial";
  if (normalized === "ag2 signal") return "Señales editoriales";
  if (normalized === "ag2 insight") return "Análisis editorial";
  if (normalized === "ag1 diagnosis") return "Diagnóstico del laboratorio";
  return value;
}

function evidence(items: AgentStructuredProposal["facts"] | AgentStructuredProposal["inferences"] | AgentStructuredProposal["hypotheses"]): readonly AgentConversationEvidenceItem[] {
  const seen = new Set<string>();
  const projected = items.map((item) => Object.freeze({id: item.id, summary: humanize(item.summary), source: humanizeSource(item.source)})).filter((item) => {
    const key = `${item.summary}\u0000${item.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return Object.freeze(projected.slice(0, 3));
}

function alternatives(decision: AgentDecisionSupport): readonly AgentConversationAlternative[] {
  return Object.freeze(decision.alternatives.map((alternative) => Object.freeze({
    id: alternative.alternativeId,
    label: alternative.label,
    strengths: Object.freeze(alternative.strengths.slice(0, 3).map(humanize)),
    weaknesses: Object.freeze(alternative.weaknesses.slice(0, 3).map(humanize)),
    unknowns: Object.freeze(alternative.unknowns.slice(0, 2).map(humanize)),
    viable: alternative.viable,
    assessment: alternative.relativeAssessment,
  })));
}

function reviewHref(workspace: AgentWorkspaceModel, reviewCaseId: string | null): string | null {
  if (!reviewCaseId) return null;
  const direct = workspace.priorityItems.find((item) => item.href && item.href.includes(encodeURIComponent(reviewCaseId)))?.href;
  if (direct) return direct;
  const available = workspace.priorityItems.find((item) => item.href)?.href;
  if (!available) return null;
  const url = new URL(available, "http://localhost");
  url.searchParams.set("case", reviewCaseId);
  return `${url.pathname}${url.search}`;
}

export function buildConversationExplainabilityItems(
  decisions: readonly AgentDecisionSupport[],
  proposals: readonly AgentStructuredProposal[],
  workspace: AgentWorkspaceModel,
): readonly AgentConversationExplainabilityItem[] {
  const byProposal = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  return Object.freeze([...decisions].sort((left, right) => left.id.localeCompare(right.id)).map((decision) => {
    const proposal = byProposal.get(decision.proposalId);
    const workspaceItem = workspace.priorityItems.find((item) => item.id === decision.id);
    const reviewCaseId = decision.trace.reviewCaseId ?? null;
    const href = workspaceItem?.href ?? reviewHref(workspace, reviewCaseId);
    const reference = Object.freeze({
      id: `agent-conversation-reference:${decision.id}`,
      kind: href ? "review_case" as const : "decision_support" as const,
      label: workspaceItem?.title ?? decision.issue.label,
      sourceLabel: workspaceItem?.sourceLabel ?? SOURCE_LABELS[decision.subject.source ?? ""] ?? "Laboratorio",
      entityLabel: workspaceItem?.entityLabel ?? "Asunto editorial",
      href,
      actionLabel: href ? (workspaceItem?.actionLabel ?? "Ver caso" as const) : null,
      decisionSupportId: decision.id,
      proposalId: decision.proposalId,
      reviewCaseId,
      freshness: decision.freshness.status,
    });
    const preferred = decision.preferredOption;
    const proposalRecommendation = proposal?.recommendation;
    const rejected = (proposalRecommendation?.rationale.rejectedAlternatives ?? decision.explanation.whyNot).map((entry) => {
      const alternative = decision.alternatives.find((candidate) => candidate.alternativeId === entry.alternativeId);
      return `${alternative?.label ?? "Otra alternativa"}: ${humanize(entry.reason)}`;
    });
    return Object.freeze({
      decisionSupportId: decision.id,
      proposalId: decision.proposalId,
      reviewCaseId,
      snapshotIdentity: decision.trace.agentContextSnapshotIdentity,
      freshness: decision.freshness.status,
      source: decision.subject.source,
      label: reference.label,
      summary: humanize(decision.explanation.summary),
      why: Object.freeze(decision.explanation.why.slice(0, 5).map(humanize)),
      facts: proposal ? evidence(proposal.facts) : Object.freeze([]),
      inferences: proposal ? evidence(proposal.inferences) : Object.freeze([]),
      hypotheses: proposal ? evidence(proposal.hypotheses) : Object.freeze([]),
      alternatives: alternatives(decision),
      recommendation: preferred ? Object.freeze({
        label: preferred.label,
        reasons: Object.freeze((proposalRecommendation?.rationale.primaryReasons ?? decision.explanation.why).slice(0, 4).map(humanize)),
        rejectedAlternatives: Object.freeze(rejected.slice(0, 3)),
        caveats: Object.freeze((proposalRecommendation?.rationale.caveats ?? decision.explanation.caveats).slice(0, 4).map(humanize)),
      }) : null,
      contradictions: Object.freeze(decision.contradictions.map((entry) => humanize(entry.summary))),
      ambiguities: Object.freeze(decision.ambiguities.map((entry) => humanize(entry.summary))),
      missingInformation: Object.freeze(decision.missingInformation.map((entry) => humanize(entry.summary))),
      expectedOutcome: decision.expectedOutcome ? Object.freeze({summary: humanize(decision.expectedOutcome.summary), observed: false as const}) : null,
      humanDecision: decision.humanDecision.explanation ? humanize(decision.humanDecision.explanation) : null,
      reference,
    });
  }));
}

function metadata(snapshotIdentity: string, intentType: AgentConversationIntentType, items: readonly AgentConversationExplainabilityItem[], observed: false | null = null) {
  return Object.freeze({
    intentType,
    snapshotIdentity,
    referencedDecisionSupportIds: Object.freeze(items.map((item) => item.decisionSupportId)),
    referencedProposalIds: Object.freeze(items.map((item) => item.proposalId)),
    referencedReviewCaseIds: Object.freeze(items.map((item) => item.reviewCaseId).filter((id): id is string => Boolean(id))),
    expectedOutcomeObserved: observed,
  });
}

function response(
  snapshotIdentity: string,
  intentType: AgentConversationIntentType,
  status: AgentConversationResponse["status"],
  text: string,
  item: AgentConversationExplainabilityItem | null,
  sections: readonly AgentConversationMessageSection[] = [],
  candidates: readonly AgentConversationExplainabilityItem[] = [],
  observed: false | null = null,
): AgentConversationResponse {
  const references = candidates.length ? candidates.map((candidate) => candidate.reference) : item ? [item.reference] : [];
  const referencedItems = candidates.length ? candidates : item ? [item] : [];
  const message: AgentConversationMessage = Object.freeze({
    id: `agent-conversation:${stableIdPart(snapshotIdentity)}:${intentType}-answer`,
    role: "agent",
    kind: status === "answered" ? "answer" : "system_notice",
    text,
    highlights: Object.freeze([]),
    sections: Object.freeze(sections.filter((section) => section.items.length).map((section) => Object.freeze({label: section.label, items: Object.freeze([...section.items])}))),
    references: Object.freeze(references),
    metadata: metadata(snapshotIdentity, intentType, referencedItems, observed),
    readOnly: true,
  });
  return Object.freeze({status, message});
}

function unresolved(snapshotIdentity: string, intentType: AgentConversationIntentType, resolution: AgentConversationReferenceResolution): AgentConversationResponse {
  if (resolution.status === "ambiguous") return response(snapshotIdentity, intentType, "needs_reference", "No puedo saber con seguridad a cuál te refieres. Tengo estas opciones; selecciona un caso de forma explícita.", null, [], resolution.candidates);
  if (resolution.status === "stale") return response(snapshotIdentity, intentType, "needs_reference", "No puedo explicar esa referencia porque el snapshot AG3 indica que está desactualizada. Actualiza el estado y vuelve a seleccionarla.", null, [], resolution.candidates);
  if (resolution.reason === "snapshot_changed") return response(snapshotIdentity, intentType, "needs_reference", "El estado ha cambiado y he descartado la referencia anterior. Selecciona de nuevo el asunto que quieres explicar.", null);
  return response(snapshotIdentity, intentType, "needs_reference", "No tengo una referencia segura para responder. Selecciona un caso o pide que te muestre el asunto dudoso.", null);
}

function section(label: string, items: readonly string[]): AgentConversationMessageSection {
  return Object.freeze({label, items: Object.freeze([...items])});
}

function lowerFirst(value: string): string {
  return value ? `${value.charAt(0).toLocaleLowerCase("es")}${value.slice(1)}` : value;
}

export function respondWithConversationExplainability(
  snapshotIdentity: string,
  intentType: Extract<AgentConversationIntentType, "why" | "evidence" | "alternatives" | "why_recommended" | "missing_information" | "expected_next" | "explain_reference">,
  resolution: AgentConversationReferenceResolution,
): AgentConversationResponse {
  if (resolution.status !== "resolved" || !resolution.item) return unresolved(snapshotIdentity, intentType, resolution);
  const item = resolution.item;
  if (intentType === "why") return response(snapshotIdentity, intentType, "answered", `Esto es lo que explica el estado de ${item.label}.`, item, [section("Motivos", item.why), section("Contradicciones", item.contradictions), section("Dudas abiertas", item.ambiguities), section("Información pendiente", item.missingInformation)]);
  if (intentType === "evidence") return response(snapshotIdentity, intentType, "answered", `Esta es la evidencia trazable disponible para ${item.label}.`, item, [section("Hechos", item.facts.map((entry) => `${entry.summary} Fuente: ${entry.source}.`)), section("Inferencias", item.inferences.map((entry) => `${entry.summary} Fuente: ${entry.source}.`)), section("Hipótesis", item.hypotheses.map((entry) => `${entry.summary} Fuente: ${entry.source}.`))]);
  if (intentType === "alternatives") return response(snapshotIdentity, intentType, "answered", item.alternatives.length ? `Hay ${item.alternatives.length} ${item.alternatives.length === 1 ? "alternativa documentada" : "alternativas documentadas"}.` : "No hay alternativas documentadas para este asunto.", item, item.alternatives.map((alternative) => section(alternative.label, [...alternative.strengths.map((value) => `A favor: ${value}`), ...alternative.weaknesses.map((value) => `En contra: ${value}`), ...alternative.unknowns.map((value) => `Duda: ${value}`), alternative.viable ? "Viable según AG3." : "No viable según AG3."])));
  if (intentType === "why_recommended") {
    if (!item.recommendation) return response(snapshotIdentity, intentType, "answered", "No hay una recomendación defendible para esta referencia.", item, [section("Dudas abiertas", [...item.ambiguities, ...item.missingInformation])]);
    return response(snapshotIdentity, intentType, "answered", `La recomendación es ${item.recommendation.label}, pero no equivale a certeza.`, item, [section("Por qué se prefiere", item.recommendation.reasons), section("Por qué no las demás", item.recommendation.rejectedAlternatives), section("Reservas e incertidumbre", item.recommendation.caveats)]);
  }
  if (intentType === "missing_information") return response(snapshotIdentity, intentType, "answered", item.missingInformation.length ? "Esta es la información que todavía falta para entender o decidir el caso con seguridad." : "No falta información relevante para entender este caso.", item, [section("Información pendiente", item.missingInformation)]);
  if (intentType === "expected_next") {
    if (!item.expectedOutcome) return response(snapshotIdentity, intentType, "answered", "AG3 no documenta un resultado posterior esperado para este asunto.", item);
    return response(snapshotIdentity, intentType, "answered", `Si posteriormente se autoriza, ${lowerFirst(item.expectedOutcome.summary)}`, item, [], [], false);
  }
  const recommendation = item.recommendation ? [`Recomendación: ${item.recommendation.label}. No equivale a certeza.`] : ["No hay una recomendación defendible todavía."];
  return response(snapshotIdentity, intentType, "answered", item.summary, item, [section("Por qué", item.why.slice(0, 3)), section("Recomendación", recommendation), section("Dudas abiertas", [...item.ambiguities, ...item.missingInformation].slice(0, 3))]);
}

export const agentConversationExplainabilitySecurity = Object.freeze({pure: true, deterministic: true, projectionOnly: true, sourceOfTruth: false, preservesEpistemicStatus: true, executes: false, persists: false, fetches: false, writes: false, llm: false, openAi: false, mutatesReview: false} as const);
