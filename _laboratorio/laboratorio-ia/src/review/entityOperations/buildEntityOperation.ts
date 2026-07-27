import {expectedEntityOperationIdempotencyKey, fingerprintEntityOperation} from "./fingerprintEntityOperation";
import type {EntityOperation, EntityOperationDraft} from "./types";
import {validateEntityOperation} from "./validateEntityOperation";

export function buildEntityOperation(draft: EntityOperationDraft): EntityOperation {
  const dependencyIds = [...new Set(draft.dependencyIds ?? [])].sort();
  const base = {...draft, dependencyIds} as Omit<EntityOperation, "id" | "idempotencyKey">;
  const fingerprint = fingerprintEntityOperation(base);
  const operation: EntityOperation = {
    ...base,
    id: draft.id?.trim() || `entity-operation:${draft.kind}:${fingerprint.slice(-16)}`,
    idempotencyKey: draft.idempotencyKey?.trim() || expectedEntityOperationIdempotencyKey(base),
  };
  const validation = validateEntityOperation(operation);
  if (!validation.valid) throw new Error(`invalid_entity_operation:${validation.errors.map((item) => item.code).join(",")}`);
  return operation;
}
