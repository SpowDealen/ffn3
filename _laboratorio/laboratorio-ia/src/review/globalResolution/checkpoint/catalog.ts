import type {EntityOperation} from "../../entityOperations";
import {listRegisteredReviewExecutors, listReviewProducers, type RegisteredReviewExecutor, type ReviewProducerRegistration} from "../../universal";
import {computeUniversalFingerprint} from "../../universal";
import type {ReviewJsonValue} from "../../types";
import {pilotCapabilityRegistry, type GlobalResolutionCapability} from "../capabilities";
import type {GlobalResolutionRecoveryEnvironment, SerializedCapabilityRequirement, SerializedExecutorRequirement} from "./types";

export type SerializedCurrentCapability = SerializedCapabilityRequirement & {
  operationKinds: EntityOperation["kind"][];
};

export type SerializedCurrentExecutor = SerializedExecutorRequirement & {
  scope?: string;
  risk: string;
  supportedEffects: string[];
  supportedEntityTypes: string[];
};

export type SerializedCurrentProducer = {
  producer: string;
  version: number;
  supportedEntityTypes: string[];
  supportedOperations: string[];
};

export type GlobalResolutionCurrentCatalog = {
  schemaVersion: 1;
  capabilities: SerializedCurrentCapability[];
  executors: SerializedCurrentExecutor[];
  producers: SerializedCurrentProducer[];
  fingerprint: string;
  valid: boolean;
  errors: string[];
  recoveryEnvironment: GlobalResolutionRecoveryEnvironment;
};

const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const fingerprint = (value: unknown): value is string => typeof value === "string" && /^sha256-v1:[a-z0-9]+$/i.test(value);
const unique = (values: readonly string[]) => [...new Set(values)].sort();

function capabilityEntry(capability: GlobalResolutionCapability): SerializedCurrentCapability {
  return {
    id: capability.id,
    support: capability.support,
    operationKinds: [...new Set(capability.operationKinds)].sort(),
  };
}

function executorEntry(executor: RegisteredReviewExecutor): SerializedCurrentExecutor {
  return {
    capability: executor.manifest.capability,
    executorId: executor.manifest.executorId,
    version: executor.manifest.version,
    manifestFingerprint: executor.manifestFingerprint,
    scope: executor.manifest.scope,
    risk: executor.manifest.risk,
    supportedEffects: [...executor.manifest.supportedEffects],
    supportedEntityTypes: [...executor.manifest.supportedEntityTypes],
  };
}

function producerEntry(producer: ReviewProducerRegistration): SerializedCurrentProducer {
  return {
    producer: producer.producerId,
    version: producer.version,
    supportedEntityTypes: [...producer.supportedEntityTypes],
    supportedOperations: [...producer.supportedOperations],
  };
}

export function buildCurrentGlobalResolutionCatalog(input: {
  capabilities?: readonly GlobalResolutionCapability[];
  executors?: readonly RegisteredReviewExecutor[];
  producers?: readonly ReviewProducerRegistration[];
} = {}): GlobalResolutionCurrentCatalog {
  const capabilities = [...(input.capabilities ?? pilotCapabilityRegistry.list())].map(capabilityEntry).sort((left, right) => left.id.localeCompare(right.id));
  const executors = [...(input.executors ?? listRegisteredReviewExecutors())].map(executorEntry).sort((left, right) => `${left.capability}:${left.executorId}`.localeCompare(`${right.capability}:${right.executorId}`));
  const producers = [...(input.producers ?? listReviewProducers())].map(producerEntry).sort((left, right) => left.producer.localeCompare(right.producer));
  const errors: string[] = [];
  const capabilityIds = new Set<string>();
  for (const capability of capabilities) {
    if (!text(capability.id) || !["contract_only", "simulatable", "executable"].includes(capability.support) || !capability.operationKinds.length) errors.push(`capability_manifest_invalid:${capability.id || "unknown"}`);
    if (capabilityIds.has(capability.id)) errors.push(`capability_duplicate:${capability.id}`);
    capabilityIds.add(capability.id);
  }
  const executorIds = new Set<string>();
  const executorCapabilities = new Map<string, SerializedCurrentExecutor[]>();
  for (const executor of executors) {
    if (!text(executor.executorId) || !text(executor.capability) || !Number.isInteger(executor.version) || executor.version < 1 || !fingerprint(executor.manifestFingerprint) || !executor.supportedEffects.length || !executor.supportedEntityTypes.length || !text(executor.risk)) errors.push(`executor_manifest_invalid:${executor.executorId || "unknown"}`);
    if (executorIds.has(executor.executorId)) errors.push(`executor_duplicate:${executor.executorId}`);
    executorIds.add(executor.executorId);
    if (!capabilityIds.has(executor.capability)) errors.push(`executor_capability_undeclared:${executor.executorId}:${executor.capability}`);
    const group = executorCapabilities.get(executor.capability) ?? [];
    group.push(executor);
    executorCapabilities.set(executor.capability, group);
  }
  for (const [capability, candidates] of executorCapabilities) {
    const scopes = new Set(candidates.map((candidate) => candidate.scope ?? ""));
    if (candidates.length > 1 && scopes.size !== candidates.length) errors.push(`executor_ambiguous:${capability}`);
  }
  for (const capability of capabilities) if (capability.support === "executable" && !(executorCapabilities.get(capability.id)?.length)) errors.push(`executable_without_executor:${capability.id}`);
  const producerIds = new Set<string>();
  for (const producer of producers) {
    if (!text(producer.producer) || !Number.isInteger(producer.version) || producer.version < 1 || !producer.supportedEntityTypes.length || !producer.supportedOperations.length) errors.push(`producer_manifest_invalid:${producer.producer || "unknown"}`);
    if (producerIds.has(producer.producer)) errors.push(`producer_duplicate:${producer.producer}`);
    producerIds.add(producer.producer);
  }
  const semantic = {schemaVersion: 1 as const, capabilities, executors, producers};
  const recoveryEnvironment = {
    capabilities: capabilities.map(({id, support}) => ({id, support})),
    executors: executors.map(({capability, executorId, version, manifestFingerprint}) => ({capability, executorId, version, manifestFingerprint})),
  };
  return {
    ...semantic,
    fingerprint: computeUniversalFingerprint(semantic as unknown as ReviewJsonValue),
    valid: errors.length === 0,
    errors: unique(errors),
    recoveryEnvironment,
  };
}
