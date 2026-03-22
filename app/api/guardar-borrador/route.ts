// app/api/guardar-borrador/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@sanity/client";

type DraftDocument = Record<string, unknown> & {
  _id: string;
  _type: string;
};

type SaveDraftBody = {
  contentType?: string;
  document?: Record<string, unknown>;
};

const sanityClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-03-01",
  token: process.env.SANITY_API_WRITE_TOKEN!,
  useCdn: false,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function ensureDraftId(document: Record<string, unknown>): DraftDocument {
  const currentId = getString(document._id);
  const currentType = getString(document._type);

  if (!currentType) {
    throw new Error("El documento no incluye _type.");
  }

  const cleanId = currentId.startsWith("drafts.")
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

export async function POST(request: Request) {
  try {
    if (!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID) {
      return NextResponse.json(
        { ok: false, error: "Falta NEXT_PUBLIC_SANITY_PROJECT_ID." },
        { status: 500 }
      );
    }

    if (!process.env.NEXT_PUBLIC_SANITY_DATASET) {
      return NextResponse.json(
        { ok: false, error: "Falta NEXT_PUBLIC_SANITY_DATASET." },
        { status: 500 }
      );
    }

    if (!process.env.SANITY_API_WRITE_TOKEN) {
      return NextResponse.json(
        { ok: false, error: "Falta SANITY_API_WRITE_TOKEN." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as SaveDraftBody;

    if (!isRecord(body)) {
      return NextResponse.json(
        { ok: false, error: "Body inválido." },
        { status: 400 }
      );
    }

    const { document, contentType } = body;

    if (!isRecord(document)) {
      return NextResponse.json(
        { ok: false, error: "Falta document o no es válido." },
        { status: 400 }
      );
    }

    const draftDocument = ensureDraftId(document);

    const result = await sanityClient.createOrReplace(draftDocument);

    return NextResponse.json({
      ok: true,
      message: "Borrador guardado correctamente.",
      contentType: getString(contentType) || draftDocument._type,
      documentId: result._id,
      documentType: result._type,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido al guardar borrador.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}