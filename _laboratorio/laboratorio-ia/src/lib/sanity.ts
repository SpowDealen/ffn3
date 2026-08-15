// src/lib/sanity.ts
import {apiUrl} from "./apiUrl";

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

export async function postDraftToSanity(
  payload: SaveDraftRequest
): Promise<SaveDraftResponse> {
  const response = await fetch(apiUrl("/api/guardar-borrador"), {
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
