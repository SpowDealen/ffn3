import type {EntityOperationAdapter, EntityOperationEntityType, EntityOperationKind, EntityOperationRegistry, OperationSupportLevel} from "./types";

function immutable(adapter: EntityOperationAdapter): EntityOperationAdapter {
  if (!adapter.entityType || !adapter.knownOperations.length) throw new Error("invalid_entity_operation_adapter");
  const knownOperations = [...new Set(adapter.knownOperations)].sort();
  const support = Object.fromEntries(Object.entries(adapter.support).filter(([kind]) => knownOperations.includes(kind as EntityOperationKind)));
  return Object.freeze({...adapter, knownOperations: Object.freeze(knownOperations), support: Object.freeze(support), minimumRequirements: Object.freeze([...new Set(adapter.minimumRequirements)].sort()), identityFields: Object.freeze([...new Set(adapter.identityFields)].sort())});
}

export function createEntityOperationRegistry(): EntityOperationRegistry {
  const adapters = new Map<EntityOperationEntityType, EntityOperationAdapter>();
  return {
    register(adapter, options = {}) {
      const next = immutable(adapter);
      const previous = adapters.get(next.entityType);
      if (previous && previous !== adapter && !options.replace) throw new Error(`entity_operation_adapter_already_registered:${next.entityType}`);
      adapters.set(next.entityType, next);
      return () => {
        if (adapters.get(next.entityType) !== next) return;
        if (previous) adapters.set(next.entityType, previous); else adapters.delete(next.entityType);
      };
    },
    get(entityType) { return adapters.get(entityType); },
    require(entityType) { const adapter = adapters.get(entityType); if (!adapter) throw new Error(`entity_operation_adapter_missing:${entityType}`); return adapter; },
    list() { return [...adapters.values()].sort((left, right) => left.entityType.localeCompare(right.entityType)); },
    supports(entityType, kind): OperationSupportLevel | undefined { return adapters.get(entityType)?.support[kind]; },
  };
}

export const entityOperationRegistry = createEntityOperationRegistry();

export const fighterEntityOperationAdapter: EntityOperationAdapter = {
  entityType: "luchador",
  knownOperations: ["find_entity", "create_entity", "reuse_entity", "replace_reference", "validate_entity"],
  support: {find_entity: "contract_only", create_entity: "executable", reuse_entity: "contract_only", replace_reference: "executable", validate_entity: "contract_only"},
  minimumRequirements: ["nombre", "disciplina", "organizacion"],
  identityFields: ["nombre", "slug", "disciplina"],
  deduplicationStrategy: "identidad editorial normalizada por nombre, slug y disciplina",
  futureCapability: "editorial.entity.luchador.write",
};

entityOperationRegistry.register(fighterEntityOperationAdapter);
