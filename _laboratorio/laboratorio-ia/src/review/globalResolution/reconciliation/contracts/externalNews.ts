import {UniversalReconciliationContractRegistry} from "../engine";
import type {CheckpointReconciliationProjection} from "../../checkpoint/lifecycle";

export function checkpointProjectionForExternalNewsReconciliation(
  capability: string,
): CheckpointReconciliationProjection | undefined {
  if (capability === "resume:external_news") return {kind: "resume"};
  if (capability === "create:luchador") return {kind: "reference_resolution", entityType: "luchador"};
  return undefined;
}

export function createExternalNewsReconciliationContractRegistry(): UniversalReconciliationContractRegistry {
  const registry = new UniversalReconciliationContractRegistry();
  registry.register({
    version: "1.0.0",
    capability: "create:luchador",
    requiredSuccessFields: ["documentId", "identityKey", "payloadFingerprint"],
    successOutcome: "created",
  });
  registry.register({
    version: "1.0.0",
    capability: "replace_reference:noticia:luchador",
    requiredSuccessFields: ["documentId", "identityKey", "payloadFingerprint"],
    successOutcome: "created",
  });
  registry.register({
    version: "1.0.0",
    capability: "resume:external_news",
    requiredSuccessFields: ["documentId", "payloadFingerprint"],
    successOutcome: "resumed",
    requiresCompletedCheckpointForAlreadyReconciled: true,
  });
  return registry;
}
