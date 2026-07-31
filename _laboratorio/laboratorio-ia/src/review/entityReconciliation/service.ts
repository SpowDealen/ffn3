import {computeUniversalFingerprint} from "../universal";
import type {ReviewJsonValue} from "../types";
import {detectDuplicateGroups} from "./detector";
import {getEntityIdentityProfile} from "./profiles";
import {requireEntityCapability} from "./capabilities";
import {ENTITY_RECONCILIATION_RULES_VERSION, type CorpusScanRequest, type EntityCorpusReadAdapter, type EntityProjection, type ReconciliationScanResult} from "./types";

const fp = (value: unknown) => computeUniversalFingerprint(value as ReviewJsonValue);
export function validateCorpusScanRequest(value: unknown): CorpusScanRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_scan_request");
  const input = value as Record<string, unknown>;
  if (input.version !== 1 || !["fighter", "event", "organization", "weight_category"].includes(String(input.kind)) || !["all", "recent"].includes(String(input.scope))) throw new Error("invalid_scan_request");
  for (const key of Object.keys(input)) if (!["version", "kind", "scope", "limit", "cursor", "maxGroups", "maxBlockSize"].includes(key)) throw new Error("unexpected_scan_field");
  const limit = Number(input.limit), maxGroups = Number(input.maxGroups), maxBlockSize = Number(input.maxBlockSize);
  if (!Number.isSafeInteger(limit) || limit < 2 || limit > 250 || !Number.isSafeInteger(maxGroups) || maxGroups < 1 || maxGroups > 50 || !Number.isSafeInteger(maxBlockSize) || maxBlockSize < 2 || maxBlockSize > 25) throw new Error("invalid_scan_limits");
  if (input.cursor !== undefined && (typeof input.cursor !== "string" || input.cursor.length > 180)) throw new Error("invalid_scan_cursor");
  return input as unknown as CorpusScanRequest;
}
export async function scanExistingEntities(adapter: EntityCorpusReadAdapter, rawRequest: unknown, signal?: AbortSignal, now = new Date()): Promise<ReconciliationScanResult> {
  const request = validateCorpusScanRequest(rawRequest); requireEntityCapability(request.kind, "reconciliation_scan"); if (!adapter.supports(request.kind)) throw new Error("scan_capability_unavailable");
  const read = await adapter.read(request, signal); const profile = getEntityIdentityProfile(request.kind);
  const projected: EntityProjection[] = [];
  for (const record of read.records.slice(0, request.limit)) { try { projected.push(profile.project(record, adapter.adapterId)); } catch { /* malformed projections are safely ignored and reported */ } }
  const warnings = [...read.warnings, ...(projected.length < read.records.slice(0, request.limit).length ? ["Algunas proyecciones no cumplieron el contrato."] : [])];
  const status = read.records.length > request.limit ? "truncated" : read.status;
  const ordered = [...projected].sort((left, right) => left.logicalId.localeCompare(right.logicalId) || left.snapshotFingerprint.localeCompare(right.snapshotFingerprint));
  const groups = detectDuplicateGroups({kind: request.kind, records: ordered, readStatus: status, maxGroups: request.maxGroups, maxBlockSize: request.maxBlockSize});
  const scanFingerprint = fp({request, status, records: ordered.map((item) => [item.logicalId, item.snapshotFingerprint]), groups: groups.map((item) => item.groupFingerprint), rulesVersion: ENTITY_RECONCILIATION_RULES_VERSION});
  return {version: 1, rulesVersion: ENTITY_RECONCILIATION_RULES_VERSION, kind: request.kind, scope: request.scope, status, groups, scanFingerprint, scannedAt: now.toISOString(), cursor: read.cursor, warnings};
}
export function createInMemoryCorpusAdapter(recordsByKind: Partial<Record<CorpusScanRequest["kind"], unknown[]>>, status: "complete" | "partial" | "truncated" | "unavailable" = "complete"): EntityCorpusReadAdapter {
  return {adapterId: "dev.in-memory", supports: (kind) => Boolean(recordsByKind[kind]), async read(request, signal) { if (signal?.aborted) return {status: "cancelled", records: [], warnings: ["Lectura cancelada."], provenance: {adapterId: "dev.in-memory", capability: "entity_reconciliation_scan"}}; const records = recordsByKind[request.kind] ?? []; return {status, records: records.slice(0, request.limit + 1), cursor: records.length > request.limit ? String(request.limit) : undefined, warnings: status === "complete" ? [] : ["Lectura incompleta."], provenance: {adapterId: "dev.in-memory", capability: "entity_reconciliation_scan"}}; }};
}
