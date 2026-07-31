import type {UniversalReconciliationContract} from "./types";

export class UniversalReconciliationContractRegistry {
  private readonly values = new Map<string, UniversalReconciliationContract>();

  register(contract: UniversalReconciliationContract): () => void {
    if (!contract.capability.trim() || !contract.version.trim() || !contract.requiredSuccessFields.length || !contract.successOutcome.trim()) {
      throw new Error("universal_reconciliation_contract_invalid");
    }
    if (this.values.has(contract.capability)) throw new Error(`universal_reconciliation_contract_duplicate:${contract.capability}`);
    const frozen = Object.freeze({...contract, requiredSuccessFields: Object.freeze([...new Set(contract.requiredSuccessFields)].sort())});
    this.values.set(frozen.capability, frozen);
    return () => {
      if (this.values.get(frozen.capability) === frozen) this.values.delete(frozen.capability);
    };
  }

  get(capability: string): UniversalReconciliationContract | undefined {
    return this.values.get(capability);
  }

  list(): UniversalReconciliationContract[] {
    return [...this.values.values()].sort((left, right) => left.capability.localeCompare(right.capability));
  }
}
