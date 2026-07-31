import type {ReviewJsonObject} from "../types";
import type {FighterIdentityGuardAuthorization} from "../globalResolution/identityGuard";

export type PreparedEntityDraft = {issueId: string; entityType: string; draft: ReviewJsonObject};
export type ValidatedPreparedEntity = {issueId: string; entityType: string; identityKey: string; name: string; aliases: string[]; disciplineId: string; sanityPayload: ReviewJsonObject; omittedFields: string[]; evidence: ReviewJsonObject[]};
export type EntityDuplicateCandidate = {entityId: string; name: string; match: "exact_name" | "alias" | "slug" | "identity_key"};
export type EntityDuplicateResult = {status: "none" | "existing" | "ambiguous"; candidates: EntityDuplicateCandidate[]};
export type FighterCreationAuthorityContext = {globalPlanId: string; globalPlanFingerprint: string; globalOperationId: string; globalOperationIdempotencyKey: string; caseId: string; caseVersion: number; producer: string; sourcePayload: ReviewJsonObject};
export type CreateEditorialEntityExecutor = {
  /** Legacy read-only duplicate lookup. It is forbidden for fighter creation covered by AU5. */
  checkDuplicate(input: {entityType: string; name: string; aliases: string[]; slug: string; identityKey: string; disciplineId?: string}): Promise<EntityDuplicateResult>;
  createEntity(input: {entityType: string; payload: ReviewJsonObject; idempotencyKey: string; identityAuthorization?: FighterIdentityGuardAuthorization; authorityContext?: FighterCreationAuthorityContext}): Promise<{success: boolean; entityId?: string; documentId?: string; alreadyExisted?: boolean; error?: string; reasonCode?: string}>;
};
export type MaterializationErrorCode = "prepared_entity_invalid" | "duplicate_found" | "ambiguous_duplicate" | "identity_guard_required" | "create_executor_unavailable" | "create_failed" | "create_succeeded_resolution_failed" | "reference_replacement_failed" | "preview_regeneration_failed" | "stale_case" | "invalid_state" | "already_materialized" | "unknown_error";
export type PreparedEntityPreviewItem = {issueId: string; entityType: string; name?: string; identityKey?: string; status: "valid" | "invalid" | "existing" | "ambiguous" | "ready"; sanityPayload?: ReviewJsonObject; omittedFields: string[]; evidence: ReviewJsonObject[]; duplicate?: EntityDuplicateResult; errors: string[]; risks: string[]};
export type PreparedEntityMaterializationPreview = {caseId: string; status: "ready" | "not_ready" | "case_not_found" | "invalid_state"; items: PreparedEntityPreviewItem[]; canExecute: boolean; entityCount: number; generatedAt: string; warnings: string[]};
export type PreparedEntityMaterializationResult = {caseId: string; status: "completed" | "partially_completed" | "failed" | "blocked"; items: Array<{issueId: string; entityType: string; identityKey?: string; status: "created" | "existing" | "failed" | "reconciliation_required"; entityId?: string; error?: {code: MaterializationErrorCode; message: string}}>; previewRegenerated: boolean; canResume: boolean; generatedAt: string; warnings: string[]};
