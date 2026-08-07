import type {ReviewCase} from "../types";
import {createEntityResolutionEngine} from "../entityResolution/factory";
import type {EntityCorpusReadAdapter, ReconciliationDecisionRequest, ReconciliationScanResult} from "./types";
import {validateCorpusScanRequest} from "./service";
import {applyReconciliationDecision, validateReconciliationDecisionRequest} from "./workflow";

export type ReconciliationScanActionResult = Readonly<{ok: true; scan: ReconciliationScanResult; cases: ReviewCase[]}>;
export async function executeReconciliationScanAction(adapter: EntityCorpusReadAdapter, body: unknown, signal?: AbortSignal, now = new Date()): Promise<ReconciliationScanActionResult> {
  const scanRequest = validateCorpusScanRequest(body);
  const engine = createEntityResolutionEngine({reconciliationAdapter: adapter}, {clock: () => now, monotonic: () => 0});
  const result = await engine.resolve({version: 1, mode: "existing_reconciliation", entityType: scanRequest.kind, producer: "review-center", source: adapter.adapterId === "dev.in-memory" ? "dev.in-memory" : "sanity", scan: scanRequest}, {signal});
  if (result.mode !== "existing_reconciliation" || !result.existingReconciliation) throw new Error(result.error?.reasonCode ?? result.reasonCode);
  return Object.freeze({ok: true, scan: result.existingReconciliation.scan, cases: [...result.existingReconciliation.cases]});
}
export function executeReconciliationDecisionAction(reviewCase: ReviewCase, body: unknown, now = new Date()): {request: ReconciliationDecisionRequest; context: ReviewCase["context"]} {
  const request = validateReconciliationDecisionRequest(body);
  return {request, context: applyReconciliationDecision(reviewCase, request, now)};
}
