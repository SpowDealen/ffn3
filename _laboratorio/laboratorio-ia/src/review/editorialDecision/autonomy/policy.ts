import type {GlobalResolutionReconciliationAssessment} from "../../globalResolution/reconciliation";
import type {ReviewJsonValue} from "../../types";
import {computeUniversalFingerprint} from "../../universal";
import type {TransactionRisk} from "../../transactions/types";
import {
  AUTONOMY_RISK_POLICY_VERSION,
  type AggregatedAutonomyRisk,
  type AutonomyBlocker,
  type AutonomyCapabilityBinding,
  type AutonomyLevel,
  type AutonomyOperationDescriptor,
  type AutonomyPolicyInput,
  type AutonomyPolicyResult,
  type AutonomyReason,
  type AutonomyReasonCode,
  type HumanReviewReason,
  type HumanReviewRequirement,
  type SafeAuthorizationRequirement,
  type SafeRiskDescriptor,
} from "./types";

const riskOrder: readonly AggregatedAutonomyRisk[] = Object.freeze(["low", "medium", "high", "destructive", "unknown"]);
const freeze = <T>(values: readonly T[]): readonly T[] => Object.freeze([...values]);
const unique = (values: readonly string[]): readonly string[] => freeze([...new Set(values)].sort());
const fp = (value: unknown): string => computeUniversalFingerprint(value as ReviewJsonValue);

function reason(code: AutonomyReasonCode, summary: string, source: AutonomyReason["source"]): AutonomyReason {
  return Object.freeze({code, summary, source});
}

function blocker(code: AutonomyReasonCode, severity: AutonomyBlocker["severity"], summary: string): AutonomyBlocker {
  return Object.freeze({code, severity, summary});
}

function operations(input: AutonomyPolicyInput): readonly AutonomyOperationDescriptor[] {
  if (input.operations?.length) return freeze([...input.operations].sort((left, right) => left.operationId.localeCompare(right.operationId)));
  return freeze([...(input.transaction?.steps ?? [])].map((step): AutonomyOperationDescriptor => Object.freeze({
    operationId: step.operationId,
    operationKind: step.operationKind,
    capability: step.capability,
    mode: step.mode,
    risk: step.risk,
    authorization: step.authorization,
    compensation: step.compensation,
    reconciliation: step.reconciliation,
    reversible: step.mode === "read_only" || step.mode === "pure_transform" && step.compensation === "reversible_transform",
    creationGuardFingerprint: step.fingerprints.creationGuardFingerprint,
  })).sort((left, right) => left.operationId.localeCompare(right.operationId)));
}

function aggregateRisk(values: readonly AutonomyOperationDescriptor[], input: AutonomyPolicyInput): SafeRiskDescriptor {
  const drivers = values.map((item) => Object.freeze({operationId: item.operationId, operationKind: item.operationKind, capability: item.capability, mode: item.mode, risk: item.risk ?? "unknown" as const, reversible: item.reversible, externalEffect: item.mode === "external_effect"}));
  const risks = drivers.map((item) => item.risk);
  const aggregate: AggregatedAutonomyRisk = !risks.length || risks.includes("unknown") ? "unknown" : risks.reduce<TransactionRisk>((maximum, value) => riskOrder.indexOf(value) > riskOrder.indexOf(maximum) ? value as TransactionRisk : maximum, "low");
  const uncertaintyCodes: string[] = [];
  if (!drivers.length) uncertaintyCodes.push("operation_descriptors_missing");
  if (risks.includes("unknown")) uncertaintyCodes.push("operation_risk_unknown");
  if (input.transactionView?.incidents.some((item) => item.severity === "blocking" || item.severity === "critical")) uncertaintyCodes.push("transaction_incident_active");
  if (input.transactionView?.reconciliationRequired.length) uncertaintyCodes.push("reconciliation_state_unresolved");
  const semantic = {aggregate, drivers: [...drivers].sort((left, right) => left.operationId.localeCompare(right.operationId)), hasExternalEffects: drivers.some((item) => item.externalEffect), allReversible: drivers.length > 0 && drivers.every((item) => item.reversible), uncertaintyCodes: unique(uncertaintyCodes)};
  return Object.freeze({...semantic, drivers: freeze(semantic.drivers), fingerprint: fp(semantic)});
}

function capabilityMap(bindings: readonly AutonomyCapabilityBinding[] | undefined): ReadonlyMap<string, AutonomyCapabilityBinding> {
  return new Map([...(bindings ?? [])].sort((left, right) => left.manifest.capabilityId.localeCompare(right.manifest.capabilityId)).map((item) => [item.manifest.capabilityId, item]));
}

function reconciliationFingerprint(values: readonly GlobalResolutionReconciliationAssessment[] | undefined, input: AutonomyPolicyInput): string {
  return fp({assessments: [...(values ?? [])].map((item) => ({status: item.status, fingerprint: item.assessmentFingerprint})).sort((left, right) => left.fingerprint.localeCompare(right.fingerprint)), transactionRequired: [...(input.transactionView?.reconciliationRequired ?? [])].sort(), incidents: [...(input.transactionView?.incidents ?? [])].filter((item) => item.kind === "effect_uncertain").map((item) => item.fingerprint).sort()});
}

function currentCreationGuards(values: readonly AutonomyOperationDescriptor[], input: AutonomyPolicyInput): Readonly<Record<string, string>> {
  const entries = values.flatMap((item) => item.creationGuardFingerprint ? [[item.operationId, item.creationGuardFingerprint] as const] : []);
  for (const [operationId, fingerprint] of Object.entries(input.transaction?.contextBinding.creationGuardFingerprints ?? {})) if (!entries.some(([id]) => id === operationId)) entries.push([operationId, fingerprint]);
  return Object.freeze(Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right))));
}

function staleness(input: AutonomyPolicyInput, risk: SafeRiskDescriptor, values: readonly AutonomyOperationDescriptor[]): readonly string[] {
  const expected = input.expectedContext;
  if (!expected) return Object.freeze([]);
  const reasons: string[] = [];
  if (expected.decisionFingerprint && expected.decisionFingerprint !== input.decision.decisionFingerprint) reasons.push("decision_fingerprint_changed");
  if (expected.sufficiencyFingerprint && expected.sufficiencyFingerprint !== input.sufficiency.evaluationFingerprint) reasons.push("sufficiency_fingerprint_changed");
  if (expected.transactionRiskFingerprint && expected.transactionRiskFingerprint !== risk.fingerprint) reasons.push("transaction_risk_changed");
  if (expected.producerManifestFingerprint && expected.producerManifestFingerprint !== input.producer?.fingerprint) reasons.push("producer_manifest_changed");
  const currentCapabilities = Object.fromEntries([...(input.capabilities ?? [])].map((item) => [item.manifest.capabilityId, item.fingerprint]).sort(([left], [right]) => left.localeCompare(right)));
  for (const [capability, fingerprint] of Object.entries(expected.capabilityManifestFingerprints ?? {})) if (currentCapabilities[capability] !== fingerprint) reasons.push(`capability_manifest_changed:${capability}`);
  const guards = currentCreationGuards(values, input);
  for (const [operationId, fingerprint] of Object.entries(expected.creationGuardFingerprints ?? {})) if (guards[operationId] !== fingerprint) reasons.push(`creation_guard_changed:${operationId}`);
  if (expected.reconciliationFingerprint && expected.reconciliationFingerprint !== reconciliationFingerprint(input.reconciliation, input)) reasons.push("reconciliation_state_changed");
  return unique(reasons);
}

function policyConflict(groups: readonly (readonly string[])[]): boolean {
  return groups.some((left, index) => groups.some((right, other) => other > index && left.some((value) => right.includes(value))));
}

function humanRequirement(reasons: readonly HumanReviewReason[]): HumanReviewRequirement | undefined {
  const values = unique(reasons) as readonly HumanReviewReason[];
  return values.length ? Object.freeze({reasons: values, safeSummary: `Se requiere revisión humana: ${values.join(", ")}.`, requiredBeforeContinuation: true as const}) : undefined;
}

function authorizationRequirement(input: AutonomyPolicyInput, values: readonly AutonomyOperationDescriptor[]): SafeAuthorizationRequirement | undefined {
  const required = values.filter((item) => item.authorization !== "none" || input.producer?.manifest.autonomyPolicy?.requiresAuthorizationCapabilities.includes(item.capability));
  if (!required.length && input.decision.decision !== "request_authorization" && !input.compensation?.executableStepIds.length) return undefined;
  const policy = required.some((item) => item.authorization === "human_required") ? "human_required" as const : "explicit" as const;
  return Object.freeze({policy, operationIds: unique(required.map((item) => item.operationId)), capabilities: unique(required.map((item) => item.capability)), bindsDecisionFingerprint: input.decision.decisionFingerprint, bindsSufficiencyFingerprint: input.sufficiency.evaluationFingerprint, ephemeral: true as const, persistedApproval: false as const, tokenStored: false as const});
}

function isExecutableDecision(decision: AutonomyPolicyInput["decision"]["decision"]): boolean {
  return ["investigate", "reuse_existing", "create_entity", "repair_reference", "validate", "resume"].includes(decision);
}

export function evaluateAutonomyRiskPolicy(input: AutonomyPolicyInput): AutonomyPolicyResult {
  const values = operations(input);
  const risk = aggregateRisk(values, input);
  const staleReasonCodes = staleness(input, risk, values);
  const reasons: AutonomyReason[] = [];
  const blockers: AutonomyBlocker[] = [];
  const humanReasons: HumanReviewReason[] = [];
  let blocked = false;
  let authorization = false;
  let supervised = false;

  if (staleReasonCodes.length) { blocked = true; reasons.push(reason("stale_context", "El contexto de policy cambió y debe reevaluarse.", "policy")); blockers.push(blocker("stale_context", "blocking", "Uno o más fingerprints vinculados ya no coinciden.")); }

  if (input.sufficiency.classification === "contradictory") {
    humanReasons.push("contradictory_evidence"); reasons.push(reason("contradictory_evidence", "B2 detectó evidencia contradictoria.", "sufficiency")); blockers.push(blocker("contradictory_evidence", "critical", "La contradicción impide autonomía."));
  } else if (input.sufficiency.classification !== "sufficient" || !input.sufficiency.canDecideNow) {
    blocked = true; reasons.push(reason("evidence_not_sufficient", `B2 clasificó la evidencia como ${input.sufficiency.classification}.`, "sufficiency")); blockers.push(blocker("evidence_not_sufficient", "blocking", "B2 no habilita una decisión final."));
  } else {
    reasons.push(reason("evidence_sufficient", "B2 habilita la evaluación de autonomía.", "sufficiency"));
  }
  if (input.sufficiency.authorityAdequate === false) { blocked = true; humanReasons.push("insufficient_authority"); reasons.push(reason("insufficient_authority", "La autoridad de las fuentes no alcanza la policy.", "sufficiency")); blockers.push(blocker("insufficient_authority", "blocking", "Se requiere una fuente con autoridad suficiente.")); }

  const ambiguous = (input.identities ?? []).some((item) => item.status === "probable_match" || item.status === "ambiguous");
  const conflicting = (input.identities ?? []).some((item) => item.status === "conflicting_identity");
  if (ambiguous && ["reuse_existing", "create_entity"].includes(input.decision.decision)) { blocked = true; humanReasons.push("identity_ambiguity"); reasons.push(reason("identity_ambiguity", "La identidad sigue siendo ambigua.", "identity")); blockers.push(blocker("identity_ambiguity", "blocking", "No puede elevarse confidence para resolver ambigüedad.")); }
  if (conflicting) { humanReasons.push("identity_ambiguity"); reasons.push(reason("identity_ambiguity", "La identidad contiene señales conflictivas.", "identity")); blockers.push(blocker("identity_ambiguity", "critical", "El conflicto de identidad requiere criterio humano.")); }

  const producerPolicy = input.producer?.manifest.autonomyPolicy;
  const capabilities = capabilityMap(input.capabilities);
  if (isExecutableDecision(input.decision.decision)) {
    if (!values.length) { blocked = true; reasons.push(reason("unknown_capability", "No existen descriptores operativos para evaluar.", "capability")); blockers.push(blocker("unknown_capability", "blocking", "La policy no infiere capabilities ausentes.")); }
    if (!input.producer || !producerPolicy) { blocked = true; reasons.push(reason("producer_policy_missing", "El productor no declara límites de autonomía.", "producer")); blockers.push(blocker("producer_policy_missing", "blocking", "Policy de productor desconocida: fail-closed.")); }
  }
  if (producerPolicy && policyConflict([producerPolicy.allowedAutonomousCapabilities, producerPolicy.supervisedCapabilities ?? [], producerPolicy.requiresAuthorizationCapabilities, producerPolicy.forbiddenAutonomousCapabilities])) {
    humanReasons.push("policy_conflict"); reasons.push(reason("policy_conflict", "El manifest declara límites incompatibles.", "producer")); blockers.push(blocker("policy_conflict", "critical", "La policy del productor debe corregirse."));
  }

  for (const operation of values) {
    const binding = capabilities.get(operation.capability);
    const producerCapability = input.producer?.manifest.capabilities.find((item) => item.capabilityId === operation.capability);
    if (!binding) { blocked = true; reasons.push(reason("unknown_capability", `Capability no catalogada: ${operation.capability}.`, "capability")); blockers.push(blocker("unknown_capability", "blocking", "Una capability desconocida nunca obtiene autonomía.")); continue; }
    if (!binding.manifest.operationKinds.includes(operation.operationKind) || !producerCapability || !producerCapability.operationKinds.includes(operation.operationKind)) { blocked = true; reasons.push(reason("unsupported_capability", `La operación no está soportada por ${operation.capability}.`, "capability")); blockers.push(blocker("unsupported_capability", "blocking", "El contrato de capability no soporta la operación.")); continue; }
    if (producerPolicy?.forbiddenAutonomousCapabilities.includes(operation.capability)) { blocked = true; reasons.push(reason("capability_forbidden", `La capability ${operation.capability} está prohibida.`, "producer")); blockers.push(blocker("capability_forbidden", "blocking", "El manifest prohíbe autonomía para esta capability.")); }
    else if (producerPolicy?.requiresAuthorizationCapabilities.includes(operation.capability) || binding.manifest.requiresExplicitAuthorization || producerCapability.requiresExplicitAuthorization) { authorization = true; reasons.push(reason("capability_requires_authorization", `La capability ${operation.capability} requiere autorización.`, "producer")); }
    else if (producerPolicy?.supervisedCapabilities?.includes(operation.capability)) { supervised = true; reasons.push(reason("capability_supervised", `La capability ${operation.capability} sólo admite supervisión.`, "producer")); }
    else if (producerPolicy?.allowedAutonomousCapabilities.includes(operation.capability)) reasons.push(reason("capability_allowed", `La capability ${operation.capability} está permitida.`, "producer"));
    else if (producerPolicy) { blocked = true; reasons.push(reason("unsupported_capability", `La capability ${operation.capability} no tiene límite declarado.`, "producer")); blockers.push(blocker("unsupported_capability", "blocking", "Capability fuera de la policy declarativa.")); }
    if (operation.authorization !== "none") { authorization = true; reasons.push(reason("authorization_required", "AU7 exige autorización explícita para un step.", "transaction")); }
    if (operation.mode === "external_effect") { supervised = true; reasons.push(reason("external_effect", "Existe al menos un efecto externo.", "transaction")); }
    else if (operation.mode === "read_only" && operation.risk === "low") reasons.push(reason("read_only_low_risk", "La operación es read-only y de riesgo bajo.", "transaction"));
    else if (operation.mode === "pure_transform" && operation.reversible) reasons.push(reason("pure_reversible_transform", "La transformación es pura y reversible.", "transaction"));
  }

  if (risk.aggregate === "unknown") { humanReasons.push("unknown_risk"); reasons.push(reason("unknown_risk", "No existe un risk descriptor completo.", "transaction")); blockers.push(blocker("unknown_risk", "critical", "Riesgo desconocido: requiere revisión humana.")); }
  else if (risk.aggregate === "destructive") { humanReasons.push("destructive_effect"); reasons.push(reason("destructive_effect", "Un step destructivo domina el conjunto.", "transaction")); blockers.push(blocker("destructive_effect", "critical", "Los efectos destructivos nunca son autónomos.")); }
  else if (risk.aggregate === "high") { humanReasons.push("high_risk"); reasons.push(reason("high_risk", "Un step high-risk eleva el riesgo agregado.", "transaction")); blockers.push(blocker("high_risk", "critical", "El riesgo alto exige intervención humana.")); }
  else if (producerPolicy && riskOrder.indexOf(risk.aggregate) > riskOrder.indexOf(producerPolicy.maximumAutonomousRisk)) { humanReasons.push("high_risk"); reasons.push(reason("high_risk", "El riesgo supera el máximo autónomo del productor.", "producer")); blockers.push(blocker("high_risk", "blocking", "El manifest no permite este riesgo autónomo.")); }

  if (input.decision.decision === "create_entity") {
    const createOperations = values.filter((item) => item.operationKind === "create_entity");
    const resolvedCreates = input.resolution?.decisions.filter((item) => item.decision === "create" && item.ready) ?? [];
    const identitiesAllowCreate = (input.identities ?? []).some((item) => item.status === "create_new");
    const guardsValid = createOperations.length > 0 && createOperations.every((item) => Boolean(item.creationGuardFingerprint)) && resolvedCreates.length > 0 && resolvedCreates.every((item) => Boolean(item.creationGuardFingerprint)) && identitiesAllowCreate;
    if (!guardsValid) { blocked = true; reasons.push(reason("creation_guard_missing", "La creación no acredita guard, discovery y create_new.", "resolution")); blockers.push(blocker("creation_guard_missing", "critical", "Creation Guard es necesario pero nunca suficiente por sí solo.")); }
    else { supervised = true; reasons.push(reason("creation_guard_valid", "AU6 acredita Creation Guard y create_new.", "resolution")); }
  }

  const transactionReconciliation = Boolean(input.transactionView?.reconciliationRequired.length || input.transactionView?.incidents.some((item) => item.kind === "effect_uncertain"));
  const unresolvedReconciliation = (input.reconciliation ?? []).filter((item) => !["confirmed_succeeded", "confirmed_not_applied", "already_reconciled"].includes(item.status));
  if (transactionReconciliation || unresolvedReconciliation.length || input.compensation?.reconciliationStepIds.length) { blocked = true; reasons.push(reason("reconciliation_required", "Existe reconciliación pendiente o efecto incierto.", "reconciliation")); blockers.push(blocker("reconciliation_required", "critical", "No se continúa automáticamente con reconciliación pendiente.")); }
  else if (input.reconciliation?.length) reasons.push(reason("reconciliation_resolved", "Las reconciliaciones aportadas están resueltas.", "reconciliation"));

  if (input.compensation?.manualStepIds.length) { humanReasons.push("manual_compensation"); reasons.push(reason("manual_compensation", "AU7 clasifica la compensación como manual.", "compensation")); blockers.push(blocker("manual_compensation", "critical", "La compensación manual nunca obtiene autonomía.")); }
  if (input.compensation?.executableStepIds.length) { authorization = true; supervised = true; reasons.push(reason("safe_compensation_requires_authorization", "Existe compensador seguro, pero requiere autorización explícita.", "compensation")); }
  const compensationPending = Boolean(input.compensation || input.transactionView?.compensationRequired.length || input.decision.decision === "request_compensation");
  if (compensationPending && values.some((item) => item.ownership === "unknown")) { humanReasons.push("unknown_ownership"); reasons.push(reason("unknown_ownership", "El ownership del efecto no está resuelto.", "compensation")); blockers.push(blocker("unknown_ownership", "critical", "No se compensa automáticamente con ownership desconocido.")); }

  if (input.transactionView?.incidents.some((item) => item.kind === "manual_intervention_required" || item.severity === "critical")) { humanReasons.push("policy_conflict"); blockers.push(blocker("policy_conflict", "critical", "AU7 informa una incidencia crítica o manual.")); }
  if (input.decision.decision === "block" || input.decision.decision === "wait_for_evidence" || input.decision.decision === "request_reconciliation") { blocked = true; reasons.push(reason("decision_non_executable", "La decisión B1 no permite avance autónomo.", "decision")); }
  if (input.decision.decision === "escalate_to_human") humanReasons.push("policy_conflict");
  if (input.decision.decision === "request_authorization") authorization = true;
  if (input.decision.decision === "request_compensation" && !input.compensation?.executableStepIds.length && !input.compensation?.manualStepIds.length) { blocked = true; reasons.push(reason("manual_compensation", "No existe una policy de compensación segura resuelta.", "compensation")); blockers.push(blocker("manual_compensation", "blocking", "Compensación desconocida: fail-closed.")); }

  let level: AutonomyLevel;
  if (blocked) level = "blocked";
  else if (humanReasons.length) level = "human_required";
  else if (authorization) level = "authorization_required";
  else if (supervised || risk.aggregate === "medium") level = "autonomous_supervised";
  else level = "autonomous_safe";

  const requiredAuthorization = level === "authorization_required" ? authorizationRequirement(input, values) : undefined;
  const humanReview = level === "human_required" ? humanRequirement(humanReasons) : undefined;
  const structuralSafe = !staleReasonCodes.length && input.sufficiency.classification === "sufficient" && !input.sufficiency.contradictionCodes?.length;
  const canPreparePlan = level !== "blocked" && structuralSafe;
  const canPrepareTransaction = canPreparePlan && values.length > 0;
  const semantic = {
    schemaVersion: AUTONOMY_RISK_POLICY_VERSION,
    level,
    decisionKind: input.decision.decision,
    decisionFingerprint: input.decision.decisionFingerprint,
    sufficiencyFingerprint: input.sufficiency.evaluationFingerprint,
    capabilities: unique(values.map((item) => item.capability)),
    entityType: input.decision.subjectEntityType,
    risk,
    reasons: freeze([...new Map(reasons.map((item) => [`${item.code}:${item.source}:${item.summary}`, item])).values()].sort((left, right) => `${left.code}:${left.source}`.localeCompare(`${right.code}:${right.source}`))),
    blockers: freeze([...new Map(blockers.map((item) => [`${item.code}:${item.summary}`, item])).values()].sort((left, right) => left.code.localeCompare(right.code))),
    requiredAuthorization,
    humanReview,
    canPreparePlan,
    canPrepareTransaction,
    canExecuteAutonomously: level === "autonomous_safe",
    canContinueAfterStep: level === "autonomous_safe",
    stale: staleReasonCodes.length > 0,
    staleReasonCodes,
    executionAllowed: false as const,
    writes: false as const,
  };
  return Object.freeze({...semantic, policyFingerprint: fp(semantic)});
}
