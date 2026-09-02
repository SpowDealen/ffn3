const HUMAN_STATE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  operational: "Operativo",
  recovering: "Recuperándose",
  degraded: "Funcionamiento limitado",
  blocked: "Necesita una decisión",
  stale: "Información desactualizada",
  unsupported: "No se puede resolver automáticamente",
  executing: "En proceso",
  active: "En proceso",
  attention: "Requiere atención",
  resolved: "Resuelto",
  resumed: "Reanudado",
  resume_failed: "No se pudo continuar",
  unavailable: "No disponible",
  idle: "Sin actividad",
});

export function presentHumanState(state: string): string {
  return HUMAN_STATE_LABELS[state] ?? "Estado pendiente";
}

export const humanLanguageSecurity = Object.freeze({
  presentationOnly: true,
  deterministic: true,
  readsExternalState: false,
  writes: false,
  persists: false,
  executes: false,
} as const);
