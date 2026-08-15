const JSON_CONTENT_TYPE = /application\/(?:[a-z0-9.+-]+\+)?json/i;

/**
 * Reads an editorial API response without ever attempting to parse an HTML
 * error page as JSON. The caller keeps responsibility for the domain schema.
 */
export async function readEditorialJsonResponse(
  response: Response,
): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!JSON_CONTENT_TYPE.test(contentType)) {
    throw new Error(
      "El servicio editorial devolvió una respuesta no válida.",
    );
  }

  const text = await response.text();

  if (!text.trim()) {
    throw new Error(
      "El servicio editorial devolvió una respuesta vacía.",
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      "El servicio editorial devolvió una respuesta no válida.",
    );
  }
}
