import {isSerializableReviewValue, validateReviewResolution} from "../cases/validateResolution";
import {buildEntityOperation, type EntityOperation, type EntityOperationEntityType, type EntityOperationKind, type OperationEvidence} from "../entityOperations";
import {computeUniversalFingerprint} from "../universal/fingerprints";
import type {ReviewIssue, ReviewJsonObject, ReviewJsonValue, ReviewResolution} from "../types";
import type {ReviewEffect} from "../universal/types";
import {riskRank} from "./planningPolicies";
import type {DerivedEntityOperationsResult, EffectDerivationContext, GlobalResolutionBlocker, GlobalResolutionPlanningEvidence, GlobalResolutionWarning, PlanningContext, PreparedEntityPlanningInput} from "./types";

const ENTITY_TYPES = new Set<EntityOperationEntityType>(["noticia", "evento", "luchador", "combate", "categoriaPeso", "disciplina", "organizacion"]);
const ENTITY_ALIASES: Readonly<Record<string, EntityOperationEntityType>> = Object.freeze({noticia: "noticia", news: "noticia", evento: "evento", event: "evento", luchador: "luchador", fighter: "luchador", combate: "combate", fight: "combate", categoriaPeso: "categoriaPeso", category: "categoriaPeso", disciplina: "disciplina", discipline: "disciplina", organizacion: "organizacion", organization: "organizacion"});
const riskOf = (kind: EntityOperationKind): EntityOperation["risk"] => kind === "merge_entities" ? "high" : kind === "create_entity" || kind === "replace_image" ? "medium" : "low";
const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const object = (value: ReviewJsonValue | undefined): ReviewJsonObject | undefined => value && typeof value === "object" && !Array.isArray(value) ? value : undefined;

function normalizeEntityType(value: unknown): EntityOperationEntityType | undefined {
  if (!text(value)) return undefined;
  if (ENTITY_TYPES.has(value as EntityOperationEntityType)) return value as EntityOperationEntityType;
  return ENTITY_ALIASES[value.trim()];
}

function evidenceForIssue(issue: ReviewIssue | undefined, supplied: readonly GlobalResolutionPlanningEvidence[]): OperationEvidence[] {
  const issueId = issue?.id ?? "unscoped";
  const explicit = supplied.filter((item) => !issue || item.issueId === issue.id).map(({issueId: _issueId, ...item}) => item);
  const candidates = (issue?.candidates ?? []).flatMap((candidate, index) => isSerializableReviewValue(candidate.value) ? [{id: `candidate:${issueId}:${candidate.id || index}`, kind: "candidate", source: "review_case", value: {candidateId: candidate.id, sanityId: candidate.sanityId ?? null, entityType: candidate.entityType ?? null, value: candidate.value} as ReviewJsonValue, confidence: typeof candidate.confidence === "number" ? Math.min(1, Math.max(0, candidate.confidence > 1 ? candidate.confidence / 100 : candidate.confidence)) : 0, limitations: candidate.reasons ?? []}] : []);
  const issueEvidence = (issue?.evidence ?? []).map((value, index) => ({id: `issue:${issueId}:evidence:${index}`, kind: "case_note", source: "review_case", value, confidence: 0, limitations: ["La incidencia conserva texto, no una confianza verificable."]}));
  return [...explicit, ...candidates, ...issueEvidence].sort((left, right) => left.id.localeCompare(right.id));
}

function conservativeConfidence(evidence: readonly OperationEvidence[]): number {
  return evidence.length ? Math.min(...evidence.map((item) => item.confidence)) : 0;
}

function uniqueEvidence(evidence: readonly OperationEvidence[]): OperationEvidence[] {
  return [...new Map(evidence.map((item) => [item.id, item])).values()].sort((left, right) => left.id.localeCompare(right.id));
}

function blocker(code: GlobalResolutionBlocker["code"], message: string, options: Omit<GlobalResolutionBlocker, "code" | "message" | "explanation" | "requiredAction"> & {explanation?: string; requiredAction?: string}): GlobalResolutionBlocker {
  return {code, message, explanation: options.explanation ?? message, requiredAction: options.requiredAction ?? "Completar la información requerida y reconstruir el plan.", ...options};
}

function logicalOperationId(kind: EntityOperationKind, entityType: EntityOperationEntityType, target: EntityOperation["target"] | undefined, payload: ReviewJsonValue | undefined): string {
  return `entity-operation:${kind}:${entityType}:${computeUniversalFingerprint({kind, entityType, target: target as unknown as ReviewJsonValue ?? null, payload: payload ?? null}).slice(-16)}`;
}

type OperationBuilder = {operations: EntityOperation[]; blockers: GlobalResolutionBlocker[]; warnings: GlobalResolutionWarning[]; context: PlanningContext};

function appendOperation(builder: OperationBuilder, input: {kind: EntityOperationKind; entityType: EntityOperationEntityType; issueId?: string; target?: EntityOperation["target"]; payload?: ReviewJsonValue; evidence: OperationEvidence[]; dependencyIds?: string[]; requiredCapability?: string; explanation: string; requireAdapterForStructure?: boolean}): EntityOperation | undefined {
  const {kind, entityType, evidence} = input;
  const adapter = builder.context.entityRegistry.get(entityType);
  const risk = riskOf(kind);
  if (riskRank(risk) > riskRank(builder.context.policy.maximumRisk)) {
    builder.blockers.push(blocker("risk_exceeds_policy", `La operación ${kind} supera el riesgo máximo permitido.`, {severity: "blocking", scope: "structure", issueId: input.issueId, entityType, evidence: [...evidence], requiredAction: "Reducir el riesgo de la resolución o elevar la política mediante aprobación."}));
    return undefined;
  }
  if (!adapter && input.requireAdapterForStructure) {
    builder.blockers.push(blocker("missing_entity_adapter", `No existe adaptador de operaciones para ${entityType}.`, {severity: "blocking", scope: "structure", issueId: input.issueId, entityType, evidence: [...evidence], requiredAction: "Registrar un adaptador declarativo para esta entidad."}));
    return undefined;
  }
  if (adapter && !adapter.knownOperations.includes(kind)) {
    builder.blockers.push(blocker("unsupported_operation", `El adaptador de ${entityType} no declara ${kind}.`, {severity: builder.context.policy.unsupportedOperation === "block" ? "blocking" : "warning", scope: input.requireAdapterForStructure ? "structure" : "execution", issueId: input.issueId, entityType, evidence: [...evidence], requiredAction: "Declarar la operación en el adaptador o elegir una resolución compatible."}));
    return undefined;
  }
  const capability = input.requiredCapability ?? (entityType === "luchador" && kind === "create_entity" ? "create:luchador" : adapter?.futureCapability);
  const operation = buildEntityOperation({
    id: logicalOperationId(kind, entityType, input.target, input.payload),
    kind,
    entityType,
    target: input.target,
    payload: input.payload,
    source: "global_resolution",
    evidence: uniqueEvidence(evidence),
    confidence: conservativeConfidence(uniqueEvidence(evidence)),
    risk,
    preconditions: [],
    postconditions: [],
    dependencyIds: [...new Set(input.dependencyIds ?? [])].sort(),
    requiredCapability: capability,
    compensatable: false,
    explanation: input.explanation,
  });
  builder.operations.push(operation);
  if (!adapter) builder.blockers.push(blocker("missing_entity_adapter", `No existe adaptador de ejecución para ${entityType}.`, {severity: "blocking", scope: "execution", issueId: input.issueId, operationId: operation.id, entityType, evidence: [...evidence], requiredAction: "Registrar un adaptador con simulación o ejecución segura."}));
  else if (adapter.support[kind] !== "executable") builder.blockers.push(blocker("operation_not_executable", `${kind} para ${entityType} solo tiene soporte ${adapter.support[kind] ?? "no declarado"}.`, {severity: "blocking", scope: "execution", issueId: input.issueId, operationId: operation.id, entityType, evidence: [...evidence], requiredAction: "Implementar y registrar la capacidad requerida antes de ejecutar."}));
  if (capability && !builder.context.policy.availableCapabilities.includes(capability)) builder.blockers.push(blocker("missing_required_capability", `La capacidad ${capability} no está disponible en la política actual.`, {severity: "blocking", scope: "execution", issueId: input.issueId, operationId: operation.id, entityType, evidence: [...evidence], requiredAction: `Habilitar la capacidad ${capability} tras validarla.`}));
  return operation;
}

function fighterRequirements(prepared: PreparedEntityPlanningInput): string[] {
  const draft = prepared.draft;
  const name = typeof draft.name === "string" ? draft.name.trim() : typeof draft.nombre === "string" ? draft.nombre.trim() : "";
  const discipline = typeof draft.disciplineId === "string" ? draft.disciplineId.trim() : "";
  const organizations = Array.isArray(draft.organizationIds) ? draft.organizationIds.filter((value): value is string => typeof value === "string" && Boolean(value.trim())) : [];
  return [!name ? "nombre" : "", !prepared.identityKey && typeof draft.identityKey !== "string" ? "identityKey" : "", !discipline ? "disciplina" : "", organizations.length !== 1 ? "organizacion" : ""].filter(Boolean);
}

function derivePreparedFighter(builder: OperationBuilder, issue: ReviewIssue, prepared: PreparedEntityPlanningInput, evidence: OperationEvidence[]): void {
  const entityType = normalizeEntityType(prepared.entityType);
  if (entityType !== "luchador") return;
  if (!prepared.valid) {
    builder.blockers.push(blocker("schema_requirement_missing", "La entidad preparada no superó su validación estructural.", {severity: "blocking", scope: "structure", issueId: issue.id, entityType, evidence: [...prepared.evidence, ...evidence], requiredAction: "Resolver los requisitos de schema antes de planificar la creación."}));
    return;
  }
  const missing = fighterRequirements(prepared);
  if (missing.length) {
    builder.blockers.push(blocker("missing_required_reference", `El luchador preparado carece de: ${missing.join(", ")}.`, {severity: "blocking", scope: "structure", issueId: issue.id, entityType, evidence: [...prepared.evidence, ...evidence], requiredAction: "Aportar nombre, identidad, disciplina y una organización demostrada."}));
    return;
  }
  const allEvidence = uniqueEvidence([...prepared.evidence, ...evidence]);
  const validation = appendOperation(builder, {kind: "validate_entity", entityType, issueId: issue.id, payload: {preparedEntity: prepared.draft}, evidence: allEvidence, explanation: "Validar estructuralmente el luchador preparado.", requireAdapterForStructure: true});
  if (!validation) return;
  const find = appendOperation(builder, {kind: "find_entity", entityType, issueId: issue.id, target: {identityKey: prepared.identityKey ?? String(prepared.draft.identityKey)}, payload: {identityKey: prepared.identityKey ?? prepared.draft.identityKey ?? ""}, evidence: allEvidence, dependencyIds: [validation.id], explanation: "Buscar un luchador con identidad editorial compatible.", requireAdapterForStructure: true});
  if (!find) return;
  const candidates = [...new Set([...(prepared.candidateEntityIds ?? []), ...(prepared.existingEntityId ? [prepared.existingEntityId] : [])])];
  if (candidates.length > 1) {
    builder.blockers.push(blocker("ambiguous_entity_candidate", "Existen varios luchadores candidatos y no hay una elección segura.", {severity: "blocking", scope: "structure", issueId: issue.id, entityType, evidence: allEvidence, requiredAction: "Seleccionar un único candidato o aportar evidencia discriminante."}));
    return;
  }
  const action = candidates.length === 1
    ? appendOperation(builder, {kind: "reuse_entity", entityType, issueId: issue.id, target: {entityId: candidates[0], identityKey: prepared.identityKey}, evidence: allEvidence, dependencyIds: [find.id], explanation: "Reutilizar el luchador existente identificado de forma inequívoca.", requireAdapterForStructure: true})
    : appendOperation(builder, {kind: "create_entity", entityType, issueId: issue.id, target: {identityKey: prepared.identityKey ?? String(prepared.draft.identityKey)}, payload: prepared.draft, evidence: allEvidence, dependencyIds: [find.id], explanation: "Crear conceptualmente el luchador preparado tras no hallar un candidato único.", requireAdapterForStructure: true});
  if (!action) return;
  const minimum = candidates.length ? builder.context.policy.minimumReuseConfidence : builder.context.policy.minimumCreateConfidence;
  if (action.confidence < minimum) builder.blockers.push(blocker("insufficient_confidence", `La confianza ${action.confidence.toFixed(2)} no alcanza el mínimo ${minimum.toFixed(2)} para ${action.kind}.`, {severity: "blocking", scope: "structure", issueId: issue.id, operationId: action.id, entityType, evidence: allEvidence, requiredAction: "Aportar evidencia adicional o elevar la decisión editorial de forma explícita."}));
  appendOperation(builder, {kind: "replace_reference", entityType, issueId: issue.id, target: {fieldPath: issue.fieldPath, identityKey: prepared.identityKey ?? String(prepared.draft.identityKey)}, payload: {issueId: issue.id, referenceOperationId: action.id}, evidence: allEvidence, dependencyIds: [action.id], explanation: "Sustituir la referencia afectada por el luchador resuelto.", requireAdapterForStructure: true});
}

function deriveResolution(builder: OperationBuilder, resolution: ReviewResolution): void {
  const issue = builder.context.reviewCase.issues.find((candidate) => candidate.id === resolution.issueId);
  if (!issue) {
    builder.blockers.push(blocker("invalid_resolution", "La resolución no pertenece a una incidencia vigente.", {severity: "blocking", scope: "structure", issueId: resolution.issueId, evidence: [], requiredAction: "Eliminar la resolución obsoleta o restaurar su incidencia."}));
    return;
  }
  const checked = validateReviewResolution(builder.context.reviewCase, resolution);
  const evidence = evidenceForIssue(issue, builder.context.evidence);
  if (!checked.valid) {
    builder.blockers.push(blocker("invalid_resolution", checked.error, {severity: "blocking", scope: "structure", issueId: issue.id, evidence, requiredAction: "Corregir la resolución conforme al contrato del ReviewCase."}));
    return;
  }
  if (resolution.type === "create_entity") {
    const prepared = builder.context.preparedEntities.find((candidate) => candidate.issueId === issue.id);
    if (!prepared) {
      builder.blockers.push(blocker("schema_requirement_missing", "La creación requiere una entidad preparada y validada; el borrador de resolución por sí solo no basta.", {severity: "blocking", scope: "structure", issueId: issue.id, entityType: normalizeEntityType(resolution.entityType), evidence, requiredAction: "Preparar y validar la entidad con identidad y referencias obligatorias."}));
      return;
    }
    derivePreparedFighter(builder, issue, prepared, evidence);
    if (normalizeEntityType(prepared.entityType) !== "luchador") builder.blockers.push(blocker("unsupported_operation", `La planificación preparada para ${prepared.entityType} aún no tiene un adaptador de creación seguro.`, {severity: "blocking", scope: "structure", issueId: issue.id, evidence: [...prepared.evidence, ...evidence], requiredAction: "Añadir un adaptador de planificación específico para esta entidad."}));
    return;
  }
  const entityType = normalizeEntityType(issue.valueKind) ?? builder.context.finalEntityType;
  if (!entityType) {
    builder.blockers.push(blocker("incompatible_entity_type", "La incidencia no conserva un tipo de entidad compatible para traducir la resolución.", {severity: "blocking", scope: "structure", issueId: issue.id, evidence, requiredAction: "Indicar explícitamente la entidad final o enriquecer la incidencia."}));
    return;
  }
  if (resolution.type === "link_reference") appendOperation(builder, {kind: "replace_reference", entityType, issueId: issue.id, target: {fieldPath: issue.fieldPath, entityId: resolution.sanityId}, payload: {referenceId: resolution.sanityId}, evidence, explanation: "Reparar la referencia mediante el ID aprobado.", requireAdapterForStructure: false});
  else if (resolution.type === "select_candidate") {
    const candidate = issue.candidates?.find((item) => item.id === resolution.candidateId);
    const entityId = candidate?.sanityId;
    if (!candidate || !entityId) builder.blockers.push(blocker("ambiguous_entity_candidate", "El candidato seleccionado no aporta un ID de entidad reutilizable.", {severity: "blocking", scope: "structure", issueId: issue.id, entityType, evidence, requiredAction: "Seleccionar un candidato con ID persistible o preparar una creación válida."}));
    else {
      const reuse = appendOperation(builder, {kind: "reuse_entity", entityType, issueId: issue.id, target: {entityId}, evidence, explanation: "Reutilizar el candidato seleccionado.", requireAdapterForStructure: true});
      if (reuse) appendOperation(builder, {kind: "replace_reference", entityType, issueId: issue.id, target: {fieldPath: issue.fieldPath, entityId}, payload: {referenceId: entityId}, evidence, dependencyIds: [reuse.id], explanation: "Aplicar la referencia del candidato reutilizado.", requireAdapterForStructure: false});
    }
  } else if (resolution.type === "set_value" || resolution.type === "accept_value") {
    const value = resolution.type === "set_value" ? resolution.value : issue.currentValue;
    if (value === undefined) builder.blockers.push(blocker("missing_required_evidence", "La resolución no conserva un valor para actualizar el metadato.", {severity: "blocking", scope: "structure", issueId: issue.id, entityType, evidence, requiredAction: "Aportar el valor aprobado en la resolución."}));
    else appendOperation(builder, {kind: issue.fieldPath?.startsWith("metadata.") ? "set_metadata" : "update_entity", entityType, issueId: issue.id, target: {fieldPath: issue.fieldPath}, payload: {value}, evidence, explanation: "Actualizar el valor editorial aprobado.", requireAdapterForStructure: false});
  } else if (resolution.type === "select_image") appendOperation(builder, {kind: "replace_image", entityType, issueId: issue.id, target: {fieldPath: issue.fieldPath}, payload: resolution.url ? {url: resolution.url} : {assetId: resolution.assetId ?? ""}, evidence, explanation: "Sustituir la imagen aprobada.", requireAdapterForStructure: false});
  else if (resolution.type === "discard" || resolution.type === "reject_duplicate" || resolution.type === "retry") builder.warnings.push({code: "resolution_without_entity_effect", issueId: issue.id, message: `La resolución ${resolution.type} no produce una operación de entidad ejecutable.`});
  else builder.blockers.push(blocker("unsupported_operation", `La resolución ${resolution.type} no tiene una traducción segura a operación editorial.`, {severity: "blocking", scope: "structure", issueId: issue.id, entityType, evidence, requiredAction: "Definir un adaptador de traducción explícito para esta resolución."}));
}

function deriveEffect(builder: OperationBuilder, effect: ReviewEffect): void {
  const entityType = normalizeEntityType(effect.type === "create_entity" || effect.type === "reuse_entity" || effect.type === "merge_entities" ? effect.entityType : undefined) ?? builder.context.finalEntityType;
  const context: EffectDerivationContext = {entityType, evidence: evidenceForIssue(undefined, builder.context.evidence), source: "global_resolution", policy: builder.context.policy};
  if (effect.type === "block_operation") { builder.blockers.push(blocker("unsupported_operation", effect.reason, {severity: "blocking", scope: "structure", evidence: context.evidence, requiredAction: "Resolver el bloqueo declarado antes de continuar."})); return; }
  if (effect.type === "skip_operation") { if (!context.policy.allowSkipOperation) builder.blockers.push(blocker("unsupported_operation", "La política no permite omitir operaciones.", {severity: "blocking", scope: "structure", evidence: context.evidence, requiredAction: "Modificar la política explícitamente o resolver la operación."})); else builder.warnings.push({code: "effect_skipped", message: effect.reason}); return; }
  if (!entityType) { builder.blockers.push(blocker("ambiguous_effect_mapping", `No se puede determinar la entidad del efecto ${effect.type}.`, {severity: "blocking", scope: "structure", evidence: context.evidence, requiredAction: "Indicar el tipo de entidad final de forma explícita."})); return; }
  const shared = {entityType, evidence: context.evidence, target: "path" in effect ? {fieldPath: effect.path} : undefined, explanation: `Traducir el efecto universal ${effect.type}.`, requireAdapterForStructure: effect.type === "create_entity" || effect.type === "reuse_entity"};
  if (effect.type === "create_entity") appendOperation(builder, {...shared, kind: "create_entity", payload: effect.payload});
  else if (effect.type === "reuse_entity") appendOperation(builder, {...shared, kind: "reuse_entity", target: {entityId: effect.entityId}});
  else if (effect.type === "merge_entities") appendOperation(builder, {...shared, kind: "merge_entities", target: {entityId: effect.targetId}, payload: {sourceIds: effect.sourceIds}});
  else if (effect.type === "replace_reference") appendOperation(builder, {...shared, kind: "replace_reference", payload: {referenceId: effect.referenceId}});
  else if (effect.type === "remove_reference") appendOperation(builder, {...shared, kind: "remove_reference", payload: {referenceId: effect.referenceId ?? null}});
  else if (effect.type === "repair_relationship") appendOperation(builder, {...shared, kind: "repair_relationship", payload: {fromId: effect.fromId ?? null, toId: effect.toId}});
  else if (effect.type === "replace_image") appendOperation(builder, {...shared, kind: "replace_image", payload: effect.image});
  else if (effect.type === "set_field") appendOperation(builder, {...shared, kind: effect.path.startsWith("metadata.") ? "set_metadata" : "update_entity", payload: {value: effect.value}});
  else if (effect.type === "remove_field") appendOperation(builder, {...shared, kind: effect.path.endsWith("Reference") ? "remove_reference" : "update_entity", payload: {remove: true}});
}

function consolidate(operations: readonly EntityOperation[]): EntityOperation[] {
  const groups = new Map<string, EntityOperation[]>();
  operations.forEach((operation) => { const group = groups.get(operation.id) ?? []; group.push(operation); groups.set(operation.id, group); });
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, group]) => {
    const first = group[0];
    const evidence = [...new Map(group.flatMap((operation) => operation.evidence).map((item) => [item.id, item])).values()].sort((left, right) => left.id.localeCompare(right.id));
    const dependencyIds = [...new Set(group.flatMap((operation) => operation.dependencyIds))].sort();
    return buildEntityOperation({...first, id, idempotencyKey: undefined, evidence, confidence: Math.min(...group.map((operation) => operation.confidence)), dependencyIds});
  });
}

function deriveDependencies(operations: readonly EntityOperation[], context: PlanningContext): EntityOperation[] {
  const entityPrerequisites = new Map<string, string[]>();
  for (const hint of context.dependencyHints) {
    const current = entityPrerequisites.get(hint.consumerEntityType) ?? [];
    entityPrerequisites.set(hint.consumerEntityType, [...new Set([...current, hint.dependencyEntityType])]);
  }
  return operations.map((operation) => {
    const dependencies = new Set(operation.dependencyIds);
    const producers = operations.filter((candidate) => candidate.id !== operation.id && ["create_entity", "reuse_entity"].includes(candidate.kind));
    if (operation.kind === "replace_reference") producers.filter((candidate) => candidate.entityType === operation.entityType).forEach((candidate) => dependencies.add(candidate.id));
    if (["create_entity", "reuse_entity", "repair_relationship"].includes(operation.kind)) {
      const requiredTypes = entityPrerequisites.get(operation.entityType) ?? [];
      producers.filter((candidate) => requiredTypes.includes(candidate.entityType)).forEach((candidate) => dependencies.add(candidate.id));
    }
    return buildEntityOperation({...operation, id: operation.id, idempotencyKey: undefined, dependencyIds: [...dependencies].sort()});
  });
}

export function deriveEntityOperations(context: PlanningContext): DerivedEntityOperationsResult {
  const builder: OperationBuilder = {operations: [], blockers: [], warnings: [], context};
  [...context.resolutions].sort((left, right) => `${left.issueId}:${left.type}`.localeCompare(`${right.issueId}:${right.type}`)).forEach((resolution) => deriveResolution(builder, resolution));
  context.effects.forEach((effect) => deriveEffect(builder, effect));
  const operations = deriveDependencies(consolidate(builder.operations), context);
  const hasFinalValidation = operations.some((operation) => operation.kind === "validate_entity" && operation.entityType === context.finalEntityType && operation.payload && object(operation.payload)?.scope === "final_payload");
  return {operations, blockers: builder.blockers, warnings: builder.warnings, assumptions: [], hasFinalValidation};
}

export function appendFinalValidationAndResume(context: PlanningContext, derived: DerivedEntityOperationsResult): DerivedEntityOperationsResult {
  const builder: OperationBuilder = {operations: [...derived.operations], blockers: [...derived.blockers], warnings: [...derived.warnings], context};
  const structuralBlocked = () => builder.blockers.some((item) => item.scope === "structure" && item.severity === "blocking");
  if (!context.finalEntityType) builder.blockers.push(blocker("missing_final_validation", "No se indicó la entidad final que debe validarse antes de reanudar.", {severity: "blocking", scope: "structure", evidence: [], requiredAction: "Indicar finalEntityType de forma explícita."}));
  if (!text(context.producer)) builder.blockers.push(blocker("missing_producer", "No existe productor conceptual para la reanudación.", {severity: "blocking", scope: "structure", evidence: [], requiredAction: "Proporcionar producer en la entrada de planificación."}));
  if (!text(context.originalOperation)) builder.blockers.push(blocker("missing_original_operation", "No existe operación original para la reanudación.", {severity: "blocking", scope: "structure", evidence: [], requiredAction: "Proporcionar originalOperation en la entrada de planificación."}));
  const hasSnapshot = Boolean(object(context.reviewCase.context.payloadSnapshot)) || Boolean(context.reviewCase.resumeAction);
  if (!hasSnapshot) builder.blockers.push(blocker("missing_snapshot", "El caso no conserva snapshot ni acción de reanudación suficientes.", {severity: "blocking", scope: "structure", evidence: [], requiredAction: "Conservar un snapshot serializable o un contrato de reanudación."}));
  if (!structuralBlocked() && context.finalEntityType) {
    const finalEvidence = evidenceForIssue(undefined, context.evidence);
    const validation = appendOperation(builder, {kind: "validate_entity", entityType: context.finalEntityType, payload: {scope: "final_payload", operation: context.originalOperation}, evidence: finalEvidence, dependencyIds: builder.operations.map((operation) => operation.id), requiredCapability: `validate:${context.finalEntityType}`, explanation: "Validar el payload final reconstruido antes de reanudar.", requireAdapterForStructure: false});
    if (validation) {
      const dependencies = context.policy.requireAllNodesForResume ? builder.operations.filter((operation) => operation.id !== validation.id).map((operation) => operation.id) : [validation.id];
      appendOperation(builder, {kind: "validate_entity", entityType: context.finalEntityType, payload: {scope: "resume", producer: context.producer, operation: context.originalOperation}, evidence: finalEvidence, dependencyIds: [...new Set([...dependencies, validation.id])].sort(), requiredCapability: `resume:${context.producer}`, explanation: "Reanudar conceptualmente el productor original tras la validación final.", requireAdapterForStructure: false});
    }
  }
  return {operations: deriveDependencies(consolidate(builder.operations), context), blockers: builder.blockers, warnings: builder.warnings, assumptions: derived.assumptions, hasFinalValidation: builder.operations.some((operation) => object(operation.payload)?.scope === "final_payload")};
}
