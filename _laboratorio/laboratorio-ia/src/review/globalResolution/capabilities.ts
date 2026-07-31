import type {EntityOperation} from "../entityOperations";

export type CapabilitySupportLevel = "contract_only" | "simulatable" | "executable";
export type GlobalResolutionCapability = {id: string; support: CapabilitySupportLevel; operationKinds: EntityOperation["kind"][]; description: string};
export type GlobalResolutionCapabilityRegistry = {get(id: string): GlobalResolutionCapability | undefined; list(): GlobalResolutionCapability[]; register(capability: GlobalResolutionCapability, options?: {replace?: boolean}): () => void};

export function createGlobalResolutionCapabilityRegistry(capabilities: readonly GlobalResolutionCapability[] = []): GlobalResolutionCapabilityRegistry {
  const values = new Map<string, GlobalResolutionCapability>();
  const registry: GlobalResolutionCapabilityRegistry = {get: (id) => values.get(id), list: () => [...values.values()].sort((a, b) => a.id.localeCompare(b.id)), register(capability, options = {}) { const previous = values.get(capability.id); if (previous && !options.replace) throw new Error(`global_resolution_capability_exists:${capability.id}`); const registered = Object.freeze({...capability, operationKinds: [...new Set(capability.operationKinds)].sort()}); values.set(capability.id, registered); return () => { if (values.get(capability.id) !== registered) return; if (previous) values.set(capability.id, previous); else values.delete(capability.id); }; }};
  capabilities.forEach((capability) => registry.register(capability)); return registry;
}

export const pilotCapabilityRegistry = createGlobalResolutionCapabilityRegistry([
  {id: "validate:luchador_prepared", support: "simulatable", operationKinds: ["validate_entity"], description: "Valida el borrador preparado de luchador sin escritura."},
  {id: "find:luchador", support: "simulatable", operationKinds: ["find_entity"], description: "Evalúa candidatos inyectados de luchador."},
  {id: "resolve_identity:fighter", support: "simulatable", operationKinds: ["find_entity"], description: "Resuelve identidad de luchador mediante discovery read-only antes de crear."},
  {id: "reuse:luchador", support: "simulatable", operationKinds: ["reuse_entity"], description: "Proyecta reutilización de un candidato inequívoco."},
  {id: "create:luchador", support: "executable", operationKinds: ["create_entity"], description: "Persiste un luchador cuya identidad ya fue autorizada por resolve_identity:fighter."},
  {id: "replace_reference:noticia:luchador", support: "executable", operationKinds: ["replace_reference"], description: "Sustituye de forma pura una referencia proyectada por un ID real validado."},
  {id: "validate:noticia", support: "simulatable", operationKinds: ["validate_entity"], description: "Valida de forma pura el payload reconstruido."},
  {id: "resume:external_news", support: "executable", operationKinds: ["validate_entity"], description: "Reanuda external_news mediante el flujo real autorizado y registrado."},
]);

export function capabilityForOperation(operation: EntityOperation): string | undefined {
  const payload = operation.payload && typeof operation.payload === "object" && !Array.isArray(operation.payload) ? operation.payload : undefined;
  const scope = typeof payload?.scope === "string" ? payload.scope : "";
  if (scope === "identity_guard" && operation.entityType === "luchador" && operation.kind === "find_entity") return "resolve_identity:fighter";
  if (scope === "resume" && typeof payload?.producer === "string") return `resume:${payload.producer}`;
  if (scope === "final_payload") return `validate:${operation.entityType}`;
  if (operation.entityType === "luchador" && operation.kind === "validate_entity") return "validate:luchador_prepared";
  if (operation.entityType === "luchador" && operation.kind === "find_entity") return "find:luchador";
  if (operation.entityType === "luchador" && operation.kind === "reuse_entity") return "reuse:luchador";
  if (operation.entityType === "luchador" && operation.kind === "create_entity") return "create:luchador";
  if (operation.entityType === "luchador" && operation.kind === "replace_reference") return "replace_reference:noticia:luchador";
  return operation.requiredCapability;
}
