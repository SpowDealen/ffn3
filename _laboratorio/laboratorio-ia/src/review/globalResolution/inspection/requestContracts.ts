import type {EntityOperation} from "../../entityOperations";
import type {ReviewCase} from "../../types";
import type {GlobalResolutionCheckpoint} from "../checkpoint";
import type {GlobalResolutionInspectionSubject} from "./types";

export type GlobalResolutionInspectionSubjectBuildResult =
  | {ok: true; subject: GlobalResolutionInspectionSubject}
  | {ok: false; code: "subject_incomplete"};

export type GlobalResolutionInspectionRequestContract = {
  id: string;
  version: string;
  producer: string;
  capability: string;
  buildSubject(input: {
    reviewCase: ReviewCase;
    checkpoint: GlobalResolutionCheckpoint;
    operation: EntityOperation;
    requireCompleteSubject: boolean;
  }): GlobalResolutionInspectionSubjectBuildResult;
};

export class GlobalResolutionInspectionRequestContractRegistry {
  private readonly values = new Map<string, GlobalResolutionInspectionRequestContract>();

  register(contract: GlobalResolutionInspectionRequestContract): () => void {
    if (!contract.id.trim() || !contract.version.trim() || !contract.producer.trim() || !contract.capability.trim()) throw new Error("inspection_request_contract_invalid");
    const key = `${contract.producer}:${contract.capability}`;
    if (this.values.has(key)) throw new Error(`inspection_request_contract_duplicate:${key}`);
    const frozen = Object.freeze({...contract, buildSubject: contract.buildSubject.bind(contract)});
    this.values.set(key, frozen);
    return () => {
      if (this.values.get(key) === frozen) this.values.delete(key);
    };
  }

  get(producer: string, capability: string): GlobalResolutionInspectionRequestContract | undefined {
    return this.values.get(`${producer}:${capability}`);
  }
}
