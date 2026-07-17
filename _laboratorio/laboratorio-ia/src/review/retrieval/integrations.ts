import {getReviewCase} from "../store/reviewStore";
import {buildRetrievalQuery} from "./buildRetrievalQuery";
import {persistRetrieval} from "./retrievalStore";
function requireCaseIssue(caseId: string, issueId: string) { const reviewCase = getReviewCase(caseId); if (!reviewCase) throw new Error("review_case_not_found"); const issue = reviewCase.issues.find((item) => item.id === issueId); if (!issue) throw new Error("review_issue_not_found"); return {reviewCase, issue}; }
export function buildDecisionRetrievalQuery(caseId: string, issueId: string) { const {reviewCase, issue} = requireCaseIssue(caseId, issueId); return buildRetrievalQuery(reviewCase, issue); }
export function retrieveRelevantDecisionMemories(caseId: string, issueId: string) { return persistRetrieval(buildDecisionRetrievalQuery(caseId, issueId)); }
