import {buildNucleusCompletionSummary, buildNucleusEvidenceSummary, buildNucleusExecutionSummary, buildNucleusKnowledgeSummary, buildNucleusResolutionSummary, buildNucleusResolutionViewModel, buildNucleusSummary} from "./model";
import {OPERATIONAL_WORKSPACE_VERSION, type BuildOperationalWorkspaceInput, type OperationalWorkspaceMetric, type OperationalWorkspaceViewModel, type OperationalWorkspaceZone, type OperationalWorkspaceZoneId, type OperationalWorkspaceZoneState} from "./workspaceTypes";
import type {NucleusResolutionViewModel, NucleusTimelineEvent} from "./types";

const navigation = Object.freeze(["evidence", "resolution", "execution", "knowledge", "history"] as const);
const tone = (critical: boolean, warning: boolean, positive = false): OperationalWorkspaceMetric["tone"] => critical ? "critical" : warning ? "warning" : positive ? "positive" : "neutral";

function eventsFor(zone: OperationalWorkspaceZoneId, timeline: readonly NucleusTimelineEvent[]): readonly NucleusTimelineEvent[] {
  if (zone === "history") return timeline;
  const kinds: Readonly<Record<Exclude<OperationalWorkspaceZoneId, "history">, readonly string[]>> = {
    summary: ["case_detected", "case_resolved"],
    evidence: ["evidence_evaluated"],
    resolution: ["identity_resolved", "decision_made", "strategy_generated"],
    execution: ["transaction_prepared", "supervised_iteration", "reconciliation"],
    knowledge: ["knowledge_updated"],
  };
  return Object.freeze(timeline.filter((event) => kinds[zone].includes(event.kind)));
}

function zoneState(required: boolean, attention: boolean, empty: boolean, unsupported: boolean): OperationalWorkspaceZoneState {
  if (unsupported) return "unsupported";
  if (required) return "required";
  if (attention) return "attention";
  if (empty) return "empty";
  return "ready";
}

function metric(label: string, value: string | number, metricTone: OperationalWorkspaceMetric["tone"] = "neutral"): OperationalWorkspaceMetric { return Object.freeze({label, value, tone: metricTone}); }

function suggested(model: NucleusResolutionViewModel): OperationalWorkspaceViewModel["suggestedZone"] {
  const target = model.primaryAction.target;
  if (target === "evidence" || target === "resolution" || target === "execution" || target === "knowledge" || target === "history") return target;
  if (target === "case" && model.state !== "completed") return "history";
  return undefined;
}

export function buildOperationalWorkspaceViewModel(input: BuildOperationalWorkspaceInput): OperationalWorkspaceViewModel {
  const nucleus = buildNucleusResolutionViewModel(input);
  const suggestedZone = suggested(nucleus);
  const contextualTimeline = Object.freeze(Object.fromEntries((["summary", ...navigation] as const).map((zone) => [zone, eventsFor(zone, nucleus.timeline)])) as Record<OperationalWorkspaceZoneId, readonly NucleusTimelineEvent[]>);
  const unsupported = nucleus.unsupported.length > 0;
  const zones: readonly OperationalWorkspaceZone[] = Object.freeze([
    Object.freeze({id: "summary", order: 1, label: "Resumen ejecutivo", state: zoneState(false, nucleus.state === "blocked" || nucleus.state === "stale", false, unsupported), safeSummary: buildNucleusSummary(nucleus), metrics: Object.freeze([metric("Estado", nucleus.state, tone(nucleus.state === "blocked", nucleus.state === "stale", nucleus.state === "completed")), metric("Severidad", nucleus.severity), metric("Acción", nucleus.primaryAction.label), metric("Riesgo", nucleus.primaryAction.risk, tone(nucleus.primaryAction.risk === "destructive", nucleus.primaryAction.risk === "high")), metric("Progreso", `${nucleus.progress.percent}%`)]), timeline: contextualTimeline.summary, lazy: false, mountedByDefault: true, unsupported: nucleus.unsupported}),
    Object.freeze({id: "evidence", order: 2, label: "Evidencia", state: zoneState(suggestedZone === "evidence", nucleus.evidence.status !== "sufficient", nucleus.evidence.sourceCount === 0, unsupported), safeSummary: buildNucleusEvidenceSummary(nucleus), metrics: Object.freeze([metric("Suficiencia", nucleus.evidence.status, tone(nucleus.evidence.status === "contradictory", nucleus.evidence.status !== "sufficient", nucleus.evidence.status === "sufficient")), metric("Fuentes", nucleus.evidence.sourceCount), metric("Contradicciones", nucleus.evidence.contradictionCount, tone(nucleus.evidence.contradictionCount > 0, false)), metric("Staleness", nucleus.facts.stale ? "stale" : "fresh", tone(false, nucleus.facts.stale, !nucleus.facts.stale))]), timeline: contextualTimeline.evidence, lazy: true, mountedByDefault: false, unsupported: nucleus.unsupported}),
    Object.freeze({id: "resolution", order: 3, label: "Resolución", state: zoneState(suggestedZone === "resolution", !nucleus.identity.resolved || nucleus.resolution.blockers.length > 0, nucleus.strategy.stepCount === 0, unsupported), safeSummary: buildNucleusResolutionSummary(nucleus), metrics: Object.freeze([metric("Identidad", nucleus.identity.resolved ? "resuelta" : "pendiente", tone(false, !nucleus.identity.resolved, nucleus.identity.resolved)), metric("Resolution", nucleus.resolution.status), metric("Strategy", nucleus.strategy.status), metric("Blockers", nucleus.resolution.blockers.length, tone(nucleus.resolution.blockers.length > 0, false))]), timeline: contextualTimeline.resolution, lazy: true, mountedByDefault: false, unsupported: nucleus.unsupported}),
    Object.freeze({id: "execution", order: 4, label: "Ejecución", state: zoneState(suggestedZone === "execution", nucleus.execution.incidents + nucleus.execution.authorization + nucleus.execution.reconciliation + nucleus.execution.compensation > 0, nucleus.execution.total === 0, unsupported), safeSummary: buildNucleusExecutionSummary(nucleus), metrics: Object.freeze([metric("Transaction", nucleus.execution.state), metric("Progreso", `${nucleus.execution.completed}/${nucleus.execution.total}`), metric("Reconciliación", nucleus.execution.reconciliation, tone(nucleus.execution.reconciliation > 0, false)), metric("Compensación", nucleus.execution.compensation, tone(nucleus.execution.compensation > 0, false)), metric("Autorizaciones", nucleus.execution.authorization, tone(false, nucleus.execution.authorization > 0))]), timeline: contextualTimeline.execution, lazy: true, mountedByDefault: false, unsupported: nucleus.unsupported}),
    Object.freeze({id: "knowledge", order: 5, label: "Conocimiento editorial", state: zoneState(suggestedZone === "knowledge", nucleus.knowledge.conflicts > 0, nucleus.knowledge.relevant === 0, unsupported), safeSummary: buildNucleusKnowledgeSummary(nucleus), metrics: Object.freeze([metric("Recomendaciones", nucleus.knowledge.recommendations), metric("Feedback", nucleus.knowledge.feedback), metric("Lifecycle", nucleus.knowledge.availability), metric("Conflictos", nucleus.knowledge.conflicts, tone(nucleus.knowledge.conflicts > 0, false))]), timeline: contextualTimeline.knowledge, lazy: true, mountedByDefault: false, unsupported: nucleus.unsupported}),
    Object.freeze({id: "history", order: 6, label: "Historial", state: zoneState(suggestedZone === "history", false, nucleus.timeline.length === 0, unsupported), safeSummary: `${nucleus.timeline.length} eventos derivados de las autoridades existentes. No se crea un log paralelo.`, metrics: Object.freeze([metric("Eventos", nucleus.timeline.length), metric("Completion", nucleus.completion.completed ? "completo" : "pendiente", tone(false, !nucleus.completion.completed, nucleus.completion.completed)), metric("Resumen", buildNucleusCompletionSummary(nucleus))]), timeline: contextualTimeline.history, lazy: true, mountedByDefault: false, unsupported: nucleus.unsupported}),
  ]);
  return Object.freeze({version: OPERATIONAL_WORKSPACE_VERSION, nucleus, primaryAction: nucleus.primaryAction, zones, navigation, suggestedZone, contextualTimeline, layout: Object.freeze({desktopColumns: 2, tabletColumns: 2, mobileColumns: 1, narrowViewport: 390, fingerprintsWrapAnywhere: true}), accessibility: Object.freeze({keyboardNavigation: true, nativeButtons: true, focusManaged: true, busyAnnounced: true, alertsAnnounced: true, reducedMotion: true}), onePrimaryAction: true, lazyTechnicalSections: true, persistsNavigation: false, presentationOnly: true, invokesExecutors: false, writes: false});
}

export function getOperationalWorkspaceZone(workspace: OperationalWorkspaceViewModel, zoneId: OperationalWorkspaceZoneId): OperationalWorkspaceZone { const zone = workspace.zones.find((entry) => entry.id === zoneId); if (!zone) throw new Error("operational_workspace_zone_unknown"); return zone; }
