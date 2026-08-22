import type {InteractionCapability} from "../interactions/model";
import type {LabNotification} from "../notifications/types";
import type {OperatorExperienceModel} from "../operator/model";
import type {ProcessExperiencePresentation} from "../processes/presentation";
import type {ReviewCase, ReviewJsonValue} from "../review/types";
import {computeUniversalFingerprint} from "../review/universal/fingerprints";
import type {GlobalStatusModel} from "../status/model";
import {projectAgentCapability, projectAgentDependencies, projectAgentNotifications, projectAgentOperator, projectAgentProcesses, projectAgentReview} from "./adapters";
import {AGENT_READY_CONTRACT_VERSION, type AgentSnapshot, type AgentSnapshotChange, type AgentSnapshotChangeKind, type AgentSnapshotDiff} from "./model";

export type AgentSnapshotInput = Readonly<{
  observedAt: string;
  globalStatus: GlobalStatusModel;
  operator: OperatorExperienceModel;
  processes: readonly ProcessExperiencePresentation[];
  notifications: readonly LabNotification[];
  reviewCases: readonly ReviewCase[];
  capabilities: readonly InteractionCapability[];
}>;

function semanticSnapshot(input: Omit<AgentSnapshot, "observationId" | "observationFingerprint" | "observedAt">): ReviewJsonValue {
  const globalStatus = {...input.globalStatus, evaluatedAt: undefined};
  const dependencies = input.dependencies.map(({checkedAt: _checkedAt, ...entry}) => entry);
  return {...input, globalStatus, dependencies} as unknown as ReviewJsonValue;
}

export function buildAgentSnapshot(input: AgentSnapshotInput): AgentSnapshot {
  const dependencies = Object.freeze(projectAgentDependencies(input.globalStatus));
  const processes = Object.freeze(projectAgentProcesses(input.processes));
  const notifications = Object.freeze(projectAgentNotifications(input.notifications));
  const review = Object.freeze(projectAgentReview(input.reviewCases));
  const capabilities = Object.freeze([...input.capabilities].sort((left, right) => left.id.localeCompare(right.id)).map(projectAgentCapability));
  const base = Object.freeze({
    schemaVersion: 1 as const,
    contractVersion: AGENT_READY_CONTRACT_VERSION,
    globalStatus: Object.freeze({state: input.globalStatus.state, label: input.globalStatus.label, evaluatedAt: input.globalStatus.evaluatedAt, currentIncidentCount: input.globalStatus.currentIncidentCount, activeProcessCount: input.globalStatus.activeProcessCount, historicalRecordCount: input.globalStatus.historicalRecordCount}),
    operator: projectAgentOperator(input.operator),
    dependencies,
    processes,
    notifications,
    review,
    capabilities,
    boundary: Object.freeze({readOnly: true as const, projectionOnly: true as const, executes: false as const, persists: false as const, plans: false as const, decidesAutonomy: false as const}),
  });
  const observationFingerprint = computeUniversalFingerprint(semanticSnapshot(base));
  return Object.freeze({...base, observationId: `agent-observation:${observationFingerprint}`, observationFingerprint, observedAt: input.observedAt});
}

function change(kind: AgentSnapshotChangeKind, entityId: string, from?: string, to?: string): AgentSnapshotChange {
  return Object.freeze({id: `agent-change:${kind}:${entityId}`, kind, entityId, from, to});
}

function byId<T extends Readonly<{id: string}>>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

const DEGRADED = new Set(["unavailable", "blocked", "degraded"]);

export function compareAgentSnapshots(previous: AgentSnapshot, current: AgentSnapshot): AgentSnapshotDiff {
  const changes: AgentSnapshotChange[] = [];
  const previousAttention = byId(previous.operator.attention);
  const currentAttention = byId(current.operator.attention);
  for (const [id, item] of currentAttention) if (!previousAttention.has(id) && item.kind === "blocker") changes.push(change("blocker_added", id));
  for (const [id, item] of previousAttention) if (!currentAttention.has(id) && item.kind === "blocker") changes.push(change("blocker_resolved", id));
  const previousProcesses = byId(previous.processes);
  const currentProcesses = byId(current.processes);
  for (const [id, item] of currentProcesses) if (item.active && !previousProcesses.get(id)?.active) changes.push(change("process_started", id));
  for (const [id, item] of previousProcesses) if (item.active && !currentProcesses.get(id)?.active) changes.push(change("process_finished", id));
  const previousReview = byId(previous.review);
  const currentReview = byId(current.review);
  for (const [id, item] of currentReview) if (item.temporal === "current" && previousReview.get(id)?.temporal !== "current") changes.push(change("review_added", id));
  for (const [id, item] of previousReview) if (item.temporal === "current" && currentReview.get(id)?.temporal !== "current") changes.push(change("review_resolved", id));
  const previousDependencies = byId(previous.dependencies);
  for (const item of current.dependencies) {
    const before = previousDependencies.get(item.id);
    if (!before) continue;
    if (!DEGRADED.has(before.state) && DEGRADED.has(item.state)) changes.push(change("health_degraded", item.id, before.state, item.state));
    if (DEGRADED.has(before.state) && !DEGRADED.has(item.state)) changes.push(change("health_recovered", item.id, before.state, item.state));
  }
  const previousCapabilities = byId(previous.capabilities);
  for (const item of current.capabilities) {
    const before = previousCapabilities.get(item.id);
    if (before && before.availability !== item.availability) changes.push(change("capability_changed", item.id, before.availability, item.availability));
  }
  changes.sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({fromFingerprint: previous.observationFingerprint, toFingerprint: current.observationFingerprint, changed: previous.observationFingerprint !== current.observationFingerprint, changes: Object.freeze(changes)});
}

export const agentSnapshotSecurity = Object.freeze({pure: true, deterministic: true, requiresExplicitObservedAt: true, createsStore: false, persists: false, watches: false, polls: false, fetches: false, writes: false, executes: false, retries: false, plans: false, decidesAutonomy: false, createsCheckpoint: false} as const);
