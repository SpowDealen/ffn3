/**
 * Resolves laboratory API URLs without coupling browser code to a development
 * port. An empty base deliberately means the current origin.
 */
export function normalizeApiBaseUrl(value: unknown): string {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";

  return trimmed.replace(/\/+$/, "");
}

export function resolveApiBaseUrl(value: unknown, development: boolean): string {
  return development ? "" : normalizeApiBaseUrl(value);
}

export function getApiBaseUrl(): string {
  const environment = (import.meta as ImportMeta & {env?: Readonly<{VITE_FFN3_API_BASE_URL?: unknown; DEV?: boolean}>}).env;
  return resolveApiBaseUrl(
    environment?.VITE_FFN3_API_BASE_URL,
    environment?.DEV === true,
  );
}

export function apiUrl(path: `/api/${string}`): string {
  return `${getApiBaseUrl()}${path}`;
}
