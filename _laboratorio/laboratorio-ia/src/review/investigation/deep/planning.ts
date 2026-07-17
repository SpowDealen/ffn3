import {stableHash} from "./normalization";
import type {DeepInvestigationPlan, InvestigationProvider, InvestigationRequest, ResearchQuestion} from "./types";

const questionsFor = (request: InvestigationRequest): ResearchQuestion[] => {
  const issue = request.issue;
  const subject = request.case.subject.id ?? request.case.subject.label ?? request.case.id;
  const result: ResearchQuestion[] = [
    {id: `${issue.id}:current`, kind: "current_value", subject, predicate: issue.fieldPath ?? "issue.currentValue", critical: true, reason: "Establecer el dato observado y su procedencia.", expectedEvidenceKinds: ["case_snapshot", "source_snapshot"]},
  ];
  if (["missing_reference", "ambiguous_reference", "missing_entity", "duplicate_candidate"].includes(issue.kind)) result.push({id: `${issue.id}:candidates`, kind: "candidate_comparison", subject, predicate: "candidate.matchesEntity", critical: true, reason: "Comparar candidatos sin elegir una resolución.", expectedEvidenceKinds: ["candidate", "cms_summary", "memory"]});
  if (issue.kind === "missing_image") result.push({id: `${issue.id}:image`, kind: "image_metadata", subject, predicate: "image.url", critical: true, reason: "Comprobar metadatos ya conservados sin descargar contenido.", expectedEvidenceKinds: ["snapshot"]});
  if (issue.kind === "contradictory_data") result.push({id: `${issue.id}:conflict`, kind: "conflict", subject, predicate: issue.fieldPath ?? "field.value", critical: true, reason: "Conservar y contrastar las posiciones incompatibles.", expectedEvidenceKinds: ["independent_source"]});
  result.push({id: `${issue.id}:history`, kind: "history", subject, predicate: "historical.decision", critical: false, reason: "Usar outcomes, memoria y retrieval solo como evidencia histórica.", expectedEvidenceKinds: ["outcome", "memory", "retrieval"]});
  return result.sort((a, b) => a.id.localeCompare(b.id));
};

export function validateProviderPolicy(provider: InvestigationProvider, request: InvestigationRequest): string | null {
  if (!provider.enabled) return provider.unavailableReason ?? "provider_unavailable";
  if (!provider.readOnly) return "provider_not_read_only";
  if (!provider.supportedIssueTypes.includes("*") && !provider.supportedIssueTypes.includes(request.issue.kind)) return "unsupported_issue_type";
  if (provider.networkAccess && request.mode === "local_only") return "network_blocked_by_mode";
  if (provider.sourceClass === "cms_read" && request.mode === "local_only") return "cms_blocked_by_mode";
  if (provider.sourceClass === "authorized_source" && request.mode !== "authorized_sources") return "authorized_source_blocked_by_mode";
  if (provider.networkAccess && provider.authorizedDomains.length === 0) return "missing_domain_allowlist";
  return null;
}

export function buildDeepInvestigationPlan(request: InvestigationRequest, providers: InvestigationProvider[]): DeepInvestigationPlan {
  const selections = providers.slice().sort((a, b) => a.id.localeCompare(b.id)).map((provider, index) => {
    const reason = validateProviderPolicy(provider, request);
    const allowed = request.allowedProviderIds.length === 0 || request.allowedProviderIds.includes(provider.id);
    const withinLimit = index < request.policy.maxProviders;
    const hasSnapshot = request.case.context.snapshot !== undefined || request.case.context.sourceSnapshot !== undefined || request.case.context.originalPayload !== undefined;
    const historicalIssue = ["ambiguous_reference", "missing_reference", "missing_entity", "duplicate_candidate", "contradictory_data", "low_confidence", "recoverable_error"].includes(request.issue.kind);
    const contextReason = provider.id === "source_snapshot" && !hasSnapshot ? "No existe snapshot original conservado." : provider.id === "retrieval" && !request.retrieval ? "No existe retrieval 5E para esta incidencia." : ["outcomes", "memory"].includes(provider.id) && !historicalIssue ? "La incidencia no requiere contraste histórico en este plan." : null;
    return {providerId: provider.id, selected: !reason && !contextReason && allowed && withinLimit, reason: reason ?? contextReason ?? (!allowed ? "No incluido en allowedProviderIds." : !withinLimit ? "Excede el máximo de proveedores de la política." : "Proveedor registrado, compatible y permitido.")};
  });
  const questions = questionsFor(request);
  const fingerprint = stableHash({issueType: request.issue.kind, questions, selections});
  return {id: `investigation-plan:${request.id}`, requestId: request.id, version: 1, issueType: request.issue.kind, questions, providers: selections, createdAt: request.requestedAt, deterministicFingerprint: fingerprint};
}
