export type GlobalStatusState =
  | "unavailable"
  | "blocked"
  | "degraded"
  | "recovering"
  | "active"
  | "attention"
  | "operational"
  | "idle";

export type SubsystemStatusState =
  | "unavailable"
  | "blocked"
  | "degraded"
  | "recovering"
  | "active"
  | "attention"
  | "operational"
  | "idle";

export type GlobalStatusEffect = Exclude<GlobalStatusState, "operational" | "idle"> | "none";

export type SubsystemStatus = Readonly<{
  id: "runtime" | "references" | "telegram" | "notifications" | "processes" | "review";
  label: string;
  state: SubsystemStatusState;
  effect: GlobalStatusEffect;
  summary: string;
  detail?: string;
  reason?: string;
  route?: "/editorial" | "/telegram" | "/actividad" | "/revision";
  checkedAt?: string;
  activeCount: number;
  currentIncidentCount: number;
  historicalCount: number;
  isLive: boolean;
}>;

export type GlobalStatusModel = Readonly<{
  state: GlobalStatusState;
  label: string;
  summary: string;
  reasons: readonly Readonly<{subsystemId: SubsystemStatus["id"]; label: string; reason: string}>[];
  subsystems: readonly SubsystemStatus[];
  activeProcessCount: number;
  currentIncidentCount: number;
  historicalRecordCount: number;
  evaluatedAt: string;
  presentationOnly: true;
}>;

export const GLOBAL_STATUS_PRECEDENCE = Object.freeze([
  "unavailable",
  "blocked",
  "degraded",
  "recovering",
  "active",
  "attention",
  "operational",
  "idle",
] as const);

const LABELS: Readonly<Record<GlobalStatusState, string>> = Object.freeze({
  unavailable: "No disponible",
  blocked: "Bloqueado",
  degraded: "Degradado",
  recovering: "Comprobando",
  active: "Actividad en curso",
  attention: "Requiere atención",
  operational: "Operativo",
  idle: "En reposo",
});

const SUMMARIES: Readonly<Record<GlobalStatusState, string>> = Object.freeze({
  unavailable: "Una dependencia estructural no responde.",
  blocked: "Una dependencia transversal impide operar con normalidad.",
  degraded: "El laboratorio sigue disponible con capacidades limitadas.",
  recovering: "Se están actualizando señales vivas de disponibilidad.",
  active: "Hay procesos u operaciones supervisadas en curso.",
  attention: "El sistema está estable, con intervención pendiente.",
  operational: "Las dependencias críticas comprobadas están disponibles.",
  idle: "No hay actividad ni incidencias vivas confirmadas.",
});

const EFFECT_RANK: Readonly<Record<GlobalStatusEffect, number>> = Object.freeze({
  none: 0,
  attention: 1,
  active: 2,
  recovering: 3,
  degraded: 4,
  blocked: 5,
  unavailable: 6,
});

const SUBSYSTEM_ORDER: Readonly<Record<SubsystemStatus["id"], number>> = Object.freeze({
  runtime: 0,
  references: 1,
  telegram: 2,
  processes: 3,
  review: 4,
  notifications: 5,
});

export function buildGlobalStatusModel(subsystems: readonly SubsystemStatus[], evaluatedAt = new Date().toISOString()): GlobalStatusModel {
  const ordered = Object.freeze([...subsystems].sort((left, right) => SUBSYSTEM_ORDER[left.id] - SUBSYSTEM_ORDER[right.id]));
  const dominant = ordered.reduce<GlobalStatusEffect>((current, subsystem) => EFFECT_RANK[subsystem.effect] > EFFECT_RANK[current] ? subsystem.effect : current, "none");
  const state: GlobalStatusState = dominant === "none"
    ? ordered.some((subsystem) => subsystem.state === "operational") ? "operational" : "idle"
    : dominant;
  const reasons = Object.freeze(ordered
    .filter((subsystem) => subsystem.reason && subsystem.effect !== "none")
    .map((subsystem) => Object.freeze({subsystemId: subsystem.id, label: subsystem.label, reason: subsystem.reason!})));
  return Object.freeze({
    state,
    label: LABELS[state],
    summary: SUMMARIES[state],
    reasons,
    subsystems: ordered,
    activeProcessCount: ordered.filter((subsystem) => subsystem.id === "processes").reduce((sum, subsystem) => sum + subsystem.activeCount, 0),
    currentIncidentCount: ordered.reduce((sum, subsystem) => sum + subsystem.currentIncidentCount, 0),
    historicalRecordCount: ordered.reduce((sum, subsystem) => sum + subsystem.historicalCount, 0),
    evaluatedAt,
    presentationOnly: true,
  });
}

export const globalStatusSecurity = Object.freeze({
  createsStore: false,
  createsHealthAuthority: false,
  fetchesInModel: false,
  persists: false,
  writes: false,
  executes: false,
  retries: false,
  mutatesSources: false,
} as const);
