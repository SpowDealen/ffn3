import {fingerprintGlobalResolutionProducerManifest} from "./fingerprint";
import type {GlobalResolutionCapabilityManifest} from "./types";

function semantic(capability: GlobalResolutionCapabilityManifest): string {
  return fingerprintGlobalResolutionProducerManifest({
    manifestVersion: "capability",
    producerId: capability.capabilityId,
    producerVersion: capability.capabilityVersion,
    displayName: capability.description,
    caseTypes: [],
    capabilities: [],
    adapters: [],
    inspectors: [],
    executionPolicy: {maximumRisk: "none", defaultAuthorization: "not_required", retryPolicy: "disabled", allowAutomaticExecution: false},
    compatibility: {caseTypes: []},
    metadata: {
      operationKinds: [...capability.operationKinds].sort(),
      requirements: [...capability.requirements].sort(),
      expectedEvidenceKinds: [...capability.expectedEvidenceKinds].sort(),
      supportsInspection: capability.supportsInspection,
      supportsReconciliation: capability.supportsReconciliation,
      requiresExplicitAuthorization: capability.requiresExplicitAuthorization,
      idempotencyPolicy: capability.idempotencyPolicy,
    },
  });
}

export class GlobalResolutionCapabilityCatalog {
  private readonly values = new Map<string, GlobalResolutionCapabilityManifest>();

  register(capability: GlobalResolutionCapabilityManifest): () => void {
    if (!capability.capabilityId.trim() || !capability.capabilityVersion.trim() || !capability.description.trim() || !capability.operationKinds.length) throw new Error("producer_capability_invalid");
    const normalized = Object.freeze({
      ...structuredClone(capability),
      operationKinds: [...new Set(capability.operationKinds)].sort(),
      requirements: [...new Set(capability.requirements)].sort(),
      expectedEvidenceKinds: [...new Set(capability.expectedEvidenceKinds)].sort(),
    });
    const current = this.values.get(normalized.capabilityId);
    if (current) {
      if (semantic(current) !== semantic(normalized)) throw new Error(`producer_capability_incompatible:${normalized.capabilityId}`);
      return () => undefined;
    }
    this.values.set(normalized.capabilityId, normalized);
    return () => {
      if (this.values.get(normalized.capabilityId) === normalized) this.values.delete(normalized.capabilityId);
    };
  }

  get(capabilityId: string): GlobalResolutionCapabilityManifest | undefined {
    return this.values.get(capabilityId);
  }

  list(): GlobalResolutionCapabilityManifest[] {
    return [...this.values.values()].map((value) => structuredClone(value)).sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
  }
}
