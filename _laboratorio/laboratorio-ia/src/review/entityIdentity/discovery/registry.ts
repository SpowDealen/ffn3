import type {CandidateDiscoveryAdapter, CandidateDiscoveryRequest, SafeCandidateDiscoveryAdapterDescriptor} from "./types";

const key = (value: SafeCandidateDiscoveryAdapterDescriptor) => `${value.adapterId}@${value.adapterVersion}`;
const semanticDescriptor = (value: SafeCandidateDiscoveryAdapterDescriptor) => JSON.stringify({...value, entityTypes: [...value.entityTypes].sort()});

export class CandidateDiscoveryRegistry {
  readonly #adapters = new Map<string, CandidateDiscoveryAdapter>();

  register(adapter: CandidateDiscoveryAdapter): this {
    const descriptor = adapter.descriptor;
    if (!descriptor.adapterId.trim() || !descriptor.adapterVersion.trim() || !descriptor.source.trim() || !descriptor.capability.trim() || !descriptor.entityTypes.length || typeof adapter.supports !== "function" || typeof adapter.discover !== "function") throw new Error("candidate_discovery_adapter_invalid");
    const existing = this.#adapters.get(key(descriptor));
    if (existing) {
      if (semanticDescriptor(existing.descriptor) !== semanticDescriptor(descriptor) || existing !== adapter) throw new Error("candidate_discovery_adapter_duplicate_incompatible");
      return this;
    }
    this.#adapters.set(key(descriptor), adapter);
    return this;
  }

  listAdapters(): readonly SafeCandidateDiscoveryAdapterDescriptor[] {
    return Object.freeze([...this.#adapters.values()].map((item) => item.descriptor).sort((a, b) => a.adapterId.localeCompare(b.adapterId) || a.adapterVersion.localeCompare(b.adapterVersion)));
  }

  resolveAdapter(request: CandidateDiscoveryRequest): CandidateDiscoveryAdapter | undefined {
    const compatible = [...this.#adapters.values()].filter((adapter) =>
      adapter.descriptor.source === request.source
      && adapter.descriptor.capability === request.capability
      && adapter.descriptor.entityTypes.includes(request.entityType)
      && adapter.supports(request),
    ).sort((a, b) => b.descriptor.specificity - a.descriptor.specificity || b.descriptor.priority - a.descriptor.priority || a.descriptor.adapterId.localeCompare(b.descriptor.adapterId));
    if (compatible.length > 1 && compatible[0].descriptor.specificity === compatible[1].descriptor.specificity && compatible[0].descriptor.priority === compatible[1].descriptor.priority) throw new Error("candidate_discovery_adapter_ambiguous");
    return compatible[0];
  }
}
