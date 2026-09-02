import {buildReviewContextHref} from "../../review/navigation";
import {
  selectDecisionSupportByAttention,
  type AgentDecisionSupport,
} from "../context/decisions";
import type {
  AgentWorkspaceItemKind,
  AgentWorkspaceMetrics,
  AgentWorkspaceModel,
  AgentWorkspacePriorityItem,
  AgentWorkspaceStatus,
} from "./types";

const SOURCE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ufc: "UFC",
  one: "ONE Championship",
  bkfc: "BKFC",
  external_news: "Noticias externas",
  ag2_editorial_intelligence: "Análisis editorial",
  ag1_reasoning: "Análisis del laboratorio",
  references: "Entidades de referencia",
});

const ENTITY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  news: "Noticia",
  event: "Evento",
  fighter: "Luchador",
  organization: "Organización",
  category: "Categoría",
  relationship: "Relación",
  dependency: "Dependencia",
  process: "Proceso",
  unknown: "Asunto editorial",
});

const CONFIDENCE_LABELS = Object.freeze({
  high: "Recomendación de confianza alta",
  medium: "Recomendación de confianza media",
  low: "Recomendación de confianza baja",
} as const);

const STATUS_LABELS: Readonly<Record<AgentWorkspaceStatus, string>> = Object.freeze({
  calm: "Todo bajo control",
  attention: "Requiere atención",
  blocked: "Hay bloqueos",
  empty: "Sin asuntos relevantes",
});

const isBlocked = (decision: AgentDecisionSupport): boolean =>
  decision.decisionState === "blocked_by_contradiction" || decision.decisionState === "blocked_by_missing_information";

const needsHumanDecision = (decision: AgentDecisionSupport): boolean =>
  decision.humanDecision.status === "required" || decision.decisionState === "human_decision_required";

const isRecommendation = (decision: AgentDecisionSupport): boolean =>
  decision.decisionState === "clear_recommendation" || decision.decisionState === "recommendation_with_caveats";

function itemKind(decision: AgentDecisionSupport): AgentWorkspaceItemKind {
  if (isBlocked(decision)) return "blocked";
  if (needsHumanDecision(decision)) return "human_decision";
  if (isRecommendation(decision)) return "recommendation";
  return "attention";
}

function itemStatusLabel(decision: AgentDecisionSupport): string {
  if (isBlocked(decision)) return decision.decisionState === "blocked_by_contradiction" ? "Bloqueado por contradicción" : "Bloqueado por información pendiente";
  if (needsHumanDecision(decision)) return "Necesita tu decisión";
  if (decision.decisionState === "clear_recommendation") return "Recomendación clara";
  if (decision.decisionState === "recommendation_with_caveats") return "Recomendación con reservas";
  return "Conviene revisarlo";
}

function sourceLabel(decision: AgentDecisionSupport): string {
  const source = decision.subject.source?.trim();
  if (!source) return "Laboratorio";
  return SOURCE_LABELS[source.toLowerCase()] ?? (source.includes("_") ? "Laboratorio" : source);
}

function entityLabel(decision: AgentDecisionSupport): string {
  return ENTITY_LABELS[decision.subject.kind] ?? "Asunto editorial";
}

function itemTitle(decision: AgentDecisionSupport): string {
  const label = decision.issue.label.trim();
  if (!label.includes(":") && !label.includes("_") && label !== label.toLowerCase()) return label;
  const entity = entityLabel(decision).toLowerCase();
  if (decision.decisionState === "blocked_by_contradiction") return `Evidencia contradictoria en ${entity}`;
  if (decision.decisionState === "blocked_by_missing_information") return `Información pendiente sobre ${entity}`;
  return decision.explanation.headline;
}

function reviewNavigation(decision: AgentDecisionSupport, reviewSearch: string): Pick<AgentWorkspacePriorityItem, "href" | "actionLabel"> {
  if (decision.authorityHint.target !== "Review") return {href: null, actionLabel: null};
  if (decision.trace.reviewCaseId) {
    return {
      href: buildReviewContextHref(reviewSearch, decision.trace.reviewCaseId),
      actionLabel: needsHumanDecision(decision) || isBlocked(decision) ? "Revisar caso" : "Ver caso",
    };
  }
  return {href: buildReviewContextHref(reviewSearch, ""), actionLabel: "Abrir revisión"};
}

function priorityItem(decision: AgentDecisionSupport, reviewSearch: string): AgentWorkspacePriorityItem {
  const navigation = reviewNavigation(decision, reviewSearch);
  return Object.freeze({
    id: decision.id,
    kind: itemKind(decision),
    statusLabel: itemStatusLabel(decision),
    title: itemTitle(decision),
    summary: decision.explanation.summary,
    sourceLabel: sourceLabel(decision),
    entityLabel: entityLabel(decision),
    recommendation: decision.preferredOption?.label ?? null,
    confidenceLabel: decision.preferredOption?.confidence ? CONFIDENCE_LABELS[decision.preferredOption.confidence.level] : null,
    humanDecisionReason: needsHumanDecision(decision) ? decision.humanDecision.explanation : null,
    blockedBy: isBlocked(decision) ? decision.missingInformation[0]?.summary ?? decision.humanDecision.explanation : null,
    staleWarning: decision.freshness.status === "stale" ? "Este análisis puede estar desactualizado." : null,
    ...navigation,
  });
}

function metricsFor(decisions: readonly AgentDecisionSupport[]): AgentWorkspaceMetrics {
  return Object.freeze({
    needsAttention: decisions.filter((decision) => decision.priority !== "no_attention").length,
    clearRecommendations: decisions.filter((decision) => decision.decisionState === "clear_recommendation").length,
    humanDecisionRequired: decisions.filter(needsHumanDecision).length,
    blocked: decisions.filter(isBlocked).length,
    noAction: decisions.filter((decision) => decision.decisionState === "no_action_needed").length,
  });
}

function statusFor(decisions: readonly AgentDecisionSupport[], metrics: AgentWorkspaceMetrics): AgentWorkspaceStatus {
  if (!decisions.length) return "empty";
  if (metrics.blocked) return "blocked";
  if (metrics.needsAttention) return "attention";
  return "calm";
}

function humanSummary(metrics: AgentWorkspaceMetrics, status: AgentWorkspaceStatus): string {
  if (status === "empty") return "El agente todavía no tiene asuntos relevantes que mostrar.";
  if (status === "calm") return `No hay asuntos que requieran tu decisión ahora mismo. ${metrics.noAction} ${metrics.noAction === 1 ? "asunto no requiere" : "asuntos no requieren"} intervención.`;
  const parts = [
    `${metrics.needsAttention} ${metrics.needsAttention === 1 ? "asunto necesita" : "asuntos necesitan"} tu atención.`,
    `${metrics.clearRecommendations} ${metrics.clearRecommendations === 1 ? "tiene" : "tienen"} una recomendación clara.`,
    `${metrics.humanDecisionRequired} ${metrics.humanDecisionRequired === 1 ? "necesita" : "necesitan"} tu decisión.`,
  ];
  if (metrics.blocked) parts.push(`${metrics.blocked} ${metrics.blocked === 1 ? "está bloqueado" : "están bloqueados"}.`);
  return parts.join(" ");
}

function headlineFor(status: AgentWorkspaceStatus): string {
  if (status === "blocked") return "Hay asuntos bloqueados que necesitan tu atención.";
  if (status === "attention") return "Hay asuntos que conviene revisar.";
  if (status === "calm") return "Todo está bajo control.";
  return "Aún no hay contexto suficiente.";
}

export function buildAgentWorkspaceModel(
  decisions: readonly AgentDecisionSupport[],
  options: Readonly<{reviewSearch?: string; priorityLimit?: number}> = {},
): AgentWorkspaceModel {
  const metrics = metricsFor(decisions);
  const status = statusFor(decisions, metrics);
  const limit = Math.max(1, Math.min(4, Math.floor(options.priorityLimit ?? 4)));
  const attention = selectDecisionSupportByAttention(decisions).filter((decision) => decision.priority !== "no_attention");
  const priorityItems = Object.freeze(attention.slice(0, limit).map((decision) => priorityItem(decision, options.reviewSearch ?? "")));
  return Object.freeze({
    status,
    statusLabel: STATUS_LABELS[status],
    headline: headlineFor(status),
    summary: humanSummary(metrics, status),
    metrics,
    priorityItems,
    hiddenPriorityCount: Math.max(0, attention.length - priorityItems.length),
    presentationOnly: true as const,
    boundary: Object.freeze({consumesDecisionSupport: true as const, readOnly: true as const, executes: false as const, persists: false as const, createsAuthority: false as const, mutatesReview: false as const}),
  });
}

export const agentWorkspacePresentationSecurity = Object.freeze({
  pure: true,
  deterministic: true,
  consumesDecisionSupportOnly: true,
  createsStore: false,
  persists: false,
  fetches: false,
  writes: false,
  executes: false,
  createsAuthority: false,
  mutatesReview: false,
} as const);
