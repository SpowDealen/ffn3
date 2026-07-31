export const SANITY_EXTERNAL_NEWS_INSPECTOR_ID = "sanity:external_news-effects";
export const SANITY_EXTERNAL_NEWS_INSPECTOR_VERSION = "1.0.0";

export type SanityFighterByIdentityRequest = {
  kind: "fighter_by_identity";
  identityKey: string;
  expectedId?: string;
  expectedPayloadFingerprint?: string;
};

export type SanityNewsDocumentRequest = {
  kind: "news_document";
  documentId: string;
  expectedPayloadFingerprint?: string;
};

export type SanityNewsFighterReferenceRequest = {
  kind: "news_fighter_reference";
  documentId: string;
  fighterId: string;
  field: "luchadores";
};

export type SanityInspectionReadRequest =
  | SanityFighterByIdentityRequest
  | SanityNewsDocumentRequest
  | SanityNewsFighterReferenceRequest;

export type SanityFighterCandidate = {
  entityId: string;
  identityKey: string;
  payloadFingerprint: string;
};

export type SanityNewsDocumentCandidate = {
  entityId: string;
  payloadFingerprint: string;
  au3PayloadFingerprint: string;
};

export type SanityInspectionReadResult =
  | {kind: "fighter_by_identity"; candidates: SanityFighterCandidate[]}
  | {kind: "news_document"; documents: SanityNewsDocumentCandidate[]}
  | {kind: "news_fighter_reference"; documentExists: boolean; referenceExists: boolean; observedDocumentId?: string};

export interface SanityExternalNewsReadExecutor {
  read(request: SanityInspectionReadRequest, options: {signal?: AbortSignal}): Promise<SanityInspectionReadResult>;
}
const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const fingerprint = (value: unknown): value is string => text(value) && /^sha256-v1:[a-z0-9]+$/i.test(value);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every((key) => allowed.includes(key));

export function parseSanityInspectionReadRequest(value: unknown): SanityInspectionReadRequest | undefined {
  if (!record(value) || !text(value.kind)) return undefined;
  if (value.kind === "fighter_by_identity") {
    if (!exactKeys(value, ["kind", "identityKey", "expectedId", "expectedPayloadFingerprint"]) || !text(value.identityKey)) return undefined;
    if (value.expectedId !== undefined && !text(value.expectedId)) return undefined;
    if (value.expectedPayloadFingerprint !== undefined && !fingerprint(value.expectedPayloadFingerprint)) return undefined;
    return {
      kind: value.kind,
      identityKey: value.identityKey.trim(),
      expectedId: text(value.expectedId) ? value.expectedId.trim() : undefined,
      expectedPayloadFingerprint: fingerprint(value.expectedPayloadFingerprint) ? value.expectedPayloadFingerprint : undefined,
    };
  }
  if (value.kind === "news_document") {
    if (!exactKeys(value, ["kind", "documentId", "expectedPayloadFingerprint"]) || !text(value.documentId)) return undefined;
    if (value.expectedPayloadFingerprint !== undefined && !fingerprint(value.expectedPayloadFingerprint)) return undefined;
    return {
      kind: value.kind,
      documentId: value.documentId.trim(),
      expectedPayloadFingerprint: fingerprint(value.expectedPayloadFingerprint) ? value.expectedPayloadFingerprint : undefined,
    };
  }
  if (value.kind === "news_fighter_reference") {
    if (!exactKeys(value, ["kind", "documentId", "fighterId", "field"]) || !text(value.documentId) || !text(value.fighterId) || value.field !== "luchadores") return undefined;
    return {kind: value.kind, documentId: value.documentId.trim(), fighterId: value.fighterId.trim(), field: "luchadores"};
  }
  return undefined;
}
