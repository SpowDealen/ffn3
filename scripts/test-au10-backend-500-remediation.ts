import assert from "node:assert/strict";
import {loadEnvConfig} from "@next/env";
import {readEditorialJsonResponse} from "../_laboratorio/laboratorio-ia/src/lib/editorialJsonResponse";
import {classifyEditorialReadError} from "../_laboratorio/laboratorio-ia/src/lib/editorialReadError";

type EnvironmentKey =
  | "NEXT_PUBLIC_SANITY_PROJECT_ID"
  | "NEXT_PUBLIC_SANITY_DATASET"
  | "SANITY_STUDIO_PROJECT_ID"
  | "SANITY_STUDIO_DATASET"
  | "TELEGRAM_BOT_TOKEN"
  | "TELEGRAM_CHAT_ID";

const environmentKeys: readonly EnvironmentKey[] = [
  "NEXT_PUBLIC_SANITY_PROJECT_ID",
  "NEXT_PUBLIC_SANITY_DATASET",
  "SANITY_STUDIO_PROJECT_ID",
  "SANITY_STUDIO_DATASET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
];

function snapshotEnvironment(): Map<EnvironmentKey, string | undefined> {
  return new Map(environmentKeys.map((key) => [key, process.env[key]]));
}

function restoreEnvironment(snapshot: Map<EnvironmentKey, string | undefined>): void {
  for (const key of environmentKeys) {
    const value = snapshot.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function json(response: Response): Promise<Record<string, unknown>> {
  const payload = await response.json();
  assert.equal(typeof payload, "object");
  assert.notEqual(payload, null);
  return payload as Record<string, unknown>;
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const originalEnvironment = snapshotEnvironment();
  let assertions = 0;
  const check = (value: unknown, message?: string): void => {
    assert.ok(value, message);
    assertions += 1;
  };
  const equal = <T>(actual: T, expected: T, message?: string): void => {
    assert.equal(actual, expected, message);
    assertions += 1;
  };

  try {
    const referenceRoute = await import("../app/api/reference-entities/route");
    const healthRoute = await import("../app/api/notifications/telegram/health/route");

    const referenceResponse = await referenceRoute.GET(
      new Request("http://localhost/api/reference-entities"),
    );
    const referencePayload = await json(referenceResponse);
    equal(referenceResponse.status, 200, "reference-entities debe responder OK con configuración válida");
    equal(referencePayload.ok, true);
    check(typeof referencePayload.data === "object" && referencePayload.data !== null);

    delete process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_SANITY_DATASET;
    delete process.env.SANITY_STUDIO_PROJECT_ID;
    delete process.env.SANITY_STUDIO_DATASET;
    const missingReferenceResponse = await referenceRoute.GET(
      new Request("http://localhost/api/reference-entities"),
    );
    const missingReferencePayload = await json(missingReferenceResponse);
    equal(missingReferenceResponse.status, 503);
    equal(missingReferencePayload.ok, false);
    equal(missingReferencePayload.code, "reference_entities_unavailable");
    equal(
      classifyEditorialReadError(
        new Error(`HTTP ${missingReferenceResponse.status}: configuración ausente`),
      ).kind,
      "service_unavailable",
    );

    restoreEnvironment(originalEnvironment);
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    const healthResponse = await healthRoute.GET(
      new Request("http://localhost/api/notifications/telegram/health"),
    );
    const healthPayload = await json(healthResponse);
    equal(healthResponse.status, 200, "el health GET no debe requerir configuración de envío");
    equal(healthPayload.ok, false);
    equal(healthPayload.configured, false);
    equal(healthPayload.tokenConfigured, false);
    equal(healthPayload.chatIdConfigured, false);

    await assert.rejects(
      readEditorialJsonResponse(
        new Response("<html>backend error</html>", {
          status: 500,
          headers: {"Content-Type": "text/html"},
        }),
      ),
      /respuesta no válida/,
    );
    assertions += 1;

    const safePayload = await readEditorialJsonResponse(
      new Response(JSON.stringify({ok: true}), {
        headers: {"Content-Type": "application/json; charset=utf-8"},
      }),
    );
    assert.deepEqual(safePayload, {ok: true});
    assertions += 1;

    console.log(`AU10 B6.7 backend 500 remediation: OK (${assertions} assertions; read-only routes, controlled missing configuration, non-JSON rejected before parsing, real writes: 0)`);
  } finally {
    restoreEnvironment(originalEnvironment);
  }
}

void main();
