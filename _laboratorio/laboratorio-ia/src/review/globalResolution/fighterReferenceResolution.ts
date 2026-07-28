import type {ContentFormState, ContentTypeId} from "../../types";
import {isSerializableReviewValue} from "../cases/validateResolution";
import {getExternalNewsResumeSnapshot, mapResumePayloadToContentFormState, validateExternalNewsResumePayload, type ExternalNewsResolutionApplicationResult, type ExternalNewsResumeValidation} from "../resume/externalNews";
import type {ResolutionGraph} from "../resolutionGraph";
import type {ReviewCase, ReviewJsonObject, ReviewJsonValue} from "../types";
import {computeUniversalFingerprint, type UniversalPlanExecution} from "../universal";
import type {FighterCreationExecutionSummary} from "./fighterCreationExecutor";
import type {GlobalResolutionPlan} from "./types";
import {validateGlobalResolutionPlan} from "./validateGlobalResolutionPlan";

export type ResolvedEditorialReference = {entityType: ContentTypeId; documentId: string; reference: {_type: "reference"; _ref: string}; sourceOperationId: string; sourceResult: "created" | "reused_existing"; identityKey: string; validated: true};
export type FighterReferenceBlockerCode = "unsafe_creation_result" | "missing_real_id" | "projected_real_id" | "entity_type_mismatch" | "identity_mismatch" | "operation_mismatch" | "postvalidation_failed" | "payload_invalid" | "projected_reference_missing" | "multiple_projected_references" | "incompatible_reference" | "stale_payload" | "stale_case" | "stale_plan" | "stale_snapshot" | "residual_projected_reference" | "already_resumed" | "news_validation_failed";
export type FighterReferenceBlocker = {code: FighterReferenceBlockerCode; message: string};
export type ExtractResolvedEditorialReferenceResult = {ok: true; reference: ResolvedEditorialReference} | {ok: false; blocker: FighterReferenceBlocker};
export type ProjectedReferenceChange = {path: "luchadoresRelacionados"; status: "replaced" | "already_applied"; marker: string; realId: string; before: string[]; after: string[]};
export type ReplaceProjectedReferenceResult = {ok: true; payload: ReviewJsonObject; reference: ResolvedEditorialReference; changes: ProjectedReferenceChange[]; status: "replaced" | "already_applied"; inputFingerprint: string; fingerprint: string} | {ok: false; blocker: FighterReferenceBlocker};
export type PreparedExternalNewsResume = {caseId: string; caseVersion: number; planId: string; planFingerprint: string; snapshotFingerprint: string; previewFingerprint: string; producer: "external_news"; operation: string; payload: ReviewJsonObject; contentFormState?: ContentFormState; appliedReferences: ResolvedEditorialReference[]; validation: ExternalNewsResumeValidation; projectedGraph: ResolutionGraph; ready: boolean; blockers: FighterReferenceBlocker[]; generatedAt: string};

const object = (value: unknown): value is ReviewJsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const blocker = (code: FighterReferenceBlockerCode, message: string): FighterReferenceBlocker => ({code, message});
const clone = <T extends ReviewJsonValue>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const hasProjected = (value: unknown): boolean => typeof value === "string" ? value.startsWith("projected:") : Array.isArray(value) ? value.some(hasProjected) : object(value) ? Object.values(value).some(hasProjected) : false;
const payloadFingerprint = (payload: ReviewJsonObject) => computeUniversalFingerprint(payload as ReviewJsonValue);

export function fingerprintPreparedExternalNewsResume(input: Omit<PreparedExternalNewsResume, "previewFingerprint" | "contentFormState" | "projectedGraph" | "ready" | "blockers" | "generatedAt">): string {
  return computeUniversalFingerprint({caseId: input.caseId, caseVersion: input.caseVersion, planId: input.planId, planFingerprint: input.planFingerprint, snapshotFingerprint: input.snapshotFingerprint, producer: input.producer, operation: input.operation, payload: input.payload, references: input.appliedReferences, validation: input.validation} as unknown as ReviewJsonValue);
}

export function extractResolvedFighterReference(input: {execution: UniversalPlanExecution; expectedOperationId: string; expectedIdentityKey: string}): ExtractResolvedEditorialReferenceResult {
  if (input.execution.status !== "succeeded" || input.execution.results.length !== 1) return {ok: false, blocker: blocker("unsafe_creation_result", "La creación no terminó en un estado seguro.")};
  const result = input.execution.results[0]; const summary = object(result.output) ? result.output as unknown as FighterCreationExecutionSummary : undefined;
  if (!summary || !["created", "reused_existing"].includes(summary.outcome)) return {ok: false, blocker: blocker("unsafe_creation_result", "El resultado no creó ni reutilizó un luchador de forma segura.")};
  if (summary.operationId !== input.expectedOperationId) return {ok: false, blocker: blocker("operation_mismatch", "La operación fuente no coincide.")};
  if (summary.entityType !== "luchador") return {ok: false, blocker: blocker("entity_type_mismatch", "La entidad resultante no es un luchador.")};
  if (summary.identityKey !== input.expectedIdentityKey) return {ok: false, blocker: blocker("identity_mismatch", "La identidad resultante no coincide con la planificada.")};
  if (!summary.entityId?.trim()) return {ok: false, blocker: blocker("missing_real_id", "La ejecución no devolvió un ID real.")};
  if (summary.entityId.startsWith("projected:")) return {ok: false, blocker: blocker("projected_real_id", "Una referencia provisional no puede materializarse.")};
  const validated = input.execution.validations.some((item) => item.valid && item.executionIdempotencyKey === result.idempotencyKey && item.checkedEffectIndexes.includes(result.effectIndexes[0]));
  if (!validated) return {ok: false, blocker: blocker("postvalidation_failed", "Falta validación posterior satisfactoria.")};
  return {ok: true, reference: {entityType: "luchador", documentId: summary.entityId, reference: {_type: "reference", _ref: summary.entityId}, sourceOperationId: summary.operationId, sourceResult: summary.outcome as "created" | "reused_existing", identityKey: summary.identityKey, validated: true}};
}

export function replaceProjectedFighterReference(input: {payload: ReviewJsonObject; reference: ResolvedEditorialReference; sourceOperationId: string; caseId: string; caseVersion: number; planFingerprint: string; expectedPlanFingerprint: string; expectedInputFingerprint?: string}): ReplaceProjectedReferenceResult {
  if (!isSerializableReviewValue(input.payload) || !Array.isArray(input.payload.luchadoresRelacionados) || input.payload.luchadoresRelacionados.some((item) => typeof item !== "string" || !item.trim())) return {ok: false, blocker: blocker("payload_invalid", "El payload no contiene un array válido de luchadores.")};
  if (input.planFingerprint !== input.expectedPlanFingerprint) return {ok: false, blocker: blocker("stale_plan", "El fingerprint del plan cambió.")};
  if (input.reference.sourceOperationId !== input.sourceOperationId) return {ok: false, blocker: blocker("operation_mismatch", "La referencia pertenece a otra operación.")};
  const inputFingerprint = payloadFingerprint(input.payload); if (input.expectedInputFingerprint && input.expectedInputFingerprint !== inputFingerprint) return {ok: false, blocker: blocker("stale_payload", "El payload cambió desde la simulación.")};
  const marker = `projected:luchador:${input.sourceOperationId}`; const before = [...input.payload.luchadoresRelacionados] as string[]; const matches = before.filter((id) => id === marker).length; const realCount = before.filter((id) => id === input.reference.documentId).length;
  if (matches > 1) return {ok: false, blocker: blocker("multiple_projected_references", "La operación aparece proyectada más de una vez.")};
  if (!matches && !realCount) return {ok: false, blocker: blocker("projected_reference_missing", "No aparece la referencia proyectada esperada.")};
  if (!matches && realCount > 1) return {ok: false, blocker: blocker("incompatible_reference", "La referencia real ya aparece duplicada.")};
  const after = matches ? [...new Set(before.map((id) => id === marker ? input.reference.documentId : id))] : [...before];
  const payload = clone(input.payload as ReviewJsonValue) as ReviewJsonObject; payload.luchadoresRelacionados = after;
  if (after.includes(marker)) return {ok: false, blocker: blocker("residual_projected_reference", "La referencia provisional de la operación no fue eliminada.")};
  const status = matches ? "replaced" as const : "already_applied" as const; const changes: ProjectedReferenceChange[] = [{path: "luchadoresRelacionados", status, marker, realId: input.reference.documentId, before, after}];
  const fingerprint = computeUniversalFingerprint({caseId: input.caseId, caseVersion: input.caseVersion, planFingerprint: input.planFingerprint, sourceOperationId: input.sourceOperationId, identityKey: input.reference.identityKey, realId: input.reference.documentId, payload} as unknown as ReviewJsonValue);
  return {ok: true, payload, reference: input.reference, changes, status, inputFingerprint, fingerprint};
}

function projectedGraph(plan: GlobalResolutionPlan, reference: ResolvedEditorialReference, ready: boolean, now: string): ResolutionGraph {
  const nodes = plan.graph.nodes.map((node) => node.isResumeNode ? {...node, state: ready ? "ready" as const : node.state} : {...node, state: ready ? "succeeded" as const : node.state, ...(node.id === reference.sourceOperationId && ready ? {result: {references: [{type: "luchador", id: reference.documentId}], output: {outcome: reference.sourceResult, identityKey: reference.identityKey}}} : {})});
  return {...plan.graph, nodes, state: ready ? "ready" : plan.graph.state, updatedAt: now};
}

export function prepareExternalNewsResume(input: {reviewCase: ReviewCase; plan: GlobalResolutionPlan; replacement: ReplaceProjectedReferenceResult; references: ResolvedEditorialReference[]; expectedCaseVersion: number; expectedPlanFingerprint: string; expectedSnapshotFingerprint?: string; expectedReplacementInputFingerprint?: string; now?: () => string}): PreparedExternalNewsResume {
  const generatedAt = input.now?.() ?? new Date().toISOString(); const blockers: FighterReferenceBlocker[] = [];
  if (input.reviewCase.version !== input.expectedCaseVersion || input.plan.caseVersion !== input.reviewCase.version || input.plan.caseId !== input.reviewCase.id) blockers.push(blocker("stale_case", "El caso o su versión cambiaron."));
  if (input.plan.fingerprint !== input.expectedPlanFingerprint || !validateGlobalResolutionPlan(input.plan).valid) blockers.push(blocker("stale_plan", "El plan ya no coincide con su fingerprint."));
  if (["resuming", "resumed"].includes(input.reviewCase.status) || input.reviewCase.resumeExecution?.status === "succeeded") blockers.push(blocker("already_resumed", "La noticia ya se reanudó o está reanudándose."));
  const snapshotResult = getExternalNewsResumeSnapshot(input.reviewCase.context); const snapshotFingerprint = snapshotResult.snapshot ? computeUniversalFingerprint(snapshotResult.snapshot as unknown as ReviewJsonValue) : "";
  if (!snapshotResult.complete || !snapshotResult.snapshot) blockers.push(blocker("payload_invalid", `Snapshot incompleto: ${snapshotResult.missingFields.join(", ")}.`));
  if (input.expectedSnapshotFingerprint && input.expectedSnapshotFingerprint !== snapshotFingerprint) blockers.push(blocker("stale_snapshot", "El snapshot cambió desde la preparación anterior."));
  if (!input.replacement.ok) blockers.push(input.replacement.blocker);
  if (input.replacement.ok && snapshotResult.snapshot && input.replacement.inputFingerprint !== (input.expectedReplacementInputFingerprint ?? payloadFingerprint(snapshotResult.snapshot.payload))) blockers.push(blocker("stale_payload", "La sustitución no partió del payload reconstruido desde el snapshot vigente."));
  const payload = input.replacement.ok ? input.replacement.payload : snapshotResult.snapshot?.payload ?? {};
  if (hasProjected(payload)) blockers.push(blocker("residual_projected_reference", "El payload conserva referencias provisionales."));
  if (!input.references.length || input.references.some((reference) => !reference.validated || !Array.isArray(payload.luchadoresRelacionados) || !payload.luchadoresRelacionados.includes(reference.documentId))) blockers.push(blocker("incompatible_reference", "Las referencias validadas no están aplicadas al payload."));
  const application: ExternalNewsResolutionApplicationResult = {caseId: input.reviewCase.id, originalPayload: snapshotResult.snapshot?.payload ?? {}, resultingPayload: payload, applied: input.replacement.ok ? input.replacement.changes.map((change) => ({issueId: change.marker, resolutionType: "resolved_reference", path: "payload.luchadoresRelacionados", previousValue: change.before, nextValue: change.after})) : [], metadata: [], skipped: [], failed: [], warnings: [], preparedEntities: [], generatedAt};
  const validation = validateExternalNewsResumePayload(payload, input.reviewCase, application); if (!validation.valid) blockers.push(blocker("news_validation_failed", [...validation.errors.map((item) => item.message), ...validation.blockingReasons].join(" ") || "La noticia no supera la validación final."));
  let contentFormState: ContentFormState | undefined; try { contentFormState = mapResumePayloadToContentFormState(payload); } catch { blockers.push(blocker("news_validation_failed", "No se pudo reconstruir ContentFormState.")); }
  const structuralBlockers = input.plan.blockers.filter((item) => item.scope === "structure" && item.severity === "blocking"); if (structuralBlockers.length) blockers.push(blocker("stale_plan", structuralBlockers.map((item) => item.message).join(" ")));
  const ready = blockers.length === 0; const previewFingerprint = fingerprintPreparedExternalNewsResume({caseId: input.reviewCase.id, caseVersion: input.reviewCase.version, planId: input.plan.id, planFingerprint: input.plan.fingerprint, snapshotFingerprint, producer: "external_news", operation: input.plan.originalOperation, payload, appliedReferences: input.references, validation});
  return {caseId: input.reviewCase.id, caseVersion: input.reviewCase.version, planId: input.plan.id, planFingerprint: input.plan.fingerprint, snapshotFingerprint, previewFingerprint, producer: "external_news", operation: input.plan.originalOperation, payload, contentFormState, appliedReferences: input.references, validation, projectedGraph: projectedGraph(input.plan, input.references[0] ?? {entityType: "luchador", documentId: "missing", reference: {_type: "reference", _ref: "missing"}, sourceOperationId: "missing", sourceResult: "created", identityKey: "missing", validated: true}, ready, generatedAt), ready, blockers, generatedAt};
}
