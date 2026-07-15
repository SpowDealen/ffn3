import {isSerializableReviewValue} from "../../cases/validateResolution";
import {beginReviewResumeExecution, failReviewResumeExecution, getReviewCase, recordReviewResumeSaved, transitionReviewCase} from "../../store/reviewStore";
import type {ReviewJsonValue, ReviewResumeExecution} from "../../types";
import {buildExternalNewsResumePreview} from "./buildExternalNewsResumePreview";
import {createExternalNewsPreviewFingerprint} from "./createExternalNewsPreviewFingerprint";
import type {ExecuteExternalNewsResumeOptions, ExecuteExternalNewsResumeResult, ExternalNewsResumeErrorCode, ExternalNewsResumeExecutor} from "./executionTypes";
import {mapResumePayloadToContentFormState} from "./mapResumePayloadToContentFormState";

const activeExecutions = new Map<string, Promise<ExecuteExternalNewsResumeResult>>();
const SENSITIVE = /(token|secret|password|authorization|cookie|api[_-]?key|headers?)/i;
const DANGEROUS = new Set(["__proto__", "prototype", "constructor"]);
function inspect(value: ReviewJsonValue): boolean { if (Array.isArray(value)) return value.every(inspect); if (!value || typeof value !== "object") return true; return Object.entries(value).every(([key, child]) => !SENSITIVE.test(key) && !DANGEROUS.has(key) && inspect(child)); }
const result = (caseId: string, status: ExecuteExternalNewsResumeResult["status"], message: string, extra: Partial<ExecuteExternalNewsResumeResult> = {}): ExecuteExternalNewsResumeResult => ({success: status === "succeeded", status, caseId, message, ...extra});
async function notify(executor: ExternalNewsResumeExecutor, event: Parameters<NonNullable<ExternalNewsResumeExecutor["notify"]>>[0]): Promise<void> { try { await executor.notify?.(event); } catch { /* Las notificaciones nunca controlan la ejecución. */ } }

async function run(caseId: string, executor: ExternalNewsResumeExecutor, options: ExecuteExternalNewsResumeOptions): Promise<ExecuteExternalNewsResumeResult> {
  const reviewCase = getReviewCase(caseId);
  if (!reviewCase) return result(caseId, "case_not_found", "El caso no existe.");
  if (reviewCase.context.producer !== "external_news") return result(caseId, "unsupported_producer", "El productor del caso no está soportado.");
  if (reviewCase.resumeExecution?.status === "succeeded" || reviewCase.resumeExecution?.draftId || reviewCase.resumeExecution?.documentId || reviewCase.status === "resumed") return result(caseId, "already_resumed", "El caso ya guardó un borrador y no puede ejecutarse otra vez.", {draftId: reviewCase.resumeExecution?.draftId, documentId: reviewCase.resumeExecution?.documentId});
  if (reviewCase.status === "resuming") return result(caseId, "already_resuming", "El caso ya se está reanudando.");
  if (!new Set(["open", "in_review", "stale", "resume_failed", "resolved"]).has(reviewCase.status)) return result(caseId, "invalid_state", `El estado ${reviewCase.status} no permite reanudación.`);
  const preview = buildExternalNewsResumePreview(reviewCase, {now: options.now});
  const fingerprint = createExternalNewsPreviewFingerprint(reviewCase, preview);
  if (options.expectedCaseVersion !== undefined && options.expectedCaseVersion !== reviewCase.version) { await notify(executor, {type: "stale", caseId, message: "La versión cambió."}); return result(caseId, "stale_preview", "La versión del caso cambió. Regenera la preview.", {previewFingerprint: fingerprint, caseVersion: reviewCase.version}); }
  if (options.expectedPreviewFingerprint !== undefined && options.expectedPreviewFingerprint !== fingerprint) { await notify(executor, {type: "stale", caseId, message: "La preview cambió."}); return result(caseId, "stale_preview", "La preview quedó obsoleta. Regénérala antes de ejecutar.", {previewFingerprint: fingerprint, caseVersion: reviewCase.version}); }
  if (!preview.canResume || preview.status !== "ready") return result(caseId, "preview_not_ready", preview.reasons.join(" ") || "La preview no está lista.", {previewFingerprint: fingerprint, caseVersion: reviewCase.version});
  const startedAt = options.now?.() ?? new Date().toISOString();
  const attemptCount = (reviewCase.resumeExecution?.attemptCount ?? 0) + 1;
  const startingExecution: ReviewResumeExecution = {status: "resuming", attemptCount, startedAt, previewFingerprint: fingerprint, caseVersionAtStart: reviewCase.version, summary: {appliedResolutionCount: preview.application.applied.length, changeCount: preview.changes.length, sourceName: typeof reviewCase.context.sourceName === "string" ? reviewCase.context.sourceName : undefined, title: typeof preview.resultingPayload.titulo === "string" ? preview.resultingPayload.titulo : undefined}};
  try { const started = beginReviewResumeExecution(caseId, {expectedVersion: reviewCase.version, execution: startingExecution}); if (!started || started.status !== "resuming") throw new Error("No se pudo persistir el estado resuming."); }
  catch (error) { const current = getReviewCase(caseId); return result(caseId, current?.status === "resuming" ? "already_resuming" : "transition_failed", error instanceof Error ? error.message : "No se pudo iniciar la transición."); }
  await notify(executor, {type: "started", caseId, message: "Reanudación iniciada."});
  let saved = false; let savedResult: Awaited<ReturnType<ExternalNewsResumeExecutor["saveDraft"]>> | undefined;
  try {
    let form;
    try { form = mapResumePayloadToContentFormState(preview.resultingPayload); } catch (error) { throw {code: "payload_mapping_failed", message: error instanceof Error ? error.message : "No se pudo mapear el payload."}; }
    let output;
    try { output = await executor.buildOutput(form); } catch (error) { throw {code: "output_build_failed", message: error instanceof Error ? error.message : "El builder falló."}; }
    if (!isSerializableReviewValue(output) || !inspect(output)) throw {code: "output_build_failed", message: "El output no es serializable o contiene claves no permitidas."};
    try { savedResult = await executor.saveDraft(output, {idempotencyKey: `external-news-resume:${caseId}`}); } catch (error) { throw {code: "draft_save_failed", message: error instanceof Error ? error.message : "El guardado lanzó un error."}; }
    if (!savedResult.success) throw {code: "draft_save_failed", message: savedResult.error || savedResult.message || "El guardado devolvió success false."};
    saved = true;
    const completedAt = options.now?.() ?? new Date().toISOString();
    const completed: ReviewResumeExecution = {...startingExecution, status: "succeeded", completedAt, draftId: savedResult.draftId, documentId: savedResult.documentId};
    try { const recorded = recordReviewResumeSaved(caseId, completed); if (!recorded) throw new Error("No se pudo registrar el borrador guardado."); const transitioned = transitionReviewCase(caseId, "resumed"); if (!transitioned || transitioned.status !== "resumed") throw new Error("No se pudo persistir el estado resumed."); }
    catch (error) { return result(caseId, "draft_saved_state_failed", `El borrador se guardó, pero el estado necesita reconciliación: ${error instanceof Error ? error.message : "error desconocido"}.`, {draftId: savedResult.draftId, documentId: savedResult.documentId, previewFingerprint: fingerprint}); }
    await notify(executor, {type: "succeeded", caseId, message: "Borrador guardado."});
    return result(caseId, "succeeded", savedResult.message || "Borrador guardado y caso reanudado.", {draftId: savedResult.draftId, documentId: savedResult.documentId, previewFingerprint: fingerprint, caseVersion: getReviewCase(caseId)?.version});
  } catch (error) {
    const code = (error && typeof error === "object" && "code" in error ? String(error.code) : "unknown_error") as ExternalNewsResumeErrorCode;
    const message = error && typeof error === "object" && "message" in error ? String(error.message) : "Error desconocido durante la reanudación.";
    if (!saved) { const failedAt = options.now?.() ?? new Date().toISOString(); try { failReviewResumeExecution(caseId, {...startingExecution, status: "failed", failedAt, error: {code, message}}); } catch { /* Se devuelve el error original. */ } }
    await notify(executor, {type: "failed", caseId, message});
    return result(caseId, code, message, {draftId: savedResult?.draftId, documentId: savedResult?.documentId, previewFingerprint: fingerprint});
  }
}

export function executeExternalNewsResume(input: {caseId: string; executor?: ExternalNewsResumeExecutor; options?: ExecuteExternalNewsResumeOptions}): Promise<ExecuteExternalNewsResumeResult> {
  if (!input.executor) return Promise.resolve(result(input.caseId, "executor_unavailable", "El executor de guardado no está disponible en esta sesión."));
  const active = activeExecutions.get(input.caseId);
  if (active) return Promise.resolve(result(input.caseId, "already_resuming", "Ya existe una ejecución activa para este caso."));
  const execution = run(input.caseId, input.executor, input.options ?? {}).finally(() => activeExecutions.delete(input.caseId));
  activeExecutions.set(input.caseId, execution);
  return execution;
}
