import {getReviewCase} from "../../store/reviewStore";
import {getOutcomeRecords} from "../../outcomes";
import {getDecisionMemories, getMemoryClusters} from "../../memory";
import {getLatestRetrievalForIssue} from "../../retrieval";
import {stableHash} from "./normalization";
import {defaultInvestigationProviders} from "./providers";
import {investigateReviewIssueCore} from "./engine";
import {buildDeepInvestigationPlan} from "./planning";
import {localStorageInvestigationRepository, validateInvestigationLedger, type InvestigationRepository} from "./persistence";
import type {InvestigationEvent, InvestigationMode, InvestigationPolicy, InvestigationRequest} from "./types";

const POLICY: InvestigationPolicy = {version: "5f.1", maxProviders: 8, maxEvidence: 100, maxClaims: 100, maxConflicts: 50, maxDepth: 12, maxTotalBytes: 1_500_000, maxEvidenceBytes: 32_000, timeoutMs: 5_000};
let repository: InvestigationRepository = localStorageInvestigationRepository; let revision = 0; const listeners = new Set<() => void>(); const controllers = new Map<string, AbortController>(); const emit = () => { revision += 1; listeners.forEach((listener) => listener()); };
const save = (ledger: ReturnType<InvestigationRepository["load"]>) => { repository.save(ledger); emit(); };
export const subscribeInvestigationStore = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
export const getInvestigationStoreVersion = () => revision;
export const getReviewInvestigations = () => repository.load().results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const getReviewInvestigation = (id: string) => getReviewInvestigations().find((item) => item.id === id);
export const getReviewInvestigationsForCase = (caseId: string) => getReviewInvestigations().filter((item) => item.request.case.id === caseId);
export const getReviewInvestigationsForIssue = (issueId: string) => getReviewInvestigations().filter((item) => item.request.issue.id === issueId);
export const getLatestReviewInvestigationForIssue = (issueId: string) => getReviewInvestigationsForIssue(issueId)[0];
function requestFor(caseId: string, issueId: string, options: {mode?: InvestigationMode; requestedBy?: string} = {}): InvestigationRequest { const reviewCase = getReviewCase(caseId); if (!reviewCase) throw new Error("review_case_not_found"); const issue = reviewCase.issues.find((item) => item.id === issueId); if (!issue) throw new Error("review_issue_not_found"); const requestedAt = new Date().toISOString(); const retrieval = getLatestRetrievalForIssue(issueId); const contextFingerprint = stableHash([reviewCase.id, reviewCase.version, reviewCase.updatedAt, issue, retrieval?.id, retrieval?.stale]); return {id: `investigation:${stableHash([caseId, issueId, contextFingerprint, requestedAt])}`, version: 1, case: structuredClone(reviewCase), issue: structuredClone(issue), retrieval: retrieval ? structuredClone(retrieval) : undefined, requestedAt, requestedBy: options.requestedBy ?? "human", mode: options.mode ?? "local_only", allowedProviderIds: [], maxDepth: POLICY.maxDepth, maxEvidence: POLICY.maxEvidence, timeoutMs: POLICY.timeoutMs, contextFingerprint, policy: POLICY}; }
export const buildReviewInvestigationPlan = (caseId: string, issueId: string, options?: {mode?: InvestigationMode}) => { const request = requestFor(caseId, issueId, options); return buildDeepInvestigationPlan(request, defaultInvestigationProviders); };
export async function investigateReviewIssue(caseId: string, issueId: string, options?: {mode?: InvestigationMode}) { const request = requestFor(caseId, issueId, options); const controller = new AbortController(); controllers.set(request.id, controller); try { const output = await investigateReviewIssueCore(request, {outcomes: getOutcomeRecords(), memories: getDecisionMemories(), clusters: getMemoryClusters(), retrieval: request.retrieval, providers: defaultInvestigationProviders}, controller.signal); const ledger = repository.load(); if (ledger.results.some((item) => item.id === output.result.id)) return output.result; save({...ledger, requests: [...ledger.requests, request], plans: [...ledger.plans, output.result.plan], results: [...ledger.results, output.result], events: appendEvents(ledger.events, output.events)}); return output.result; } finally { controllers.delete(request.id); } }
const appendEvents = (existing: InvestigationEvent[], next: InvestigationEvent[]) => { const keys = new Map(existing.map((item) => [item.idempotencyKey, JSON.stringify(item.payload)])); next.forEach((item) => { const payload = keys.get(item.idempotencyKey); if (payload && payload !== JSON.stringify(item.payload)) throw new Error("idempotency_collision"); keys.set(item.idempotencyKey, JSON.stringify(item.payload)); }); return [...existing, ...next.filter((item) => !existing.some((old) => old.idempotencyKey === item.idempotencyKey))]; };
export const cancelReviewInvestigation = (id: string) => { const controller = controllers.get(id); if (!controller) return false; controller.abort(); return true; };
export const getInvestigationEvidence = (id: string) => getReviewInvestigation(id)?.evidence ?? [];
export const getInvestigationClaims = (id: string) => getReviewInvestigation(id)?.claims ?? [];
export const getInvestigationConflicts = (id: string) => getReviewInvestigation(id)?.conflicts ?? [];
export const getInvestigationFindings = (id: string) => getReviewInvestigation(id)?.findings ?? [];
export const validateReviewInvestigationStore = () => validateInvestigationLedger(repository.load());
export const exportReviewInvestigations = () => structuredClone(repository.load());
export function clearReviewInvestigationHistory(confirmation: string) { if (confirmation !== "CLEAR_INVESTIGATION_HISTORY") throw new Error("explicit_confirmation_required"); save({schemaVersion: 1, requests: [], plans: [], results: [], events: []}); }
const storeEvent = (resultId: string, type: "investigation_marked_stale" | "investigation_reconciled" | "investigation_note_added", payload: InvestigationEvent["payload"], suffix: string): InvestigationEvent => ({id: `investigation-event:${stableHash([resultId, suffix])}`, investigationId: resultId, type, timestamp: new Date().toISOString(), payload, idempotencyKey: `${resultId}:${suffix}`, actor: type === "investigation_note_added" ? "human" : "system", module: "review.investigation.deep", investigationVersion: "5f.1", policyVersion: POLICY.version, provenance: "local_read_only"});
export function reconcileReviewInvestigations(id?: string) {
  const ledger = repository.load(); let changed = false; const extraEvents: InvestigationEvent[] = [];
  const outcomes = getOutcomeRecords(); const memories = getDecisionMemories(); const providersFingerprint = stableHash(defaultInvestigationProviders.map((item) => [item.id, item.version, item.enabled, item.sanitizationVersion]));
  const results = ledger.results.map((result) => {
    if (id && result.id !== id) return result; const current = getReviewCase(result.request.case.id); const reasons: string[] = [];
    if (!current) reasons.push("El caso ya no existe."); else {
      const issue = current.issues.find((item) => item.id === result.request.issue.id); const retrieval = getLatestRetrievalForIssue(result.request.issue.id);
      if (stableHash([current.id, current.version, current.updatedAt]) !== result.fingerprints.case) reasons.push("El caso o su versión cambió.");
      if (!issue || stableHash(issue) !== result.fingerprints.issue) reasons.push("La incidencia cambió o desapareció.");
      if (stableHash(issue?.candidates ?? []) !== result.fingerprints.candidates) reasons.push("Los candidatos cambiaron.");
      if (stableHash(current.context.snapshot ?? current.context.sourceSnapshot ?? current.context.originalPayload ?? null) !== result.fingerprints.snapshot) reasons.push("El snapshot conservado cambió.");
      if (stableHash(retrieval ?? null) !== result.fingerprints.retrieval) reasons.push("El retrieval cambió.");
    }
    if (stableHash(outcomes.map((item) => [item.id, item.updatedAt, item.currentStatus])) !== result.fingerprints.outcomes) reasons.push("Los outcomes cambiaron.");
    if (stableHash(memories.map((item) => [item.id, item.updatedAt, item.status, item.memoryFingerprint])) !== result.fingerprints.memory) reasons.push("La memoria cambió.");
    if (providersFingerprint !== result.fingerprints.providers) reasons.push("El registro o versión de proveedores cambió.");
    if (stableHash(POLICY) !== result.fingerprints.policy) reasons.push("La política cambió.");
    if (result.analysisVersion !== "5f.1" || stableHash("5f.1") !== result.fingerprints.analysis) reasons.push("La versión de análisis cambió.");
    const unique = [...new Set(reasons)].sort(); if (!unique.length) return result;
    if (result.stale && unique.every((reason) => result.staleReasons.includes(reason))) return result; changed = true; const staleEvent = storeEvent(result.id, "investigation_marked_stale", {reasons: unique}, "stale"); extraEvents.push(staleEvent); return {...result, stale: true, status: "stale" as const, staleReasons: unique, eventIds: result.eventIds.includes(staleEvent.id) ? result.eventIds : [...result.eventIds, staleEvent.id]};
  });
  if (changed || extraEvents.length) save({...ledger, results, events: appendEvents(ledger.events, extraEvents)}); return {changed, results: id ? results.filter((item) => item.id === id) : results};
}
export function addInvestigationNote(id: string, note: string) { if (!note.trim()) throw new Error("note_required"); const ledger = repository.load(); const result = ledger.results.find((item) => item.id === id); if (!result) throw new Error("investigation_not_found"); const created = storeEvent(id, "investigation_note_added", {note: note.trim()}, `note:${result.notes.length}`); const results = ledger.results.map((item) => item.id === id ? {...item, notes: [...item.notes, note.trim()], eventIds: [...item.eventIds, created.id]} : item); save({...ledger, results, events: appendEvents(ledger.events, [created])}); return results.find((item) => item.id === id)!; }
export function setInvestigationRepositoryForTests(next: InvestigationRepository) { const previous = repository; repository = next; emit(); return () => { repository = previous; emit(); }; }
