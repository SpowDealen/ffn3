import type {ContentTypeId} from "../../types";
import type {ReviewJsonValue} from "../types";

export type EntityOperationEntityType = ContentTypeId;

export type EntityOperationKind =
  | "find_entity"
  | "create_entity"
  | "update_entity"
  | "reuse_entity"
  | "merge_entities"
  | "replace_reference"
  | "remove_reference"
  | "repair_relationship"
  | "set_metadata"
  | "replace_image"
  | "validate_entity";

export type OperationDecisionSource =
  | "autonomous_resolution"
  | "editorial_decision"
  | "legacy_resolution"
  | "compatibility_adapter"
  | "global_resolution";

export type OperationRisk = "none" | "low" | "medium" | "high" | "critical";

export type OperationSupportLevel = "contract_only" | "simulatable" | "executable";

export type EntityTarget = {
  entityId?: string;
  identityKey?: string;
  fieldPath?: string;
  expectedRevision?: string;
};

export type OperationEvidence = {
  id: string;
  kind: string;
  source: string;
  value?: ReviewJsonValue;
  confidence: number;
  limitations: string[];
};

export type OperationConditionKind =
  | "entity_exists"
  | "entity_absent"
  | "field_equals"
  | "reference_exists"
  | "schema_valid"
  | "no_ambiguity"
  | "custom";

export type OperationCondition = {
  id: string;
  kind: OperationConditionKind;
  description: string;
  required: boolean;
  expected?: ReviewJsonValue;
};

export type EntityOperation = {
  id: string;
  kind: EntityOperationKind;
  entityType: EntityOperationEntityType;
  target?: EntityTarget;
  payload?: ReviewJsonValue;
  source: OperationDecisionSource;
  evidence: OperationEvidence[];
  confidence: number;
  risk: OperationRisk;
  preconditions: OperationCondition[];
  postconditions: OperationCondition[];
  dependencyIds: string[];
  requiredCapability?: string;
  idempotencyKey: string;
  compensatable: boolean;
  explanation: string;
};

export type EntityOperationValidationIssue = {
  code: string;
  message: string;
  path?: string;
};

export type EntityOperationValidationResult = {
  valid: boolean;
  errors: EntityOperationValidationIssue[];
  warnings: EntityOperationValidationIssue[];
};

export type EntityOperationAdapter = {
  entityType: EntityOperationEntityType;
  knownOperations: readonly EntityOperationKind[];
  support: Readonly<Partial<Record<EntityOperationKind, OperationSupportLevel>>>;
  minimumRequirements: readonly string[];
  identityFields: readonly string[];
  deduplicationStrategy?: string;
  futureCapability?: string;
  validate?(operation: EntityOperation): EntityOperationValidationResult;
};

export type EntityOperationRegistry = {
  register(adapter: EntityOperationAdapter, options?: {replace?: boolean}): () => void;
  get(entityType: EntityOperationEntityType): EntityOperationAdapter | undefined;
  require(entityType: EntityOperationEntityType): EntityOperationAdapter;
  list(): EntityOperationAdapter[];
  supports(entityType: EntityOperationEntityType, kind: EntityOperationKind): OperationSupportLevel | undefined;
};

export type EntityOperationDraft = Omit<EntityOperation, "id" | "idempotencyKey" | "dependencyIds"> & {
  id?: string;
  idempotencyKey?: string;
  dependencyIds?: string[];
};
