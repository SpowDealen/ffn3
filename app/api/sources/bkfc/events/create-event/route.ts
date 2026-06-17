import {createClient} from "@sanity/client"
import {NextResponse} from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type BkfcEventInput = {
  id?: string
  name?: string
  headline?: string
  mainEvent?: string
  startDate?: string
  endDate?: string
  venue?: string
  city?: string
  region?: string
  country?: string
  locationText?: string
  watchText?: string
  description?: string
  sourceUrl?: string
  canonicalUrl?: string
  imageUrl?: string
  status?: "proximo" | "celebrado" | "cancelado"
}

type RequestBody = {
  confirm?: boolean
  event?: BkfcEventInput
}

type SanityReferenceRecord = {
  _id: string
  nombre?: string
}

type TransformResponse =
  | {
      ok: true
      data: {
        nombre: string
        horaLocal: string
        ciudad: string
        pais: string
        recinto: string
        cartelPrincipal: string
        dondeVer: string
        descripcionCorta: string
        descripcion: string
        notas: string
      }
    }
  | {
      ok: false
      error?: string
    }

type SaveDraftResponse =
  | {
      ok: true
      documentId?: string
      documentType?: string
      imageAssetId?: string
      message?: string
    }
  | {
      ok: false
      error?: string
      message?: string
    }

const projectId =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
  process.env.SANITY_STUDIO_PROJECT_ID

const dataset =
  process.env.NEXT_PUBLIC_SANITY_DATASET ||
  process.env.SANITY_STUDIO_DATASET ||
  "production"

const apiVersion =
  process.env.NEXT_PUBLIC_SANITY_API_VERSION ||
  "2025-03-01"

const token = process.env.SANITY_API_WRITE_TOKEN

const sanityClient = createClient({
  projectId: projectId || "",
  dataset,
  apiVersion,
  token,
  useCdn: false,
  perspective: "raw",
})

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
}

function withCors(response: NextResponse): NextResponse {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  return response
}

function jsonWithCors(
  body: Record<string, unknown>,
  init?: ResponseInit,
): NextResponse {
  return withCors(NextResponse.json(body, init))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
}

function createReference(id: string): {
  _type: "reference"
  _ref: string
} {
  return {
    _type: "reference",
    _ref: id,
  }
}

function validateEnvironment(): string | null {
  if (!projectId) {
    return "Falta NEXT_PUBLIC_SANITY_PROJECT_ID."
  }

  if (!dataset) {
    return "Falta NEXT_PUBLIC_SANITY_DATASET."
  }

  if (!token) {
    return "Falta SANITY_API_WRITE_TOKEN."
  }

  return null
}

async function findRequiredReference(
  type: "disciplina" | "organizacion",
  normalizedName: string,
): Promise<SanityReferenceRecord | null> {
  return sanityClient.fetch<SanityReferenceRecord | null>(
    `*[
      _type == $type &&
      lower(nombre) == $normalizedName
    ][0]{
      _id,
      nombre
    }`,
    {
      type,
      normalizedName,
    },
  )
}

async function findExistingEvent(params: {
  slug: string
  name: string
}): Promise<{
  _id: string
  nombre?: string
  slug?: string
} | null> {
  return sanityClient.fetch(
    `*[
      _type == "evento" &&
      (
        slug.current == $slug ||
        lower(nombre) == lower($name)
      )
    ][0]{
      _id,
      nombre,
      "slug": slug.current
    }`,
    params,
  )
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCors(new NextResponse(null, {status: 204}))
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const environmentError = validateEnvironment()

    if (environmentError) {
      return jsonWithCors(
        {
          ok: false,
          error: environmentError,
        },
        {status: 500},
      )
    }

    let body: RequestBody

    try {
      body = (await request.json()) as RequestBody
    } catch {
      return jsonWithCors(
        {
          ok: false,
          error: "El body no es un JSON válido.",
        },
        {status: 400},
      )
    }

    if (!isRecord(body) || body.confirm !== true || !isRecord(body.event)) {
      return jsonWithCors(
        {
          ok: false,
          error:
            "Debes enviar confirm: true y un evento BKFC válido.",
        },
        {status: 400},
      )
    }

    const event = body.event as BkfcEventInput
    const name = getString(event.name)
    const startDate = getString(event.startDate)
    const imageUrl = getString(event.imageUrl)

    if (!name) {
      return jsonWithCors(
        {
          ok: false,
          error: "El evento no incluye nombre.",
        },
        {status: 400},
      )
    }

    if (!startDate) {
      return jsonWithCors(
        {
          ok: false,
          error:
            "El evento no incluye una fecha válida y no se puede crear con seguridad.",
        },
        {status: 400},
      )
    }

    if (!imageUrl) {
      return jsonWithCors(
        {
          ok: false,
          error:
            "El evento no incluye una imagen oficial válida.",
        },
        {status: 400},
      )
    }

    const slug =
      slugify(name) ||
      slugify(getString(event.id)) ||
      `bkfc-event-${Date.now()}`

    const existingEvent = await findExistingEvent({
      slug,
      name,
    })

    if (existingEvent) {
      return jsonWithCors({
        ok: true,
        skipped: true,
        message: "El evento ya existe en Sanity.",
        event: {
          sourceName: name,
          sanityId: existingEvent._id,
          sanityName: existingEvent.nombre,
          slug: existingEvent.slug,
        },
      })
    }

    const [discipline, organization] = await Promise.all([
      findRequiredReference("disciplina", "bare knuckle"),
      findRequiredReference("organizacion", "bkfc"),
    ])

    if (!discipline?._id) {
      return jsonWithCors(
        {
          ok: false,
          error:
            "No se encontró la disciplina Bare Knuckle en Sanity.",
        },
        {status: 409},
      )
    }

    if (!organization?._id) {
      return jsonWithCors(
        {
          ok: false,
          error:
            "No se encontró la organización BKFC en Sanity.",
        },
        {status: 409},
      )
    }

    const baseUrl = new URL(request.url).origin

    const transformResponse = await fetch(
      `${baseUrl}/api/sources/bkfc/events/transform`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(event),
        cache: "no-store",
      },
    )

    const transformed =
      (await transformResponse.json()) as TransformResponse

    if (!transformResponse.ok || !transformed.ok) {
      return jsonWithCors(
        {
          ok: false,
          error:
            !transformed.ok && transformed.error
              ? transformed.error
              : "No se pudo transformar editorialmente el evento BKFC.",
        },
        {status: 502},
      )
    }

    const documentId = `bkfc-event-${slug}`

    const document: Record<string, unknown> = {
      _id: documentId,
      _type: "evento",
      nombre: transformed.data.nombre || name,
      slug: {
        _type: "slug",
        current: slug,
      },
      organizacion: createReference(organization._id),
      disciplina: createReference(discipline._id),
      fecha: startDate,
      horaLocal: transformed.data.horaLocal,
      ciudad:
        transformed.data.ciudad ||
        getString(event.city),
      pais:
        transformed.data.pais ||
        getString(event.country),
      recinto:
        transformed.data.recinto ||
        getString(event.venue),
      cartelPrincipal:
        transformed.data.cartelPrincipal ||
        getString(event.mainEvent),
      dondeVer:
        transformed.data.dondeVer ||
        getString(event.watchText),
      descripcionCorta:
        transformed.data.descripcionCorta,
      descripcion:
        transformed.data.descripcion,
      notas:
        transformed.data.notas ||
        `Fuente oficial: ${
          getString(event.canonicalUrl) ||
          getString(event.sourceUrl)
        }`,
      imagen: imageUrl,
      estado:
        event.status === "celebrado" ||
        event.status === "cancelado"
          ? event.status
          : "proximo",
    }

    const saveResponse = await fetch(
      `${baseUrl}/api/guardar-borrador`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          contentType: "evento",
          document,
        }),
        cache: "no-store",
      },
    )

    const saved =
      (await saveResponse.json()) as SaveDraftResponse

    if (!saveResponse.ok || !saved.ok) {
      return jsonWithCors(
        {
          ok: false,
          error:
            !saved.ok
              ? saved.error ||
                saved.message ||
                "No se pudo guardar el borrador del evento."
              : "No se pudo guardar el borrador del evento.",
        },
        {status: 502},
      )
    }

    return jsonWithCors({
      ok: true,
      skipped: false,
      message:
        "Evento BKFC transformado y guardado como borrador.",
      event: {
        sourceName: name,
        documentId: saved.documentId,
        documentType: saved.documentType,
        imageAssetId: saved.imageAssetId,
        slug,
        disciplineId: discipline._id,
        organizationId: organization._id,
      },
    })
  } catch (error) {
    console.error(
      "Error creando el borrador del evento BKFC:",
      error,
    )

    return jsonWithCors(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Error desconocido creando el evento BKFC.",
      },
      {status: 500},
    )
  }
}
