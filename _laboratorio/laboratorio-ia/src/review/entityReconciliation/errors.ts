export class EntityReconciliationError extends Error {
  constructor(readonly reasonCode: string) { super(reasonCode); this.name = "EntityReconciliationError"; }
}
export const reconciliationReasonCode = (error: unknown, fallback: string): string => error instanceof EntityReconciliationError ? error.reasonCode : fallback;
export function reconciliationFailure(reasonCode: string): never { throw new EntityReconciliationError(reasonCode); }
