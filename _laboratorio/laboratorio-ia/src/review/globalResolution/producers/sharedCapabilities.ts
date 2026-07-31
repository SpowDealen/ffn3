import type {GlobalResolutionCapabilityManifest} from "./types";

export const createLuchadorCapabilityManifest = Object.freeze<GlobalResolutionCapabilityManifest>({
  capabilityId: "create:luchador",
  capabilityVersion: "1.0.0",
  description: "Crear o reutilizar un luchador con identidad estable.",
  operationKinds: ["create_entity"],
  requirements: ["prepared_entity", "identity_key", "explicit_operation"],
  expectedEvidenceKinds: ["document_id", "identity_key", "payload_fingerprint"],
  supportsInspection: true,
  supportsReconciliation: true,
  requiresExplicitAuthorization: true,
  idempotencyPolicy: "required",
});

export const resolveFighterIdentityCapabilityManifest = Object.freeze<GlobalResolutionCapabilityManifest>({
  capabilityId: "resolve_identity:fighter",
  capabilityVersion: "1.0.0",
  description: "Resolver identidad de luchador mediante candidatos read-only antes de crear.",
  operationKinds: ["find_entity"],
  requirements: ["identity_descriptor", "candidate_discovery", "complete_evidence"],
  expectedEvidenceKinds: ["identity_fingerprint", "discovery_fingerprint", "candidate_id"],
  supportsInspection: false,
  supportsReconciliation: false,
  requiresExplicitAuthorization: false,
  idempotencyPolicy: "required",
});
