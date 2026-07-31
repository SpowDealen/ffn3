import type {ReviewCase} from "../../types";
import {GlobalResolutionProducerAdapterRegistry} from "./adapterRegistry";
import {GlobalResolutionCapabilityCatalog} from "./capabilityCatalog";
import {
  EXTERNAL_NEWS_INSPECTOR_ID,
  externalNewsProducerAdapterDescriptors,
  externalNewsProducerManifest,
  externalNewsUniversalCapabilities,
} from "./externalNews";
import {GlobalResolutionProducerRegistry} from "./registry";
import {fighterSourceProducerAdapterDescriptors, fighterSourceProducerManifests} from "./fighterSources";
import type {ProducerCaseResolutionInput, ProducerCheckpointBinding, ProducerResolution} from "./types";

export type GlobalResolutionProducerRuntime = {
  capabilities: GlobalResolutionCapabilityCatalog;
  adapters: GlobalResolutionProducerAdapterRegistry;
  producers: GlobalResolutionProducerRegistry;
};

export function createGlobalResolutionProducerRuntime(): GlobalResolutionProducerRuntime {
  const capabilities = new GlobalResolutionCapabilityCatalog();
  externalNewsUniversalCapabilities.forEach((capability) => capabilities.register(capability));
  const adapters = new GlobalResolutionProducerAdapterRegistry();
  externalNewsProducerAdapterDescriptors().forEach((adapter) => adapters.register(adapter));
  fighterSourceProducerAdapterDescriptors().forEach((adapter) => adapters.register(adapter));
  const producers = new GlobalResolutionProducerRegistry(capabilities, adapters, new Set([EXTERNAL_NEWS_INSPECTOR_ID]));
  producers.registerProducer(externalNewsProducerManifest);
  fighterSourceProducerManifests.forEach((manifest) => producers.registerProducer(manifest));
  return Object.freeze({capabilities, adapters, producers});
}

export function producerCaseInputFromReviewCase(reviewCase: ReviewCase): ProducerCaseResolutionInput {
  const checkpointBinding = reviewCase.globalResolution?.producerManifest;
  return {
    producerId: typeof reviewCase.context.producer === "string" ? reviewCase.context.producer : checkpointBinding?.producerId,
    producerVersion: checkpointBinding?.producerVersion,
    caseType: reviewCase.subject.type,
    source: reviewCase.source,
  };
}

export function resolveGlobalResolutionProducerForReviewCase(
  reviewCase: ReviewCase,
  runtime: GlobalResolutionProducerRuntime = createGlobalResolutionProducerRuntime(),
): ProducerResolution {
  return runtime.producers.resolveProducerForCase(producerCaseInputFromReviewCase(reviewCase));
}

export function globalResolutionProducerCheckpointBinding(
  producerId: string,
  runtime: GlobalResolutionProducerRuntime = createGlobalResolutionProducerRuntime(),
): ProducerCheckpointBinding | undefined {
  return runtime.producers.checkpointBinding(producerId);
}
