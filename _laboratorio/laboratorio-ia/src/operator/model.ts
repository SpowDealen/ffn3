import type {SubsystemStatus} from "../status/model";

export type OperatorSignalSource = "health" | "notification" | "process" | "review";
export type OperatorSignalKind = "blocker" | "attention" | "action" | "active" | "informational" | "historical";
export type OperatorSignalTemporal = "current" | "recent" | "historical";
export type OperatorSignalPriority = "immediate" | "high" | "normal" | "low";
export type OperatorDestination = NonNullable<SubsystemStatus["route"]>;

export type OperatorSignal = Readonly<{
  id: string;
  source: OperatorSignalSource;
  sourceLabel: string;
  title: string;
  summary: string;
  reason?: string;
  kind: OperatorSignalKind;
  priority: OperatorSignalPriority;
  temporal: OperatorSignalTemporal;
  actionable: boolean;
  destination?: OperatorDestination;
  authoritySource: string;
}>;

export type OperatorExperienceState = "attention" | "active" | "clear" | "unknown";

export type OperatorExperienceModel = Readonly<{
  state: OperatorExperienceState;
  label: string;
  summary: string;
  attention: readonly OperatorSignal[];
  active: readonly OperatorSignal[];
  nextBest?: OperatorSignal;
  currentAttentionCount: number;
  activeCount: number;
  reviewPendingCount: number;
  authorizedActionCount: number;
  historicalCount: number;
  presentationOnly: true;
}>;

const PRIORITY_RANK: Readonly<Record<OperatorSignalPriority, number>> = Object.freeze({immediate: 4, high: 3, normal: 2, low: 1});
const KIND_RANK: Readonly<Record<OperatorSignalKind, number>> = Object.freeze({blocker: 6, action: 5, attention: 4, active: 3, informational: 2, historical: 1});

export function compareOperatorSignals(left: OperatorSignal, right: OperatorSignal): number {
  const priority = PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority];
  if (priority) return priority;
  const kind = KIND_RANK[right.kind] - KIND_RANK[left.kind];
  return kind || left.id.localeCompare(right.id, "es-ES");
}

export const operatorModelSecurity = Object.freeze({
  createsStore: false,
  persists: false,
  fetches: false,
  writes: false,
  executes: false,
  createsAuthority: false,
  mutatesSources: false,
} as const);
