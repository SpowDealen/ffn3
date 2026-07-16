import type {OutcomeAssessment, OutcomeEvidence, OperationalOutcomeStatus, StructuralOutcomeStatus, TechnicalOutcomeStatus} from "./types";

export function evaluateTechnicalOutcome(input: {executed: boolean; success?: boolean; error?: {code: string; message: string}; returnedIds?: string[]; persisted?: boolean; reconciliationRequired?: boolean; evidence?: OutcomeEvidence[]}): OutcomeAssessment<TechnicalOutcomeStatus> {
  const evidence = input.evidence ?? [];
  if (!input.executed) return {status: "unknown", reasons: ["No existe evidencia de que la operación se ejecutara."], evidence};
  if (input.reconciliationRequired || (input.success && input.persisted === false)) return {status: "pending", reasons: ["La operación requiere reconciliación antes de declarar un resultado terminal."], evidence};
  if (input.error || input.success === false) return {status: "failed", reasons: [input.error?.message ?? "El executor devolvió un fallo explícito."], evidence};
  if (input.success === true && (input.returnedIds?.some(Boolean) || input.persisted === true)) return {status: "succeeded", reasons: ["La operación devolvió éxito y una señal persistida o un ID real."], evidence};
  return {status: "pending", reasons: ["La ejecución no contiene evidencia terminal suficiente."], evidence};
}
export function evaluateStructuralOutcome(input: {validation?: {valid: boolean; reasons?: string[]}; requirementsSatisfied?: boolean; documentId?: string; referencesValid?: boolean; evidence?: OutcomeEvidence[]}): OutcomeAssessment<StructuralOutcomeStatus> {
  const evidence = input.evidence ?? [];
  if (input.validation?.valid === false || input.requirementsSatisfied === false || input.referencesValid === false) return {status: "invalid", reasons: input.validation?.reasons?.length ? input.validation.reasons : ["Falló una invariante estructural explícita."], evidence};
  if (input.validation?.valid === true) return {status: "valid", reasons: input.validation.reasons?.length ? input.validation.reasons : ["Las validaciones estructurales disponibles son válidas."], evidence};
  if (input.documentId) return {status: "pending", reasons: ["Existe un documento identificable, pero falta validación estructural completa."], evidence};
  return {status: "unknown", reasons: ["No hay datos estructurales suficientes."], evidence};
}
export function evaluateEditorialOutcome(input: {action?: "request" | "confirm" | "reject"; actor?: string; reason?: string; evidence?: OutcomeEvidence[]}): OutcomeAssessment<"unknown" | "pending_confirmation" | "confirmed" | "rejected"> {
  const evidence = input.evidence ?? [];
  if (input.action === "confirm" && input.actor && input.reason?.trim()) return {status: "confirmed", reasons: [input.reason], evidence};
  if (input.action === "reject" && input.actor && input.reason?.trim()) return {status: "rejected", reasons: [input.reason], evidence};
  if (input.action === "request") return {status: "pending_confirmation", reasons: ["Se solicitó confirmación editorial explícita."], evidence};
  return {status: "unknown", reasons: ["Ninguna señal técnica implica verdad editorial."], evidence};
}
export function evaluateOperationalOutcome(input: {resumeCompleted?: boolean; processClosed?: boolean; draftId?: string; activeExecution?: boolean; terminalFailure?: string; reconciliationRequired?: boolean; evidence?: OutcomeEvidence[]}): OutcomeAssessment<OperationalOutcomeStatus> {
  const evidence = input.evidence ?? [];
  if (input.terminalFailure) return {status: "failed", reasons: [input.terminalFailure], evidence};
  if (input.reconciliationRequired || input.activeExecution) return {status: "pending", reasons: ["La operación sigue activa o necesita reconciliación."], evidence};
  if (input.resumeCompleted && input.processClosed !== false && input.draftId) return {status: "completed", reasons: ["La reanudación terminó y existe un borrador identificable."], evidence};
  return {status: "unknown", reasons: ["No existe evidencia operativa terminal suficiente."], evidence};
}
