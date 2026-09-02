import {getReviewOriginResumeAuthority, getReviewResumeExecutor} from "../../../integrations/reviewResumeExecutors";
import {createOrUpdateReviewCaseFromIntake} from "../../intake";
import {buildExternalNewsResumePreview, createExternalNewsPreviewFingerprint, executeExternalNewsResume} from "../externalNews";
import {
  beginReviewResumeExecution,
  failReviewResumeExecution,
  getReviewCase,
  recordReviewResumeSaved,
  transitionReviewCase,
} from "../../store/reviewStore";
import type {ReviewCase, ReviewResumeExecution} from "../../types";
import {readReviewOriginResumeContext} from "./contract";
import {OFFICIAL_REVIEW_RESUME_PRODUCERS, type DispatchReviewResumeInput, type DispatchReviewResumeResult, type ReviewOriginAuthorityResult, type ReviewOriginResumeContext, type ReviewResumeProducer} from "./types";

const active = new Map<string, Promise<DispatchReviewResumeResult>>();
const result = (caseId: string, status: DispatchReviewResumeResult["status"], message: string, extra: Partial<DispatchReviewResumeResult> = {}): DispatchReviewResumeResult => Object.freeze({success: status === "resumed", status, caseId, message, ...extra});
const successMessage = (reviewCase: ReviewCase): string => reviewCase.subject.type === "event"
  ? "El evento continuó correctamente y el resultado quedó preparado."
  : "La noticia continuó correctamente y quedó preparada.";
const blockedMessage = (status: "changed" | "conflict"): string => status === "changed"
  ? "No se pudo continuar porque la información cambió desde que se abrió el caso."
  : "No se pudo continuar porque el origen presenta información contradictoria.";
const knownProducer = (value: unknown): ReviewResumeProducer | undefined => value === "external_news" || typeof value === "string" && (OFFICIAL_REVIEW_RESUME_PRODUCERS as readonly string[]).includes(value) ? value as ReviewResumeProducer : undefined;

function markStale(reviewCase: ReviewCase): void {
  const current = getReviewCase(reviewCase.id);
  if (current && current.status !== "stale" && ["resolved", "resuming"].includes(current.status)) transitionReviewCase(current.id, "stale");
}

function failStarted(reviewCase: ReviewCase, code: string, message: string, now: string): void {
  const current = getReviewCase(reviewCase.id);
  if (!current || current.status !== "resuming") return;
  const previous = current.resumeExecution;
  failReviewResumeExecution(reviewCase.id, {
    status: "failed",
    attemptCount: previous?.attemptCount ?? reviewCase.resumeAttempts + 1,
    startedAt: previous?.startedAt,
    failedAt: now,
    caseVersionAtStart: reviewCase.version,
    previewFingerprint: previous?.previewFingerprint,
    error: {code, message},
    summary: previous?.summary,
  });
}

function validFollowUp(resultValue: ReviewOriginAuthorityResult, context: ReviewOriginResumeContext): boolean {
  if (!resultValue.followUp) return false;
  const source = context.producer.split("_")[0];
  return resultValue.followUp.actionable === true && resultValue.followUp.source === source && Boolean(resultValue.followUp.originId?.trim());
}

async function dispatchExternalNews(reviewCase: ReviewCase, input: DispatchReviewResumeInput): Promise<DispatchReviewResumeResult> {
  const preview = buildExternalNewsResumePreview(reviewCase, {now: input.now});
  const fingerprint = createExternalNewsPreviewFingerprint(reviewCase, preview);
  if (input.expectedFingerprint !== fingerprint || input.expectedCaseVersion !== reviewCase.version) {
    markStale(reviewCase);
    return result(reviewCase.id, "changed", blockedMessage("changed"), {producer: "external_news"});
  }
  const execution = await executeExternalNewsResume({caseId: reviewCase.id, executor: getReviewResumeExecutor("external_news"), options: {expectedCaseVersion: reviewCase.version, expectedPreviewFingerprint: fingerprint, preparedPreview: preview, preparedPreviewFingerprint: fingerprint, now: input.now}});
  if (execution.status === "already_resumed") return result(reviewCase.id, "already_resumed", "El flujo ya había continuado; se reutiliza el resultado existente.", {producer: "external_news", resultId: execution.draftId ?? execution.documentId});
  if (execution.success && (execution.draftId || execution.documentId)) return result(reviewCase.id, "resumed", "La noticia continuó correctamente y el borrador quedó preparado.", {producer: "external_news", resultId: execution.draftId ?? execution.documentId});
  if (execution.status === "stale_preview") return result(reviewCase.id, "changed", blockedMessage("changed"), {producer: "external_news"});
  return result(reviewCase.id, "resume_failed", execution.message || "No se pudo continuar la noticia externa.", {producer: "external_news"});
}

async function dispatchOfficial(reviewCase: ReviewCase, context: ReviewOriginResumeContext, input: DispatchReviewResumeInput): Promise<DispatchReviewResumeResult> {
  if (input.expectedCaseVersion !== reviewCase.version || input.expectedFingerprint !== context.fingerprint) {
    markStale(reviewCase);
    return result(reviewCase.id, "changed", blockedMessage("changed"), {producer: context.producer});
  }
  const authority = getReviewOriginResumeAuthority(context.producer);
  if (!authority) return result(reviewCase.id, "authority_unavailable", "El productor todavía no ofrece una reanudación segura para este caso.", {producer: context.producer});
  const now = input.now?.() ?? new Date().toISOString();
  const execution: ReviewResumeExecution = {
    status: "resuming",
    attemptCount: (reviewCase.resumeExecution?.attemptCount ?? 0) + 1,
    startedAt: now,
    caseVersionAtStart: reviewCase.version,
    previewFingerprint: context.fingerprint,
    summary: {appliedResolutionCount: reviewCase.resolutions.length, changeCount: reviewCase.resolutions.length, sourceName: reviewCase.source, title: reviewCase.title, producer: context.producer, operation: context.operation},
  };
  try {
    const started = beginReviewResumeExecution(reviewCase.id, {expectedVersion: reviewCase.version, execution});
    if (!started || started.status !== "resuming") return result(reviewCase.id, "already_resuming", "El flujo ya se está reanudando.", {producer: context.producer});
  } catch {
    const current = getReviewCase(reviewCase.id);
    return result(reviewCase.id, current?.status === "resuming" ? "already_resuming" : "changed", current?.status === "resuming" ? "El flujo ya se está reanudando." : blockedMessage("changed"), {producer: context.producer});
  }

  let authorityResult: ReviewOriginAuthorityResult;
  try {
    authorityResult = await authority.continueOrigin({caseId: reviewCase.id, caseVersion: reviewCase.version, producer: context.producer, originId: context.originId, operation: context.operation, fingerprint: context.fingerprint, resolutions: structuredClone(reviewCase.resolutions), context: structuredClone(reviewCase.context), idempotencyKey: `review-resume:${context.producer}:${context.originId}:${context.fingerprint}`, signal: input.signal ?? new AbortController().signal});
  } catch (error) {
    const message = error instanceof Error ? error.message : "La autoridad del productor no pudo continuar el flujo.";
    failStarted(reviewCase, "producer_authority_failed", message, input.now?.() ?? new Date().toISOString());
    return result(reviewCase.id, "resume_failed", message, {producer: context.producer});
  }

  if (authorityResult.outcome === "changed" || authorityResult.outcome === "conflict") {
    markStale(reviewCase);
    return result(reviewCase.id, authorityResult.outcome, blockedMessage(authorityResult.outcome), {producer: context.producer});
  }
  if (authorityResult.outcome === "review_required") {
    const message = authorityResult.message?.trim() || "El flujo continuó, pero encontró otro problema que necesita revisión.";
    failStarted(reviewCase, "follow_up_review_required", message, input.now?.() ?? new Date().toISOString());
    const followUp = validFollowUp(authorityResult, context) ? createOrUpdateReviewCaseFromIntake(authorityResult.followUp!) : undefined;
    return result(reviewCase.id, "review_required", message, {producer: context.producer, followUpCaseId: followUp?.caseId});
  }
  if (authorityResult.outcome === "blocked" || authorityResult.outcome === "failed") {
    const message = authorityResult.message?.trim() || "El origen no pudo continuar y necesita atención.";
    failStarted(reviewCase, "producer_resume_failed", message, input.now?.() ?? new Date().toISOString());
    return result(reviewCase.id, "resume_failed", message, {producer: context.producer});
  }
  if (!authorityResult.observed) {
    const message = "El productor informó una continuación, pero no aportó evidencia del resultado.";
    failStarted(reviewCase, "result_not_observed", message, input.now?.() ?? new Date().toISOString());
    return result(reviewCase.id, "result_not_observed", message, {producer: context.producer});
  }

  const completedAt = input.now?.() ?? new Date().toISOString();
  const completed: ReviewResumeExecution = {...execution, status: "succeeded", completedAt, summary: {...execution.summary!, resultId: authorityResult.resultId}};
  recordReviewResumeSaved(reviewCase.id, completed);
  transitionReviewCase(reviewCase.id, "resumed");
  return result(reviewCase.id, "resumed", authorityResult.message?.trim() || successMessage(reviewCase), {producer: context.producer, resultId: authorityResult.resultId});
}

async function run(input: DispatchReviewResumeInput): Promise<DispatchReviewResumeResult> {
  const reviewCase = getReviewCase(input.caseId);
  if (!reviewCase) return result(input.caseId, "case_not_found", "El caso de revisión ya no existe.");
  const producer = reviewCase.context.producer;
  if (reviewCase.status === "resumed" || reviewCase.resumeExecution?.status === "succeeded") return result(reviewCase.id, "already_resumed", "El flujo ya había continuado; se reutiliza el resultado existente.", {producer: knownProducer(producer), resultId: reviewCase.resumeExecution?.summary?.resultId});
  if (reviewCase.status === "resuming") return result(reviewCase.id, "already_resuming", "El flujo ya se está reanudando.", {producer: knownProducer(producer)});
  if (reviewCase.status !== "resolved") return result(reviewCase.id, "invalid_state", reviewCase.status === "stale" ? blockedMessage("changed") : "Resuelve primero el caso antes de continuar el flujo.", {producer: knownProducer(producer)});
  if (!input.authorized) return result(reviewCase.id, "authorization_required", "Confirma la reanudación antes de continuar el flujo.", {producer: knownProducer(producer)});
  if (producer === "external_news") return dispatchExternalNews(reviewCase, input);
  const context = readReviewOriginResumeContext(reviewCase);
  if (!context) return result(reviewCase.id, "invalid_resume_context", "No se puede identificar de forma segura el origen que debe continuar.");
  return dispatchOfficial(reviewCase, context, input);
}

export function dispatchReviewResume(input: DispatchReviewResumeInput): Promise<DispatchReviewResumeResult> {
  const running = active.get(input.caseId);
  if (running) return Promise.resolve(result(input.caseId, "already_resuming", "El flujo ya se está reanudando."));
  const execution = run(input).finally(() => active.delete(input.caseId));
  active.set(input.caseId, execution);
  return execution;
}
