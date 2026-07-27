import {isSerializableReviewValue} from "../cases/validateResolution";
import {contentTypes} from "../../config/contentTypes";
import {expectedEntityOperationIdempotencyKey} from "./fingerprintEntityOperation";
import type {EntityOperation, EntityOperationValidationIssue, EntityOperationValidationResult, OperationCondition, OperationEvidence} from "./types";

const KINDS = new Set<EntityOperation["kind"]>(["find_entity", "create_entity", "update_entity", "reuse_entity", "merge_entities", "replace_reference", "remove_reference", "repair_relationship", "set_metadata", "replace_image", "validate_entity"]);
const RISKS = new Set<EntityOperation["risk"]>(["none", "low", "medium", "high", "critical"]);
const SOURCES = new Set<EntityOperation["source"]>(["autonomous_resolution", "editorial_decision", "legacy_resolution", "compatibility_adapter", "global_resolution"]);
const CONDITIONS = new Set<OperationCondition["kind"]>(["entity_exists", "entity_absent", "field_equals", "reference_exists", "schema_valid", "no_ambiguity", "custom"]);
const ENTITY_TYPES = new Set(contentTypes.map((contentType) => contentType.id));
const message = (code: string, path?: string): EntityOperationValidationIssue => ({code, message: code.replace(/_/g, " "), path});
const nonEmpty = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());

function validateConditions(value: readonly OperationCondition[], path: string, errors: EntityOperationValidationIssue[]): void {
  const ids = new Set<string>();
  value.forEach((condition, index) => {
    const current = `${path}[${index}]`;
    if (!nonEmpty(condition?.id) || ids.has(condition.id)) errors.push(message("entity_operation_condition_id_invalid", current));
    ids.add(condition?.id ?? "");
    if (!CONDITIONS.has(condition?.kind)) errors.push(message("entity_operation_condition_kind_invalid", current));
    if (!nonEmpty(condition?.description) || typeof condition?.required !== "boolean") errors.push(message("entity_operation_condition_invalid", current));
  });
}

function validateEvidence(value: readonly OperationEvidence[], errors: EntityOperationValidationIssue[]): void {
  const ids = new Set<string>();
  value.forEach((item, index) => {
    const path = `evidence[${index}]`;
    if (!nonEmpty(item?.id) || ids.has(item.id)) errors.push(message("entity_operation_evidence_id_invalid", path));
    ids.add(item?.id ?? "");
    if (!nonEmpty(item?.kind) || !nonEmpty(item?.source) || !Number.isFinite(item?.confidence) || item.confidence < 0 || item.confidence > 1 || !Array.isArray(item?.limitations) || item.limitations.some((limitation) => !nonEmpty(limitation))) errors.push(message("entity_operation_evidence_invalid", path));
  });
}

export function validateEntityOperation(value: unknown): EntityOperationValidationResult {
  const errors: EntityOperationValidationIssue[] = [];
  const warnings: EntityOperationValidationIssue[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return {valid: false, errors: [message("entity_operation_object_required")], warnings};
  const operation = value as Partial<EntityOperation>;
  if (!nonEmpty(operation.id)) errors.push(message("entity_operation_id_required", "id"));
  if (!KINDS.has(operation.kind as EntityOperation["kind"])) errors.push(message("entity_operation_kind_invalid", "kind"));
  if (!ENTITY_TYPES.has(operation.entityType as EntityOperation["entityType"])) errors.push(message("entity_operation_entity_type_invalid", "entityType"));
  if (!SOURCES.has(operation.source as EntityOperation["source"])) errors.push(message("entity_operation_source_invalid", "source"));
  if (!RISKS.has(operation.risk as EntityOperation["risk"])) errors.push(message("entity_operation_risk_invalid", "risk"));
  if (!Number.isFinite(operation.confidence) || Number(operation.confidence) < 0 || Number(operation.confidence) > 1) errors.push(message("entity_operation_confidence_invalid", "confidence"));
  if (!Array.isArray(operation.evidence)) errors.push(message("entity_operation_evidence_invalid", "evidence")); else validateEvidence(operation.evidence, errors);
  if (!Array.isArray(operation.preconditions)) errors.push(message("entity_operation_preconditions_invalid", "preconditions")); else validateConditions(operation.preconditions, "preconditions", errors);
  if (!Array.isArray(operation.postconditions)) errors.push(message("entity_operation_postconditions_invalid", "postconditions")); else validateConditions(operation.postconditions, "postconditions", errors);
  if (!Array.isArray(operation.dependencyIds) || operation.dependencyIds.some((dependencyId) => !nonEmpty(dependencyId))) errors.push(message("entity_operation_dependencies_invalid", "dependencyIds"));
  else if (new Set(operation.dependencyIds).size !== operation.dependencyIds.length) errors.push(message("entity_operation_dependencies_duplicated", "dependencyIds"));
  if (!nonEmpty(operation.idempotencyKey)) errors.push(message("entity_operation_idempotency_key_required", "idempotencyKey"));
  if (typeof operation.compensatable !== "boolean" || !nonEmpty(operation.explanation)) errors.push(message("entity_operation_description_invalid"));
  if (!isSerializableReviewValue(value)) errors.push(message("entity_operation_not_serializable"));
  if (!errors.length) {
    const expected = expectedEntityOperationIdempotencyKey(operation as Omit<EntityOperation, "id" | "idempotencyKey" | "explanation">);
    if (operation.idempotencyKey !== expected) errors.push(message("entity_operation_idempotency_key_mismatch", "idempotencyKey"));
  }
  return {valid: !errors.length, errors, warnings};
}
