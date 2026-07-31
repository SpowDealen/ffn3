import type {GlobalResolutionPlan} from "../globalResolution";
import type {ReviewCase, ReviewJsonObject} from "../types";

export const FIGHTER_RESOLUTION_REQUEST_VERSION = "1.0.0" as const;
export const FIGHTER_RESOLUTION_PRODUCERS = ["ufc_events", "one_events", "bkfc_events", "fekm_participants"] as const;
export type FighterResolutionProducer = typeof FIGHTER_RESOLUTION_PRODUCERS[number];
export type FighterResolutionExternalIdentifier = Readonly<{namespace: string; value: string}>;
export type FighterResolutionRequest = Readonly<{
  requestVersion: typeof FIGHTER_RESOLUTION_REQUEST_VERSION;
  requestId: string;
  producer: FighterResolutionProducer;
  source: "ufc" | "one" | "bkfc" | "fekm";
  sourceReference: Readonly<{kind: "event" | "participant_document"; id: string; itemId?: string}>;
  identity: Readonly<{primaryLabel: string; normalizedLabel: string; aliases: readonly string[]; externalIdentifiers: readonly FighterResolutionExternalIdentifier[]}>;
  creation: Readonly<{disciplineId: string; organizationId: string; weightCategoryId?: string}>;
  requestFingerprint: string;
  idempotencyKey: string;
  requestedAt: string;
}>;
export type FighterResolutionProposal = Readonly<{
  request: FighterResolutionRequest;
  reviewCase: ReviewCase;
  plan: GlobalResolutionPlan;
  guardOperationId: string;
  creationOperationId: string;
}>;
export type FighterResolutionIntakeItem = Readonly<{
  status: "planned" | "blocked" | "rejected" | "unavailable";
  requestId?: string;
  caseId?: string;
  operationId?: string;
  guardOperationId?: string;
  reasonCode?: string;
  proposal?: FighterResolutionProposal;
}>;
export type FighterResolutionIntakeResponse = Readonly<{
  ok: boolean;
  outcome: "planned" | "blocked" | "rejected" | "unavailable";
  producer: FighterResolutionProducer;
  items: readonly FighterResolutionIntakeItem[];
  summary: Readonly<{received: number; planned: number; blocked: number; rejected: number; created: 0}>;
  registrationRequired: true;
  action: Readonly<{kind: "open_review_center"; path: "/revision"}>;
  error?: string;
}>;
export type FighterResolutionRegistrationResult = Readonly<{
  status: "accepted" | "already_registered" | "blocked";
  caseId: string;
  operationId: string;
  guardOperationId: string;
  reasonCode?: string;
}>;
export type FighterResolutionSafeContext = ReviewJsonObject;
