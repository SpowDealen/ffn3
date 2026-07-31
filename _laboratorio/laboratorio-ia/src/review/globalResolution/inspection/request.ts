import type {ReviewCase} from "../../types";
import {createExternalNewsInspectionRequestContractRegistry} from "./sanity/requestContracts";
import {buildUniversalGlobalResolutionInspectionRequest} from "./universalRequest";
import type {GlobalResolutionInspectionRequest} from "./types";
import {createGlobalResolutionProducerRuntime, producerCaseInputFromReviewCase} from "../producers";

export type GlobalResolutionInspectionRequestBuildResult =
  | {ok: true; request: GlobalResolutionInspectionRequest}
  | {ok: false; code: "checkpoint_missing" | "operation_missing" | "capability_unsupported" | "subject_incomplete"};

export function buildGlobalResolutionInspectionRequest(input: {
  reviewCase: ReviewCase;
  operationId: string;
  inspectorId?: string;
  inspectorVersion?: string;
  inspectionGeneration?: number;
  requestedAt: string;
  requireCompleteSubject?: boolean;
}): GlobalResolutionInspectionRequestBuildResult {
  const runtime = createGlobalResolutionProducerRuntime();
  const producer = runtime.producers.resolveProducerForCase(producerCaseInputFromReviewCase(input.reviewCase));
  if (producer.status !== "resolved") return {ok: false, code: "capability_unsupported"};
  const adapter = runtime.producers.resolveAdapter(producer.producer.manifest.producerId, "inspection_request_builder");
  if (adapter.status !== "resolved") return {ok: false, code: "capability_unsupported"};
  return buildUniversalGlobalResolutionInspectionRequest({...input, contracts: createExternalNewsInspectionRequestContractRegistry()});
}
