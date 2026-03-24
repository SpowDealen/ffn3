export type SaveDraftResponse = {
  ok: boolean;
  message?: string;
  error?: string;
  contentType?: string;
  documentId?: string;
  documentType?: string;
};

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
  const safeContentType = getString(contentType);

  if (!safeContentType) {
    throw new Error("Falta contentType.");
  }

  if (!isRecord(document)) {
    throw new Error("El documento no es válido.");
  }

  const safeDocument = ensureDocumentShape(document);

  const response = await fetch("http://localhost:3000/api/guardar-borrador", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contentType: safeContentType,
      document: safeDocument,
    }),
  });

  let data: SaveDraftResponse;

  try {
    data = (await response.json()) as SaveDraftResponse;
  } catch {
    throw new Error("La respuesta del servidor no es válida.");
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Error al guardar borrador.");
  }

  return data;
}