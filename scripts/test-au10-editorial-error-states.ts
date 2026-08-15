import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classifyEditorialReadError} from "../_laboratorio/laboratorio-ia/src/lib/editorialReadError";

let assertions = 0;
const equal = <T>(actual: T, expected: T): void => { assert.equal(actual, expected); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");

function main(): void {
  const network = classifyEditorialReadError(new TypeError("Failed to fetch"));
  equal(network.kind, "network");
  equal(network.message, "No se pudo conectar con el servicio editorial.");
  equal(network.retryable, true);

  const timeout = classifyEditorialReadError(new DOMException("The operation timed out", "AbortError"));
  equal(timeout.kind, "timeout");
  equal(timeout.message, "El servicio editorial tardó demasiado en responder.");
  equal(timeout.retryable, true);

  const unavailable = classifyEditorialReadError({status: 503});
  equal(unavailable.kind, "service_unavailable");
  equal(unavailable.message, "El servicio no está disponible temporalmente.");
  equal(unavailable.retryable, true);

  const missing = classifyEditorialReadError({status: 404});
  equal(missing.kind, "not_found");
  equal(missing.retryable, false);
  const permission = classifyEditorialReadError(new Error("HTTP 403"));
  equal(permission.kind, "permission");
  equal(permission.retryable, false);
  const unknown = classifyEditorialReadError(new SyntaxError("Unexpected token < in JSON"));
  equal(unknown.kind, "unknown");
  equal(unknown.message, "Ha ocurrido un problema al recuperar la información.");
  check(!unknown.message.includes("Unexpected token"));
  check(!network.message.includes("Failed to fetch"));

  const panel = source("_laboratorio/laboratorio-ia/src/components/PanelIA.tsx");
  const activity = source("_laboratorio/laboratorio-ia/src/notifications/ActivityCenter.tsx");
  const classifier = source("_laboratorio/laboratorio-ia/src/lib/editorialReadError.ts");
  check(panel.includes("classifyEditorialReadError"));
  check(panel.includes("function EditorialLoadFeedback"));
  check(panel.includes('role={isError ? "alert" : "status"}'));
  check(panel.includes('"Reintentar"'));
  check(panel.includes("reloadReferenceEntities"));
  check(panel.includes("reloadExternalNews"));
  check(panel.includes("reloadOfficialUfcNews"));
  check(panel.includes("reloadOfficialBkfcNews"));
  check(panel.includes("reloadOfficialOneNews"));
  check(panel.includes("reloadOfficialFekmNews"));
  check(panel.includes("reloadOfficialUfcEvents"));
  check(panel.includes("reloadOfficialBkfcEvents"));
  check(panel.includes("reloadOfficialOneEvents"));
  check(panel.includes("reloadOfficialFekmEvents"));
  check(panel.includes("console.warn(\"[FFN3] Error técnico"));
  check(activity.includes("telegramEditorialError"));
  check(activity.includes('role="alert"'));
  check(activity.includes("Reintentar"));
  check(classifier.includes("failed to fetch"));
  check(classifier.includes("service_unavailable"));
  check(!classifier.includes("fetch("));
  check(!classifier.includes("localStorage"));
  check(!classifier.includes("Sanity"));
  console.log(`AU10 B6.5 editorial error states: OK (${assertions} assertions; safe transport classification, existing retries, accessible alerts and zero domain writes)`);
}

main();
