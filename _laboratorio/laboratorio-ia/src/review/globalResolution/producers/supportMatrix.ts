import type {GlobalResolutionProducerRegistry} from "./registry";
import type {ProducerCapabilityMode} from "./types";

export type GlobalResolutionProducerSupportRow = Readonly<{
  producerId: string;
  producerVersion: string;
  family: string;
  capabilityId: string;
  operationKinds: readonly string[];
  plan: boolean;
  simulate: boolean;
  execute: boolean;
  inspect: boolean;
  reconcile: boolean;
  repairCheckpoint: boolean;
  enableRetry: boolean;
  supportStatus: "supported" | "validation_only";
}>;

const hasMode = (modes: readonly ProducerCapabilityMode[], mode: ProducerCapabilityMode) => modes.includes(mode);

export function deriveGlobalResolutionProducerSupportMatrix(
  registry: GlobalResolutionProducerRegistry,
): GlobalResolutionProducerSupportRow[] {
  return registry.listProducers().flatMap(({manifest}) => manifest.capabilities.map((capability) => Object.freeze({
    producerId: manifest.producerId,
    producerVersion: manifest.producerVersion,
    family: manifest.family ?? "unclassified",
    capabilityId: capability.capabilityId,
    operationKinds: Object.freeze([...capability.operationKinds].sort()),
    plan: hasMode(capability.modes, "plan"),
    simulate: hasMode(capability.modes, "simulate"),
    execute: hasMode(capability.modes, "execute"),
    inspect: capability.supportsInspection && hasMode(capability.modes, "inspect"),
    reconcile: capability.supportsReconciliation && hasMode(capability.modes, "reconcile"),
    repairCheckpoint: capability.supportsReconciliation && hasMode(capability.modes, "reconcile"),
    enableRetry: manifest.executionPolicy.retryPolicy === "manual_after_confirmed_absence" && hasMode(capability.modes, "retry"),
    supportStatus: manifest.metadata?.validationOnly === true ? "validation_only" as const : "supported" as const,
  }))).sort((left, right) =>
    `${left.producerId}:${left.capabilityId}`.localeCompare(`${right.producerId}:${right.capabilityId}`),
  );
}
