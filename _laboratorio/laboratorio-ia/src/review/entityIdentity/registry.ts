import type {EntityIdentityStrategy, UniversalEntityType} from "./types";

export class EntityIdentityStrategyRegistry {
  private readonly values = new Map<UniversalEntityType, EntityIdentityStrategy>();

  register(strategy: EntityIdentityStrategy): () => void {
    if (!strategy.entityType || !strategy.version.trim() || typeof strategy.build !== "function" || typeof strategy.compare !== "function" || typeof strategy.canCreate !== "function") {
      throw new Error("entity_identity_strategy_invalid");
    }
    const current = this.values.get(strategy.entityType);
    if (current === strategy) return () => undefined;
    if (current) throw new Error(`entity_identity_strategy_duplicate:${strategy.entityType}`);
    this.values.set(strategy.entityType, strategy);
    return () => {
      if (this.values.get(strategy.entityType) === strategy) this.values.delete(strategy.entityType);
    };
  }

  get<T extends UniversalEntityType>(entityType: T): EntityIdentityStrategy<T> | undefined {
    return this.values.get(entityType) as EntityIdentityStrategy<T> | undefined;
  }

  list(): EntityIdentityStrategy[] {
    return [...this.values.values()].sort((left, right) => left.entityType.localeCompare(right.entityType));
  }
}
