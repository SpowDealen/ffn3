import assert from "node:assert/strict";

type JsonObject = Record<string, unknown>;

const nextOrigin = process.env.FFN3_RUNTIME_API_ORIGIN ?? "http://localhost:3000";
const laboratoryOrigin = process.env.FFN3_RUNTIME_PROXY_ORIGIN ?? "http://localhost:5173";

let assertions = 0;

function check(value: unknown, message: string): asserts value {
  assert.ok(value, message);
  assertions += 1;
}

function equal<T>(actual: T, expected: T, message: string): void {
  assert.equal(actual, expected, message);
  assertions += 1;
}

async function readJson(url: string): Promise<JsonObject> {
  const response = await fetch(url, {
    headers: {Accept: "application/json"},
  });

  equal(response.status, 200, `${url} debe responder HTTP 200`);
  check(
    response.headers.get("content-type")?.toLowerCase().includes("application/json"),
    `${url} debe responder Content-Type JSON`,
  );

  const raw = await response.text();
  check(!/^\s*</.test(raw), `${url} no puede responder HTML`);

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    assert.fail(`${url} debe responder JSON válido`);
  }

  check(typeof payload === "object" && payload !== null, `${url} debe responder un objeto`);
  return payload as JsonObject;
}

async function assertReferenceEntities(origin: string): Promise<void> {
  const url = `${origin}/api/reference-entities`;
  const payload = await readJson(url);

  equal(payload.ok, true, `${url} debe confirmar la lectura`);
  check(typeof payload.data === "object" && payload.data !== null, `${url} debe incluir data`);

  const data = payload.data as JsonObject;
  for (const collection of [
    "disciplina",
    "organizacion",
    "evento",
    "categoriaPeso",
    "luchador",
  ]) {
    check(Array.isArray(data[collection]), `${url} debe incluir ${collection}`);
  }

  check(
    Object.values(data).some((value) => Array.isArray(value) && value.length > 0),
    `${url} no puede certificar una carga ficticia vacía`,
  );
}

async function assertTelegramHealth(origin: string): Promise<void> {
  const url = `${origin}/api/notifications/telegram/health`;
  const payload = await readJson(url);

  for (const key of ["ok", "configured", "enabled", "tokenConfigured", "chatIdConfigured"]) {
    check(typeof payload[key] === "boolean", `${url} debe incluir ${key} booleano`);
  }

  for (const forbiddenKey of ["token", "chatId", "secret"]) {
    check(!(forbiddenKey in payload), `${url} no debe exponer ${forbiddenKey}`);
  }
}

async function main(): Promise<void> {
  await assertReferenceEntities(nextOrigin);
  await assertReferenceEntities(laboratoryOrigin);
  await assertTelegramHealth(nextOrigin);
  await assertTelegramHealth(laboratoryOrigin);

  console.log(
    `AU10 B6.11 runtime/API reconciliation: OK (${assertions} assertions; direct and proxied JSON contracts, no HTML errors, no writes)`,
  );
}

void main();
