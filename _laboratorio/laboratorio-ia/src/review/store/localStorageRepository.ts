import {
  FINAL_REVIEW_CASE_TTL_MS,
  MAX_REVIEW_CASES,
  REVIEW_CASE_STORAGE_KEY,
} from "../constants";
import type {ReviewCase} from "../types";
import {assertSerializableReviewValue} from "../cases/validateResolution";
import {migrateReviewCases} from "./migrations";

export type ReviewCaseRepository = {
  load(): ReviewCase[];
  save(reviewCases: readonly ReviewCase[]): void;
};

export type LocalStorageReviewCaseRepositoryOptions = {
  maxCases?: number;
  finalizedTtlMs?: number;
};

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && "localStorage" in window;
}

const FINAL_STATUSES = new Set<ReviewCase["status"]>([
  "resolved",
  "resumed",
  "dismissed",
]);

function removeExpiredFinalCases(
  reviewCases: ReviewCase[],
  ttlMs: number,
): ReviewCase[] {
  const cutoff = Date.now() - ttlMs;
  return reviewCases.filter((reviewCase) => {
    if (!FINAL_STATUSES.has(reviewCase.status)) return true;
    const activityTime = Date.parse(reviewCase.updatedAt);
    return !Number.isFinite(activityTime) || activityTime >= cutoff;
  });
}

export function createLocalStorageReviewCaseRepository(
  options: LocalStorageReviewCaseRepositoryOptions = {},
): ReviewCaseRepository {
  const maxCases = options.maxCases ?? MAX_REVIEW_CASES;
  const finalizedTtlMs = options.finalizedTtlMs ?? FINAL_REVIEW_CASE_TTL_MS;

  return {
  load(): ReviewCase[] {
    if (!canUseLocalStorage()) return [];

    try {
      const stored = window.localStorage.getItem(REVIEW_CASE_STORAGE_KEY);
      return stored
        ? removeExpiredFinalCases(
            migrateReviewCases(JSON.parse(stored) as unknown),
            finalizedTtlMs,
          )
        : [];
    } catch (error) {
      console.error("[FFN3 review] No se pudieron cargar los casos.", error);
      return [];
    }
  },

  save(reviewCases: readonly ReviewCase[]): void {
    if (!canUseLocalStorage()) return;

    const activeCases = reviewCases.filter(
      (reviewCase) => !FINAL_STATUSES.has(reviewCase.status),
    );
    const finalizedCases = removeExpiredFinalCases(
      reviewCases.filter((reviewCase) => FINAL_STATUSES.has(reviewCase.status)),
      finalizedTtlMs,
    );
    const casesToPersist = [...activeCases, ...finalizedCases]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, Math.max(maxCases, activeCases.length));
    assertSerializableReviewValue(casesToPersist);

    try {
      window.localStorage.setItem(
        REVIEW_CASE_STORAGE_KEY,
        JSON.stringify(casesToPersist),
      );
    } catch (error) {
      console.error("[FFN3 review] No se pudieron guardar los casos.", error);
    }
  },
  };
}

export const localStorageReviewCaseRepository =
  createLocalStorageReviewCaseRepository();
