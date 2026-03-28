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

function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_FFN3_API_BASE_URL;

  if (typeof raw !== "string" || !raw.trim()) {
    return "http://localhost:3000";
  }

  return raw.trim().replace(/\/+$/, "");
}

function ensureDocumentShape(
  document: Record<string, unknown>
): Record<string, unknown> {
  const _type = getString(document._type);

  if (!_type) {
    throw new Error("El documento no incluye _type.");
  }

  return document;
}

async function parseJsonSafely(response: Response): Promise<SaveDraftResponse | null> {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  try {
    return (await response.json()) as SaveDraftResponse;
  } catch {
    return null;
  }
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
  const apiBaseUrl = getApiBaseUrl();

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}/api/guardar-borrador`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        contentType: safeContentType,
        document: safeDocument,
      }),
    });
  } catch {
    throw new Error(
      "No se pudo conectar con /api/guardar-borrador. Revisa que el host Next esté levantado y que CORS esté permitido."
    );
  }

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(
      data?.error ||
        data?.message ||
        `Error HTTP ${response.status} al guardar borrador.`
    );
  }

  if (!data) {
    throw new Error("La respuesta del servidor no es JSON válido.");
  }

  if (!data.ok) {
    throw new Error(data.error || data.message || "Error al guardar borrador.");
  }

  return data;
}