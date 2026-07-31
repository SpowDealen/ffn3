import type {ProducerAdapterImplementation, ProducerAdapterKind, ProducerAdapterManifest, ProducerAdapterResolution} from "./types";

const version = (value: string) => /^\d+\.\d+\.\d+$/.test(value);
const satisfies = (actual: string, range?: string) => !range || range === actual || range.startsWith("^") && actual.split(".")[0] === range.slice(1).split(".")[0];

export class GlobalResolutionProducerAdapterRegistry {
  private readonly values = new Map<string, ProducerAdapterImplementation>();

  register<T>(adapter: ProducerAdapterImplementation<T>): () => void {
    if (!adapter.adapterId.trim() || !version(adapter.version) || !adapter.adapterKind || adapter.implementation === undefined) throw new Error("producer_adapter_invalid");
    if (this.values.has(adapter.adapterId)) throw new Error(`producer_adapter_duplicate:${adapter.adapterId}`);
    const registered = Object.freeze({...adapter});
    this.values.set(adapter.adapterId, registered);
    return () => {
      if (this.values.get(adapter.adapterId) === registered) this.values.delete(adapter.adapterId);
    };
  }

  get(id: string): ProducerAdapterImplementation | undefined {
    return this.values.get(id);
  }

  list(): ProducerAdapterImplementation[] {
    return [...this.values.values()].sort((left, right) => left.adapterId.localeCompare(right.adapterId));
  }

  resolve<T>(bindings: readonly ProducerAdapterManifest[], kind: ProducerAdapterKind, capabilityId?: string): ProducerAdapterResolution<T> {
    const candidates = bindings.filter((binding) => binding.adapterKind === kind && (!capabilityId || !binding.capabilityIds?.length || binding.capabilityIds.includes(capabilityId)));
    if (!candidates.length) return {status: "unsupported", reason: "producer_adapter_binding_unsupported"};
    const available = candidates.flatMap((binding) => {
      const adapter = this.get(binding.adapterId);
      return adapter && adapter.adapterKind === kind ? [{binding, adapter}] : [];
    });
    if (!available.length) return {status: "missing", reason: "producer_adapter_missing"};
    const compatible = available.filter(({binding, adapter}) => satisfies(adapter.version, binding.adapterVersionRange));
    if (!compatible.length) return {status: "version_mismatch", reason: "producer_adapter_version_mismatch"};
    const maximum = Math.max(...compatible.map(({binding}) => binding.priority ?? 0));
    const selected = compatible.filter(({binding}) => (binding.priority ?? 0) === maximum);
    if (selected.length !== 1) return {status: "ambiguous", reason: "producer_adapter_priority_ambiguous"};
    return {status: "resolved", binding: structuredClone(selected[0].binding), adapter: selected[0].adapter as ProducerAdapterImplementation<T>};
  }
}
