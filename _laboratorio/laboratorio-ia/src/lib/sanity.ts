// src/lib/sanity.ts

export type SaveDraftRequest = {
  contentType: string;
  document: Record<string, unknown>;
};

export type SaveDraftResponse = {
  ok: boolean;
  message?: string;
  error?: string;
  contentType?: string;
  documentId?: string;
  documentType?: string;
};

function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_FFN3_API_BASE_URL;

  if (typeof raw !== "string" || !raw.trim()) {
    return "http://localhost:3000";
  }

  return raw.trim().replace(/\/+$/, "");
}

export async function postDraftToSanity(
  payload: SaveDraftRequest
): Promise<SaveDraftResponse> {
  const apiBaseUrl = getApiBaseUrl();

  const response = await fetch(`${apiBaseUrl}/api/guardar-borrador`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as SaveDraftResponse;

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "No se pudo guardar el borrador.");
  }

  return data;
}