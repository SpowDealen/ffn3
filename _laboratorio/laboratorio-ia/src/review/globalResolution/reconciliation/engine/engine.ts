import type {ReviewJsonValue} from "../../../types";
import {computeUniversalFingerprint} from "../../../universal";
import type {GlobalResolutionReconciliationEvidence} from "../types";
import type {UniversalReconciliationContractRegistry} from "./registry";
import {
  UNIVERSAL_RECONCILIATION_ASSESSMENT_VERSION,
  type UniversalReconciliationAction,
  type UniversalReconciliationAssessment,
  type UniversalReconciliationAssessmentInput,
  type UniversalReconciliationOutcome,
  type UniversalReconciliationReason,
  type UniversalReconciliationStatus,
  type UniversalSafeEvidenceSummary,
} from "./types";

const fp = (value: unknown): string => computeUniversalFingerprint(value as ReviewJsonValue);
const safe = (value?: string, maximum = 180): string | undefined => value?.replace(/https?:\/\/\S+/gi, "[URL OCULTA]").replace(/\b(token|secret|authorization|cookie|password|api[_-]?key)\b\s*[:=]\s*\S+/gi, "$1=[OCULTO]").slice(0, maximum);
const reason = (code: string, message: string): UniversalReconciliationReason => ({code, message});

function category(value: GlobalResolutionReconciliationEvidence): UniversalSafeEvidenceSummary["category"] {
  if (value.source !== "external_inspector") return value.source === "checkpoint" ? "local_checkpoint" : "local_operation";
  if (value.finding === "effect_not_found") return "remote_absence";
  if (value.finding === "unknown") return /ambigu/i.test(value.summary) ? "remote_ambiguity" : "technical";
  if (value.type === "resolved_reference" || /referenc/i.test(value.summary)) return "remote_reference";
  if (value.fingerprint) return "remote_payload";
  return "remote_document";
}

function summarize(values: readonly GlobalResolutionReconciliationEvidence[]): UniversalSafeEvidenceSummary[] {
  const unique = new Map<string, UniversalSafeEvidenceSummary>();
  for (const value of values) {
    const semantic = {
      category: category(value),
      provenance: value.source,
      summary: safe(value.summary) ?? "Evidencia no disponible",
      confidence: value.confidence,
      fingerprint: safe(value.fingerprint, 220),
      documentId: safe(value.documentId, 160),
      identityKey: safe(value.identityKey, 160),
      finding: value.finding,
    };
    const id = `safe-evidence:${fp(semantic).slice(-24)}`;
    if (!unique.has(id)) unique.set(id, {id, ...semantic});
  }
  return [...unique.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function actions(status: UniversalReconciliationStatus): UniversalReconciliationAction[] {
  if (status === "confirmed_succeeded") return ["repair_checkpoint"];
  if (status === "confirmed_not_applied") return ["enable_retry"];
  if (["conflicting_evidence", "insufficient_evidence", "technical_failure"].includes(status)) return ["inspect_again"];
  return ["none"];
}

function bindingFingerprint(binding: UniversalReconciliationAssessmentInput["currentContext"]): string {
  return fp({
    producerId: binding.producerId,
    producerVersion: binding.producerVersion,
    manifestVersion: binding.manifestVersion,
    manifestFingerprint: binding.manifestFingerprint,
    caseVersion: binding.caseVersion,
    checkpointVersion: binding.checkpointVersion,
    checkpointFingerprint: binding.checkpointFingerprint,
    operationId: binding.operationId,
    operationFingerprint: binding.operationFingerprint,
    payloadFingerprint: binding.payloadFingerprint,
    capabilityId: binding.capabilityId,
    capabilityVersion: binding.capabilityVersion,
    inspectorId: binding.inspectorId,
    inspectorVersion: binding.inspectorVersion,
    inspectionGeneration: binding.inspectionGeneration,
  });
}

function bindingMatches(expected: UniversalReconciliationAssessmentInput["expectedContext"], current: UniversalReconciliationAssessmentInput["currentContext"]): boolean {
  return !expected || expected.producerId === current.producerId
    && expected.producerVersion === current.producerVersion
    && expected.manifestVersion === current.manifestVersion
    && expected.manifestFingerprint === current.manifestFingerprint
    && expected.caseVersion === current.caseVersion
    && expected.checkpointVersion === current.checkpointVersion
    && expected.checkpointFingerprint === current.checkpointFingerprint
    && expected.operationId === current.operationId
    && expected.operationFingerprint === current.operationFingerprint
    && expected.payloadFingerprint === current.payloadFingerprint
    && expected.capabilityId === current.capabilityId
    && expected.capabilityVersion === current.capabilityVersion
    && expected.inspectorId === current.inspectorId
    && expected.inspectorVersion === current.inspectorVersion
    && expected.inspectionGeneration === current.inspectionGeneration;
}

function requiredOutcome(
  contract: NonNullable<ReturnType<UniversalReconciliationContractRegistry["get"]>>,
  evidence: readonly GlobalResolutionReconciliationEvidence[],
  expectedPayloadFingerprint?: string,
): UniversalReconciliationOutcome | undefined {
  const candidates = evidence.filter((item) => item.finding === "effect_confirmed" && item.confidence === "confirmed" || item.source !== "external_inspector" && ["confirmed", "strong"].includes(item.confidence) && Boolean(item.documentId));
  const documentIds = [...new Set(candidates.flatMap((item) => item.documentId ? [item.documentId] : []))];
  if (documentIds.length !== 1) return undefined;
  const matching = candidates.filter((item) => item.documentId === documentIds[0]);
  const source = matching.find((item) => item.identityKey && item.fingerprint)
    ?? matching.find((item) => item.fingerprint)
    ?? matching[0];
  const identityKeys = [...new Set(matching.flatMap((item) => item.identityKey ? [item.identityKey] : []))];
  const evidenceFingerprints = [...new Set(evidence.flatMap((item) => ["confirmed", "strong"].includes(item.confidence) && item.fingerprint ? [item.fingerprint] : []))];
  const hasLocalPostcondition = matching.some((item) => item.source !== "external_inspector");
  const externalFingerprints = matching.flatMap((item) => item.source === "external_inspector" && item.fingerprint ? [item.fingerprint] : []);
  const payloadFingerprint = expectedPayloadFingerprint
    ? hasLocalPostcondition || externalFingerprints.includes(expectedPayloadFingerprint) ? expectedPayloadFingerprint : undefined
    : evidenceFingerprints.length === 1 ? evidenceFingerprints[0] : undefined;
  const outcome: UniversalReconciliationOutcome = {
    outcome: source?.outcome && ["created", "reused_existing", "resumed", "already_resumed"].includes(source.outcome) ? source.outcome : contract.successOutcome,
    documentId: documentIds[0],
    identityKey: identityKeys.length === 1 ? identityKeys[0] : undefined,
    payloadFingerprint,
    idempotencyKey: source?.idempotencyKey,
  };
  return contract.requiredSuccessFields.every((field) => Boolean(outcome[field])) ? outcome : undefined;
}

function finish(input: {
  status: UniversalReconciliationStatus;
  source: UniversalReconciliationAssessmentInput;
  reasons: UniversalReconciliationReason[];
  localEvidence: UniversalSafeEvidenceSummary[];
  remoteEvidence: UniversalSafeEvidenceSummary[];
  summary: string;
  outcome?: UniversalReconciliationOutcome;
}): UniversalReconciliationAssessment {
  const allowedActions = actions(input.status);
  const blockingReasons = allowedActions.some((action) => action === "repair_checkpoint" || action === "enable_retry") ? [] : input.reasons;
  const contextFingerprint = bindingFingerprint(input.source.currentContext);
  const evidenceFingerprint = input.localEvidence.length || input.remoteEvidence.length ? fp([...input.localEvidence, ...input.remoteEvidence]) : undefined;
  const semantic = {
    version: UNIVERSAL_RECONCILIATION_ASSESSMENT_VERSION,
    status: input.status,
    operationId: input.source.currentContext.operationId,
    capability: input.source.reconciliationCase.capability,
    inspectorId: input.source.inspectorId,
    summary: input.summary,
    reasons: [...input.reasons].sort((left, right) => left.code.localeCompare(right.code)),
    localEvidence: input.localEvidence,
    remoteEvidence: input.remoteEvidence,
    allowedActions,
    blockingReasons: [...blockingReasons].sort((left, right) => left.code.localeCompare(right.code)),
    contextFingerprint,
    evidenceFingerprint,
    outcome: input.outcome,
  } as const;
  return {
    ...semantic,
    inspectedAt: input.source.inspectedAt,
    assessmentFingerprint: fp(semantic),
  };
}

export function assessUniversalReconciliation(
  input: UniversalReconciliationAssessmentInput,
  registry: UniversalReconciliationContractRegistry,
): UniversalReconciliationAssessment {
  const values = [...(input.evidence ?? input.reconciliationCase.evidence)];
  const safeEvidence = summarize(values);
  const localEvidence = safeEvidence.filter((item) => !item.category.startsWith("remote_") && item.category !== "technical");
  const remoteEvidence = safeEvidence.filter((item) => !localEvidence.includes(item));
  const contract = registry.get(input.reconciliationCase.capability);
  if (!bindingMatches(input.expectedContext, input.currentContext)) return finish({
    status: "stale_context", source: input, localEvidence, remoteEvidence,
    reasons: [reason("context_changed", "La evidencia pertenece a una versión, operación o fingerprint anterior.")],
    summary: "El contexto cambió después de la inspección.",
  });
  if (input.technicalFailure) return finish({
    status: "technical_failure", source: input, localEvidence, remoteEvidence,
    reasons: [reason("inspection_failed", "La inspección no pudo aportar evidencia segura.")],
    summary: "No fue posible completar la inspección.",
  });
  if (input.unsupported) return finish({
    status: "unsupported", source: input, localEvidence, remoteEvidence,
    reasons: [reason("inspector_unsupported", "No existe un inspector compatible para la solicitud.")],
    summary: "La operación no dispone de un inspector compatible.",
  });
  if (!contract) return finish({
    status: "unsupported", source: input, localEvidence, remoteEvidence,
    reasons: [reason("capability_unsupported", "No existe un contrato de reconciliación compatible.")],
    summary: "La capability no dispone de reconciliación registrada.",
  });
  const node = input.checkpoint.graph.nodes.find((item) => item.operationId === input.currentContext.operationId);
  if (node?.state === "succeeded" && (!contract.requiresCompletedCheckpointForAlreadyReconciled || input.checkpoint.phase === "completed")) return finish({
    status: "already_reconciled", source: input, localEvidence, remoteEvidence, reasons: [],
    summary: "La operación ya está reconciliada.", outcome: requiredOutcome(contract, values, input.currentContext.payloadFingerprint),
  });
  const confirmed = values.filter((item) => item.finding === "effect_confirmed" && item.confidence === "confirmed");
  const absent = values.filter((item) => item.finding === "effect_not_found" && item.confidence === "confirmed");
  const documentIds = [...new Set(values.flatMap((item) => item.documentId && ["confirmed", "strong"].includes(item.confidence) ? [item.documentId] : []))];
  const ambiguous = values.some((item) => item.finding === "unknown" && /ambigu/i.test(item.summary));
  if (confirmed.length && absent.length || documentIds.length > 1 || ambiguous) return finish({
    status: "conflicting_evidence", source: input, localEvidence, remoteEvidence,
    reasons: [reason("evidence_conflict", "Las evidencias no identifican un único resultado real.")],
    summary: "La evidencia disponible es contradictoria o ambigua.",
  });
  const outcome = requiredOutcome(contract, values, input.currentContext.payloadFingerprint);
  if (outcome) return finish({
    status: "confirmed_succeeded", source: input, localEvidence, remoteEvidence, reasons: [],
    summary: "La evidencia confirma que el efecto esperado ocurrió.", outcome,
  });
  if (absent.length && !documentIds.length && !confirmed.length) return finish({
    status: "confirmed_not_applied", source: input, localEvidence, remoteEvidence, reasons: [],
    summary: "La evidencia confirma que el efecto esperado no ocurrió.",
  });
  return finish({
    status: "insufficient_evidence", source: input, localEvidence, remoteEvidence,
    reasons: [reason("evidence_insufficient", "Faltan hechos concluyentes para confirmar presencia o ausencia.")],
    summary: "No existe evidencia suficiente para determinar el resultado.",
  });
}
