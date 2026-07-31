import type {ReviewCase} from "../../types";

export type GlobalResolutionInspectorId = string;

export type GlobalResolutionInspectionSubject = {
  entityType?: string;
  expectedId?: string;
  identityKey?: string;
  sourceId?: string;
  sourceUrl?: string;
  expectedReferences?: Array<{field: string; targetId: string}>;
  expectedPayloadFingerprint?: string;
};

export type GlobalResolutionInspectionRequest = {
  inspectorId?: GlobalResolutionInspectorId;
  caseId: string;
  producer: string;
  producerVersion?: string;
  manifestVersion?: string;
  manifestFingerprint?: string;
  capability: string;
  capabilityVersion?: string;
  operationId: string;
  operationFingerprint: string;
  checkpointFingerprint: string;
  checkpointVersion?: number;
  caseVersion: number;
  inspectorVersion?: string;
  inspectionGeneration?: number;
  subject: GlobalResolutionInspectionSubject;
  requestedAt: string;
};

export type GlobalResolutionObservation =
  | {kind: "entity_exists"; entityType: string; entityId: string; identityKey?: string; payloadFingerprint?: string}
  | {kind: "entity_missing"; entityType: string; expectedId?: string; identityKey?: string}
  | {kind: "reference_exists"; ownerId: string; field: string; targetId: string}
  | {kind: "reference_missing"; ownerId: string; field: string; targetId: string}
  | {kind: "payload_matches"; entityId: string; expectedFingerprint: string; actualFingerprint: string}
  | {kind: "payload_differs"; entityId: string; expectedFingerprint: string; actualFingerprint: string}
  | {kind: "multiple_candidates"; entityType: string; candidateIds: string[]; identityKey?: string}
  | {kind: "service_unavailable"; reason: string};

export type GlobalResolutionInspectionStatus = "observed" | "not_observed" | "ambiguous" | "unavailable" | "unsupported";

export type GlobalResolutionInspectionEvidence = {
  inspectorId: string;
  inspectorVersion: string;
  inspectionId: string;
  producer: string;
  producerVersion?: string;
  manifestVersion?: string;
  manifestFingerprint?: string;
  capability: string;
  capabilityVersion?: string;
  operationId: string;
  operationFingerprint: string;
  checkpointFingerprint: string;
  checkpointVersion?: number;
  inspectionGeneration?: number;
  inspectedAt: string;
  status: GlobalResolutionInspectionStatus;
  observations: GlobalResolutionObservation[];
  warnings: string[];
  fingerprint: string;
};

export type GlobalResolutionInspectorCompatibility =
  | {supported: true; specificity: number}
  | {supported: false; reason: "producer_unsupported" | "capability_unsupported" | "subject_incomplete" | "version_unsupported"};

export type GlobalResolutionInspectionContext = {
  signal?: AbortSignal;
  now: () => string;
};

export interface GlobalResolutionEffectInspector {
  readonly id: string;
  readonly version: string;
  supports(request: GlobalResolutionInspectionRequest): GlobalResolutionInspectorCompatibility;
  inspect(request: GlobalResolutionInspectionRequest, context: GlobalResolutionInspectionContext): Promise<GlobalResolutionInspectionEvidence>;
}

export type GlobalResolutionInspectionFailureCode =
  | "invalid_request"
  | "checkpoint_conflict"
  | "operation_conflict"
  | "inspector_not_found"
  | "inspector_ambiguous"
  | "unsupported"
  | "inspection_failed"
  | "incompatible_inspector"
  | "wrong_producer_evidence"
  | "wrong_operation_evidence"
  | "stale_generation"
  | "aborted";

export type GlobalResolutionInspectionFailure = {
  code: GlobalResolutionInspectionFailureCode;
  message: string;
  retryable: boolean;
};

export type GlobalResolutionInspectionResult =
  | {ok: true; evidence: GlobalResolutionInspectionEvidence; inspector: {id: string; version: string}}
  | ({ok: false} & GlobalResolutionInspectionFailure);

export type GlobalResolutionInspectionCaseReader = (caseId: string) => ReviewCase | undefined | Promise<ReviewCase | undefined>;

export const globalResolutionInspectionSecurity = Object.freeze({
  readOnly: true,
  executesCapabilities: false,
  executesProducers: false,
  executesResume: false,
  mutatesReviewCase: false,
  mutatesCheckpoint: false,
  persistsEvidence: false,
  persistsCredentials: false,
  automaticExecution: false,
  genericQueries: false,
} as const);
