import type {GlobalResolutionProducerManifest, ProducerAdapterImplementation} from "./types";
import {createLuchadorCapabilityManifest, resolveFighterIdentityCapabilityManifest} from "./sharedCapabilities";

export const FIGHTER_SOURCE_PRODUCER_IDS = ["ufc_events", "one_events", "bkfc_events", "fekm_participants"] as const;
export type FighterSourceProducerId = typeof FIGHTER_SOURCE_PRODUCER_IDS[number];

const names: Record<FighterSourceProducerId, string> = {
  ufc_events: "UFC Eventos",
  one_events: "ONE Eventos",
  bkfc_events: "BKFC Eventos",
  fekm_participants: "FEKM Participantes",
};

const caseTypes: Record<FighterSourceProducerId, string> = {
  ufc_events: "fighter_resolution",
  one_events: "fighter_resolution",
  bkfc_events: "fighter_resolution",
  fekm_participants: "fighter_resolution",
};

export function fighterSourceProducerManifest(producerId: FighterSourceProducerId): GlobalResolutionProducerManifest {
  const adapter = (kind: "case_adapter" | "planner" | "executor" | "lifecycle_projection" | "ui_controller", suffix: string, capabilityIds?: string[]) => ({adapterKind: kind, adapterId: `fighter-source.${producerId}.${suffix}.v1`, adapterVersionRange: "^1.0.0", capabilityIds, priority: 100} as const);
  return {
    manifestVersion: "1.0.0",
    producerId,
    producerVersion: "1.0.0",
    displayName: names[producerId],
    family: "fighter_source",
    caseTypes: [caseTypes[producerId]],
    capabilities: [resolveFighterIdentityCapabilityManifest, createLuchadorCapabilityManifest].map((capability) => ({
      capabilityId: capability.capabilityId,
      capabilityVersion: capability.capabilityVersion,
      operationKinds: [...capability.operationKinds],
      modes: ["plan", "simulate", "execute", "retry"],
      requiresExplicitAuthorization: capability.requiresExplicitAuthorization,
      supportsIdempotency: true,
      supportsInspection: false,
      supportsReconciliation: false,
      requiredContext: ["caseId", "caseVersion", "checkpointFingerprint", "operationFingerprint"],
      dependencies: capability.capabilityId === "create:luchador" ? ["resolve_identity:fighter"] : [],
    })),
    adapters: [
      adapter("case_adapter", "case"),
      adapter("planner", "planner"),
      adapter("executor", "create-luchador", ["create:luchador"]),
      adapter("lifecycle_projection", "checkpoint", ["resolve_identity:fighter", "create:luchador"]),
      adapter("ui_controller", "controls"),
    ],
    inspectors: [],
    executionPolicy: {maximumRisk: "medium", defaultAuthorization: "explicit", retryPolicy: "manual_after_confirmed_absence", allowAutomaticExecution: false},
    compatibility: {caseTypes: [caseTypes[producerId]], contracts: ["fighter-resolution-request:v1"], sources: [producerId.replace(/_events$|_participants$/u, "")]},
    metadata: {lifecycle: "AU5", intakeOnly: true},
  };
}

export const fighterSourceProducerManifests = Object.freeze(FIGHTER_SOURCE_PRODUCER_IDS.map(fighterSourceProducerManifest));

export function fighterSourceProducerAdapterDescriptors(): ProducerAdapterImplementation[] {
  return fighterSourceProducerManifests.flatMap((manifest) => manifest.adapters.map((binding) => ({adapterId: binding.adapterId, version: "1.0.0", adapterKind: binding.adapterKind, implementation: Object.freeze({adapterId: binding.adapterId})})));
}
