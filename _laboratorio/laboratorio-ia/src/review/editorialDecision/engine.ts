import type {EntityResolutionResult, UniversalEntityType} from "../entityIdentity";
import type {GlobalResolutionObservation} from "../globalResolution/inspection/types";
import type {TransversalResolutionDecision, TransversalResolutionPlan} from "../globalResolution/transversalPlanning";
import type {ReviewJsonValue} from "../types";
import type {SafeTransactionStepDescriptor, TransactionOperationalView} from "../transactions/orchestrator";
import {computeUniversalFingerprint} from "../universal";
import {projectAutonomousEditorialEvidence} from "./evidenceProjection";
import {evaluateEditorialEvidenceSufficiency, type EditorialEvidenceSufficiencyEvaluation} from "./evidenceSufficiency";
import {
  AUTONOMOUS_EDITORIAL_DECISION_ENGINE_VERSION,
  type AutonomousEditorialBlocker,
  type AutonomousEditorialDecision,
  type AutonomousEditorialDecisionInput,
  type AutonomousEditorialDecisionKind,
  type AutonomousEditorialEvidence,
  type AutonomousEditorialEvidenceSource,
  type AutonomousEditorialFoundation,
  type AutonomousEditorialPrecondition,
  type AutonomousEditorialRisk,
} from "./types";

type Selection = Readonly<{
  decision: AutonomousEditorialDecisionKind;
  reasonCode: string;
  explanation: string;
  subjectEntityType?: UniversalEntityType;
  relevantEvidence?: readonly AutonomousEditorialEvidence[];
  blockers?: readonly AutonomousEditorialBlocker[];
  preconditions?: readonly AutonomousEditorialPrecondition[];
  risk?: AutonomousEditorialRisk;
}>;

const priority: Readonly<Record<TransversalResolutionDecision["decision"], number>> = Object.freeze({
  blocked: 0,
  investigate: 1,
  repair_reference: 2,
  reuse: 3,
  create: 4,
  validate: 5,
  resume: 6,
});

const freeze = <T>(values: readonly T[]): readonly T[] => Object.freeze([...values]);
const unique = (values: readonly string[]): readonly string[] => freeze([...new Set(values)].sort());
const fingerprint = (value: unknown): string => computeUniversalFingerprint(value as ReviewJsonValue);
const byEvidenceId = (left: AutonomousEditorialEvidence, right: AutonomousEditorialEvidence): number => left.id.localeCompare(right.id);

function evidenceForSource(evidence: readonly AutonomousEditorialEvidence[], source: AutonomousEditorialEvidenceSource): readonly AutonomousEditorialEvidence[] {
  return evidence.filter((item) => item.source === source);
}

function sourceIds(evidence: readonly AutonomousEditorialEvidence[], source: AutonomousEditorialEvidenceSource): readonly string[] {
  return unique(evidenceForSource(evidence, source).map((item) => item.id));
}

function observationExists(input: AutonomousEditorialDecisionInput, kind: GlobalResolutionObservation["kind"]): boolean {
  return (input.inspection ?? []).some((item) => item.observations.some((observation) => observation.kind === kind));
}

function blocker(code: string, severity: AutonomousEditorialBlocker["severity"], summary: string, evidenceIds: readonly string[]): AutonomousEditorialBlocker {
  return Object.freeze({code, severity, summary, evidenceIds: unique(evidenceIds)});
}

function precondition(code: string, description: string, satisfied: boolean, evidenceIds: readonly string[]): AutonomousEditorialPrecondition {
  return Object.freeze({code, description, satisfied, evidenceIds: unique(evidenceIds)});
}

function conflictingReuseTargets(identities: readonly EntityResolutionResult[]): readonly UniversalEntityType[] {
  const byType = new Map<UniversalEntityType, Set<string>>();
  for (const identity of identities) {
    if (identity.status !== "reuse" || !identity.candidateId) continue;
    const targets = byType.get(identity.entityType) ?? new Set<string>();
    targets.add(identity.candidateId);
    byType.set(identity.entityType, targets);
  }
  return freeze([...byType.entries()].filter(([, targets]) => targets.size > 1).map(([entityType]) => entityType).sort());
}

function relevantPlanDecision(plan: TransversalResolutionPlan): TransversalResolutionDecision | undefined {
  return [...plan.decisions]
    .filter((decision) => decision.ready)
    .sort((left, right) => priority[left.decision] - priority[right.decision] || left.requirementId.localeCompare(right.requirementId))[0];
}

function readyStep(view: TransactionOperationalView): SafeTransactionStepDescriptor | undefined {
  return [...view.nextReadySteps].sort((left, right) => left.stepId.localeCompare(right.stepId))[0];
}

function inferStepDecision(step: SafeTransactionStepDescriptor): AutonomousEditorialDecisionKind {
  const semantic = `${step.capability} ${step.operationId}`.toLowerCase();
  if (semantic.includes("repair") || semantic.includes("replace_reference")) return "repair_reference";
  if (semantic.includes("reuse")) return "reuse_existing";
  if (semantic.includes("create")) return "create_entity";
  if (semantic.includes("validate")) return "validate";
  if (semantic.includes("resume")) return "resume";
  return "investigate";
}

function select(input: AutonomousEditorialDecisionInput, evidence: readonly AutonomousEditorialEvidence[]): Selection {
  const inspectionIds = sourceIds(evidence, "inspection");
  const identityIds = sourceIds(evidence, "identity");
  const resolutionIds = sourceIds(evidence, "resolution");
  const transactionIds = sourceIds(evidence, "transaction");
  const identities = input.identities ?? [];
  if (!input.case.caseId.trim() || !Number.isInteger(input.case.caseVersion) || input.case.caseVersion < 0) return {decision: "block", reasonCode: "invalid_case_context", explanation: "El contexto del caso no contiene una identidad y versión válidas.", blockers: [blocker("invalid_case_context", "critical", "No se puede vincular la decisión a un caso versionado.", [])], risk: "critical"};
  if (input.resolution && (input.resolution.plan.caseId !== input.case.caseId || input.resolution.plan.caseVersion !== input.case.caseVersion)) return {decision: "block", reasonCode: "stale_resolution_context", explanation: "El plan transversal pertenece a otro contexto o versión del caso y debe regenerarse.", blockers: [blocker("stale_resolution_context", "critical", "El plan AU6 no coincide con el caso actual.", resolutionIds)], risk: "critical"};
  const conflicts = conflictingReuseTargets(identities);
  const contradiction = identities.some((item) => item.status === "conflicting_identity") || observationExists(input, "payload_differs") || conflicts.length > 0;
  if (contradiction) {
    const reasons = [
      ...(identities.some((item) => item.status === "conflicting_identity") ? [blocker("identity_conflict", "critical", "Las señales de identidad se contradicen.", identityIds)] : []),
      ...(observationExists(input, "payload_differs") ? [blocker("payload_conflict", "critical", "La inspección contradice el estado esperado.", inspectionIds)] : []),
      ...(conflicts.length ? [blocker("multiple_resolved_identities", "critical", `Existen destinos incompatibles para: ${conflicts.join(", ")}.`, identityIds)] : []),
    ];
    return {decision: "block", reasonCode: "contradictory_evidence", explanation: "La evidencia disponible se contradice. El caso permanece bloqueado hasta resolver el conflicto.", blockers: reasons, risk: "critical"};
  }
  if (input.resolution && (input.resolution.plan.blockers.some((item) => item.severity === "blocking") || input.resolution.decisions.some((item) => item.decision === "blocked"))) {
    const codes = unique([...input.resolution.plan.blockers.map((item) => item.code), ...input.resolution.decisions.filter((item) => item.decision === "blocked").flatMap((item) => item.reasonCodes)]);
    return {decision: "block", reasonCode: "resolution_blocked", explanation: "El plan transversal autoritativo contiene bloqueos y no permite continuar.", blockers: [blocker("resolution_blocked", "blocking", `Bloqueos AU6: ${codes.join(", ") || "sin detalle seguro"}.`, resolutionIds)], risk: "high"};
  }
  const manual = input.transaction?.incidents.filter((item) => item.kind === "manual_intervention_required" || item.severity === "critical") ?? [];
  const riskyStep = input.transaction?.nextReadySteps.find((step) => step.risk === "high" || step.risk === "destructive");
  if (manual.length || riskyStep) return {decision: "escalate_to_human", reasonCode: manual.length ? "manual_intervention_required" : "high_risk_step", explanation: "El riesgo o la incidencia requiere criterio humano explícito antes de cualquier acción.", blockers: [blocker("human_decision_required", "critical", "No existe una continuación autónoma segura.", transactionIds)], risk: "critical"};
  if (input.transaction?.reconciliationRequired.length || input.transaction?.incidents.some((item) => item.kind === "effect_uncertain")) return {decision: "request_reconciliation", reasonCode: "transaction_reconciliation_required", explanation: "Existe un efecto incierto. Debe reconciliarse antes de decidir reintento, compensación o continuidad.", relevantEvidence: evidenceForSource(evidence, "transaction"), preconditions: [precondition("reconciliation_completed", "Confirmar el efecto mediante AU4.", false, transactionIds)], risk: "high"};
  if (input.transaction?.compensationRequired.length || input.transaction?.incidents.some((item) => item.kind === "compensation_required" || item.kind === "compensation_failed")) return {decision: "request_compensation", reasonCode: "transaction_compensation_required", explanation: "La transacción requiere una decisión explícita de compensación; AU8 no la ejecuta.", relevantEvidence: evidenceForSource(evidence, "transaction"), preconditions: [precondition("compensation_authorized", "Autorizar y supervisar la compensación en AU7.", false, transactionIds)], risk: "high"};
  if (input.transaction?.authorizationRequired.length || input.transaction?.incidents.some((item) => item.kind === "authorization_required")) return {decision: "request_authorization", reasonCode: "transaction_authorization_required", explanation: "El siguiente step está preparado, pero exige autorización explícita y vigente.", relevantEvidence: evidenceForSource(evidence, "transaction"), preconditions: [precondition("authorization_present", "Aportar autorización explícita vinculada al checkpoint.", false, transactionIds)], risk: "medium"};
  const ambiguous = (input.inspection ?? []).some((item) => item.status === "ambiguous") || observationExists(input, "multiple_candidates") || identities.some((item) => item.status === "ambiguous" || item.status === "probable_match");
  if (ambiguous) return {decision: "investigate", reasonCode: "ambiguous_evidence", explanation: "Hay varias interpretaciones plausibles. Se necesita evidencia discriminante antes de elegir una identidad.", relevantEvidence: evidence.filter((item) => item.source === "inspection" || item.source === "identity"), preconditions: [precondition("ambiguity_resolved", "Aportar evidencia que descarte candidatos alternativos.", false, unique([...inspectionIds, ...identityIds]))], risk: "medium"};
  const insufficient = (input.inspection ?? []).some((item) => item.status === "unavailable" || item.status === "unsupported" || item.observations.some((observation) => observation.kind === "service_unavailable")) || identities.some((item) => item.status === "insufficient_evidence" || item.status === "unsupported");
  if (insufficient || evidence.length === 0) return {decision: "wait_for_evidence", reasonCode: evidence.length ? "evidence_unavailable" : "evidence_absent", explanation: "No existe evidencia suficiente y verificable para recomendar una operación segura.", relevantEvidence: evidence, preconditions: [precondition("sufficient_evidence", "Recopilar evidencia verificable desde AU4 o AU5.", false, unique([...inspectionIds, ...identityIds]))], risk: "medium"};
  const planDecision = input.resolution ? relevantPlanDecision(input.resolution) : undefined;
  if (planDecision) {
    const mapping: Readonly<Record<Exclude<TransversalResolutionDecision["decision"], "blocked">, AutonomousEditorialDecisionKind>> = {investigate: "investigate", repair_reference: "repair_reference", reuse: "reuse_existing", create: "create_entity", validate: "validate", resume: "resume"};
    const decision = mapping[planDecision.decision as Exclude<TransversalResolutionDecision["decision"], "blocked">];
    if (decision === "create_entity" && (!planDecision.creationGuardFingerprint || !planDecision.evidenceFingerprints.length)) return {decision: "block", reasonCode: "creation_guard_incomplete", explanation: "La creación propuesta no acredita un Creation Guard válido y evidencia asociada.", subjectEntityType: planDecision.entityType, blockers: [blocker("creation_guard_incomplete", "critical", "Crear queda prohibido hasta renovar guard y evidencia.", resolutionIds)], risk: "critical"};
    return {decision, reasonCode: `resolution_${planDecision.decision}`, explanation: explanationFor(decision), subjectEntityType: planDecision.entityType, relevantEvidence: evidence, preconditions: [precondition("resolution_ready", "AU6 marca la decisión como preparada.", true, resolutionIds), ...(decision === "create_entity" ? [precondition("creation_guard_valid", "Creation Guard presente y respaldado por evidencia.", true, resolutionIds)] : [])], risk: riskFor(decision)};
  }
  if (input.transaction) {
    const step = readyStep(input.transaction);
    if (step) {
      const decision = inferStepDecision(step);
      if (decision === "create_entity") return {decision: "block", reasonCode: "creation_requires_resolution_guard", explanation: "Un step de creación no basta: falta una decisión AU6 lista con Creation Guard verificable.", blockers: [blocker("creation_guard_not_observed", "critical", "AU8 no autoriza crear desde el estado transaccional aislado.", transactionIds)], risk: "critical"};
      return {decision, reasonCode: `transaction_step_${decision}`, explanation: explanationFor(decision), relevantEvidence: evidenceForSource(evidence, "transaction"), preconditions: [precondition("transaction_step_ready", "AU7 marca el step como preparado.", true, transactionIds)], risk: riskFor(decision)};
    }
  }
  const reusable = [...identities].filter((item) => item.status === "reuse" && item.candidateId).sort((left, right) => left.entityType.localeCompare(right.entityType))[0];
  if (reusable) return {decision: "reuse_existing", reasonCode: "identity_reuse_resolved", explanation: explanationFor("reuse_existing"), subjectEntityType: reusable.entityType, relevantEvidence: evidenceForSource(evidence, "identity"), preconditions: [precondition("identity_resolved", "AU5 resolvió un candidato único.", true, identityIds)], risk: "low"};
  if (observationExists(input, "reference_missing")) return {decision: "repair_reference", reasonCode: "broken_reference_observed", explanation: explanationFor("repair_reference"), relevantEvidence: evidenceForSource(evidence, "inspection"), preconditions: [precondition("reference_break_confirmed", "AU4 confirmó la referencia rota.", true, inspectionIds)], risk: "medium"};
  if (identities.some((item) => item.status === "create_new")) return {decision: "wait_for_evidence", reasonCode: "creation_guard_missing", explanation: "AU5 no encontró identidad reutilizable, pero crear exige primero una resolución AU6 con Creation Guard válido.", relevantEvidence: evidenceForSource(evidence, "identity"), preconditions: [precondition("creation_guard_valid", "Construir y validar el Creation Guard mediante AU6.", false, identityIds)], risk: "medium"};
  return {decision: "validate", reasonCode: "evidence_requires_validation", explanation: explanationFor("validate"), relevantEvidence: evidence, preconditions: [precondition("evidence_available", "Existe evidencia segura que debe validarse editorialmente.", true, evidence.map((item) => item.id))], risk: "low"};
}

function explanationFor(decision: AutonomousEditorialDecisionKind): string {
  const explanations: Readonly<Record<AutonomousEditorialDecisionKind, string>> = {
    investigate: "Investigar la siguiente incógnita antes de decidir una operación editorial.",
    reuse_existing: "Reutilizar la entidad resuelta; no existe fundamento para crear un duplicado.",
    create_entity: "Crear la entidad propuesta únicamente a través del flujo autorizado de AU6 y AU7.",
    repair_reference: "Reparar la referencia confirmada manteniendo la identidad canónica.",
    validate: "Validar la evidencia y las postcondiciones antes de continuar.",
    resume: "Reanudar sólo el flujo ya validado y preparado por las capas anteriores.",
    wait_for_evidence: "Esperar evidencia verificable antes de emitir una recomendación operativa.",
    request_authorization: "Solicitar autorización explícita para el siguiente step.",
    request_reconciliation: "Abrir reconciliación para determinar el resultado real del efecto.",
    request_compensation: "Solicitar una compensación supervisada según la política transaccional.",
    block: "Bloquear el caso hasta resolver las contradicciones o precondiciones críticas.",
    escalate_to_human: "Escalar a una persona por riesgo alto o necesidad de criterio editorial.",
  };
  return explanations[decision];
}

function riskFor(decision: AutonomousEditorialDecisionKind): AutonomousEditorialRisk {
  if (["block", "escalate_to_human"].includes(decision)) return "critical";
  if (["request_reconciliation", "request_compensation"].includes(decision)) return "high";
  if (["create_entity", "repair_reference", "request_authorization", "investigate", "wait_for_evidence"].includes(decision)) return "medium";
  return "low";
}

function confidenceFor(evidence: readonly AutonomousEditorialEvidence[]): number {
  if (!evidence.length) return 0;
  const sources = new Set(evidence.map((item) => item.source)).size;
  const average = evidence.reduce((sum, item) => sum + (item.confidence ?? 0.5), 0) / evidence.length;
  const cap = sources === 1 ? 0.74 : sources === 2 ? 0.9 : 0.97;
  return Number(Math.min(cap, average).toFixed(3));
}

function applySufficiencyGate(selection: Selection, evaluation: EditorialEvidenceSufficiencyEvaluation): Selection {
  const finalDecisions = new Set<AutonomousEditorialDecisionKind>(["reuse_existing", "create_entity", "repair_reference", "validate", "resume"]);
  if (!finalDecisions.has(selection.decision) || evaluation.canDecideNow) return selection;
  const evidenceIds = evaluation.evidenceUsed.map((item) => item.id);
  if (evaluation.riskGate === "blocked") return {decision: "escalate_to_human", reasonCode: "sufficiency_risk_gate_blocked", explanation: "La evidencia puede ser útil, pero el riesgo impide una decisión final sin intervención humana.", subjectEntityType: selection.subjectEntityType, relevantEvidence: evaluation.evidenceUsed, blockers: [blocker("high_risk_decision", "critical", "El riesgo de la decisión supera el límite autónomo.", evidenceIds)], risk: "critical"};
  if (evaluation.classification === "contradictory") return {decision: "block", reasonCode: "sufficiency_contradictory", explanation: "La evaluación de suficiencia detectó evidencia contradictoria y prohíbe decidir.", subjectEntityType: selection.subjectEntityType, relevantEvidence: evaluation.evidenceUsed, blockers: [blocker("contradictory_evidence", "critical", evaluation.safeExplanation, evidenceIds)], risk: "critical"};
  if (evaluation.classification === "partial" || evaluation.classification === "stale") return {decision: "investigate", reasonCode: `sufficiency_${evaluation.classification}`, explanation: evaluation.safeExplanation, subjectEntityType: selection.subjectEntityType, relevantEvidence: evaluation.evidenceUsed, preconditions: [precondition("evidence_sufficient", "Completar la investigación recomendada por AU8 B2.", false, evidenceIds)], risk: "medium"};
  return {decision: "wait_for_evidence", reasonCode: `sufficiency_${evaluation.classification}`, explanation: evaluation.safeExplanation, subjectEntityType: selection.subjectEntityType, relevantEvidence: evaluation.evidenceUsed, preconditions: [precondition("evidence_sufficient", "Esperar o recopilar la evidencia ausente.", false, evidenceIds)], risk: "medium"};
}

export function decideAutonomousEditorialAction(input: AutonomousEditorialDecisionInput): AutonomousEditorialDecision {
  const evidence = projectAutonomousEditorialEvidence(input);
  const preliminarySelection = select(input, evidence);
  const sufficiency = evaluateEditorialEvidenceSufficiency({...input, decisionIntent: preliminarySelection.decision, decisionRisk: preliminarySelection.risk ?? riskFor(preliminarySelection.decision)});
  const selection = applySufficiencyGate(preliminarySelection, sufficiency);
  const relevantEvidence = freeze([...(selection.relevantEvidence ?? evidence)].sort(byEvidenceId));
  const evidenceIds = unique(relevantEvidence.map((item) => item.id));
  const foundations: readonly AutonomousEditorialFoundation[] = freeze([Object.freeze({code: selection.reasonCode, summary: selection.explanation, evidenceIds})]);
  const preconditions = freeze(selection.preconditions ?? []);
  const blockingReasons = freeze(selection.blockers ?? []);
  const inputSemantic = {
    engineVersion: AUTONOMOUS_EDITORIAL_DECISION_ENGINE_VERSION,
    case: input.case,
    evaluatedAt: input.evaluatedAt,
    inspectionFingerprints: unique((input.inspection ?? []).map((item) => item.fingerprint)),
    identityFingerprints: unique((input.identities ?? []).map((item) => item.resolutionFingerprint)),
    resolutionFingerprint: input.resolution?.decisionFingerprint,
    transactionFingerprint: input.transaction?.transactionFingerprint,
    evidenceSufficiencyFingerprint: sufficiency.evaluationFingerprint,
  };
  const inputFingerprint = fingerprint(inputSemantic);
  const semantic = {version: AUTONOMOUS_EDITORIAL_DECISION_ENGINE_VERSION, caseId: input.case.caseId, caseVersion: input.case.caseVersion, decision: selection.decision, subjectEntityType: selection.subjectEntityType, foundations, evidence: relevantEvidence, confidence: confidenceFor(relevantEvidence), risk: selection.risk ?? riskFor(selection.decision), preconditions, blockingReasons, operatorExplanation: selection.explanation, evidenceSufficiency: sufficiency.classification, evidenceSufficiencyFingerprint: sufficiency.evaluationFingerprint, canDecideNow: sufficiency.canDecideNow, inputFingerprint, executionAllowed: false as const, writes: false as const};
  return Object.freeze({...semantic, decisionFingerprint: fingerprint(semantic)});
}
