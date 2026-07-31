import {selectCompatibleInspector, type GlobalResolutionInspectorSelection} from "./compatibility";
import type {GlobalResolutionEffectInspector, GlobalResolutionInspectionRequest} from "./types";

const text = (value: string) => Boolean(value.trim());

export class GlobalResolutionInspectorRegistry {
  private readonly values = new Map<string, GlobalResolutionEffectInspector>();
  private readonly sources = new WeakMap<object, GlobalResolutionEffectInspector>();

  register(inspector: GlobalResolutionEffectInspector): () => void {
    if (!text(inspector.id) || !text(inspector.version) || typeof inspector.supports !== "function" || typeof inspector.inspect !== "function") throw new Error("global_resolution_inspector_invalid");
    const previous = this.sources.get(inspector);
    if (previous && this.values.get(previous.id) === previous) return () => undefined;
    if (this.values.has(inspector.id)) throw new Error(`global_resolution_inspector_duplicate:${inspector.id}`);
    const registered = Object.freeze({
      id: inspector.id.trim(),
      version: inspector.version.trim(),
      supports: inspector.supports.bind(inspector),
      inspect: inspector.inspect.bind(inspector),
    });
    this.values.set(registered.id, registered);
    this.sources.set(inspector, registered);
    return () => {
      if (this.values.get(registered.id) === registered) this.values.delete(registered.id);
    };
  }

  get(id: string): GlobalResolutionEffectInspector | undefined {
    return this.values.get(id);
  }

  list(): GlobalResolutionEffectInspector[] {
    return [...this.values.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  select(request: GlobalResolutionInspectionRequest): GlobalResolutionInspectorSelection {
    return selectCompatibleInspector(this.list(), request);
  }
}

export const registerInspector = (registry: GlobalResolutionInspectorRegistry, inspector: GlobalResolutionEffectInspector) => registry.register(inspector);
export const getInspector = (registry: GlobalResolutionInspectorRegistry, id: string) => registry.get(id);
export const listInspectors = (registry: GlobalResolutionInspectorRegistry) => registry.list();
export const selectInspector = (registry: GlobalResolutionInspectorRegistry, request: GlobalResolutionInspectionRequest) => registry.select(request);
