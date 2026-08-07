import type {ReviewJsonValue} from "../../types";
import {computeUniversalFingerprint} from "../../universal";
import type {GlobalResolutionProducerManifest} from "./types";

const unique = (values: readonly string[] | undefined) => [...new Set(values ?? [])].sort();

export function normalizeGlobalResolutionProducerManifest(manifest: GlobalResolutionProducerManifest): GlobalResolutionProducerManifest {
  return {
    ...structuredClone(manifest),
    caseTypes: unique(manifest.caseTypes),
    capabilities: manifest.capabilities.map((capability) => ({
      ...capability,
      operationKinds: unique(capability.operationKinds) as typeof capability.operationKinds,
      modes: unique(capability.modes) as typeof capability.modes,
      requiredContext: unique(capability.requiredContext),
      optionalContext: unique(capability.optionalContext),
      dependencies: unique(capability.dependencies),
    })).sort((left, right) => `${left.capabilityId}:${left.capabilityVersion}`.localeCompare(`${right.capabilityId}:${right.capabilityVersion}`)),
    adapters: manifest.adapters.map((adapter) => ({
      ...adapter,
      capabilityIds: unique(adapter.capabilityIds),
      operationKinds: unique(adapter.operationKinds) as typeof adapter.operationKinds,
    })).sort((left, right) => `${left.adapterKind}:${left.priority ?? 0}:${left.adapterId}`.localeCompare(`${right.adapterKind}:${right.priority ?? 0}:${right.adapterId}`)),
    inspectors: manifest.inspectors.map((binding) => ({
      ...binding,
      requiredEvidenceKinds: unique(binding.requiredEvidenceKinds),
    })).sort((left, right) => `${left.capabilityId}:${left.priority ?? 0}:${left.inspectorId}`.localeCompare(`${right.capabilityId}:${right.priority ?? 0}:${right.inspectorId}`)),
    autonomyPolicy: manifest.autonomyPolicy ? {
      ...manifest.autonomyPolicy,
      allowedAutonomousCapabilities: unique(manifest.autonomyPolicy.allowedAutonomousCapabilities),
      supervisedCapabilities: unique(manifest.autonomyPolicy.supervisedCapabilities),
      requiresAuthorizationCapabilities: unique(manifest.autonomyPolicy.requiresAuthorizationCapabilities),
      forbiddenAutonomousCapabilities: unique(manifest.autonomyPolicy.forbiddenAutonomousCapabilities),
    } : undefined,
    compatibility: {
      ...manifest.compatibility,
      caseTypes: unique(manifest.compatibility.caseTypes),
      contracts: unique(manifest.compatibility.contracts),
      sources: unique(manifest.compatibility.sources),
      legacyProducerIds: unique(manifest.compatibility.legacyProducerIds),
    },
    metadata: manifest.metadata ? Object.fromEntries(Object.entries(manifest.metadata).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [key, Array.isArray(value) ? unique(value) : value])) : undefined,
  };
}

export function fingerprintGlobalResolutionProducerManifest(manifest: GlobalResolutionProducerManifest): string {
  return computeUniversalFingerprint(normalizeGlobalResolutionProducerManifest(manifest) as unknown as ReviewJsonValue);
}
