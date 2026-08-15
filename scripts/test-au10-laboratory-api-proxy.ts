import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeApiBaseUrl, resolveApiBaseUrl} from "../_laboratorio/laboratorio-ia/src/lib/apiUrl";

let assertions = 0;
const equal = <T>(actual: T, expected: T): void => { assert.equal(actual, expected); assertions += 1; };
const check = (value: unknown): void => { assert.ok(value); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");

function main(): void {
  equal(normalizeApiBaseUrl(undefined), "");
  equal(normalizeApiBaseUrl("/"), "");
  equal(normalizeApiBaseUrl(" https://api.example.test/// "), "https://api.example.test");
  equal(resolveApiBaseUrl("http://localhost:3000", true), "");
  equal(resolveApiBaseUrl("https://api.example.test", false), "https://api.example.test");

  const vite = source("_laboratorio/laboratorio-ia/vite.config.ts");
  check(vite.includes('proxy: {'));
  check(vite.includes('"/api"'));
  check(vite.includes("FFN3_API_PROXY_TARGET"));
  check(vite.includes("changeOrigin: true"));

  const laboratory = source("_laboratorio/laboratorio-ia/src/components/PanelIA.tsx");
  check(laboratory.includes('getApiBaseUrl()'));
  check(laboratory.includes('`${API_BASE_URL}/api/reference-entities`'));
  check(laboratory.includes('`${API_BASE_URL}/api/sources/ufc/news?'));

  const allLabSources = [
    "_laboratorio/laboratorio-ia/src/components/PanelIA.tsx",
    "_laboratorio/laboratorio-ia/src/lib/sanity.ts",
    "_laboratorio/laboratorio-ia/src/lib/saveDraft.ts",
    "_laboratorio/laboratorio-ia/src/notifications/remote.ts",
    "_laboratorio/laboratorio-ia/src/notifications/telegramHealth.ts",
  ].map(source).join("\n");
  check(!allLabSources.includes("localhost:3000"));
  check(allLabSources.includes('apiUrl("/api/notifications/telegram/health")'));

  for (const endpoint of [
    "app/api/reference-entities/route.ts",
    "app/api/sources/ufc/news/route.ts",
    "app/api/notifications/telegram/health/route.ts",
  ]) {
    const route = source(endpoint);
    check(!route.includes('Access-Control-Allow-Origin", "*"'));
    check(route.includes("LOCAL_DEVELOPMENT_ORIGINS") || route.includes("allowedOrigins"));
  }

  console.log(`AU10 B6.1 laboratory API proxy: OK (${assertions} assertions; same-origin development proxy, explicit production base and strict CORS)`);
}

main();
