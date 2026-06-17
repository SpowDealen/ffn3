import {createClient} from "@sanity/client"
import {NextResponse} from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type BkfcFightCardItem = {
  weightClass?: string
}

type BkfcEventInput = {
  name?: string
  fightCard?: BkfcFightCardItem[]
}

type RequestBody = {
  confirm?: boolean
  event?: BkfcEventInput
}

type SanityRecord = {
  _id: string
  nombre?: string
  slug?: string
}

type CategoryDefinition = {
  sourceLabel: string
  nombre: string
  slug: string
  limitePeso: number
  unidad: "lb"
  descripcion: string
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

const client = createClient({
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

const CATEGORY_MAP: Record<string, Omit<CategoryDefinition, "sourceLabel">> = {
  "women strawweight": {
    nombre: "Peso paja femenino",
    slug: "peso-paja-femenino-bare-knuckle",
    limitePeso: 115,
    unidad: "lb",
    descripcion:
      "Categoría femenina de peso paja de Bare Knuckle, con límite máximo de 115 libras.",
  },
  "women flyweight": {
    nombre: "Peso mosca femenino",
    slug: "peso-mosca-femenino-bare-knuckle",
    limitePeso: 125,
    unidad: "lb",
    descripcion:
      "Categoría femenina de peso mosca de Bare Knuckle, con límite máximo de 125 libras.",
  },
  "women bantamweight": {
    nombre: "Peso gallo femenino",
    slug: "peso-gallo-femenino-bare-knuckle",
    limitePeso: 135,
    unidad: "lb",
    descripcion:
      "Categoría femenina de peso gallo de Bare Knuckle, con límite máximo de 135 libras.",
  },
  "men flyweight": {
    nombre: "Peso mosca",
    slug: "peso-mosca-bare-knuckle",
    limitePeso: 125,
    unidad: "lb",
    descripcion:
      "Categoría de peso mosca de Bare Knuckle, con límite máximo de 125 libras.",
  },
  flyweight: {
    nombre: "Peso mosca",
    slug: "peso-mosca-bare-knuckle",
    limitePeso: 125,
    unidad: "lb",
    descripcion:
      "Categoría de peso mosca de Bare Knuckle, con límite máximo de 125 libras.",
  },
  bantamweight: {
    nombre: "Peso gallo",
    slug: "peso-gallo-bare-knuckle",
    limitePeso: 135,
    unidad: "lb",
    descripcion:
      "Categoría de peso gallo de Bare Knuckle, con límite máximo de 135 libras.",
  },
  featherweight: {
    nombre: "Peso pluma",
    slug: "peso-pluma-bare-knuckle",
    limitePeso: 145,
    unidad: "lb",
    descripcion:
      "Categoría de peso pluma de Bare Knuckle, con límite máximo de 145 libras.",
  },
  lightweight: {
    nombre: "Peso ligero",
    slug: "peso-ligero-bare-knuckle",
    limitePeso: 155,
    unidad: "lb",
    descripcion:
      "Categoría de peso ligero de Bare Knuckle, con límite máximo de 155 libras.",
  },
  welterweight: {
    nombre: "Peso wélter",
    slug: "peso-welter-bare-knuckle",
    limitePeso: 165,
    unidad: "lb",
    descripcion:
      "Categoría de peso wélter de Bare Knuckle, con límite máximo de 165 libras.",
  },
  middleweight: {
    nombre: "Peso medio",
    slug: "peso-medio-bare-knuckle",
    limitePeso: 175,
    unidad: "lb",
    descripcion:
      "Categoría de peso medio de Bare Knuckle, con límite máximo de 175 libras.",
  },
  "light heavyweight": {
    nombre: "Peso semipesado",
    slug: "peso-semipesado-bare-knuckle",
    limitePeso: 185,
    unidad: "lb",
    descripcion:
      "Categoría de peso semipesado de Bare Knuckle, con límite máximo de 185 libras.",
  },
  cruiserweight: {
    nombre: "Peso crucero",
    slug: "peso-crucero-bare-knuckle",
    limitePeso: 205,
    unidad: "lb",
    descripcion:
      "Categoría de peso crucero de Bare Knuckle, con límite máximo de 205 libras.",
  },
  heavyweight: {
    nombre: "Peso pesado",
    slug: "peso-pesado-bare-knuckle",
    limitePeso: 265,
    unidad: "lb",
    descripcion:
      "Categoría de peso pesado de Bare Knuckle, con límite máximo de 265 libras.",
  },
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

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
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

async function findBareKnuckleDiscipline(): Promise<SanityRecord | null> {
  return client.fetch<SanityRecord | null>(
    `*[
      _type == "disciplina" &&
      lower(nombre) == "bare knuckle"
    ][0]{
      _id,
      nombre
    }`,
  )
}

async function findExistingCategory(params: {
  disciplineId: string
  name: string
  slug: string
}): Promise<SanityRecord | null> {
  return client.fetch<SanityRecord | null>(
    `*[
      _type == "categoriaPeso" &&
      disciplina._ref == $disciplineId &&
      (
        lower(nombre) == lower($name) ||
        slug.current == $slug
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

    if (body.confirm !== true) {
      return jsonWithCors(
        {
          ok: false,
          error:
            "Debes enviar confirm: true para crear las categorías.",
        },
        {status: 400},
      )
    }

    if (!body.event || !Array.isArray(body.event.fightCard)) {
      return jsonWithCors(
        {
          ok: false,
          error:
            "Debes enviar el evento BKFC con su cartelera para detectar las categorías necesarias.",
        },
        {status: 400},
      )
    }

    const discipline = await findBareKnuckleDiscipline()

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

    const sourceLabels = Array.from(
      new Set(
        body.event.fightCard
          .map((fight) => (fight.weightClass || "").trim())
          .filter(Boolean),
      ),
    )

    const candidates: CategoryDefinition[] = []
    const unresolved: string[] = []

    for (const sourceLabel of sourceLabels) {
      const mapped = CATEGORY_MAP[normalize(sourceLabel)]

      if (!mapped) {
        unresolved.push(sourceLabel)
        continue
      }

      candidates.push({
        sourceLabel,
        ...mapped,
      })
    }

    const created: Array<{
      sourceLabel: string
      nombre: string
      documentId: string
      draftId: string
    }> = []

    const skipped: Array<{
      sourceLabel: string
      nombre: string
      sanityId: string
    }> = []

    const failed: Array<{
      sourceLabel: string
      nombre: string
      error: string
    }> = []

    const seenSlugs = new Set<string>()

    for (const category of candidates) {
      if (seenSlugs.has(category.slug)) {
        continue
      }

      seenSlugs.add(category.slug)

      try {
        const existing = await findExistingCategory({
          disciplineId: discipline._id,
          name: category.nombre,
          slug: category.slug,
        })

        if (existing?._id) {
          skipped.push({
            sourceLabel: category.sourceLabel,
            nombre: category.nombre,
            sanityId: existing._id,
          })
          continue
        }

        const documentId = `bkfc-category-${category.slug}`
        const draftId = `drafts.${documentId}`

        await client.createIfNotExists({
          _id: draftId,
          _type: "categoriaPeso",
          nombre: category.nombre,
          slug: {
            _type: "slug",
            current: category.slug,
          },
          disciplina: {
            _type: "reference",
            _ref: discipline._id,
          },
          limitePeso: category.limitePeso,
          unidad: category.unidad,
          descripcion: category.descripcion,
        })

        created.push({
          sourceLabel: category.sourceLabel,
          nombre: category.nombre,
          documentId,
          draftId,
        })
      } catch (error) {
        failed.push({
          sourceLabel: category.sourceLabel,
          nombre: category.nombre,
          error:
            error instanceof Error
              ? error.message
              : "Error desconocido.",
        })
      }
    }

    return jsonWithCors({
      ok: failed.length === 0,
      event: body.event.name || "",
      discipline: {
        sanityId: discipline._id,
        sanityName: discipline.nombre,
      },
      summary: {
        detected: sourceLabels.length,
        candidates: seenSlugs.size,
        created: created.length,
        skipped: skipped.length,
        unresolved: unresolved.length,
        failed: failed.length,
      },
      created,
      skipped,
      unresolved,
      failed,
    })
  } catch (error) {
    console.error(
      "Error creando categorías BKFC:",
      error,
    )

    return jsonWithCors(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Error desconocido creando categorías BKFC.",
      },
      {status: 500},
    )
  }
}
