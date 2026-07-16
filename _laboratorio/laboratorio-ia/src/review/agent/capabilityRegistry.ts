import type {EditorialCapabilityAdapter} from "./types";

const capabilities = new Map<string, EditorialCapabilityAdapter>();
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((listener) => listener());

function validateAdapter(adapter: EditorialCapabilityAdapter): void {
  const {manifest} = adapter;
  if (!manifest.id.trim() || manifest.version < 1) throw new Error("invalid_capability_manifest");
  if (!manifest.provides.length) throw new Error("capability_without_outcomes");
  if (manifest.timeoutMs < 100 || manifest.timeoutMs > 60_000) throw new Error("invalid_capability_timeout");
  if (manifest.maxExecutionsPerRun < 1 || manifest.maxExecutionsPerRun > 10) throw new Error("invalid_capability_execution_limit");
}

export function registerEditorialCapability(adapter: EditorialCapabilityAdapter): () => void {
  validateAdapter(adapter);
  const current = capabilities.get(adapter.manifest.id);
  if (current && current !== adapter) throw new Error(`capability_already_registered:${adapter.manifest.id}`);
  capabilities.set(adapter.manifest.id, adapter);
  emit();
  return () => {
    if (capabilities.get(adapter.manifest.id) === adapter) {
      capabilities.delete(adapter.manifest.id);
      emit();
    }
  };
}

export const getEditorialCapability = (id: string): EditorialCapabilityAdapter | undefined => capabilities.get(id);
export const listEditorialCapabilities = (): EditorialCapabilityAdapter[] => [...capabilities.values()].sort((left, right) => right.manifest.priority - left.manifest.priority || left.manifest.id.localeCompare(right.manifest.id));
export function subscribeEditorialCapabilities(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
