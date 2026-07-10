import { NextResponse } from "next/server";
import { createClient } from "@sanity/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DraftDocument = Record<string, unknown> & {
  _id: string;
  _type: string;
};

type SaveDraftBody = {
  contentType?: string;
  document?: Record<string, unknown>;
};

type UploadedImageResult = {
  document: Record<string, unknown>;
  imageAssetId?: string;
};

type SanityImageValue = {
  _type: "image";
  asset: {
    _type: "reference";
    _ref: string;
  };
};

const MAX_IMAGE_SIZE_BYTES =
  15 * 1024 * 1024;

const sanityClient = createClient({
  projectId:
    process.env
      .NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset:
    process.env
      .NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion:
    process.env
      .NEXT_PUBLIC_SANITY_API_VERSION ||
    "2025-03-01",
  token:
    process.env.SANITY_API_WRITE_TOKEN!,
  useCdn: false,
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods":
    "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization",
  "Cache-Control":
    "no-store, no-cache, must-revalidate",
};

function withCors(
  response: NextResponse,
): NextResponse {
  Object.entries(CORS_HEADERS).forEach(
    ([key, value]) => {
      response.headers.set(key, value);
    },
  );

  return response;
}

function jsonWithCors(
  body: Record<string, unknown>,
  init?: ResponseInit,
): NextResponse {
  return withCors(
    NextResponse.json(body, init),
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );
  } catch {
    return false;
  }
}

function isSanityImageValue(
  value: unknown,
): value is SanityImageValue {
  if (!isRecord(value)) {
    return false;
  }

  if (value._type !== "image") {
    return false;
  }

  if (!isRecord(value.asset)) {
    return false;
  }

  return (
    value.asset._type === "reference" &&
    Boolean(getString(value.asset._ref))
  );
}

function getExternalImageUrl(
  value: unknown,
): string | undefined {
  if (typeof value === "string") {
    const url = value.trim();

    return isHttpUrl(url)
      ? url
      : undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const candidates = [
    value.url,
    value.src,
    value.externalUrl,
    value.imageUrl,
  ];

  for (const candidate of candidates) {
    const url = getString(candidate);

    if (url && isHttpUrl(url)) {
      return url;
    }
  }

  return undefined;
}

function getFileExtension(
  contentType: string,
): string {
  switch (
    contentType.toLowerCase().split(";")[0]
  ) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/avif":
      return "avif";
    default:
      return "jpg";
  }
}

function sanitizeFilename(
  value: string,
): string {
  return value
    .replace(/[?#].*$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function createImageFilename(
  imageUrl: string,
  contentType: string,
): string {
  try {
    const url = new URL(imageUrl);

    const rawFilename =
      url.pathname.split("/").pop() || "";

    const sanitized =
      sanitizeFilename(rawFilename);

    if (
      sanitized &&
      sanitized.includes(".")
    ) {
      return sanitized;
    }
  } catch {
    // Se usa el nombre alternativo inferior.
  }

  const extension =
    getFileExtension(contentType);

  return `ffn3-imagen-${Date.now()}.${extension}`;
}

async function downloadExternalImage(
  imageUrl: string,
): Promise<{
  buffer: Buffer;
  contentType: string;
  filename: string;
}> {
  if (!isHttpUrl(imageUrl)) {
    throw new Error(
      "La imagen principal no contiene una URL HTTP válida.",
    );
  }

  const imageOrigin = new URL(imageUrl).origin;

  const response = await fetch(imageUrl, {
    method: "GET",
    headers: {
      Accept:
        "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Referer: `${imageOrigin}/`,
    },
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `No se pudo descargar la imagen externa. La fuente respondió con estado ${response.status}.`,
    );
  }

  const contentType =
    response.headers
      .get("content-type")
      ?.split(";")[0]
      .trim()
      .toLowerCase() || "";

  if (!contentType.startsWith("image/")) {
    throw new Error(
      `La URL externa no devolvió una imagen válida. Content-Type recibido: ${
        contentType || "desconocido"
      }.`,
    );
  }

  const declaredLength = Number(
    response.headers.get("content-length"),
  );

  if (
    Number.isFinite(declaredLength) &&
    declaredLength >
      MAX_IMAGE_SIZE_BYTES
  ) {
    throw new Error(
      "La imagen externa supera el límite permitido de 15 MB.",
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  if (
    arrayBuffer.byteLength === 0
  ) {
    throw new Error(
      "La imagen externa está vacía.",
    );
  }

  if (
    arrayBuffer.byteLength >
    MAX_IMAGE_SIZE_BYTES
  ) {
    throw new Error(
      "La imagen externa supera el límite permitido de 15 MB.",
    );
  }

  const buffer =
    Buffer.from(arrayBuffer);

  const filename =
    createImageFilename(
      imageUrl,
      contentType,
    );

  return {
    buffer,
    contentType,
    filename,
  };
}

async function uploadExternalImageToSanity(
  imageUrl: string,
): Promise<SanityImageValue> {
  const {
    buffer,
    contentType,
    filename,
  } = await downloadExternalImage(
    imageUrl,
  );

  const asset =
    await sanityClient.assets.upload(
      "image",
      buffer,
      {
        filename,
        contentType,
      },
    );

  if (!asset?._id) {
    throw new Error(
      "Sanity no devolvió el ID del asset de imagen.",
    );
  }

  return {
    _type: "image",
    asset: {
      _type: "reference",
      _ref: asset._id,
    },
  };
}

async function prepareImageField(params: {
  document: Record<string, unknown>;
  fieldName: string;
  missingImageMessage: string;
}): Promise<UploadedImageResult> {
  const {
    document,
    fieldName,
    missingImageMessage,
  } = params;

  const currentImage =
    document[fieldName];

  if (
    isSanityImageValue(currentImage)
  ) {
    return {
      document,
      imageAssetId:
        currentImage.asset._ref,
    };
  }

  const externalImageUrl =
    getExternalImageUrl(currentImage);

  if (!externalImageUrl) {
    throw new Error(
      missingImageMessage,
    );
  }

  const sanityImage =
    await uploadExternalImageToSanity(
      externalImageUrl,
    );

  return {
    document: {
      ...document,
      [fieldName]: sanityImage,
    },
    imageAssetId:
      sanityImage.asset._ref,
  };
}

async function prepareNoticiaImage(
  document: Record<string, unknown>,
): Promise<UploadedImageResult> {
  return prepareImageField({
    document,
    fieldName: "imagenPrincipal",
    missingImageMessage:
      "La noticia necesita una imagen principal. Selecciona una fuente con imagen válida antes de guardar.",
  });
}

async function prepareEventoImage(
  document: Record<string, unknown>,
): Promise<UploadedImageResult> {
  return prepareImageField({
    document,
    fieldName: "imagen",
    missingImageMessage:
      "El evento necesita una imagen. Selecciona una fuente con imagen válida antes de guardar.",
  });
}

async function prepareDocumentAssets(
  document: Record<string, unknown>,
): Promise<UploadedImageResult> {
  const documentType =
    getString(document._type);

  if (documentType === "noticia") {
    return prepareNoticiaImage(document);
  }

  if (documentType === "evento") {
    return prepareEventoImage(document);
  }

  return {
    document,
  };
}

function ensureDraftId(
  document: Record<string, unknown>,
): DraftDocument {
  const currentId =
    getString(document._id);

  const currentType =
    getString(document._type);

  if (!currentType) {
    throw new Error(
      "El documento no incluye _type.",
    );
  }

  const cleanId = currentId.startsWith(
    "drafts.",
  )
    ? currentId
    : currentId
      ? `drafts.${currentId}`
      : `drafts.${crypto.randomUUID()}`;

  return {
    ...document,
    _id: cleanId,
    _type: currentType,
  };
}

function validateEnvironment():
  | string
  | null {
  if (
    !process.env
      .NEXT_PUBLIC_SANITY_PROJECT_ID
  ) {
    return "Falta NEXT_PUBLIC_SANITY_PROJECT_ID.";
  }

  if (
    !process.env
      .NEXT_PUBLIC_SANITY_DATASET
  ) {
    return "Falta NEXT_PUBLIC_SANITY_DATASET.";
  }

  if (
    !process.env
      .SANITY_API_WRITE_TOKEN
  ) {
    return "Falta SANITY_API_WRITE_TOKEN.";
  }

  return null;
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCors(
    new NextResponse(null, {
      status: 204,
    }),
  );
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  try {
    const environmentError =
      validateEnvironment();

    if (environmentError) {
      return jsonWithCors(
        {
          ok: false,
          error: environmentError,
        },
        {
          status: 500,
        },
      );
    }

    let body: SaveDraftBody;

    try {
      body =
        (await request.json()) as SaveDraftBody;
    } catch {
      return jsonWithCors(
        {
          ok: false,
          error:
            "El body no es un JSON válido.",
        },
        {
          status: 400,
        },
      );
    }

    if (!isRecord(body)) {
      return jsonWithCors(
        {
          ok: false,
          error: "Body inválido.",
        },
        {
          status: 400,
        },
      );
    }

    const {
      document,
      contentType,
    } = body;

    if (!isRecord(document)) {
      return jsonWithCors(
        {
          ok: false,
          error:
            "Falta document o no es válido.",
        },
        {
          status: 400,
        },
      );
    }

    const originalDocumentType =
      getString(document._type);

    if (!originalDocumentType) {
      return jsonWithCors(
        {
          ok: false,
          error:
            "El documento no incluye _type.",
        },
        {
          status: 400,
        },
      );
    }

    const prepared =
      await prepareDocumentAssets(
        document,
      );

    const draftDocument =
      ensureDraftId(prepared.document);

    const result =
      await sanityClient.createOrReplace(
        draftDocument,
      );

    return jsonWithCors({
      ok: true,
      message:
        prepared.imageAssetId
          ? "Imagen importada y borrador guardado correctamente."
          : "Borrador guardado correctamente.",
      contentType:
        getString(contentType) ||
        draftDocument._type,
      documentId: result._id,
      documentType: result._type,
      imageAssetId:
        prepared.imageAssetId,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido al guardar borrador.";

    console.error(
      "Error guardando borrador en Sanity:",
      error,
    );

    return jsonWithCors(
      {
        ok: false,
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}