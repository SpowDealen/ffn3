import { postDraftToSanity, type SaveDraftResponse } from "./sanity";

export type SaveDraftInput = {
  contentType: string;
  document: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function ensureDocumentShape(document: Record<string, unknown>): Record<string, unknown> {
  const _type = getString(document._type);

  if (!_type) {
    throw new Error("El documento no incluye _type.");
  }

  return document;
}

export async function saveDraft({
  contentType,
  document,
}: SaveDraftInput): Promise<SaveDraftResponse> {
  if (!getString(contentType)) {
    throw new Error("Falta contentType.");
  }

  if (!isRecord(document)) {
    throw new Error("El documento no es válido.");
  }

  const safeDocument = ensureDocumentShape(document);

  return postDraftToSanity({
    contentType: getString(contentType),
    document: safeDocument,
  });
}