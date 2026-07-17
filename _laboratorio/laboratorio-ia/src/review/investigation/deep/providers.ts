import type {ReviewJsonValue} from "../../types";
import {normalizeEvidenceValue, stableHash} from "./normalization";
import type {EvidenceItem, EvidenceSourceClass, InvestigationProvider, InvestigationProviderContext} from "./types";

function evidence(providerId: string, sourceClass: EvidenceSourceClass, sourceId: string, subject: string, predicate: string, value: ReviewJsonValue, context: InvestigationProviderContext, options: Partial<EvidenceItem> = {}): EvidenceItem {
  const normalized = normalizeEvidenceValue(value);
  const sourceFingerprint = stableHash([sourceClass, sourceId]);
  return {id: `evidence:${stableHash([providerId, sourceId, subject, predicate, normalized.value])}`, providerId, providerRunId: `${context.request.id}:${providerId}`, sourceClass, sourceId, sourceFingerprint, subject, predicate, originalValue: value, normalizedValue: normalized.value, transformations: normalized.transformations, normalizerVersion: "5f.1", authority: "internal_structured", directness: "direct", freshness: "current", reliability: "high", collectedAt: context.now, provenance: `${sourceClass}:${sourceId}`, parentEvidenceIds: [], independenceGroup: sourceFingerprint, limitations: [], status: "active", equivalentEvidenceIds: [], ...options};
}

const provider = (id: string, collect: InvestigationProvider["collect"]): InvestigationProvider => ({id, version: "5f.1", sourceClass: "internal_local", capabilities: ["structured_read"], supportedIssueTypes: ["*"], requiredContext: ["review_case", "review_issue"], riskLevel: "low", readOnly: true, networkAccess: false, authorizedDomains: [], maximumRequests: 1, timeoutMs: 500, cachePolicy: "none", storesRawPayload: false, sanitizationVersion: "5f.1", enabled: true, collect});

export const localCaseProvider = provider("local_case", async (context) => {
  const {case: reviewCase, issue} = context.request; const items: EvidenceItem[] = [];
  items.push(evidence("local_case", "internal_local", `case:${reviewCase.id}:v${reviewCase.version}`, reviewCase.subject.id ?? reviewCase.id, "issue.kind", issue.kind, context));
  if (issue.currentValue !== undefined) items.push(evidence("local_case", "internal_local", `case:${reviewCase.id}:v${reviewCase.version}`, reviewCase.subject.id ?? reviewCase.id, issue.fieldPath ?? "issue.currentValue", issue.currentValue, context));
  issue.candidates?.forEach((candidate) => items.push(evidence("local_case", "internal_local", `case:${reviewCase.id}:v${reviewCase.version}`, candidate.id, "candidate.value", candidate.value, context)));
  reviewCase.resolutions.filter((item) => item.issueId === issue.id).forEach((resolution) => items.push(evidence("local_case", "internal_local", `case:${reviewCase.id}:v${reviewCase.version}`, issue.id, "resolution.observedType", resolution.type, context, {authority: "historical_editorial", directness: "near_direct", limitations: ["Resolución observada; no se adopta ni ejecuta."]})));
  return {evidence: items, limitations: issue.currentValue === undefined ? ["La incidencia no conserva un valor actual."] : []};
});

export const outcomeProvider = provider("outcomes", async (context) => ({evidence: context.outcomes.filter((item) => item.caseId === context.request.case.id && item.issueId === context.request.issue.id).map((item) => evidence("outcomes", "internal_local", `outcome:${item.id}`, item.issueId, "outcome.editorialStatus", item.editorialStatus, context, {authority: "historical_editorial", directness: "near_direct", freshness: item.reconciliationRequired ? "stale" : "recent", status: item.reconciliationRequired ? "stale" : "active", limitations: ["El outcome describe historia editorial, no evidencia actual suficiente."]})), limitations: []}));
export const memoryProvider = provider("memory", async (context) => ({evidence: context.memories.filter((item) => item.issueId === context.request.issue.id || item.issueType === context.request.issue.kind).map((item) => evidence("memory", "internal_local", `memory:${item.id}`, item.issueId, "memory.editorialDecision", item.editorialDecision, context, {authority: "historical_editorial", directness: "derived", freshness: ["obsolete", "superseded", "invalidated"].includes(item.status) ? "stale" : "aging", reliability: item.confidence.level === "high" ? "high" : "medium", parentEvidenceIds: item.sourceOutcomeEventIds, independenceGroup: `outcome:${item.outcomeId}`, limitations: ["Memoria derivada de un outcome; no constituye una fuente independiente."]})), limitations: []}));
export const retrievalProvider = provider("retrieval", async (context) => ({evidence: context.retrieval ? [...context.retrieval.positiveEvidence, ...context.retrieval.negativeEvidence].map((item) => evidence("retrieval", "internal_local", `retrieval:${context.retrieval!.id}`, item.memoryId, "retrieval.evidenceType", item.evidenceType, context, {authority: "derived_analysis", directness: "derived", freshness: context.retrieval!.stale ? "stale" : "recent", status: context.retrieval!.stale ? "stale" : "active", parentEvidenceIds: [item.memoryId], independenceGroup: `outcome:${item.outcomeId}`, limitations: context.retrieval!.limitations})) : [], limitations: context.retrieval ? context.retrieval.limitations : ["No existe retrieval 5E para esta incidencia."]}));
export const sourceSnapshotProvider = provider("source_snapshot", async (context) => {
  const snapshot = context.request.case.context.snapshot ?? context.request.case.context.sourceSnapshot ?? context.request.case.context.originalPayload;
  if (snapshot === undefined) return {evidence: [], limitations: ["El productor no conservó un snapshot original utilizable."]};
  const atomic: Array<{path: string; value: ReviewJsonValue}> = [];
  const visit = (value: ReviewJsonValue, path: string, depth: number): void => {
    if (atomic.length >= 24 || depth > 4) return;
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) { atomic.push({path, value}); return; }
    if (Array.isArray(value)) value.slice(0, 8).forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
    else Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).forEach(([key, item]) => visit(item, path ? `${path}.${key}` : key, depth + 1));
  };
  visit(snapshot, "snapshot", 0);
  return {evidence: atomic.map((item) => evidence("source_snapshot", "producer", `snapshot:${context.request.case.id}`, context.request.case.subject.id ?? context.request.case.id, item.path, item.value, context, {authority: "official_secondary", limitations: ["Valor atómico extraído del snapshot ya conservado; no se volvió a descargar la fuente."]})), limitations: atomic.length === 0 ? ["El snapshot existe, pero no contiene valores atómicos seguros."] : ["El snapshot se limita a un máximo de 24 valores atómicos; no se persiste el payload completo."]};
});

export const unavailableSanityReadProvider: InvestigationProvider = {...provider("sanity_read", async () => ({evidence: [], limitations: []})), sourceClass: "cms_read", networkAccess: true, enabled: false, unavailableReason: "No existe un endpoint 5F servidor, allowlisted y exclusivamente de lectura."};
export const unavailableAuthorizedProducerProvider: InvestigationProvider = {...provider("authorized_producer", async () => ({evidence: [], limitations: []})), sourceClass: "authorized_source", networkAccess: true, enabled: false, unavailableReason: "No se habilita consulta remota sin infraestructura 5F dedicada y auditada."};
export const defaultInvestigationProviders = [localCaseProvider, outcomeProvider, memoryProvider, retrievalProvider, sourceSnapshotProvider, unavailableSanityReadProvider, unavailableAuthorizedProducerProvider];
