import {getReviewCase} from "../store/reviewStore";
import type {ReviewCase} from "../types";
import {
  authorizeAndResumeExternalNews,
  authorizeExternalNewsGlobalResume,
  initializeExternalNewsGlobalResolution,
  prepareExternalNewsGlobalResume,
  recoverExternalNewsGlobalResolution,
  simulateExternalNewsGlobalResolution,
  executeExternalNewsResolutionOperation,
} from "./externalNewsApplication";
import {buildExternalNewsControlPlanningInput, buildExternalNewsControlSimulationContext} from "./controlsModel";
import {createExternalNewsInspectionRuntime} from "./externalNewsRuntime";
import {createSanityInspectionHttpReader} from "./inspection";
import {createGlobalResolutionProducerRuntime, producerCaseInputFromReviewCase} from "./producers";
import {CandidateDiscoveryRegistry, CandidateDiscoveryService, createSanityFighterCandidateDiscoveryHttpAdapter} from "../entityIdentity/discovery";

export type GlobalResolutionProducerControls = {
  recover: typeof recoverExternalNewsGlobalResolution;
  initialize: typeof initializeExternalNewsGlobalResolution;
  simulate: typeof simulateExternalNewsGlobalResolution;
  executeOperation: typeof executeExternalNewsResolutionOperation;
  prepareResume: typeof prepareExternalNewsGlobalResume;
  authorizeResume: typeof authorizeExternalNewsGlobalResume;
  resume: typeof authorizeAndResumeExternalNews;
  buildPlanningInput: typeof buildExternalNewsControlPlanningInput;
  buildSimulationContext: typeof buildExternalNewsControlSimulationContext;
  createInspectionRuntime: () => ReturnType<typeof createExternalNewsInspectionRuntime>;
};

const candidateRegistry = new CandidateDiscoveryRegistry().register(createSanityFighterCandidateDiscoveryHttpAdapter());
const candidateDiscoveryService = new CandidateDiscoveryService(candidateRegistry);

const externalNewsControls: GlobalResolutionProducerControls = Object.freeze({
  recover: recoverExternalNewsGlobalResolution,
  initialize: initializeExternalNewsGlobalResolution,
  simulate: simulateExternalNewsGlobalResolution,
  executeOperation: (input) => executeExternalNewsResolutionOperation({...input, dependencies: {...input.dependencies, candidateDiscoveryService, candidateDiscoverySource: "sanity"}}),
  prepareResume: prepareExternalNewsGlobalResume,
  authorizeResume: authorizeExternalNewsGlobalResume,
  resume: authorizeAndResumeExternalNews,
  buildPlanningInput: buildExternalNewsControlPlanningInput,
  buildSimulationContext: buildExternalNewsControlSimulationContext,
  createInspectionRuntime: () => createExternalNewsInspectionRuntime({reader: createSanityInspectionHttpReader(), readCase: getReviewCase}),
});

export function resolveGlobalResolutionProducerControls(reviewCase: ReviewCase):
  | {status: "resolved"; controls: GlobalResolutionProducerControls; displayName: string; producerVersion: string}
  | {status: "unsupported" | "ambiguous" | "missing" | "version_mismatch" | "invalid_manifest"; reason: string} {
  const runtime = createGlobalResolutionProducerRuntime();
  const producer = runtime.producers.resolveProducerForCase(producerCaseInputFromReviewCase(reviewCase));
  if (producer.status !== "resolved") return {
    status: producer.status,
    reason: producer.status === "ambiguous" ? producer.reason : producer.status === "version_mismatch" ? "producer_version_mismatch" : producer.reason,
  };
  const binding = runtime.producers.resolveAdapter(producer.producer.manifest.producerId, "ui_controller");
  if (binding.status !== "resolved") return {status: "unsupported", reason: binding.reason};
  return {
    status: "resolved",
    controls: externalNewsControls,
    displayName: producer.producer.manifest.displayName,
    producerVersion: producer.producer.manifest.producerVersion,
  };
}
