import {apiUrl} from "../lib/apiUrl";
import {readEditorialJsonResponse} from "../lib/editorialJsonResponse";
import {getTelegramHealth, type TelegramHealthResponse} from "../notifications/telegramHealth";
import type {ReferenceEntitiesObservation, RuntimeObservation} from "./adapters";

export type GlobalLiveChecks = Readonly<{
  runtime: RuntimeObservation;
  references: ReferenceEntitiesObservation;
  telegram: Readonly<{checking: boolean; health: TelegramHealthResponse | null; error?: string}>;
}>;

type ReferenceCheckResult = Readonly<{runtimeReachable: boolean; observation: ReferenceEntitiesObservation}>;

export const INITIAL_GLOBAL_LIVE_CHECKS: GlobalLiveChecks = Object.freeze({
  runtime: Object.freeze({state: "checking"}),
  references: Object.freeze({state: "checking"}),
  telegram: Object.freeze({checking: true, health: null}),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function checkReferenceEntities(): Promise<ReferenceCheckResult> {
  let runtimeReachable = false;
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(apiUrl("/api/reference-entities"), {method: "GET", cache: "no-store"});
    runtimeReachable = true;
    const payload = await readEditorialJsonResponse(response);
    if (!response.ok || !isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) {
      return {runtimeReachable, observation: {state: "unavailable", checkedAt, reason: isRecord(payload) && typeof payload.code === "string" ? payload.code : "reference_entities_unavailable"}};
    }
    const entityCount = Object.values(payload.data).reduce<number>((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0);
    return {runtimeReachable, observation: {state: "available", checkedAt, entityCount}};
  } catch {
    return {runtimeReachable, observation: {state: "unavailable", checkedAt, reason: runtimeReachable ? "reference_response_invalid" : "reference_runtime_unreachable"}};
  }
}

export async function readGlobalLiveChecks(): Promise<GlobalLiveChecks> {
  const [referenceResult, telegramResult] = await Promise.all([
    checkReferenceEntities(),
    getTelegramHealth().then((health) => ({health, error: undefined})).catch(() => ({health: null, error: "telegram_health_unavailable"})),
  ]);
  const checkedAt = new Date().toISOString();
  const runtimeAvailable = referenceResult.runtimeReachable || telegramResult.health !== null;
  return Object.freeze({
    runtime: Object.freeze(runtimeAvailable ? {state: "available" as const, checkedAt} : {state: "unavailable" as const, checkedAt, reason: "laboratory_runtime_unreachable"}),
    references: Object.freeze(referenceResult.observation),
    telegram: Object.freeze({checking: false, health: telegramResult.health, ...(telegramResult.error ? {error: telegramResult.error} : {})}),
  });
}
