import type {AgentAuthorityOwner} from "../agent-ready/model";
import type {AgentDiagnosis, AgentObservationEvent, AgentProposal, AgentProposalAuthority, AgentReasoningContext, AgentReevaluationTarget} from "./model";

const AUTHORITY_NAMES: Readonly<Record<AgentAuthorityOwner, AgentProposalAuthority>> = Object.freeze({
  notification_store: "Notification Store",
  review_center: "Review Center",
  au7_transaction: "AU7",
  au8_supervised: "AU8",
  les4_live_checks: "LES 4 live checks",
  process_origin: "Process origin",
  ui_navigation: "UI navigation",
  existing_authority: "Existing authority",
});

const REEVALUATION = Object.freeze({
  "Notification Store": Object.freeze(["notification_delivery", "global_status"]),
  "Review Center": Object.freeze(["review_case", "process_state", "dependencies"]),
  AU7: Object.freeze(["transaction_result", "checkpoint", "reconciliation"]),
  AU8: Object.freeze(["supervised_loop_state", "checkpoint", "observed_effects"]),
  "LES 4 live checks": Object.freeze(["global_status", "dependencies", "operator_signals"]),
  "Process origin": Object.freeze(["process_state", "operator_signals"]),
  "UI navigation": Object.freeze(["operator_signals"]),
  "Existing authority": Object.freeze(["operator_signals", "capability_availability"]),
} as const satisfies Readonly<Record<AgentProposalAuthority, readonly AgentReevaluationTarget[]>>);

const ACTIONS: Readonly<Record<AgentProposalAuthority, string>> = Object.freeze({
  "Notification Store": "handoff_notification_retry",
  "Review Center": "handoff_review_resolution",
  AU7: "handoff_transaction_execution",
  AU8: "handoff_supervised_execution",
  "LES 4 live checks": "request_read_only_refresh",
  "Process origin": "handoff_process_authority",
  "UI navigation": "navigate_to_authority_surface",
  "Existing authority": "request_authority_review",
});

export function mapProposalAuthority(owner: AgentAuthorityOwner | undefined): AgentProposalAuthority {
  return owner ? AUTHORITY_NAMES[owner] : "Existing authority";
}

function relatedEvent(diagnosis: AgentDiagnosis, context: AgentReasoningContext): AgentObservationEvent | undefined {
  const evidence = new Set(diagnosis.evidence.map((item) => item.id));
  return context.diff.events.find((event) => evidence.has(event.id));
}

function reviewDestination(diagnosis: AgentDiagnosis, context: AgentReasoningContext): string | undefined {
  if (diagnosis.category !== "dependency_blocks_review") return undefined;
  return context.snapshot.review.find((review) => review.temporal === "current")?.destination;
}

export function buildAgentProposals(diagnoses: readonly AgentDiagnosis[], context: AgentReasoningContext): readonly AgentProposal[] {
  const proposals = diagnoses.map((diagnosis) => {
    const event = relatedEvent(diagnosis, context);
    const authority = mapProposalAuthority(diagnosis.authority ?? event?.authority);
    const blockedByCapability = event?.type === "capability_blocked";
    const blocked = !diagnosis.actionable || blockedByCapability;
    return Object.freeze({
      id: `ag1-proposal:${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      action: diagnosis.actionable ? ACTIONS[authority] : "observe_more_evidence",
      authority,
      destination: event?.current?.destination ?? event?.previous?.destination ?? reviewDestination(diagnosis, context),
      requiresAuthorization: Boolean(event?.current?.requiresAuthorization),
      destructive: Boolean(event?.current?.destructive),
      blocked,
      reason: blockedByCapability ? event?.reason ?? "capability_blocked_by_authority" : !diagnosis.actionable ? "diagnosis_not_actionable" : undefined,
      reevaluateAfter: REEVALUATION[authority],
    });
  });
  return Object.freeze(proposals.sort((left, right) => left.id.localeCompare(right.id)));
}

export const agentProposalSecurity = Object.freeze({pure: true, deterministic: true, handoffOnly: true, agentIsAuthority: false, fetches: false, persists: false, writes: false, executes: false, invokesAuthority: false, reevaluates: false, usesClock: false, usesRandomness: false} as const);
