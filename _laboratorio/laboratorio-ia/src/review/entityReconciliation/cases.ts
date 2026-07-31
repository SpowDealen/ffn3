import type {ReviewCase, ReviewJsonObject, ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import {getReviewCases, registerCanonicalReviewCase, transitionReviewCase, updateReviewCaseContextIfCurrent} from "../store/reviewStore";
import type {DuplicateGroup, ReconciliationCheckpoint, ReconciliationScanResult} from "./types";
import {reconciliationFailure} from "./errors";

const fp = (value: unknown) => computeUniversalFingerprint(value as ReviewJsonValue);
const asJson = <T>(value: T) => structuredClone(value) as unknown as ReviewJsonObject;

export function buildReconciliationReviewCase(group: DuplicateGroup, scan: ReconciliationScanResult): ReviewCase {
  const caseId = `entity-reconciliation:${fp({group: group.groupFingerprint, rules: scan.rulesVersion, scope: scan.scope})}`;
  const checkpoint: ReconciliationCheckpoint = {version: 1, rulesVersion: scan.rulesVersion, scope: scan.scope, scanFingerprint: scan.scanFingerprint, groupFingerprint: group.groupFingerprint, group, scanStatus: scan.status, state: group.state};
  const label = {fighter: "luchadores", event: "eventos", organization: "organizaciones", weight_category: "categorías de peso"}[group.kind];
  return {schemaVersion: 1, id: caseId, dedupeKey: caseId, module: "entity.reconciliation", title: `Posibles duplicados de ${label}`, status: "open", priority: group.state === "blocked" ? "high" : "normal", source: "sanity-read-only", subject: {type: group.kind, id: group.groupId, label: group.members.map((item) => item.label).join(" / ")}, issues: [{id: `${caseId}:decision`, kind: "duplicate_candidate", valueKind: group.kind === "weight_category" ? "category" : group.kind, label: "Hipótesis de duplicado", message: "La evidencia requiere una decisión humana explícita.", required: true, blocking: true, candidates: group.members.map((member) => ({id: member.logicalId, label: member.label, value: member.logicalId, entityType: group.kind, sanityId: member.logicalId, reasons: group.canonical.logicalId === member.logicalId ? group.canonical.reasons : ["Alternativa de canónico."]})), evidence: group.pairs.flatMap((pair) => pair.evidence.map((item) => item.explanation))}], resolutions: [], context: {entityReconciliation: asJson(checkpoint)}, createdAt: scan.scannedAt, updatedAt: scan.scannedAt, version: 1, resumeAttempts: 0};
}

export function buildReconciliationReviewCases(scan: ReconciliationScanResult): ReviewCase[] { return scan.groups.map((group) => buildReconciliationReviewCase(group, scan)); }

export function registerReconciliationReviewCase(proposal: ReviewCase): {status: "accepted" | "already_registered"; reviewCase: ReviewCase} {
  const next = readReconciliationCheckpoint(proposal); const nextMembers = next.group.members.map((item) => item.logicalId).sort().join("|");
  for (const existing of getReviewCases().filter((item) => item.module === "entity.reconciliation" && item.id !== proposal.id)) {
    try {
      const previous = readReconciliationCheckpoint(existing); const previousMembers = previous.group.members.map((item) => item.logicalId).sort().join("|");
      if (previous.group.kind !== next.group.kind || previous.scope !== next.scope || previousMembers !== nextMembers || previous.groupFingerprint === next.groupFingerprint) continue;
      const context = {...existing.context, entityReconciliation: asJson({...previous, state: "stale" as const})};
      const updated = updateReviewCaseContextIfCurrent(existing.id, existing.version, context);
      if (updated && updated.status !== "stale" && ["open", "in_review", "resolved", "resuming", "resume_failed"].includes(updated.status)) transitionReviewCase(updated.id, "stale");
    } catch { /* unrelated or invalid historical cases do not block a fresh safe proposal */ }
  }
  return registerCanonicalReviewCase(proposal);
}

export function readReconciliationCheckpoint(reviewCase: ReviewCase): ReconciliationCheckpoint {
  const value = reviewCase.context.entityReconciliation;
  if (!value || typeof value !== "object" || Array.isArray(value)) reconciliationFailure("reconciliation_checkpoint_missing");
  const checkpoint = structuredClone(value) as unknown as ReconciliationCheckpoint;
  if (checkpoint.version !== 1 || typeof checkpoint.rulesVersion !== "string" || !["all", "recent"].includes(checkpoint.scope) || !["complete", "partial", "truncated", "unavailable", "cancelled"].includes(checkpoint.scanStatus) || !["candidate", "needs_review", "inconclusive", "blocked", "confirmed_duplicate", "not_duplicate", "deferred", "stale"].includes(checkpoint.state) || !checkpoint.group || checkpoint.groupFingerprint !== checkpoint.group.groupFingerprint || !checkpoint.group.members?.length) reconciliationFailure("reconciliation_checkpoint_invalid");
  if (!["fighter", "event", "organization", "weight_category"].includes(checkpoint.group.kind) || reviewCase.module !== "entity.reconciliation" || reviewCase.subject.type !== checkpoint.group.kind) reconciliationFailure("reconciliation_checkpoint_kind_mismatch");
  const ids = checkpoint.group.members.map((item) => item.logicalId);
  if (new Set(ids).size !== ids.length || checkpoint.group.members.some((member) => member.kind !== checkpoint.group.kind || !member.logicalId || !member.snapshotFingerprint || !member.identityFingerprint || !Array.isArray(member.variants) || member.variants.length === 0 || member.variants.some((variant) => !variant.documentId || !["draft", "published"].includes(variant.variant) || !variant.contentFingerprint))) reconciliationFailure("reconciliation_members_invalid");
  if (!ids.includes(checkpoint.group.canonical.logicalId) || checkpoint.group.pairs.some((pair) => pair.memberIds.some((id) => !ids.includes(id)))) reconciliationFailure("reconciliation_group_binding_invalid");
  if (checkpoint.decision && (checkpoint.decision.expectedGroupFingerprint !== checkpoint.groupFingerprint || !checkpoint.decision.actor || (checkpoint.decision.canonicalLogicalId && !ids.includes(checkpoint.decision.canonicalLogicalId)))) reconciliationFailure("reconciliation_decision_invalid");
  return checkpoint;
}
