import type {ContentTypeId} from "../../../types";
import {buildEntityOperation, type EntityOperationKind, type OperationCondition, type OperationEvidence, type OperationRisk} from "../../entityOperations";
import type {UniversalEntityType} from "../../entityIdentity";
import {buildResolutionGraph, topologicalSortResolutionGraph} from "../../resolutionGraph";
import type {ReviewJsonValue} from "../../types";
import {computeUniversalFingerprint} from "../../universal";
import type {AutonomousEditorialDecisionKind} from "../types";
import type {
  AggregatedAutonomyRisk,
  AutonomyLevel,
} from "../autonomy";
import {
  AUTONOMOUS_RESOLUTION_STRATEGY_VERSION,
  type AutonomousResolutionStrategy,
  type AutonomousResolutionStrategyInput,
  type AutonomousResolutionStrategyPrecondition,
  type AutonomousResolutionStrategyStatus,
  type AutonomousResolutionStrategyStep,
  type AutonomousResolutionStrategyStepKind,
} from "./types";

type DraftStep = {
  key: string;
  kind: AutonomousResolutionStrategyStepKind;
  objective: string;
  dependencyKeys: string[];
  rationaleCodes: string[];
  evidenceIds: string[];
  preconditions: AutonomousResolutionStrategyPrecondition[];
  risk: AggregatedAutonomyRisk;
  autonomy: AutonomyLevel;
  entityType?: UniversalEntityType;
  capability?: string;
};

const schemaToUniversal: Readonly<Record<ContentTypeId, UniversalEntityType>> = Object.freeze({
  noticia: "news",
  evento: "event",
  luchador: "fighter",
  combate: "fight",
  categoriaPeso: "weight_category",
  disciplina: "discipline",
  organizacion: "organization",
});

const universalToSchema: Readonly<Record<UniversalEntityType, ContentTypeId>> = Object.freeze({
  fighter: "luchador",
  event: "evento",
  organization: "organizacion",
  discipline: "disciplina",
  weight_category: "categoriaPeso",
  fight: "combate",
  news: "noticia",
  result: "noticia",
});

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const sorted = (values: readonly string[]): string[] => unique(values.filter(Boolean)).sort();
const fingerprint = (value: unknown): string => computeUniversalFingerprint(value as ReviewJsonValue);

function condition(code: string, description: string, satisfied: boolean): AutonomousResolutionStrategyPrecondition {
  return Object.freeze({code, description, satisfied});
}

function operationKind(kind: AutonomousResolutionStrategyStepKind): EntityOperationKind {
  if (["investigate", "inspect_sanity", "inspect_source", "search_candidates", "compare_entities"].includes(kind)) return "find_entity";
  if (kind === "reuse_entity") return "reuse_entity";
  if (kind === "create_entity") return "create_entity";
  if (kind === "repair_reference") return "replace_reference";
  if (kind === "validate") return "validate_entity";
  return "set_metadata";
}

function operationRisk(risk: AggregatedAutonomyRisk): OperationRisk {
  if (risk === "unknown" || risk === "destructive") return "critical";
  return risk;
}

function autonomyRisk(risk: OperationRisk): AggregatedAutonomyRisk {
  if (risk === "critical") return "destructive";
  if (risk === "none") return "low";
  return risk;
}

function evidenceIds(input: AutonomousResolutionStrategyInput): string[] {
  return sorted([
    ...input.decision.evidence.map((item) => item.id),
    ...(input.inspection ?? []).map((item) => `inspection:${item.fingerprint.slice(-16)}`),
    ...(input.identities ?? []).map((item) => `identity:${item.resolutionFingerprint.slice(-16)}`),
    ...(input.resolution ? [`resolution:${input.resolution.decisionFingerprint.slice(-16)}`] : []),
    ...(input.checkpoint ? [`checkpoint:${input.checkpoint.checkpointFingerprint.slice(-16)}`] : []),
    ...(input.transaction ? [`transaction:${input.transaction.transactionFingerprint.slice(-16)}`] : []),
    ...(input.transactionView ? [`transaction-view:${input.transactionView.transactionFingerprint.slice(-16)}`] : []),
    ...(input.reconciliation ?? []).map((item) => `reconciliation:${item.assessmentFingerprint.slice(-16)}`),
  ]);
}

function stepId(draft: DraftStep): string {
  return `autonomous-strategy:${draft.kind}:${fingerprint({version: AUTONOMOUS_RESOLUTION_STRATEGY_VERSION, key: draft.key, kind: draft.kind, entityType: draft.entityType, capability: draft.capability}).slice(-16)}`;
}

function safeEvidence(ids: readonly string[]): OperationEvidence[] {
  return sorted(ids).map((id) => ({id, kind: "strategy_evidence", source: "autonomous_resolution_strategy", confidence: 1, limitations: ["safe_projection_only"]}));
}

function graphCondition(item: AutonomousResolutionStrategyPrecondition, stepIdValue: string): OperationCondition {
  return {id: `${stepIdValue}:precondition:${item.code}`, kind: "custom", description: item.description, required: !item.satisfied};
}

function finalise(input: AutonomousResolutionStrategyInput, drafts: readonly DraftStep[], status: AutonomousResolutionStrategyStatus, blockers: readonly string[]): AutonomousResolutionStrategy {
  const keys = new Set(drafts.map((item) => item.key));
  if (keys.size !== drafts.length) throw new Error("duplicate_autonomous_strategy_step_key");
  const ids = new Map(drafts.map((item) => [item.key, stepId(item)]));
  const steps = drafts.map((draft): AutonomousResolutionStrategyStep => {
    const dependencyIds = sorted(draft.dependencyKeys.map((key) => {
      const id = ids.get(key);
      if (!id) throw new Error(`missing_autonomous_strategy_dependency:${key}`);
      return id;
    }));
    const semantic = {
      version: AUTONOMOUS_RESOLUTION_STRATEGY_VERSION,
      id: ids.get(draft.key)!,
      kind: draft.kind,
      objective: draft.objective,
      dependencyIds,
      rationaleCodes: sorted(draft.rationaleCodes),
      evidenceIds: sorted(draft.evidenceIds),
      preconditions: [...draft.preconditions].sort((left, right) => left.code.localeCompare(right.code)),
      risk: draft.risk,
      autonomy: draft.autonomy,
      entityType: draft.entityType,
      capability: draft.capability,
    };
    return Object.freeze({...semantic, fingerprint: fingerprint(semantic)});
  });
  const byId = new Map(steps.map((item) => [item.id, item]));
  const graph = buildResolutionGraph({
    caseId: input.caseId,
    caseVersion: input.caseVersion,
    producerId: input.producerId,
    originalOperation: input.originalOperation,
    now: () => input.generatedAt,
    metadata: {planner: "au2_resolution_graph", projection: "au8_autonomous_resolution_strategy", strategyVersion: AUTONOMOUS_RESOLUTION_STRATEGY_VERSION},
    nodes: steps.map((step) => ({
      id: step.id,
      operation: buildEntityOperation({
        id: step.id,
        kind: operationKind(step.kind),
        entityType: universalToSchema[step.entityType ?? input.decision.subjectEntityType ?? "news"],
        source: "editorial_decision",
        evidence: safeEvidence([...step.evidenceIds, `strategy-step:${step.fingerprint.slice(-16)}`]),
        confidence: step.evidenceIds.length ? 1 : 0,
        risk: operationRisk(step.risk),
        preconditions: step.preconditions.map((item) => graphCondition(item, step.id)),
        postconditions: [],
        dependencyIds: [...step.dependencyIds],
        requiredCapability: step.capability,
        compensatable: false,
        explanation: step.objective,
      }),
      state: "pending",
      requiredForCompletion: true,
    })),
  });
  const topology = topologicalSortResolutionGraph(graph);
  if (!topology.valid) throw new Error(`invalid_autonomous_strategy_graph:${topology.errors.map((item) => item.code).join(",")}`);
  const orderedSteps = topology.nodeIds.map((id) => byId.get(id)!);
  const semantic = {
    schemaVersion: AUTONOMOUS_RESOLUTION_STRATEGY_VERSION,
    caseId: input.caseId,
    caseVersion: input.caseVersion,
    status,
    decisionFingerprint: input.decision.decisionFingerprint,
    sufficiencyFingerprint: input.sufficiency.evaluationFingerprint,
    autonomyFingerprint: input.autonomy.policyFingerprint,
    checkpointFingerprint: input.checkpoint?.checkpointFingerprint,
    sourceGraphFingerprint: input.resolution?.plan.graph.fingerprint ?? input.checkpoint?.graphFingerprint,
    graphFingerprint: graph.fingerprint,
    orderedSteps,
    layers: topology.layers,
    blockers: sorted(blockers),
    executionAllowed: false as const,
    launchesTransactions: false as const,
    writes: false as const,
  };
  return Object.freeze({
    schemaVersion: AUTONOMOUS_RESOLUTION_STRATEGY_VERSION,
    caseId: input.caseId,
    caseVersion: input.caseVersion,
    status,
    decisionFingerprint: input.decision.decisionFingerprint,
    sufficiencyFingerprint: input.sufficiency.evaluationFingerprint,
    autonomyFingerprint: input.autonomy.policyFingerprint,
    checkpointFingerprint: input.checkpoint?.checkpointFingerprint,
    sourceGraphFingerprint: semantic.sourceGraphFingerprint,
    graph,
    steps: Object.freeze(orderedSteps),
    orderedStepIds: Object.freeze([...topology.nodeIds]),
    layers: Object.freeze(topology.layers.map((layer) => Object.freeze([...layer]))),
    blockers: Object.freeze(sorted(blockers)),
    strategyFingerprint: fingerprint(semantic),
    executionAllowed: false,
    launchesTransactions: false,
    writes: false,
  });
}

function draft(input: AutonomousResolutionStrategyInput, value: Omit<DraftStep, "autonomy" | "risk" | "evidenceIds" | "dependencyKeys" | "rationaleCodes" | "preconditions"> & Partial<Pick<DraftStep, "risk" | "evidenceIds" | "dependencyKeys" | "rationaleCodes" | "preconditions">>): DraftStep {
  return {
    ...value,
    autonomy: input.autonomy.level,
    risk: value.risk ?? input.autonomy.risk.aggregate,
    evidenceIds: sorted(value.evidenceIds ?? evidenceIds(input)),
    dependencyKeys: sorted(value.dependencyKeys ?? []),
    rationaleCodes: sorted(value.rationaleCodes ?? []),
    preconditions: [...(value.preconditions ?? [])].sort((left, right) => left.code.localeCompare(right.code)),
  };
}

function contextBlockers(input: AutonomousResolutionStrategyInput): string[] {
  const blockers: string[] = [];
  if (input.decision.caseId !== input.caseId || input.decision.caseVersion !== input.caseVersion) blockers.push("decision_context_mismatch");
  if (input.autonomy.decisionFingerprint !== input.decision.decisionFingerprint) blockers.push("autonomy_decision_fingerprint_mismatch");
  if (input.autonomy.sufficiencyFingerprint !== input.sufficiency.evaluationFingerprint) blockers.push("autonomy_sufficiency_fingerprint_mismatch");
  if (input.decision.evidenceSufficiencyFingerprint !== input.sufficiency.evaluationFingerprint) blockers.push("decision_sufficiency_fingerprint_mismatch");
  if (input.checkpoint && (input.checkpoint.caseId !== input.caseId || input.checkpoint.caseVersion !== input.caseVersion)) blockers.push("checkpoint_context_mismatch");
  if (input.resolution && (input.resolution.plan.caseId !== input.caseId || input.resolution.plan.caseVersion !== input.caseVersion)) blockers.push("resolution_context_mismatch");
  return sorted(blockers);
}

function terminal(input: AutonomousResolutionStrategyInput, kind: "request_human" | "stop", key: string, deps: readonly string[], codes: readonly string[]): DraftStep {
  return draft(input, {
    key,
    kind,
    objective: kind === "request_human" ? "Solicitar criterio humano explícito sin continuar el caso." : "Detener la estrategia sin ejecutar efectos.",
    dependencyKeys: [...deps],
    rationaleCodes: [...codes],
    preconditions: kind === "request_human" ? [condition("human_review_completed", "Una persona debe resolver el bloqueo antes de regenerar.", false)] : [],
    risk: kind === "request_human" ? "high" : input.autonomy.risk.aggregate,
  });
}

function investigation(input: AutonomousResolutionStrategyInput, reasonCodes: readonly string[]): AutonomousResolutionStrategy {
  const steps: DraftStep[] = [];
  steps.push(draft(input, {key: "investigate", kind: "investigate", objective: "Delimitar la evidencia ausente, ambigua u obsoleta antes de decidir.", rationaleCodes: [...reasonCodes], risk: "low"}));
  const unavailable = ["unavailable", "insufficient", "partial", "stale"].includes(input.sufficiency.classification);
  const ambiguous = (input.identities ?? []).some((item) => ["ambiguous", "probable_match", "insufficient_evidence"].includes(item.status)) || input.decision.foundations.some((item) => item.code.includes("ambiguous"));
  const leaves: string[] = [];
  if (unavailable) {
    steps.push(draft(input, {key: "inspect-sanity", kind: "inspect_sanity", objective: "Recomendar una inspección AU4 del estado canónico, sin ejecutarla.", dependencyKeys: ["investigate"], rationaleCodes: [input.sufficiency.classification === "stale" ? "refresh_stale_sanity_evidence" : "inspect_canonical_state"], risk: "low"}));
    steps.push(draft(input, {key: "inspect-source", kind: "inspect_source", objective: "Recomendar la comprobación de la fuente editorial independiente, sin acceder a ella.", dependencyKeys: ["investigate"], rationaleCodes: ["corroborate_source_evidence"], risk: "low"}));
    leaves.push("inspect-sanity", "inspect-source");
  }
  if (ambiguous || input.decision.decision === "investigate") {
    steps.push(draft(input, {key: "search-candidates", kind: "search_candidates", objective: "Buscar candidatos de identidad mediante AU5, sin iniciar la búsqueda.", dependencyKeys: ["investigate"], rationaleCodes: ["identity_candidates_required"], risk: "low"}));
    steps.push(draft(input, {key: "compare-entities", kind: "compare_entities", objective: "Comparar candidatos con evidencia discriminante antes de reuse o create.", dependencyKeys: ["search-candidates", ...leaves], rationaleCodes: ["identity_must_be_resolved"], preconditions: [condition("candidate_evidence_available", "La búsqueda debe aportar candidatos y evidencia comparable.", false)], risk: "low"}));
    leaves.push("compare-entities");
  }
  if (!leaves.length) leaves.push("investigate");
  steps.push(terminal(input, "stop", "stop-after-investigation", leaves, ["regenerate_after_evidence_changes"]));
  return finalise(input, steps, "investigation_required", ["evidence_not_ready_for_final_strategy"]);
}

function strategyKind(kind: EntityOperationKind): AutonomousResolutionStrategyStepKind | undefined {
  if (kind === "find_entity") return "search_candidates";
  if (kind === "reuse_entity") return "reuse_entity";
  if (kind === "create_entity") return "create_entity";
  if (["replace_reference", "remove_reference", "repair_relationship"].includes(kind)) return "repair_reference";
  if (["validate_entity", "set_metadata"].includes(kind)) return "validate";
  return undefined;
}

function operational(input: AutonomousResolutionStrategyInput): AutonomousResolutionStrategy {
  const steps: DraftStep[] = [];
  const sourceKeyByOperation = new Map<string, string>();
  const sourceOperations = input.resolution?.plan.operations ?? [];
  const unguardedCreates = sourceOperations.filter((operation) => operation.kind === "create_entity" && !input.resolution?.decisions.some((item) => item.decision === "create" && item.ready && Boolean(item.creationGuardFingerprint) && item.operationIds.includes(operation.id)));
  if (unguardedCreates.length) {
    const codes = unguardedCreates.map((item) => `creation_guard_missing:${item.id}`).sort();
    return finalise(input, [terminal(input, "stop", "stop-creation-guard", [], codes)], "blocked", codes);
  }
  for (const operation of sourceOperations) {
    const kind = strategyKind(operation.kind);
    if (!kind) continue;
    if (kind === "validate" || (operation.payload && typeof operation.payload === "object" && !Array.isArray(operation.payload) && operation.payload.scope === "resume")) continue;
    const key = `source:${operation.id}`;
    sourceKeyByOperation.set(operation.id, key);
    steps.push(draft(input, {
      key,
      kind,
      objective: kind === "search_candidates" ? "Resolver candidatos de identidad mediante AU5 antes de continuar." : kind === "reuse_entity" ? "Reutilizar la identidad canónica resuelta y evitar duplicados." : kind === "create_entity" ? "Preparar la creación protegida por el Creation Guard AU6." : "Preparar la reparación de la referencia confirmada.",
      entityType: schemaToUniversal[operation.entityType],
      capability: operation.requiredCapability,
      rationaleCodes: [`au6_${operation.kind}`],
      evidenceIds: operation.evidence.map((item) => item.id),
      risk: autonomyRisk(operation.risk),
      preconditions: kind === "create_entity" ? [condition("creation_guard_valid", "AU6 debe mantener vigente el Creation Guard de esta creación.", true)] : [],
    }));
  }
  for (const operation of sourceOperations) {
    const key = sourceKeyByOperation.get(operation.id);
    if (!key) continue;
    const item = steps.find((candidate) => candidate.key === key)!;
    item.dependencyKeys = sorted(operation.dependencyIds.flatMap((id) => sourceKeyByOperation.get(id) ?? []));
  }

  const subject = input.decision.subjectEntityType ?? "news";
  if (!steps.length) {
    const kindByDecision: Partial<Record<AutonomousEditorialDecisionKind, AutonomousResolutionStrategyStepKind>> = {
      reuse_existing: "reuse_entity",
      create_entity: "create_entity",
      repair_reference: "repair_reference",
    };
    const kind = kindByDecision[input.decision.decision];
    if (kind) steps.push(draft(input, {key: `decision:${kind}`, kind, objective: kind === "reuse_entity" ? "Reutilizar la entidad canónica resuelta." : kind === "create_entity" ? "Preparar la creación autorizada por AU6." : "Preparar la reparación de la referencia confirmada.", entityType: subject, rationaleCodes: [`decision_${input.decision.decision}`], preconditions: kind === "create_entity" ? [condition("creation_guard_valid", "Debe existir un Creation Guard AU6 válido.", input.decision.preconditions.some((item) => item.code === "creation_guard_valid" && item.satisfied))] : []}));
  }

  for (const create of steps.filter((item) => item.kind === "create_entity")) {
    const searches = create.dependencyKeys.filter((key) => steps.some((item) => item.key === key && item.kind === "search_candidates"));
    const searchKey = searches[0] ?? `identity-search:${create.key}`;
    if (!searches.length) steps.push(draft(input, {key: searchKey, kind: "search_candidates", objective: `Confirmar que no existe una entidad ${create.entityType ?? "equivalente"} reutilizable.`, entityType: create.entityType, dependencyKeys: [...create.dependencyKeys], rationaleCodes: ["reuse_before_create"], risk: "low"}));
    const compareKey = `identity-compare:${create.key}`;
    steps.push(draft(input, {key: compareKey, kind: "compare_entities", objective: "Resolver identidad y descartar duplicados antes de permitir create.", entityType: create.entityType, dependencyKeys: [searchKey], rationaleCodes: ["identity_resolution_before_create", "reuse_before_create"], preconditions: [condition("identity_resolved", "AU5/AU6 deben concluir create_new sin ambigüedad.", true)], risk: "low"}));
    create.dependencyKeys = sorted([...create.dependencyKeys.filter((key) => key !== searchKey), compareKey]);
  }

  const coreKeys = steps.map((item) => item.key);
  steps.push(draft(input, {key: "final-reference-validation", kind: "validate", objective: "Validar todas las referencias y precondiciones antes de preparar AU7.", dependencyKeys: coreKeys, rationaleCodes: ["references_validated_before_transaction"], preconditions: [condition("no_unresolved_reference", "No puede quedar ninguna referencia pendiente o ambigua.", true)], risk: "low", capability: "validate:resolution_strategy"}));
  steps.push(draft(input, {key: "prepare-transaction", kind: "prepare_transaction", objective: "Preparar una proyección transaccional AU7 sin lanzarla ni ejecutarla.", dependencyKeys: ["final-reference-validation"], rationaleCodes: ["validation_precedes_transaction"], preconditions: [condition("references_validated", "La validación final debe completarse antes de preparar la transacción.", true)], capability: "prepare:universal_transaction", risk: input.autonomy.risk.aggregate}));

  let status: AutonomousResolutionStrategyStatus = "ready";
  const blockers: string[] = [];
  if (input.autonomy.level === "authorization_required" || input.decision.decision === "request_authorization") {
    steps.push(draft(input, {key: "wait-authorization", kind: "wait_authorization", objective: "Esperar una autorización explícita, vigente y vinculada a fingerprints.", dependencyKeys: ["prepare-transaction"], rationaleCodes: ["authorization_required"], preconditions: [condition("authorization_present", "La autorización aún no ha sido aportada.", false)], risk: input.autonomy.risk.aggregate}));
    steps.push(terminal(input, "stop", "stop-after-authorization", ["wait-authorization"], ["no_execution_without_authorization"]));
    status = "authorization_required";
    blockers.push("authorization_required_before_continuation");
  }
  return finalise(input, steps, status, blockers);
}

/** Motor puro B4. Ordena intenciones mediante el Resolution Graph AU2 y nunca ejecuta sus pasos. */
export function buildAutonomousResolutionStrategy(input: AutonomousResolutionStrategyInput): AutonomousResolutionStrategy {
  const contextIssues = contextBlockers(input);
  if (contextIssues.length) {
    const human = terminal(input, "request_human", "request-human-context", [], contextIssues);
    return finalise(input, [human, terminal(input, "stop", "stop-context", [human.key], contextIssues)], "blocked", contextIssues);
  }
  const contradictionCodes = sorted([
    ...(input.sufficiency.classification === "contradictory" ? ["contradictory_evidence"] : []),
    ...(input.sufficiency.contradictionCodes ?? []),
    ...input.decision.blockingReasons.filter((item) => item.code.includes("conflict") || item.code.includes("contradict")).map((item) => item.code),
    ...(input.identities ?? []).filter((item) => item.status === "conflicting_identity").flatMap((item) => item.reasonCodes),
  ]);
  if (contradictionCodes.length) {
    const human = terminal(input, "request_human", "request-human-contradiction", [], contradictionCodes);
    return finalise(input, [human, terminal(input, "stop", "stop-contradiction", [human.key], contradictionCodes)], "blocked", contradictionCodes);
  }
  const reconciliationPending = input.decision.decision === "request_reconciliation"
    || Boolean(input.transactionView?.reconciliationRequired.length)
    || Boolean(input.transactionView?.incidents.some((item) => item.kind === "effect_uncertain"))
    || Boolean(input.reconciliation?.some((item) => item.status !== "already_reconciled"));
  if (reconciliationPending) {
    const wait = draft(input, {key: "wait-reconciliation", kind: "wait_reconciliation", objective: "Esperar la reconciliación AU4 antes de decidir continuidad, retry o compensación.", rationaleCodes: ["reconciliation_required"], preconditions: [condition("reconciliation_resolved", "AU4 debe confirmar y aplicar el resultado de reconciliación.", false)], risk: "high"});
    return finalise(input, [wait, terminal(input, "stop", "stop-reconciliation", [wait.key], ["effect_state_uncertain"])], "reconciliation_required", ["reconciliation_required_before_continuation"]);
  }
  const evidenceNotReady = input.sufficiency.classification !== "sufficient" || !input.sufficiency.canDecideNow || ["investigate", "wait_for_evidence"].includes(input.decision.decision);
  if (evidenceNotReady) return investigation(input, [`sufficiency_${input.sufficiency.classification}`, `decision_${input.decision.decision}`]);
  if (input.autonomy.level === "human_required" || input.decision.decision === "escalate_to_human" || input.decision.decision === "request_compensation") {
    const human = terminal(input, "request_human", "request-human-policy", [], ["human_review_required", `decision_${input.decision.decision}`]);
    return finalise(input, [human, terminal(input, "stop", "stop-human", [human.key], ["human_review_required"])], "human_required", ["human_review_required_before_continuation"]);
  }
  if (input.autonomy.level === "blocked" || input.decision.decision === "block" || !input.autonomy.canPreparePlan) {
    return finalise(input, [terminal(input, "stop", "stop-policy", [], ["autonomy_policy_blocked"])], "blocked", sorted(["autonomy_policy_blocked", ...input.autonomy.blockers.map((item) => item.code)]));
  }
  return operational(input);
}
