import {buildKnowledgeCenterViewModel, readKnowledgeCenterSnapshot, type KnowledgeValidityState} from "../knowledge";
import type {ReviewCase, ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import {buildCrossCaseGraph} from "./crossCase";
import type {CrossCaseGraph, CrossCaseRelation} from "./crossCaseTypes";
import {buildNucleusResolutionViewModel} from "./model";
import {GLOBAL_RESOLUTION_DASHBOARD_VERSION, type AssembleGlobalResolutionDashboardInput, type BuildGlobalResolutionDashboardInput, type GlobalDashboardActivity, type GlobalDashboardActivityEvent, type GlobalDashboardActivityKind, type GlobalDashboardBottleneck, type GlobalDashboardBottleneckKind, type GlobalDashboardCaseProjection, type GlobalDashboardCrossCase, type GlobalDashboardFacets, type GlobalDashboardFilters, type GlobalDashboardHealthIndicator, type GlobalDashboardKnowledge, type GlobalDashboardLimits, type GlobalDashboardPriorityCase, type GlobalDashboardRankingComponents, type GlobalDashboardSummary, type GlobalDashboardTimelineEvent, type GlobalResolutionDashboardViewModel} from "./dashboardTypes";

const fp = (value: unknown): string => computeUniversalFingerprint(value as ReviewJsonValue);
const unique = (values: readonly string[]): readonly string[] => Object.freeze([...new Set(values.filter(Boolean))].sort());
const freeze = <T>(value: T): Readonly<T> => Object.freeze(value);
const defaults: GlobalDashboardLimits = Object.freeze({priorityCases: 12, activity: 20, timeline: 30, relations: 12, bottlenecks: 12});
const activityKinds: readonly GlobalDashboardActivityKind[] = Object.freeze(["cases_created", "decisions", "transactions", "reconciliations", "outcomes", "knowledge_updates"]);

function iso(value: string): string { if (!value || Number.isNaN(Date.parse(value))) throw new Error("global_dashboard_evaluated_at_invalid"); return new Date(value).toISOString(); }
function clampLimit(value: number | undefined, fallback: number): number { return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.floor(value!))) : fallback; }
function limits(value?: Partial<GlobalDashboardLimits>): GlobalDashboardLimits { return freeze({priorityCases: clampLimit(value?.priorityCases, defaults.priorityCases), activity: clampLimit(value?.activity, defaults.activity), timeline: clampLimit(value?.timeline, defaults.timeline), relations: clampLimit(value?.relations, defaults.relations), bottlenecks: clampLimit(value?.bottlenecks, defaults.bottlenecks)}); }

function projectCase(reviewCase: ReviewCase, evaluatedAt: string): GlobalDashboardCaseProjection {
  const nucleus = buildNucleusResolutionViewModel({reviewCase, evaluatedAt});
  const checkpoint = reviewCase.globalResolution?.caseVersion === reviewCase.version ? reviewCase.globalResolution : undefined;
  const knowledgeSnapshot = readKnowledgeCenterSnapshot(reviewCase.context);
  const knowledge = buildKnowledgeCenterViewModel(knowledgeSnapshot, evaluatedAt, [reviewCase.subject.type]);
  const capabilities = unique(checkpoint?.plan.requiredCapabilities ?? []);
  const blockerCodes = unique([...nucleus.reasonCodes, ...(checkpoint?.transaction?.blockers.map((entry) => entry.code) ?? [])]);
  const missingExecutorCodes = new Set(["operation_not_executable", "missing_required_capability", "execution_binding_missing", "unsupported_step"]);
  const missingExecutor = blockerCodes.some((entry) => missingExecutorCodes.has(entry));
  const lifecycle = knowledge.lifecycleCounts;
  return freeze({
    caseId: reviewCase.id, caseVersion: reviewCase.version, title: reviewCase.title, caseStatus: reviewCase.status, nucleusState: nucleus.state, severity: reviewCase.priority,
    producer: typeof reviewCase.context.producer === "string" ? reviewCase.context.producer : checkpoint?.producer ?? reviewCase.module,
    entityType: reviewCase.subject.type, autonomy: nucleus.autonomy.visibility, risk: nucleus.autonomy.risk, capabilities,
    knowledgeStates: Object.freeze((Object.entries(lifecycle) as [KnowledgeValidityState, number][]).filter(([, count]) => count > 0).map(([state]) => state).sort()),
    action: nucleus.primaryAction, blockers: blockerCodes, createdAt: reviewCase.createdAt, updatedAt: reviewCase.updatedAt,
    authorizationRequired: nucleus.facts.authorizationPending, reconciliationRequired: nucleus.facts.reconciliationPending, compensationRequired: nucleus.facts.compensationPending, humanReviewRequired: nucleus.facts.humanReviewPending,
    blocked: nucleus.facts.blocked || nucleus.state === "blocked", stale: nucleus.facts.stale, unsupported: !nucleus.facts.supported, missingExecutor,
    knowledge: freeze({current: lifecycle.current + lifecycle.temporal, underReview: lifecycle.under_review, contradictory: lifecycle.contradictory, invalidated: lifecycle.invalidated + lifecycle.expired + lifecycle.superseded, recommendations: knowledge.recommendations.length, recentLearning: knowledge.feedback.length}),
    timeline: nucleus.timeline, fingerprints: unique([...nucleus.fingerprints, checkpoint?.checkpointFingerprint ?? "", knowledgeSnapshot?.snapshotFingerprint ?? ""]),
  });
}

function summary(projections: readonly GlobalDashboardCaseProjection[]): GlobalDashboardSummary {
  return freeze({
    totalCases: projections.length,
    open: projections.filter((entry) => ["open", "in_review", "resuming", "resume_failed"].includes(entry.caseStatus)).length,
    resolved: projections.filter((entry) => ["resolved", "resumed"].includes(entry.caseStatus)).length,
    blocked: projections.filter((entry) => entry.blocked).length,
    stale: projections.filter((entry) => entry.stale).length,
    unsupported: projections.filter((entry) => entry.unsupported).length,
    authorizationRequired: projections.filter((entry) => entry.authorizationRequired).length,
    reconciliationRequired: projections.filter((entry) => entry.reconciliationRequired).length,
    compensationRequired: projections.filter((entry) => entry.compensationRequired).length,
    humanReviewRequired: projections.filter((entry) => entry.humanReviewRequired).length,
    autonomousSafe: projections.filter((entry) => !entry.unsupported && entry.autonomy === "Autónomo seguro").length,
    autonomousSupervised: projections.filter((entry) => entry.autonomy === "Autónomo supervisado").length,
  });
}

function matches(entry: GlobalDashboardCaseProjection, filters: GlobalDashboardFilters): boolean {
  const selected = (value: string | undefined, actual: string | readonly string[]): boolean => !value || value === "all" || (Array.isArray(actual) ? actual.includes(value) : actual === value);
  return selected(filters.status, entry.caseStatus) && selected(filters.producer, entry.producer) && selected(filters.entityType, entry.entityType) && selected(filters.severity, entry.severity) && selected(filters.autonomy, entry.autonomy) && selected(filters.risk, entry.risk) && selected(filters.capability, entry.capabilities) && selected(filters.knowledgeState, entry.knowledgeStates);
}

function facets(projections: readonly GlobalDashboardCaseProjection[]): GlobalDashboardFacets {
  return freeze({statuses: unique(projections.map((entry) => entry.caseStatus)), producers: unique(projections.map((entry) => entry.producer)), entityTypes: unique(projections.map((entry) => entry.entityType)), severities: unique(projections.map((entry) => entry.severity)), autonomies: unique(projections.map((entry) => entry.autonomy)), risks: unique(projections.map((entry) => entry.risk)), capabilities: unique(projections.flatMap((entry) => entry.capabilities)), knowledgeStates: unique(projections.flatMap((entry) => entry.knowledgeStates))});
}

function scopedGraph(graph: CrossCaseGraph, ids: ReadonlySet<string>, relationLimit: number): GlobalDashboardCrossCase {
  const relations = graph.relations.filter((entry) => entry.caseIds.every((id) => ids.has(id)));
  const groups = graph.groups.filter((entry) => entry.caseIds.every((id) => ids.has(id)));
  const relatedCaseCount = new Set(relations.flatMap((entry) => entry.caseIds)).size;
  return freeze({graphFingerprint: graph.graphFingerprint, clusters: Object.freeze(groups), relations: Object.freeze(relations.slice(0, relationLimit)), relatedCaseCount, sharedBlockerCount: relations.filter((entry) => entry.kind === "blocked_by_other_case" || entry.kind === "dependency_chain" || entry.kind === "shared_conflict").length, duplicateCandidateCount: relations.filter((entry) => entry.kind === "possible_duplicate_case" || entry.kind === "merge_candidate").length, coordinatedResolutionOpportunities: groups.length, advisoryOnly: true});
}

function knowledgeSummary(projections: readonly GlobalDashboardCaseProjection[]): GlobalDashboardKnowledge {
  return freeze({current: projections.reduce((sum, entry) => sum + entry.knowledge.current, 0), underReview: projections.reduce((sum, entry) => sum + entry.knowledge.underReview, 0), contradictory: projections.reduce((sum, entry) => sum + entry.knowledge.contradictory, 0), invalidated: projections.reduce((sum, entry) => sum + entry.knowledge.invalidated, 0), recommendationsRelevant: projections.reduce((sum, entry) => sum + entry.knowledge.recommendations, 0), recentLearning: projections.reduce((sum, entry) => sum + entry.knowledge.recentLearning, 0), advisoryOnly: true, replacesCurrentEvidence: false});
}

function event(kind: GlobalDashboardActivityKind, entry: GlobalDashboardCaseProjection, safeSummary: string, occurredAt: string, sourceFingerprint: string): GlobalDashboardActivityEvent {
  const semantic = {kind, caseId: entry.caseId, caseVersion: entry.caseVersion, occurredAt, sourceFingerprint};
  const fingerprint = fp(semantic);
  return freeze({eventId: `dashboard-event:${fingerprint}`, kind, caseId: entry.caseId, caseTitle: entry.title, safeSummary, occurredAt, fingerprint});
}

function activities(projections: readonly GlobalDashboardCaseProjection[], limit: number): GlobalDashboardActivity {
  const events = new Map<string, GlobalDashboardActivityEvent>();
  for (const entry of projections) {
    const add = (value: GlobalDashboardActivityEvent): void => { events.set(value.fingerprint, value); };
    add(event("cases_created", entry, "Caso registrado en AU3.", entry.createdAt, entry.fingerprints[0] ?? entry.caseId));
    if (entry.timeline.some((item) => item.kind === "decision_made")) add(event("decisions", entry, "Decisión AU8 presente en el snapshot.", entry.updatedAt, entry.action.kind));
    if (entry.timeline.some((item) => item.kind === "transaction_prepared")) add(event("transactions", entry, "Transacción AU7 presente en el snapshot.", entry.updatedAt, entry.fingerprints.join(":")));
    if (entry.reconciliationRequired) add(event("reconciliations", entry, "Reconciliación requerida por el estado actual.", entry.updatedAt, entry.blockers.join(":")));
    if (["resolved", "resumed"].includes(entry.caseStatus)) add(event("outcomes", entry, "Outcome confirmado por el lifecycle AU3.", entry.updatedAt, entry.caseStatus));
    if (entry.knowledge.current + entry.knowledge.underReview + entry.knowledge.contradictory + entry.knowledge.invalidated + entry.knowledge.recentLearning > 0) add(event("knowledge_updates", entry, "Snapshot AU9 actualizado; conocimiento advisory-only.", entry.updatedAt, entry.fingerprints.join(":")));
  }
  const all = [...events.values()].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || left.fingerprint.localeCompare(right.fingerprint));
  const counts = freeze(Object.fromEntries(activityKinds.map((kind) => [kind, all.filter((entry) => entry.kind === kind).length])) as Record<GlobalDashboardActivityKind, number>);
  return freeze({counts, recent: Object.freeze(all.slice(0, limit))});
}

function bottleneck(kind: GlobalDashboardBottleneckKind, severity: GlobalDashboardBottleneck["severity"], caseIds: readonly string[], safeCause: string, requiredAction: string, fingerprints: readonly string[]): GlobalDashboardBottleneck {
  const affectedCaseIds = unique(caseIds); const evidenceFingerprints = unique(fingerprints);
  const bottleneckFingerprint = fp({kind, severity, affectedCaseIds, evidenceFingerprints});
  return freeze({bottleneckId: `dashboard-bottleneck:${bottleneckFingerprint}`, kind, severity, affectedCaseIds, count: affectedCaseIds.length, safeCause, requiredAction, evidenceFingerprints, bottleneckFingerprint, advisoryOnly: true});
}

function deriveBottlenecks(projections: readonly GlobalDashboardCaseProjection[], relations: readonly CrossCaseRelation[], limit: number): readonly GlobalDashboardBottleneck[] {
  const result: GlobalDashboardBottleneck[] = [];
  const grouped = <T extends string>(values: readonly (readonly [T, GlobalDashboardCaseProjection])[]): Map<T, GlobalDashboardCaseProjection[]> => { const map = new Map<T, GlobalDashboardCaseProjection[]>(); for (const [key, value] of values) map.set(key, [...(map.get(key) ?? []), value]); return map; };
  for (const [capability, entries] of grouped(projections.filter((entry) => entry.blocked).flatMap((entry) => entry.capabilities.map((capability) => [capability, entry] as const)))) if (entries.length >= 2) result.push(bottleneck("capability_blocked", "degraded", entries.map((entry) => entry.caseId), `La capability ${capability} bloquea ${entries.length} casos.`, "Revisar soporte y evidencia de la capability; no ejecutar automáticamente.", entries.flatMap((entry) => entry.fingerprints)));
  const missing = projections.filter((entry) => entry.missingExecutor); if (missing.length) result.push(bottleneck("missing_executor", "degraded", missing.map((entry) => entry.caseId), `${missing.length} casos declaran binding o executor ausente.`, "Registrar o verificar el executor autorizado fuera del dashboard.", missing.flatMap((entry) => entry.fingerprints)));
  const authorization = projections.filter((entry) => entry.authorizationRequired); if (authorization.length >= 2) result.push(bottleneck("repeated_authorization", "attention", authorization.map((entry) => entry.caseId), `${authorization.length} casos esperan autorización explícita.`, "Priorizar decisiones humanas sin compartir autorizaciones entre casos.", authorization.flatMap((entry) => entry.fingerprints)));
  const reconciliation = projections.filter((entry) => entry.reconciliationRequired); if (reconciliation.length >= 2) result.push(bottleneck("recurring_reconciliation", "critical", reconciliation.map((entry) => entry.caseId), `${reconciliation.length} casos requieren reconciliación.`, "Abrir AU4 por caso y confirmar el efecto antes de continuar.", reconciliation.flatMap((entry) => entry.fingerprints)));
  const stale = projections.filter((entry) => entry.stale); if (stale.length) result.push(bottleneck("stale_cases", "degraded", stale.map((entry) => entry.caseId), `${stale.length} casos tienen contexto stale.`, "Regenerar evidencia y estrategia antes de actuar.", stale.flatMap((entry) => entry.fingerprints)));
  for (const [entityType, entries] of grouped(projections.filter((entry) => entry.unsupported).map((entry) => [entry.entityType, entry] as const))) result.push(bottleneck("unsupported_entity_type", "degraded", entries.map((entry) => entry.caseId), `${entityType} no está soportado por el Núcleo.`, "Mantener visible y derivar a revisión humana; no inventar fallback.", entries.flatMap((entry) => entry.fingerprints)));
  const conflicts = relations.filter((entry) => entry.kind === "shared_conflict"); if (conflicts.length) result.push(bottleneck("shared_conflict", "critical", conflicts.flatMap((entry) => entry.caseIds), `${conflicts.length} conflictos gobernados afectan varios casos.`, "Revisar evidencia actual; AU9 no elige ganador.", conflicts.map((entry) => entry.relationFingerprint)));
  const blockerGroups = grouped(projections.flatMap((entry) => entry.blockers.map((code) => [code, entry] as const))); for (const [code, entries] of blockerGroups) if (entries.length >= 2) result.push(bottleneck("shared_blocker", "degraded", entries.map((entry) => entry.caseId), `El blocker ${code} se repite en ${entries.length} casos.`, "Coordinar revisión conservando decisiones independientes.", entries.flatMap((entry) => entry.fingerprints)));
  const severity = {critical: 3, degraded: 2, attention: 1};
  return Object.freeze(result.sort((left, right) => severity[right.severity] - severity[left.severity] || right.count - left.count || left.bottleneckFingerprint.localeCompare(right.bottleneckFingerprint)).slice(0, limit));
}

function health(value: GlobalDashboardSummary, bottlenecks: readonly GlobalDashboardBottleneck[]): GlobalDashboardHealthIndicator {
  const reasons: string[] = [];
  if (value.compensationRequired) reasons.push("compensation_required");
  if (bottlenecks.some((entry) => entry.kind === "shared_conflict")) reasons.push("shared_conflict");
  if (value.blocked && bottlenecks.some((entry) => entry.severity === "critical")) reasons.push("critical_blocker");
  if (reasons.length) return freeze({state: "critical", reasonCodes: unique(reasons), safeExplanation: "Existen condiciones críticas confirmadas; el dashboard no continúa ni resuelve por sí solo."});
  if (value.reconciliationRequired || value.blocked || value.stale || value.unsupported || bottlenecks.some((entry) => entry.kind === "missing_executor")) return freeze({state: "degraded", reasonCodes: unique([...(value.reconciliationRequired ? ["reconciliation_required"] : []), ...(value.blocked ? ["blocked_cases"] : []), ...(value.stale ? ["stale_cases"] : []), ...(value.unsupported ? ["unsupported_cases"] : []), ...(bottlenecks.some((entry) => entry.kind === "missing_executor") ? ["missing_executor"] : [])]), safeExplanation: "La operación global está degradada por estados reales que requieren corrección o revisión."});
  if (value.authorizationRequired || value.humanReviewRequired || value.open) return freeze({state: "attention", reasonCodes: unique([...(value.authorizationRequired ? ["authorization_required"] : []), ...(value.humanReviewRequired ? ["human_review_required"] : []), ...(value.open ? ["open_cases"] : [])]), safeExplanation: "El laboratorio está estable, con trabajo o decisiones explícitas pendientes."});
  return freeze({state: "healthy", reasonCodes: Object.freeze([]), safeExplanation: "No hay blockers, staleness ni acciones críticas en el snapshot actual."});
}

function ranked(projections: readonly GlobalDashboardCaseProjection[], graph: CrossCaseGraph, evaluatedAt: string, limit: number): readonly GlobalDashboardPriorityCase[] {
  const severityValues = {critical: 30, high: 22, normal: 12, low: 5}; const riskValues = {destructive: 18, high: 12, medium: 7, low: 2};
  const actionValues = {human_decision: 15, external_effect: 12, pure_transform: 6, read_only: 3};
  const now = Date.parse(evaluatedAt);
  const relationsByCase = new Map<string, CrossCaseRelation[]>();
  for (const relation of graph.relations) for (const caseId of relation.caseIds) relationsByCase.set(caseId, [...(relationsByCase.get(caseId) ?? []), relation]);
  return Object.freeze(projections.map((entry) => {
    const relations = relationsByCase.get(entry.caseId) ?? [];
    const dependencyCount = relations.filter((relation) => relation.kind === "dependency_chain" || relation.kind === "blocked_by_other_case").length;
    const components: GlobalDashboardRankingComponents = freeze({severity: severityValues[entry.severity], blockingStatus: entry.compensationRequired || entry.reconciliationRequired || entry.blocked ? 25 : entry.authorizationRequired || entry.humanReviewRequired || entry.stale ? 18 : 0, age: Math.min(20, Math.max(0, Math.floor((now - Date.parse(entry.createdAt)) / 86_400_000 / 7) * 2)), dependencyImpact: Math.min(15, dependencyCount * 5), crossCaseImpact: Math.min(20, Math.floor((relations[0]?.rank.total ?? 0) / 5)), risk: riskValues[entry.risk], actionRequired: actionValues[entry.action.actionClass]});
    const impact = Object.values(components).reduce((sum, component) => sum + component, 0);
    const explanation = Object.freeze([`severity:${components.severity} (${entry.severity})`, `blocking_status:${components.blockingStatus} (${entry.nucleusState})`, `age:${components.age}`, `dependency_impact:${components.dependencyImpact} (${dependencyCount})`, `cross_case_impact:${components.crossCaseImpact} (${relations.length})`, `risk:${components.risk} (${entry.risk})`, `action_required:${components.actionRequired} (${entry.action.kind})`]);
    const priorityFingerprint = fp({caseId: entry.caseId, caseVersion: entry.caseVersion, components, action: entry.action.kind, relationFingerprints: relations.map((relation) => relation.relationFingerprint).sort()});
    return freeze({caseId: entry.caseId, title: entry.title, state: entry.nucleusState, severity: entry.severity, actionRequired: entry.action.label, impact, relatedCases: new Set(relations.flatMap((relation) => relation.caseIds).filter((id) => id !== entry.caseId)).size, blockers: entry.blockers, components, explanation, priorityFingerprint});
  }).sort((left, right) => right.impact - left.impact || left.priorityFingerprint.localeCompare(right.priorityFingerprint)).slice(0, limit));
}

function timeline(activity: GlobalDashboardActivity, limit: number): readonly GlobalDashboardTimelineEvent[] { return Object.freeze(activity.recent.slice(0, limit).map((entry, index) => freeze({...entry, order: index + 1}))); }

export function assembleGlobalResolutionDashboard(input: AssembleGlobalResolutionDashboardInput): GlobalResolutionDashboardViewModel {
  const evaluatedAt = iso(input.evaluatedAt); const selectedLimits = limits(input.limits); const filters = freeze({status: input.filters?.status, producer: input.filters?.producer, entityType: input.filters?.entityType, severity: input.filters?.severity, autonomy: input.filters?.autonomy, risk: input.filters?.risk, capability: input.filters?.capability, knowledgeState: input.filters?.knowledgeState});
  const projectionMap = new Map<string, GlobalDashboardCaseProjection>();
  for (const entry of input.projections) { const current = projectionMap.get(entry.caseId); if (!current || entry.caseVersion > current.caseVersion) projectionMap.set(entry.caseId, entry); }
  const projections = Object.freeze([...projectionMap.values()].sort((left, right) => left.caseId.localeCompare(right.caseId)));
  const scoped = Object.freeze(projections.filter((entry) => matches(entry, filters)));
  const scopeIds = new Set(scoped.map((entry) => entry.caseId));
  const crossCase = scopedGraph(input.crossCaseGraph, scopeIds, selectedLimits.relations);
  const derivedBottlenecks = deriveBottlenecks(scoped, input.crossCaseGraph.relations.filter((entry) => entry.caseIds.every((id) => scopeIds.has(id))), selectedLimits.bottlenecks);
  const globalSummary = summary(projections); const scopedSummary = summary(scoped); const activity = activities(scoped, Math.max(selectedLimits.activity, selectedLimits.timeline));
  const snapshotFingerprint = fp(projections.map((entry) => ({caseId: entry.caseId, caseVersion: entry.caseVersion, state: entry.nucleusState, updatedAt: entry.updatedAt, fingerprints: entry.fingerprints})));
  const priorityCases = ranked(scoped, input.crossCaseGraph, evaluatedAt, selectedLimits.priorityCases);
  const dashboardFingerprint = fp({version: GLOBAL_RESOLUTION_DASHBOARD_VERSION, snapshotFingerprint, graphFingerprint: input.crossCaseGraph.graphFingerprint, filters, limits: selectedLimits, health: health(scopedSummary, derivedBottlenecks).state, priorities: priorityCases.map((entry) => entry.priorityFingerprint), bottlenecks: derivedBottlenecks.map((entry) => entry.bottleneckFingerprint)});
  return freeze({version: GLOBAL_RESOLUTION_DASHBOARD_VERSION, snapshotFingerprint, dashboardFingerprint, evaluatedAt, summary: globalSummary, scopedSummary, health: health(scopedSummary, derivedBottlenecks), filters, facets: facets(projections), filteredCaseCount: scoped.length, priorityCases, activity: freeze({...activity, recent: Object.freeze(activity.recent.slice(0, selectedLimits.activity))}), bottlenecks: derivedBottlenecks, crossCase, knowledge: knowledgeSummary(scoped), timeline: timeline(activity, selectedLimits.timeline), limits: selectedLimits, performance: freeze({memoizable: true, outputLimited: true, fullSortComplexity: "O(n log n)", crossCaseComplexity: "output-sensitive O(signals + relations)", lazyHeavySections: true, persistsFilters: false}), advisoryOnly: true, replacesCurrentEvidence: false, presentationOnly: true, persistsState: false, invokesExecutors: false, writes: false});
}

export function buildGlobalResolutionDashboard(input: BuildGlobalResolutionDashboardInput): GlobalResolutionDashboardViewModel {
  const evaluatedAt = iso(input.evaluatedAt);
  const caseMap = new Map<string, ReviewCase>(); for (const entry of input.cases) { const current = caseMap.get(entry.id); if (!current || entry.version > current.version) caseMap.set(entry.id, entry); }
  const cases = Object.freeze([...caseMap.values()].sort((left, right) => left.id.localeCompare(right.id)));
  const projections = Object.freeze(cases.map((entry) => projectCase(entry, evaluatedAt)));
  const crossCaseGraph = buildCrossCaseGraph({cases, evaluatedAt, maxRelations: Math.max(100, input.limits?.relations ?? defaults.relations)});
  return assembleGlobalResolutionDashboard({projections, crossCaseGraph, evaluatedAt, filters: input.filters, limits: input.limits});
}

export function projectGlobalDashboardCase(reviewCase: ReviewCase, evaluatedAt: string): GlobalDashboardCaseProjection { return projectCase(reviewCase, iso(evaluatedAt)); }
