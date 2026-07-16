import {REVIEW_CASE_STORAGE_KEY} from "../constants";
import type {
  CreateReviewCaseInput,
  ReviewCase,
  ReviewCaseStatus,
  ReviewResolution,
  ReviewEntityMaterialization,
  ReviewResumeExecution,
  UpdateReviewCaseInput,
} from "../types";
import {buildReviewCase} from "../cases/createReviewCase";
import {findActiveReviewCaseByDedupeKey} from "../cases/deduplicateReviewCase";
import {
  applyReviewCaseTransition,
  applyReviewResolution,
  applyReviewCaseUpdate,
  removeReviewResolutionValue,
} from "../cases/transitionReviewCase";
import {
  localStorageReviewCaseRepository,
  type ReviewCaseRepository,
} from "./localStorageRepository";
import {migrateReviewCases} from "./migrations";

const listeners = new Set<() => void>();
const BROADCAST_CHANNEL_NAME = "ffn3.review-cases";
let repository: ReviewCaseRepository = localStorageReviewCaseRepository;
let broadcastChannel: BroadcastChannel | null = null;

function sortByRecentActivity(reviewCases: ReviewCase[]): ReviewCase[] {
  return [...reviewCases].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function emitChange(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.error("[FFN3 review] Error actualizando un suscriptor.", error);
    }
  }
}

function isNewer(candidate: ReviewCase, current: ReviewCase): boolean {
  return (
    candidate.version > current.version ||
    (candidate.version === current.version &&
      candidate.updatedAt > current.updatedAt)
  );
}

function mergeLatestReviewCases(
  current: ReviewCase[],
  incoming: ReviewCase[],
): ReviewCase[] {
  const merged = new Map(current.map((reviewCase) => [reviewCase.id, reviewCase]));
  for (const candidate of incoming) {
    const existing = merged.get(candidate.id);
    if (!existing || isNewer(candidate, existing)) merged.set(candidate.id, candidate);
  }
  return sortByRecentActivity([...merged.values()]);
}

function save(reviewCases: ReviewCase[]): void {
  const sortedCases = sortByRecentActivity(reviewCases);
  repository.save(sortedCases);
  broadcastChannel?.postMessage(sortedCases);
  emitChange();
}

function replaceById(
  id: string,
  update: (reviewCase: ReviewCase) => ReviewCase,
): ReviewCase | undefined {
  const reviewCases = repository.load();
  const index = reviewCases.findIndex((reviewCase) => reviewCase.id === id);
  if (index === -1) return undefined;

  const updated = update(reviewCases[index]);
  if (updated === reviewCases[index]) return updated;

  save([updated, ...reviewCases.filter((reviewCase) => reviewCase.id !== id)]);
  return updated;
}

function initializeCrossTabSynchronization(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("storage", (event) => {
    if (event.key === REVIEW_CASE_STORAGE_KEY) emitChange();
  });

  if (typeof BroadcastChannel === "undefined") return;
  broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  broadcastChannel.addEventListener("message", (event: MessageEvent<unknown>) => {
    const incoming = migrateReviewCases(event.data);
    if (incoming.length === 0) return;

    const current = repository.load();
    const merged = mergeLatestReviewCases(current, incoming);
    if (JSON.stringify(merged) === JSON.stringify(sortByRecentActivity(current))) {
      return;
    }

    repository.save(merged);
    emitChange();
  });
}

initializeCrossTabSynchronization();

export function getReviewCases(): ReviewCase[] {
  return sortByRecentActivity(repository.load());
}

export function getReviewCase(id: string): ReviewCase | undefined {
  return getReviewCases().find((reviewCase) => reviewCase.id === id);
}

export function createReviewCase(input: CreateReviewCaseInput): ReviewCase {
  const reviewCases = repository.load();
  const existing = findActiveReviewCaseByDedupeKey(reviewCases, input.dedupeKey);

  if (existing) {
    const updated = applyReviewCaseUpdate(existing, {
      title: input.title,
      priority: input.priority,
      source: input.source,
      subject: input.subject,
      issues: input.issues,
      context: input.context ?? {},
      resumeAction: input.resumeAction,
    });
    save([updated, ...reviewCases.filter((item) => item.id !== existing.id)]);
    return updated;
  }

  const reviewCase = buildReviewCase(input);
  save([reviewCase, ...reviewCases]);
  return reviewCase;
}

export function updateReviewCase(
  id: string,
  input: UpdateReviewCaseInput,
): ReviewCase | undefined {
  return replaceById(id, (reviewCase) =>
    applyReviewCaseUpdate(reviewCase, input),
  );
}

export function transitionReviewCase(
  id: string,
  nextStatus: ReviewCaseStatus,
): ReviewCase | undefined {
  return replaceById(id, (reviewCase) =>
    applyReviewCaseTransition(reviewCase, nextStatus),
  );
}

const RESUME_START_STATUSES = new Set<ReviewCaseStatus>(["open", "in_review", "stale", "resume_failed", "resolved"]);

export function beginReviewResumeExecution(id: string, input: {expectedVersion: number; execution: ReviewResumeExecution}): ReviewCase | undefined {
  return replaceById(id, (reviewCase) => {
    if (reviewCase.version !== input.expectedVersion) throw new Error("La versión del caso cambió antes de iniciar la reanudación.");
    if (!RESUME_START_STATUSES.has(reviewCase.status)) throw new Error(`El estado ${reviewCase.status} no permite iniciar la reanudación.`);
    if (reviewCase.resumeExecution?.status === "succeeded" || reviewCase.resumeExecution?.draftId || reviewCase.resumeExecution?.documentId) throw new Error("El caso ya registra un borrador guardado.");
    const transitioned = applyReviewCaseTransition(reviewCase, "resuming");
    return applyReviewCaseUpdate(transitioned, {resumeExecution: input.execution});
  });
}

export function recordReviewResumeSaved(id: string, execution: ReviewResumeExecution): ReviewCase | undefined {
  return replaceById(id, (reviewCase) => {
    if (reviewCase.status !== "resuming") throw new Error("El caso no está en reanudación.");
    return applyReviewCaseUpdate(reviewCase, {resumeExecution: execution});
  });
}

export function failReviewResumeExecution(id: string, execution: ReviewResumeExecution): ReviewCase | undefined {
  return replaceById(id, (reviewCase) => {
    if (reviewCase.status !== "resuming") throw new Error("El caso no está en reanudación.");
    const recorded = applyReviewCaseUpdate(reviewCase, {resumeExecution: execution, lastResumeError: execution.error?.message});
    return applyReviewCaseTransition(recorded, "resume_failed");
  });
}

export function addReviewResolution(
  id: string,
  resolution: ReviewResolution,
): ReviewCase | undefined {
  return replaceById(id, (reviewCase) => {
    if (!["open", "in_review", "stale", "resume_failed"].includes(reviewCase.status)) {
      throw new Error("El estado actual del caso no permite editar resoluciones.");
    }
    return applyReviewResolution(reviewCase, resolution);
  });
}

export function materializeReviewResolution(id: string, resolution: ReviewResolution, entityMaterialization: ReviewEntityMaterialization): ReviewCase | undefined {
  return replaceById(id, (reviewCase) => {
    if (!["open", "in_review", "resolved", "resume_failed"].includes(reviewCase.status)) throw new Error("El estado actual no permite materializar entidades.");
    const resolved = applyReviewResolution(reviewCase, resolution);
    return {...resolved, entityMaterialization};
  });
}

export function removeReviewResolution(
  caseId: string,
  issueId: string,
): ReviewCase | undefined {
  return replaceById(caseId, (reviewCase) => {
    if (!["open", "in_review", "stale", "resume_failed"].includes(reviewCase.status)) {
      throw new Error("El estado actual del caso no permite eliminar resoluciones.");
    }
    return removeReviewResolutionValue(reviewCase, issueId);
  });
}

export function dismissReviewCase(
  id: string,
  reason?: string,
): ReviewCase | undefined {
  return replaceById(id, (reviewCase) =>
    applyReviewCaseTransition(reviewCase, "dismissed", new Date(), reason),
  );
}

export function removeReviewCase(id: string): void {
  const reviewCases = repository.load();
  const remaining = reviewCases.filter((reviewCase) => reviewCase.id !== id);
  if (remaining.length !== reviewCases.length) save(remaining);
}

export function clearResolvedReviewCases(): void {
  const reviewCases = repository.load();
  const remaining = reviewCases.filter(
    (reviewCase) =>
      !["resolved", "resumed", "dismissed"].includes(reviewCase.status),
  );
  if (remaining.length !== reviewCases.length) save(remaining);
}

export function clearAllReviewCases(): void {
  if (repository.load().length > 0) save([]);
}

export function subscribeToReviewCases(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setReviewCaseRepositoryForTests(
  nextRepository: ReviewCaseRepository,
): () => void {
  const previousRepository = repository;
  repository = nextRepository;
  return () => {
    repository = previousRepository;
  };
}
