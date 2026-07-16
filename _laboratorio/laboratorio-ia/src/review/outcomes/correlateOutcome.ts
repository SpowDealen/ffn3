import type {DecisionOutcomeRecord, OutcomeCorrelation} from "./types";
export function correlateOutcome(records: readonly DecisionOutcomeRecord[], input: {outcomeId?: string; caseId?: string; issueId?: string; resolutionId?: string; decisionFingerprint?: string; explicitReference?: string}): OutcomeCorrelation {
  if (input.outcomeId) { const found = records.find((item) => item.id === input.outcomeId); return found ? {status: "exact", outcomeIds: [found.id], reasons: ["Coincidencia por outcomeId."]} : {status: "unresolved", outcomeIds: [], reasons: ["El outcomeId no existe."]}; }
  const explicit = input.explicitReference ? records.filter((item) => [item.applicationReference, item.materializationReference, item.resumeReference, item.documentReference].includes(input.explicitReference)) : [];
  if (explicit.length === 1) return {status: "explicit_reference", outcomeIds: [explicit[0].id], reasons: ["Una referencia explícita conecta la observación con el outcome."]};
  if (explicit.length > 1) return {status: "conflict", outcomeIds: explicit.map((item) => item.id), reasons: ["La referencia explícita apunta a varios outcomes."]};
  const exact = records.filter((item) => item.caseId === input.caseId && item.issueId === input.issueId && (!input.resolutionId || item.resolutionId === input.resolutionId));
  if (exact.length === 1) return {status: "exact", outcomeIds: [exact[0].id], reasons: ["Coincidencia exacta por caso, issue y resolución."]};
  if (exact.length > 1) return {status: "conflict", outcomeIds: exact.map((item) => item.id), reasons: ["Existen varias decisiones para el mismo ámbito; se requiere referencia explícita."]};
  const fingerprint = input.decisionFingerprint ? records.filter((item) => item.decisionFingerprint === input.decisionFingerprint) : [];
  if (fingerprint.length === 1) return {status: "fingerprint_match", outcomeIds: [fingerprint[0].id], reasons: ["Coincidencia por fingerprint de decisión versionado."]};
  if (fingerprint.length > 1) return {status: "conflict", outcomeIds: fingerprint.map((item) => item.id), reasons: ["El fingerprint aparece en varios records y no basta para fusionarlos."]};
  return {status: "unresolved", outcomeIds: [], reasons: ["No existen IDs, referencias o fingerprints inequívocos."]};
}
