import type {ReviewCase} from "../../review/types";
import {createDecisionSupportFixture} from "../context/decisions";
import {createAgentContextComposerReviewCases} from "../context/fixtures";

export const AGENT_WORKSPACE_FIXTURE_QUERY = "agent-workspace" as const;

const VISIBLE_CONTEXT_ITEMS = Object.freeze([
  "review:case:ufc:identity",
  "fixture:bkfc:clear",
  "editorial:ag2-insight:ag2-signal:evidence_conflicting:evento:event:conflicting:evidence:conflict",
  "review:case:external:dismissed",
]);

function clearRecommendationReviewCase(reviewCases: readonly ReviewCase[]): ReviewCase {
  const base = reviewCases.find((reviewCase) => reviewCase.id === "case:bkfc:ready")!;
  return {
    ...structuredClone(base),
    id: "case:fixture:bkfc:clear",
    dedupeKey: "dev:ag4:clear-recommendation",
    title: "Organización BKFC respaldada por la evidencia",
    context: {...structuredClone(base.context), devOnly: true, readOnly: true, agentWorkspaceFixture: true},
  };
}

export function buildAgentWorkspaceFixture() {
  const decisionFixture = createDecisionSupportFixture();
  const reviewCases = createAgentContextComposerReviewCases();
  const decisions = Object.freeze(VISIBLE_CONTEXT_ITEMS.map((contextItemId) => decisionFixture.decisions.find((decision) => decision.trace.contextItemId === contextItemId)!));
  return Object.freeze({
    decisions,
    reviewCases: Object.freeze([...structuredClone(reviewCases), clearRecommendationReviewCase(reviewCases)]),
  });
}

export const agentWorkspaceFixtureSecurity = Object.freeze({
  pure: true,
  deterministic: true,
  devOnly: true,
  readOnly: true,
  createsStore: false,
  persists: false,
  fetches: false,
  writes: false,
  executes: false,
  accessesSanity: false,
  accessesTelegram: false,
  accessesExternalApis: false,
  invokesAu7: false,
  invokesAu8: false,
} as const);
