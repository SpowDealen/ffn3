import type {ReviewCase, ReviewIssue} from "../types";
import type {AutonomousEvidence} from "./types";
import {normalizeConfidence} from "./normalization";

export function collectEvidence(caseData: ReviewCase, issue: ReviewIssue): AutonomousEvidence[] {
  const evidence: AutonomousEvidence[] = [];
  if (issue.currentValue !== undefined) evidence.push({id: `${issue.id}:current`, kind: "current_value", source: "issue.currentValue", label: "Valor actual", value: issue.currentValue});
  if (issue.expected) evidence.push({id: `${issue.id}:expected`, kind: "expected_constraint", source: "issue.expected", label: "Restricciones esperadas", value: issue.expected});
  issue.candidates?.forEach((candidate) => evidence.push({id: `${issue.id}:candidate:${candidate.id}`, kind: "candidate", source: "issue.candidates", label: candidate.label, value: candidate.value, confidence: normalizeConfidence(candidate.confidence), revision: candidate.sanityRevision ?? candidate.snapshotRevision, reason: candidate.reasons?.join("; ")}));
  issue.evidence?.forEach((value, index) => evidence.push({id: `${issue.id}:evidence:${index}`, kind: "metadata", source: "issue.evidence", label: "Evidencia persistida", value}));
  if (Object.keys(caseData.context).length) evidence.push({id: `${issue.id}:context`, kind: "metadata", source: "case.context", label: "Contexto persistido", value: caseData.context});
  return evidence;
}
