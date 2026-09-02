import {projectAgentReview} from "../../agent-ready/adapters";
import {AGENT_READY_CONTRACT_VERSION, type AgentDependency, type AgentProcess, type AgentSnapshot} from "../../agent-ready/model";
import type {ReviewCase, ReviewModule, ReviewPriority} from "../../review/types";
import {computeUniversalFingerprint} from "../../review/universal";
import {compareAgentSnapshots} from "../compare";
import {diagnoseAgentContext} from "../diagnosis";
import {buildEditorialIntelligence} from "../editorial-insights";
import type {EditorialEvidenceObservation} from "../editorial-model";
import {buildAgentProposals} from "../proposals";
import {buildReasoningContext} from "../reasoning";
import type {AgentContextInput} from "./types";

const GENERATED_AT = "2026-09-03T10:00:00.000Z";

function reviewCase(input: Readonly<{
  id: string;
  module: ReviewModule;
  source: string;
  subjectType: string;
  status: ReviewCase["status"];
  priority: ReviewPriority;
  issue?: ReviewCase["issues"][number];
  resolution?: ReviewCase["resolutions"][number];
  producer?: string;
}>): ReviewCase {
  return {
    schemaVersion: 1,
    id: input.id,
    dedupeKey: input.id,
    module: input.module,
    title: `Caso ${input.source} ${input.subjectType}`,
    status: input.status,
    priority: input.priority,
    source: input.source,
    subject: {type: input.subjectType, id: `${input.id}:subject`, label: `${input.source} ${input.subjectType}`},
    issues: input.issue ? [input.issue] : [],
    resolutions: input.resolution ? [input.resolution] : [],
    context: {
      producer: input.producer ?? input.module.replace(".", "_"),
      unifiedReviewIntake: {
        sourceLabel: input.source,
        entityLabel: input.subjectType === "news" ? "Noticia" : input.subjectType === "event" ? "Evento" : "Entidad editorial",
        ...(input.status === "resolved" ? {resume: {schemaVersion: 1}} : {}),
      },
    },
    createdAt: "2026-09-03T08:00:00.000Z",
    updatedAt: "2026-09-03T09:00:00.000Z",
    resolvedAt: ["resolved", "resumed"].includes(input.status) ? "2026-09-03T09:00:00.000Z" : undefined,
    resumedAt: input.status === "resumed" ? "2026-09-03T09:30:00.000Z" : undefined,
    version: input.resolution ? 2 : 1,
    resumeAttempts: input.status === "resumed" ? 1 : 0,
    resumeExecution: input.status === "resumed" ? {status: "succeeded", attemptCount: 1, completedAt: "2026-09-03T09:30:00.000Z", summary: {appliedResolutionCount: 1, changeCount: 1, resultId: `${input.id}:result`}} : undefined,
  };
}

export function createAgentContextComposerReviewCases(): readonly ReviewCase[] {
  const ambiguousIssue: ReviewCase["issues"][number] = {id: "issue:ufc:identity", kind: "ambiguous_reference", valueKind: "fighter", label: "Identidad", message: "Hay dos luchadores posibles para la noticia.", blocking: true, evidence: ["evidence:ufc:identity"], candidates: [{id: "fighter:alex-norte", label: "Alex Norte", value: {sanityId: "fighter:alex-norte"}, confidence: 0.94}, {id: "fighter:alex-sur", label: "Álex Sur", value: {sanityId: "fighter:alex-sur"}, confidence: 0.61}]};
  const readyIssue: ReviewCase["issues"][number] = {id: "issue:bkfc:ready", kind: "ambiguous_reference", valueKind: "organization", label: "Organización", message: "Confirma la organización propuesta.", blocking: true, evidence: ["evidence:bkfc:organization"], candidates: [{id: "organization:bkfc", label: "BKFC", value: {sanityId: "organization:bkfc"}, confidence: 0.92}]};
  const staleIssue: ReviewCase["issues"][number] = {id: "issue:one:stale", kind: "low_confidence", valueKind: "text", label: "Evidencia", message: "La evidencia necesita actualizarse.", blocking: true, evidence: ["evidence:one:stale"]};
  return Object.freeze([
    reviewCase({id: "case:ufc:identity", module: "ufc.news", source: "UFC", subjectType: "news", status: "open", priority: "critical", issue: ambiguousIssue, producer: "ufc_news"}),
    reviewCase({id: "case:one:resume", module: "one.events", source: "ONE", subjectType: "event", status: "resolved", priority: "high", producer: "one_events"}),
    reviewCase({id: "case:bkfc:done", module: "bkfc.news", source: "BKFC", subjectType: "news", status: "resumed", priority: "normal", producer: "bkfc_news"}),
    reviewCase({id: "case:external:dismissed", module: "external.news", source: "Noticias externas", subjectType: "news", status: "dismissed", priority: "low", producer: "external_news"}),
    reviewCase({id: "case:bkfc:ready", module: "bkfc.events", source: "BKFC", subjectType: "event", status: "open", priority: "high", issue: readyIssue, resolution: {type: "select_candidate", issueId: readyIssue.id, candidateId: "organization:bkfc"}, producer: "bkfc_events"}),
    reviewCase({id: "case:one:stale", module: "one.news", source: "ONE", subjectType: "news", status: "stale", priority: "critical", issue: staleIssue, producer: "one_news"}),
  ]);
}

function dependency(state: AgentDependency["state"], current: boolean): AgentDependency {
  return Object.freeze({id: "references", label: "Entidades de referencia", state, effect: state === "operational" ? "none" : "degraded", current, live: false, reason: current ? Object.freeze({code: "references_degraded", text: "Las referencias necesitan comprobación."}) : undefined, destination: "/editorial", checkedAt: GENERATED_AT, activeCount: 0, currentIncidentCount: current ? 1 : 0, historicalCount: current ? 0 : 1});
}

function process(): AgentProcess {
  return Object.freeze({id: "process:one:events", title: "Preparación de eventos ONE", state: "running", temporal: "current", active: true, source: "ONE · Process Store", authority: Object.freeze({owner: "process_origin", source: "ONE events"}), updatedAt: GENERATED_AT, progress: Object.freeze({kind: "determinate", current: 1, total: 3}), actions: Object.freeze({retryAuthorized: false, cancelAuthorized: false}), destination: "/actividad"});
}

function snapshot(kind: "previous" | "current", reviewCases: readonly ReviewCase[]): AgentSnapshot {
  const current = kind === "current";
  const projectedReview = current ? Object.freeze(projectAgentReview(reviewCases)) : Object.freeze([]);
  const processes = current ? Object.freeze([process()]) : Object.freeze([]);
  const dependencies = Object.freeze([dependency(current ? "degraded" : "operational", current)]);
  const observationFingerprint = computeUniversalFingerprint({kind, review: projectedReview.map((entry) => ({id: entry.id, version: entry.version, status: entry.status})), processes: processes.map((entry) => ({id: entry.id, state: entry.state})), dependencies: dependencies.map((entry) => ({id: entry.id, state: entry.state}))});
  return Object.freeze({schemaVersion: 1, contractVersion: AGENT_READY_CONTRACT_VERSION, observationId: `agent-observation:${observationFingerprint}`, observationFingerprint, observedAt: current ? GENERATED_AT : "2026-09-03T09:59:00.000Z", globalStatus: Object.freeze({state: current ? "degraded" : "operational", label: current ? "Necesita atención" : "Operativo", evaluatedAt: current ? GENERATED_AT : "2026-09-03T09:59:00.000Z", currentIncidentCount: current ? 1 : 0, activeProcessCount: current ? 1 : 0, historicalRecordCount: 0}), operator: Object.freeze({state: current ? "attention" : "clear", attention: Object.freeze([]), active: Object.freeze([])}), dependencies, processes, notifications: Object.freeze([]), review: projectedReview, capabilities: Object.freeze([]), boundary: Object.freeze({readOnly: true, projectionOnly: true, executes: false, persists: false, plans: false, decidesAutonomy: false})});
}

function editorialEvidence(): readonly EditorialEvidenceObservation[] {
  return Object.freeze([
    Object.freeze({id: "evidence:ufc:ambiguous", epistemicStatus: "observed_fact" as const, dimension: "fighter_identity" as const, assessment: "ambiguous" as const, entity: Object.freeze({kind: "luchador" as const, id: "fighter:alex"}), temporal: "current" as const, evidence: Object.freeze([{id: "evidence:ufc:identity", source: "Review"}]), reviewId: "case:ufc:identity"}),
    Object.freeze({id: "evidence:orphan-news", epistemicStatus: "observed_fact" as const, dimension: "news_relevant_entity" as const, assessment: "missing" as const, entity: Object.freeze({kind: "noticia" as const, id: "news:without-review"}), temporal: "current" as const, evidence: Object.freeze([{id: "evidence:news:missing", source: "Inspection", fingerprint: "sha256-v1:news-missing"}])}),
    Object.freeze({id: "evidence:conflict", epistemicStatus: "observed_fact" as const, dimension: "evidence_consistency" as const, assessment: "conflicting" as const, entity: Object.freeze({kind: "evento" as const, id: "event:conflicting"}), temporal: "current" as const, evidence: Object.freeze([{id: "evidence:conflict:a", source: "Inspection", fingerprint: "sha256-v1:conflict-a"}, {id: "evidence:conflict:b", source: "Inspection", fingerprint: "sha256-v1:conflict-b"}])}),
    Object.freeze({id: "evidence:bkfc:sufficient", epistemicStatus: "observed_fact" as const, dimension: "evidence_sufficiency" as const, assessment: "sufficient" as const, entity: Object.freeze({kind: "noticia" as const, id: "case:bkfc:done:subject"}), temporal: "current" as const, evidence: Object.freeze([{id: "evidence:bkfc:done", source: "Review"}]), reviewId: "case:bkfc:done"}),
  ]);
}

export function createAgentContextComposerFixture(): AgentContextInput {
  const reviewCases = createAgentContextComposerReviewCases();
  const previous = snapshot("previous", []);
  const current = snapshot("current", reviewCases);
  const reasoning = buildReasoningContext(compareAgentSnapshots(previous, current), current);
  const diagnoses = diagnoseAgentContext(reasoning);
  const proposals = buildAgentProposals(diagnoses, reasoning);
  const editorial = buildEditorialIntelligence({snapshot: current, events: reasoning.diff.events, diagnoses, evidence: editorialEvidence()});
  return Object.freeze({generatedAt: GENERATED_AT, snapshot: current, reasoning, diagnoses, proposals, editorial, reviewCases});
}

export const agentContextFixtureSecurity = Object.freeze({pure: true, deterministic: true, devOnly: true, createsStore: false, persists: false, fetches: false, writes: false, executes: false, sanity: false, telegram: false, externalApis: false} as const);
