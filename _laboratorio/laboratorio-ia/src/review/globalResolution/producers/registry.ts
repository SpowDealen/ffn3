import type {ReviewCase} from "../../types";
import type {GlobalResolutionInspectorRegistry} from "../inspection";
import type {GlobalResolutionCapabilityCatalog} from "./capabilityCatalog";
import type {GlobalResolutionProducerAdapterRegistry} from "./adapterRegistry";
import {normalizeGlobalResolutionProducerManifest} from "./fingerprint";
import {
  type GlobalResolutionProducerManifest,
  type ProducerAdapterKind,
  type ProducerAdapterResolution,
  type ProducerCaseResolutionInput,
  type ProducerCheckpointBinding,
  type ProducerCheckpointCompatibility,
  type ProducerInspectorBindingResolution,
  type ProducerLegacyCompatibility,
  type ProducerPlanningContext,
  type ProducerResolution,
  type RegisteredGlobalResolutionProducer,
} from "./types";
import {validateGlobalResolutionProducerManifest} from "./validation";

const satisfies = (actual: string, range?: string) => !range || range === actual || range.startsWith("^") && actual.split(".")[0] === range.slice(1).split(".")[0];
const unique = (values: readonly string[]) => [...new Set(values)].sort();

export class GlobalResolutionProducerRegistry {
  private readonly values = new Map<string, Map<string, RegisteredGlobalResolutionProducer>>();

  constructor(
    readonly capabilities: GlobalResolutionCapabilityCatalog,
    readonly adapters: GlobalResolutionProducerAdapterRegistry,
    private readonly inspectorIds: ReadonlySet<string> = new Set(),
  ) {}

  registerProducer(manifestInput: GlobalResolutionProducerManifest): () => void {
    const validation = validateGlobalResolutionProducerManifest(manifestInput, {capabilities: this.capabilities, adapters: this.adapters, inspectorIds: this.inspectorIds});
    if (!validation.valid || !validation.fingerprint) throw new Error(`producer_manifest_invalid:${validation.issues.filter((entry) => entry.severity === "error").map((entry) => entry.code).join(",")}`);
    const manifest = normalizeGlobalResolutionProducerManifest(manifestInput);
    const versions = this.values.get(manifest.producerId) ?? new Map();
    const current = versions.get(manifest.producerVersion);
    if (current) {
      if (current.fingerprint !== validation.fingerprint) throw new Error(`producer_manifest_duplicate_incompatible:${manifest.producerId}`);
      return () => undefined;
    }
    const registered = Object.freeze({
      manifest: Object.freeze(manifest),
      fingerprint: validation.fingerprint,
      warnings: validation.issues.filter((entry) => entry.severity !== "error"),
    });
    versions.set(manifest.producerVersion, registered);
    this.values.set(manifest.producerId, versions);
    return () => {
      if (versions.get(manifest.producerVersion) === registered) versions.delete(manifest.producerVersion);
      if (!versions.size) this.values.delete(manifest.producerId);
    };
  }

  getProducer(producerId: string, version?: string): RegisteredGlobalResolutionProducer | undefined {
    const versions = this.values.get(producerId);
    if (!versions) return undefined;
    if (version) return versions.get(version);
    const values = [...versions.values()].sort((left, right) => right.manifest.producerVersion.localeCompare(left.manifest.producerVersion));
    return values.length === 1 ? values[0] : undefined;
  }

  listProducers(): RegisteredGlobalResolutionProducer[] {
    return [...this.values.values()].flatMap((versions) => [...versions.values()])
      .sort((left, right) => `${left.manifest.producerId}:${left.manifest.producerVersion}`.localeCompare(`${right.manifest.producerId}:${right.manifest.producerVersion}`));
  }

  resolveProducerForCase(input: ProducerCaseResolutionInput): ProducerResolution {
    if (input.producerId) {
      const versions = this.values.get(input.producerId);
      if (!versions) {
        const legacy = this.listProducers().filter(({manifest}) => manifest.compatibility.legacyProducerIds?.includes(input.producerId!));
        if (legacy.length === 1) return {status: "resolved", producer: legacy[0], provenance: "legacy"};
        return {status: "unsupported", reason: "producer_not_registered"};
      }
      if (input.producerVersion) {
        const exact = versions.get(input.producerVersion);
        return exact
          ? {status: "resolved", producer: exact, provenance: "explicit"}
          : {status: "version_mismatch", producerId: input.producerId, requestedVersion: input.producerVersion, availableVersions: [...versions.keys()].sort()};
      }
      const candidates = [...versions.values()];
      return candidates.length === 1
        ? {status: "resolved", producer: candidates[0], provenance: "explicit"}
        : {status: "ambiguous", producerIds: candidates.map(({manifest}) => `${manifest.producerId}@${manifest.producerVersion}`).sort(), reason: "producer_version_ambiguous"};
    }
    if (!input.caseType && !input.source && !input.contractId) return {status: "missing", reason: "producer_identity_missing"};
    const candidates = this.listProducers().filter(({manifest}) => {
      const compatibleCase = !input.caseType || manifest.compatibility.caseTypes.includes(input.caseType) || manifest.caseTypes.includes(input.caseType);
      const compatibleSource = !input.source || !manifest.compatibility.sources?.length || manifest.compatibility.sources.includes(input.source);
      const compatibleContract = !input.contractId || !manifest.compatibility.contracts?.length || manifest.compatibility.contracts.includes(input.contractId);
      return compatibleCase && compatibleSource && compatibleContract;
    });
    if (!candidates.length) return {status: "unsupported", reason: "producer_case_unsupported"};
    if (candidates.length > 1) return {status: "ambiguous", producerIds: candidates.map(({manifest}) => `${manifest.producerId}@${manifest.producerVersion}`).sort(), reason: "producer_case_ambiguous"};
    return {status: "resolved", producer: candidates[0], provenance: "compatible"};
  }

  resolveCapability(producerId: string, operation: {kind: string; requiredCapability?: string}): ReturnType<GlobalResolutionCapabilityCatalog["get"]> {
    const producer = this.getProducer(producerId);
    if (!producer) return undefined;
    const declared = operation.requiredCapability
      ? producer.manifest.capabilities.find((capability) => capability.capabilityId === operation.requiredCapability)
      : producer.manifest.capabilities.filter((capability) => capability.operationKinds.includes(operation.kind as never)).length === 1
        ? producer.manifest.capabilities.find((capability) => capability.operationKinds.includes(operation.kind as never))
        : undefined;
    return declared ? this.capabilities.get(declared.capabilityId) : undefined;
  }

  resolveInspectorBinding(producerId: string, capabilityId: string, inspectors?: GlobalResolutionInspectorRegistry): ProducerInspectorBindingResolution {
    const producer = this.getProducer(producerId);
    if (!producer) return {status: "missing", reason: "producer_missing"};
    const candidates = producer.manifest.inspectors.filter((binding) => binding.capabilityId === capabilityId);
    if (!candidates.length) return {status: "unsupported", reason: "producer_inspector_binding_unsupported"};
    const available = inspectors ? candidates.filter((binding) => inspectors.get(binding.inspectorId)) : candidates.filter((binding) => this.inspectorIds.has(binding.inspectorId));
    if (!available.length) return {status: "missing", reason: "producer_inspector_missing"};
    const compatible = inspectors ? available.filter((binding) => satisfies(inspectors.get(binding.inspectorId)!.version, binding.inspectorVersionRange)) : available;
    if (!compatible.length) return {status: "version_mismatch", reason: "producer_inspector_version_mismatch"};
    const maximum = Math.max(...compatible.map((binding) => binding.priority ?? 0));
    const selected = compatible.filter((binding) => (binding.priority ?? 0) === maximum);
    return selected.length === 1 ? {status: "resolved", binding: structuredClone(selected[0])} : {status: "ambiguous", reason: "producer_inspector_priority_ambiguous"};
  }

  resolveAdapter<T>(producerId: string, kind: ProducerAdapterKind, capabilityId?: string): ProducerAdapterResolution<T> {
    const producer = this.getProducer(producerId);
    return producer ? this.adapters.resolve<T>(producer.manifest.adapters, kind, capabilityId) : {status: "missing", reason: "producer_missing"};
  }

  resolveLegacyReviewCase(reviewCase: ReviewCase): ProducerLegacyCompatibility {
    const producerId = typeof reviewCase.context.producer === "string" ? reviewCase.context.producer : undefined;
    const resolved = this.resolveProducerForCase({producerId, caseType: reviewCase.subject.type, source: reviewCase.source});
    if (resolved.status === "resolved") {
      return producerId
        ? {status: "legacy_compatible", producer: resolved.producer, provenance: resolved.provenance}
        : {status: "migration_recommended", producer: resolved.producer, provenance: resolved.provenance};
    }
    if (resolved.status === "ambiguous" || resolved.status === "version_mismatch") return {status: "migration_required", reasons: [resolved.status]};
    return {status: "incompatible", reasons: [resolved.reason]};
  }

  checkpointBinding(producerId: string): ProducerCheckpointBinding | undefined {
    const producer = this.getProducer(producerId);
    if (!producer) return undefined;
    return {
      producerId: producer.manifest.producerId,
      producerVersion: producer.manifest.producerVersion,
      manifestVersion: producer.manifest.manifestVersion,
      manifestFingerprint: producer.fingerprint,
      capabilityVersions: producer.manifest.capabilities.map(({capabilityId, capabilityVersion}) => ({capabilityId, capabilityVersion})).sort((left, right) => left.capabilityId.localeCompare(right.capabilityId)),
      adapterIds: unique(producer.manifest.adapters.map(({adapterId}) => adapterId)),
    };
  }

  checkCheckpoint(producerId: string, binding?: ProducerCheckpointBinding): ProducerCheckpointCompatibility {
    if (!binding) return this.getProducer(producerId) ? {status: "legacy_compatible", reasons: ["producer_manifest_binding_missing"]} : {status: "incompatible", reasons: ["producer_missing"]};
    const producer = this.getProducer(binding.producerId, binding.producerVersion);
    if (!producer) return {status: "incompatible", reasons: ["producer_version_missing"]};
    if (producer.fingerprint !== binding.manifestFingerprint || producer.manifest.manifestVersion !== binding.manifestVersion) return {status: "stale", reasons: ["producer_manifest_changed"]};
    return {status: "compatible", reasons: []};
  }

  planningContext(producerId: string): ProducerPlanningContext | undefined {
    const producer = this.getProducer(producerId);
    if (!producer) return undefined;
    return {
      producerId,
      producerVersion: producer.manifest.producerVersion,
      manifestVersion: producer.manifest.manifestVersion,
      manifestFingerprint: producer.fingerprint,
      availableCapabilities: producer.manifest.capabilities.filter((capability) => capability.modes.includes("plan")).map(({capabilityId}) => capabilityId).sort(),
      operationKinds: unique(producer.manifest.capabilities.flatMap(({operationKinds}) => operationKinds)) as ProducerPlanningContext["operationKinds"],
      dependencies: unique(producer.manifest.capabilities.flatMap(({dependencies}) => dependencies ?? [])),
      plannerAdapterIds: unique(producer.manifest.adapters.filter(({adapterKind}) => adapterKind === "planner").map(({adapterId}) => adapterId)),
      executorAdapterIds: unique(producer.manifest.adapters.filter(({adapterKind}) => adapterKind === "executor").map(({adapterId}) => adapterId)),
    };
  }
}
