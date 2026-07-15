import type {ReviewCandidate, ReviewIssue, ReviewJsonObject} from "../../types";
import type {ExternalNewsItem, ExternalSourceId} from "../../../sources/types";
import type {AutonomousCaseResolutionResult, AutonomousApplyResult} from "../../autonomous";

export type ExternalResolvedReference = {id: string; label: string} | null;
export type ExternalNewsRelationCandidate = ReviewCandidate & {relation: "discipline" | "organization" | "event" | "fighter" | "duplicate" | "image"; mention?: string};

export type ExternalNewsEditorialAnalysis = {
  relevancia?: "alta" | "media" | "baja" | "descartar";
  debeCrearNoticia?: boolean;
  necesitaRevisionManual?: boolean;
  razonRevisionManual?: string;
  disciplinaPrincipal?: string;
  organizacionPrincipal?: string;
  eventoPrincipal?: string;
  luchadoresPrincipales?: string[];
  luchadoresSecundarios?: string[];
  hechoPrincipal?: string;
  confianzaRelaciones?: number;
};

export type ExternalNewsResolved = {
  disciplina: ExternalResolvedReference;
  organizacion: ExternalResolvedReference;
  evento: ExternalResolvedReference;
  combate?: ({id: string; label: string; eventoId?: string; eventoLabel?: string} | null);
  luchadoresPrincipales: Array<{id: string; label: string}>;
  luchadoresSecundarios: Array<{id: string; label: string}>;
};

export type ExternalNewsReviewInput = {
  source: {id: ExternalSourceId; name: string};
  item: ExternalNewsItem;
  analysis: ExternalNewsEditorialAnalysis;
  resolved: ExternalNewsResolved;
  candidates?: ExternalNewsRelationCandidate[];
  duplicateCandidates?: ReviewCandidate[];
  imageCandidates?: ReviewCandidate[];
  warnings?: string[];
  operation?: "analyze" | "prepare" | "resolve" | "create_draft";
  now?: () => string;
};

export type ExternalNewsReviewContext = ReviewJsonObject & {
  producer: "external_news";
  sourceId: string;
  sourceName: string;
  sourceUrl?: string;
  externalItemId?: string;
  canonicalUrl?: string;
  title?: string;
  operation: "analyze" | "prepare" | "resolve" | "create_draft";
  payloadSnapshot: ReviewJsonObject;
  analysisSnapshot: ReviewJsonObject;
  unresolvedRelations: string[];
  createdAt: string;
};

export type ExternalNewsIssueDetection = {issues: ReviewIssue[]; hasBlockingIssues: boolean; hasRequiredIssues: boolean; warnings: string[]};
export type ExternalNewsReviewCaseResult = {status: "clean" | "created" | "updated" | "unchanged"; caseId?: string; issueCount: number; blockingIssueCount: number; requiredIssueCount: number};
export type ExternalNewsPilotReview = {required: boolean; caseId?: string; status: "not_needed" | "created" | "updated" | "partially_resolved" | "ready_for_future_resume" | "needs_more_evidence" | "error"; issueCount: number; resolvedIssueCount: number; pendingIssueCount: number; blockingPendingCount: number; autonomousAppliedCount: number; error?: string};
export type ExternalNewsReviewPilotResult = {review: ExternalNewsPilotReview; caseResult?: ExternalNewsReviewCaseResult; simulation?: AutonomousCaseResolutionResult; application?: AutonomousApplyResult; saveBlocked: boolean};
