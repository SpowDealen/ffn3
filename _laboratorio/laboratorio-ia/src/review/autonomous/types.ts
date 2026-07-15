import type {ReviewCase, ReviewIssue, ReviewResolution} from "../types";

export type AutonomousEvidence = {
  id: string;
  kind: "current_value" | "candidate" | "expected_constraint" | "relationship" | "snapshot" | "exact_match" | "validation" | "metadata";
  source: string;
  label: string;
  value?: unknown;
  confidence?: number;
  revision?: string;
  reason?: string;
};

export type AutonomousStrategy = "exact_match" | "current_value" | "candidate_ranking" | "reference_match" | "duplicate_analysis" | "primitive_validation" | "optional_discard" | "retry" | "combined";

export type AutonomousResolutionDecision = {
  issueId: string;
  status: "resolved" | "unresolved" | "needs_more_evidence" | "rejected";
  proposedResolution?: ReviewResolution;
  confidence: number;
  strategy: AutonomousStrategy;
  evidence: AutonomousEvidence[];
  reasoningSummary: string;
  alternativesRejected: Array<{id?: string; label: string; reason: string}>;
  warnings: string[];
  validation: {valid: boolean; errors: string[]};
  generatedAt: string;
};

export type AutonomousResolverOptions = {
  minimumConfidence?: number;
  allowOptionalDiscard?: boolean;
  allowPreparedEntity?: boolean;
  now?: () => string;
};

export type AutonomousCaseResolutionResult = {
  caseId: string;
  decisions: AutonomousResolutionDecision[];
  resolvedCount: number;
  unresolvedCount: number;
  needsMoreEvidenceCount: number;
  rejectedCount: number;
  canResolveAfterApplying: boolean;
  generatedAt: string;
};

export type AutonomousApplyResult = {
  caseId: string;
  applied: string[];
  skipped: Array<{issueId: string; reason: string}>;
  failed: Array<{issueId: string; error: string}>;
};

export type RunAutonomousReviewOptions = AutonomousResolverOptions & {dryRun?: boolean};
export type AutonomousReviewRunResult = AutonomousCaseResolutionResult & {dryRun: boolean; application?: AutonomousApplyResult};

export type StrategyContext = {caseData: ReviewCase; issue: ReviewIssue; options: Required<Omit<AutonomousResolverOptions, "now">>; generatedAt: string};
