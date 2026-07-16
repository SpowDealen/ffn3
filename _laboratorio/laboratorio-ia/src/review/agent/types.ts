import type {ReviewJsonObject, ReviewJsonValue} from "../types";

export type EditorialCapabilityEffect =
  | "read_local"
  | "read_external"
  | "write_review_store"
  | "create_entity"
  | "update_entity"
  | "save_draft"
  | "publish"
  | "resume_flow"
  | "notify";

export type EditorialCapabilityRisk = "none" | "low" | "medium" | "high" | "critical";
export type EditorialAgentFact = {key: string; value: ReviewJsonValue; source: string; confidence: number; observedAt: string};
export type EditorialAgentGoal = {id: string; objective: string; target: ReviewJsonObject; requiredOutcomes: string[]};
export type EditorialCapabilityManifest = {id: string; version: number; description: string; provides: string[]; requires: string[]; effects: EditorialCapabilityEffect[]; risk: EditorialCapabilityRisk; timeoutMs: number; priority: number; maxExecutionsPerRun: number};
export type EditorialCapabilityContext = {goal: EditorialAgentGoal; facts: EditorialAgentFact[]; artifacts: EditorialAgentArtifact[]; now: string; signal: AbortSignal};
export type EditorialCapabilityResult = {status: "completed" | "not_applicable" | "needs_input" | "failed"; producedOutcomes: string[]; facts: EditorialAgentFact[]; artifact?: ReviewJsonObject; reasoningSummary: string; evidence: Array<{label: string; source: string; value?: ReviewJsonValue}>; warnings: string[]; error?: {code: string; message: string}};
export type EditorialCapabilityAdapter = {manifest: EditorialCapabilityManifest; supports(goal: EditorialAgentGoal, facts: readonly EditorialAgentFact[]): boolean; execute(context: EditorialCapabilityContext): Promise<EditorialCapabilityResult>};
export type EditorialAgentPlanStep = {id: string; capabilityId: string; capabilityVersion: number; requires: string[]; provides: string[]; effects: EditorialCapabilityEffect[]; reason: string};
export type EditorialAgentPlan = {id: string; goal: EditorialAgentGoal; steps: EditorialAgentPlanStep[]; unresolvedOutcomes: string[]; generatedAt: string; version: number};
export type EditorialAgentArtifact = {stepId: string; capabilityId: string; status: EditorialCapabilityResult["status"]; producedOutcomes: string[]; data?: ReviewJsonObject; reasoningSummary: string; evidence: EditorialCapabilityResult["evidence"]; warnings: string[]; error?: {code: string; message: string}; startedAt: string; completedAt: string};
export type EditorialAgentPolicy = {allowedEffects: EditorialCapabilityEffect[]; maximumRisk: EditorialCapabilityRisk; maximumSteps: number; maximumDurationMs: number};
export type EditorialAgentRunOptions = {policy?: Partial<EditorialAgentPolicy>; initialFacts?: EditorialAgentFact[]; now?: () => string};
export type EditorialAgentRun = {runId: string; status: "completed" | "partially_completed" | "needs_capability" | "blocked_by_policy" | "failed"; goal: EditorialAgentGoal; plan: EditorialAgentPlan; facts: EditorialAgentFact[]; artifacts: EditorialAgentArtifact[]; satisfiedOutcomes: string[]; unresolvedOutcomes: string[]; policy: EditorialAgentPolicy; reasoningSummary: string; warnings: string[]; generatedAt: string; completedAt: string};
