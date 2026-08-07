import {fingerprintGlobalResolutionProducerManifest, normalizeGlobalResolutionProducerManifest} from "./fingerprint";
import type {GlobalResolutionCapabilityCatalog} from "./capabilityCatalog";
import type {GlobalResolutionProducerAdapterRegistry} from "./adapterRegistry";
import type {GlobalResolutionProducerManifest, ProducerManifestIssue, ProducerManifestValidationResult} from "./types";

const semver = (value: string) => /^\d+\.\d+\.\d+$/.test(value);
const versionRange = (value: string) => semver(value) || /^\^\d+\.\d+\.\d+$/.test(value);
const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const sensitiveKey = /token|secret|password|authorization|cookie|api[_-]?key|groq|query|dataset|project[_-]?id/i;
const sensitiveValue = /https?:\/\/|(?:token|secret|password|authorization|cookie|api[_-]?key)\s*[:=]/i;

function issue(severity: ProducerManifestIssue["severity"], code: string, message: string, path?: string): ProducerManifestIssue {
  return {severity, code, message, path};
}

function groupBy<T>(values: readonly T[], keyOf: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) groups.set(keyOf(value), [...(groups.get(keyOf(value)) ?? []), value]);
  return groups;
}

export function validateGlobalResolutionProducerManifest(
  input: GlobalResolutionProducerManifest,
  dependencies: {
    capabilities: GlobalResolutionCapabilityCatalog;
    adapters?: GlobalResolutionProducerAdapterRegistry;
    inspectorIds?: ReadonlySet<string>;
  },
): ProducerManifestValidationResult {
  let manifest: GlobalResolutionProducerManifest;
  try {
    manifest = normalizeGlobalResolutionProducerManifest(input);
  } catch {
    return {valid: false, issues: [issue("error", "producer_manifest_not_serializable", "El manifiesto no es serializable.")]};
  }
  const issues: ProducerManifestIssue[] = [];
  if (!text(manifest.producerId)) issues.push(issue("error", "producer_id_missing", "El productor no tiene una identidad técnica.", "producerId"));
  if (!semver(manifest.producerVersion)) issues.push(issue("error", "producer_version_invalid", "La versión del productor no es válida.", "producerVersion"));
  if (!semver(manifest.manifestVersion)) issues.push(issue("error", "manifest_version_invalid", "La versión del manifiesto no es válida.", "manifestVersion"));
  if (!text(manifest.displayName) || !manifest.caseTypes.length) issues.push(issue("error", "producer_header_invalid", "El nombre visible o los tipos de caso están incompletos."));
  if (manifest.executionPolicy.allowAutomaticExecution !== false) issues.push(issue("error", "automatic_execution_forbidden", "El manifiesto no puede autorizar ejecución automática.", "executionPolicy"));

  const capabilities = new Map<string, typeof manifest.capabilities[number]>();
  for (const capability of manifest.capabilities) {
    if (!text(capability.capabilityId) || !semver(capability.capabilityVersion) || !capability.operationKinds.length || !capability.modes.length) {
      issues.push(issue("error", "producer_capability_invalid", "La capability declarada está incompleta.", `capabilities.${capability.capabilityId || "unknown"}`));
      continue;
    }
    if (capabilities.has(capability.capabilityId)) issues.push(issue("error", "producer_capability_duplicate", "La capability está duplicada.", `capabilities.${capability.capabilityId}`));
    capabilities.set(capability.capabilityId, capability);
    const universal = dependencies.capabilities.get(capability.capabilityId);
    if (!universal) issues.push(issue("error", "universal_capability_missing", "La capability no existe en el catálogo universal.", `capabilities.${capability.capabilityId}`));
    else if (universal.capabilityVersion !== capability.capabilityVersion || capability.operationKinds.some((kind) => !universal.operationKinds.includes(kind))) issues.push(issue("error", "universal_capability_incompatible", "La capability no coincide con el contrato universal.", `capabilities.${capability.capabilityId}`));
    if (capability.supportsReconciliation && (!capability.supportsInspection || !capability.modes.includes("inspect"))) issues.push(issue("error", "reconciliation_without_inspection", "La reconciliación requiere inspección declarada.", `capabilities.${capability.capabilityId}`));
    if (capability.modes.includes("retry") && !capability.supportsIdempotency && manifest.executionPolicy.retryPolicy !== "manual_after_confirmed_absence") issues.push(issue("error", "retry_without_safe_policy", "El retry no dispone de idempotencia o política segura.", `capabilities.${capability.capabilityId}`));
    if (capability.modes.includes("execute") && capability.requiresExplicitAuthorization && manifest.executionPolicy.defaultAuthorization !== "explicit") issues.push(issue("error", "execution_authorization_undefined", "La ejecución requiere autorización explícita.", `capabilities.${capability.capabilityId}`));
    if (capability.supportsInspection !== capability.modes.includes("inspect")) issues.push(issue("error", "inspection_mode_contradiction", "El modo inspect contradice el contrato de capability.", `capabilities.${capability.capabilityId}`));
    if (capability.supportsReconciliation !== capability.modes.includes("reconcile")) issues.push(issue("error", "reconciliation_mode_contradiction", "El modo reconcile contradice el contrato de capability.", `capabilities.${capability.capabilityId}`));
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      issues.push(issue("error", "capability_dependency_cycle", "Las dependencies de capabilities contienen un ciclo.", `capabilities.${id}`));
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of capabilities.get(id)?.dependencies ?? []) {
      if (!capabilities.has(dependency)) issues.push(issue("error", "capability_dependency_missing", "La capability depende de otra capability no declarada.", `capabilities.${id}`));
      else visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of capabilities.keys()) visit(id);

  if (manifest.autonomyPolicy) {
    const policy = manifest.autonomyPolicy;
    if (!semver(policy.policyVersion)) issues.push(issue("error", "autonomy_policy_version_invalid", "La versión de la policy de autonomía no es válida.", "autonomyPolicy.policyVersion"));
    const declared = [policy.allowedAutonomousCapabilities, policy.supervisedCapabilities ?? [], policy.requiresAuthorizationCapabilities, policy.forbiddenAutonomousCapabilities];
    if (declared.flat().some((id) => !capabilities.has(id))) issues.push(issue("error", "autonomy_policy_capability_missing", "La policy de autonomía referencia una capability no declarada.", "autonomyPolicy"));
    const groups = declared.map((values) => new Set(values));
    if (groups.some((left, index) => groups.some((right, other) => other > index && [...left].some((id) => right.has(id))))) issues.push(issue("error", "autonomy_policy_capability_conflict", "Una capability aparece en límites de autonomía incompatibles.", "autonomyPolicy"));
  }

  for (const binding of manifest.inspectors) {
    if (!capabilities.has(binding.capabilityId)) issues.push(issue("error", "inspector_capability_missing", "El binding de inspector apunta a una capability inexistente.", `inspectors.${binding.inspectorId}`));
    if (dependencies.inspectorIds && !dependencies.inspectorIds.has(binding.inspectorId)) issues.push(issue("error", "inspector_implementation_missing", "El inspector declarado no está registrado.", `inspectors.${binding.inspectorId}`));
    if (binding.inspectorVersionRange && !versionRange(binding.inspectorVersionRange)) issues.push(issue("error", "inspector_version_range_invalid", "El rango de versión del inspector no es válido.", `inspectors.${binding.inspectorId}`));
  }
  for (const [capabilityId, bindings] of groupBy(manifest.inspectors, (binding) => binding.capabilityId)) {
    const highest = Math.max(...bindings.map((binding) => binding.priority ?? 0));
    if (bindings.filter((binding) => (binding.priority ?? 0) === highest).length > 1) issues.push(issue("error", "inspector_priority_ambiguous", "La prioridad de inspectores es ambigua.", `inspectors.${capabilityId}`));
  }

  for (const binding of manifest.adapters) {
    if (binding.capabilityIds?.some((id) => !capabilities.has(id))) issues.push(issue("error", "adapter_capability_missing", "El adaptador apunta a una capability inexistente.", `adapters.${binding.adapterId}`));
    if (dependencies.adapters && !dependencies.adapters.get(binding.adapterId)) issues.push(issue("error", "adapter_implementation_missing", "El adaptador declarado no está registrado.", `adapters.${binding.adapterId}`));
    if (binding.adapterVersionRange && !versionRange(binding.adapterVersionRange)) issues.push(issue("error", "adapter_version_range_invalid", "El rango de versión del adaptador no es válido.", `adapters.${binding.adapterId}`));
  }
  for (const [kind, bindings] of groupBy(manifest.adapters, (binding) => binding.adapterKind)) {
    const highest = Math.max(...bindings.map((binding) => binding.priority ?? 0));
    const top = bindings.filter((binding) => (binding.priority ?? 0) === highest);
    if (top.length > 1 && top.some((left, index) => top.some((right, other) => other !== index && (!left.capabilityIds?.length || !right.capabilityIds?.length || left.capabilityIds.some((id) => right.capabilityIds?.includes(id)))))) {
      issues.push(issue("error", "adapter_priority_ambiguous", "La prioridad de adaptadores es ambigua.", `adapters.${kind}`));
    }
  }

  const serialized = JSON.stringify(manifest);
  if (sensitiveValue.test(serialized)) issues.push(issue("error", "producer_manifest_sensitive_content", "El manifiesto contiene valores no permitidos."));
  if (manifest.metadata && Object.keys(manifest.metadata).some((key) => sensitiveKey.test(key))) issues.push(issue("error", "producer_metadata_sensitive_key", "La metadata contiene claves no permitidas.", "metadata"));
  if (!manifest.inspectors.length) issues.push(issue("info", "producer_without_inspectors", "El productor no declara inspectores."));
  if (!manifest.adapters.some((adapter) => adapter.adapterKind === "planner")) issues.push(issue("warning", "producer_without_planner", "El productor no declara adaptador de planning."));

  const ordered = issues.sort((left, right) => `${left.severity}:${left.code}:${left.path ?? ""}`.localeCompare(`${right.severity}:${right.code}:${right.path ?? ""}`));
  return {
    valid: !ordered.some((entry) => entry.severity === "error"),
    issues: ordered,
    fingerprint: !ordered.some((entry) => entry.severity === "error") ? fingerprintGlobalResolutionProducerManifest(manifest) : undefined,
  };
}
