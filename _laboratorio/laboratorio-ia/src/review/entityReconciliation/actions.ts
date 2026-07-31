import type {ReviewCase} from "../types";
import {buildReconciliationReviewCases} from "./cases";
import {scanExistingEntities} from "./service";
import type {EntityCorpusReadAdapter, ReconciliationDecisionRequest, ReconciliationScanResult} from "./types";
import {applyReconciliationDecision, validateReconciliationDecisionRequest} from "./workflow";

export type ReconciliationScanActionResult = Readonly<{ok: true; scan: ReconciliationScanResult; cases: ReviewCase[]}>;
export async function executeReconciliationScanAction(adapter: EntityCorpusReadAdapter, body: unknown, signal?: AbortSignal, now = new Date()): Promise<ReconciliationScanActionResult> {
  const scan = await scanExistingEntities(adapter, body, signal, now);
  return Object.freeze({ok: true, scan, cases: buildReconciliationReviewCases(scan)});
}
export function executeReconciliationDecisionAction(reviewCase: ReviewCase, body: unknown, now = new Date()): {request: ReconciliationDecisionRequest; context: ReviewCase["context"]} {
  const request = validateReconciliationDecisionRequest(body);
  return {request, context: applyReconciliationDecision(reviewCase, request, now)};
}
