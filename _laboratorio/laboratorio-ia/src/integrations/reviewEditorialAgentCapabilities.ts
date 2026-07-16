import {getReviewCase} from "../review/store/reviewStore";
import {runAutonomousInvestigation} from "../review/investigation";
import {registerEditorialCapability, runEditorialAgent, type EditorialAgentFact, type EditorialAgentRun, type EditorialCapabilityAdapter} from "../review/agent";
import type {ReviewJsonObject} from "../review/types";

const inspectReviewCase: EditorialCapabilityAdapter = {
  manifest: {id: "review.inspect_case", version: 1, description: "Observa un ReviewCase sin modificarlo.", provides: ["review_case_observed"], requires: [], effects: ["read_local"], risk: "none", timeoutMs: 1_000, priority: 100, maxExecutionsPerRun: 1},
  supports(goal) { return typeof goal.target.caseId === "string"; },
  async execute(context) {
    const caseId = String(context.goal.target.caseId ?? "");
    const reviewCase = getReviewCase(caseId);
    if (!reviewCase) return {status: "failed", producedOutcomes: [], facts: [], reasoningSummary: "El caso solicitado no existe en el store de revisión.", evidence: [], warnings: [], error: {code: "case_not_found", message: "No existe el ReviewCase."}};
    const snapshot: ReviewJsonObject = {caseId: reviewCase.id, version: reviewCase.version, module: reviewCase.module, status: reviewCase.status, issueCount: reviewCase.issues.length, unresolvedIssueIds: reviewCase.issues.filter((issue) => !reviewCase.resolutions.some((resolution) => resolution.issueId === issue.id)).map((issue) => issue.id)};
    const fact: EditorialAgentFact = {key: "review_case_observed", value: snapshot, source: "review.inspect_case", confidence: 1, observedAt: context.now};
    return {status: "completed", producedOutcomes: ["review_case_observed"], facts: [fact], artifact: snapshot, reasoningSummary: "El caso se observó directamente desde el store y se resumió sin mutaciones.", evidence: [{label: "ReviewCase persistido", source: "review_store", value: snapshot}], warnings: []};
  },
};

const investigateReviewIssues: EditorialCapabilityAdapter = {
  manifest: {id: "review.investigate_issues", version: 1, description: "Adapta la investigación 4D1 como capacidad de lectura del agente.", provides: ["review_issues_investigated"], requires: ["review_case_observed"], effects: ["read_local", "read_external"], risk: "low", timeoutMs: 20_000, priority: 90, maxExecutionsPerRun: 1},
  supports(goal) { return typeof goal.target.caseId === "string"; },
  async execute(context) {
    const result = await runAutonomousInvestigation(String(context.goal.target.caseId), {dryRun: true, now: () => context.now});
    const artifact = result as unknown as ReviewJsonObject;
    const fact: EditorialAgentFact = {key: "review_issues_investigated", value: {status: result.status, investigatedIssueCount: result.investigatedIssueCount, pendingCount: result.pendingCount, conflictCount: result.conflictCount}, source: "review.investigate_issues", confidence: result.status === "completed" ? 1 : .8, observedAt: context.now};
    return {status: result.status === "failed" ? "failed" : "completed", producedOutcomes: ["review_issues_investigated"], facts: [fact], artifact, reasoningSummary: `La capacidad investigó ${result.investigatedIssueCount} incidencias mediante fuentes autorizadas; ${result.pendingCount + result.conflictCount} siguen pendientes.`, evidence: result.conclusions.flatMap((conclusion) => conclusion.evidence.slice(0, 10).map((evidence) => ({label: evidence.label, source: evidence.source, value: evidence.value}))), warnings: result.warnings};
  },
};

export function registerReviewEditorialAgentCapabilities(): () => void {
  const unregisterInspect = registerEditorialCapability(inspectReviewCase);
  const unregisterInvestigation = registerEditorialCapability(investigateReviewIssues);
  return () => { unregisterInvestigation(); unregisterInspect(); };
}

export function runReviewEditorialAgent(caseId: string): Promise<EditorialAgentRun> {
  return runEditorialAgent({id: `review:${caseId}`, objective: "Comprender e investigar las incidencias del caso antes de proponer cualquier acción.", target: {caseId}, requiredOutcomes: ["review_issues_investigated"]});
}
