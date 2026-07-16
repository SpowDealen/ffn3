import type {EntitySchemaRequirementAdapter} from "./types";

const adapters = new Map<string, EntitySchemaRequirementAdapter>();
export function registerSchemaRequirementAdapter(adapter: EntitySchemaRequirementAdapter): () => void { adapters.set(adapter.entityType, adapter); return () => { if (adapters.get(adapter.entityType) === adapter) adapters.delete(adapter.entityType); }; }
export function getSchemaRequirementAdapter(entityType: string): EntitySchemaRequirementAdapter | undefined { return adapters.get(entityType); }
