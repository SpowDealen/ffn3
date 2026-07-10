import {createClient} from "@sanity/client"
import {NextResponse} from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type DisciplineKey = "kickboxing" | "muay_thai" | "mixed"
type GenderKey = "masculino" | "femenino" | "mixto" | "otro"
type AgeGroup =
  | "senior"
  | "veterano"
  | "junior"
  | "juvenil"
  | "cadete"
  | "infantil"
  | "otro"
type Confidence = "alta" | "media" | "baja"

type SourceParticipant = {
  id?: string
  name?: string
  federationCode?: string
  discipline?: DisciplineKey
  disciplineLabel?: string
  categoryLabel?: string
  weightLabel?: string
  limitKg?: number
  gender?: GenderKey
  ageGroup?: AgeGroup
  eventName?: string
  confidence?: Confidence
  reviewRequired?: boolean
  warnings?: string[]
  sourceDocumentTitle?: string
  sourcePdfUrl?: string
}

type RequestBody = {
  confirm?: boolean
  participants?: SourceParticipant[]
}

type ReferenceDoc = {
  _id: string
  nombre?: string
  slug?: {current?: string}
}

type CategoryDoc = ReferenceDoc & {
  limitePeso?: number
  unidad?: "kg" | "lb"
  disciplina?: {_ref?: string} | null
}

type FighterDoc = ReferenceDoc & {
  disciplina?: {_ref?: string} | null
  organizacion?: {_ref?: string} | null
  categoriaPeso?: {_ref?: string} | null
}

const projectId =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
  process.env.SANITY_STUDIO_PROJECT_ID

const dataset =
  process.env.NEXT_PUBLIC_SANITY_DATASET ||
  process.env.SANITY_STUDIO_DATASET ||
  "production"

const apiVersion =
  process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-03-01"

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

function withCors<T>(response: NextResponse<T>): NextResponse<T> {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function normalize(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function slugify(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
}

function baseId(value: string): string {
  return value.replace(/^drafts\./, "")
}

function reference(id: string): {_type: "reference"; _ref: string} {
  // Conserva el ID real resuelto. Si la relación apunta a un borrador,
  // Sanity necesita recibir "drafts.<id>"; quitar el prefijo rompería
  // la referencia mientras no exista la versión publicada.
  return {_type: "reference", _ref: id}
}

function preferDraft<T extends {_id: string}>(docs: T[]): T[] {
  const grouped = new Map<string, T>()

  for (const doc of docs) {
    const key = baseId(doc._id)
    const current = grouped.get(key)
    if (!current || doc._id.startsWith("drafts.")) grouped.set(key, doc)
  }

  return Array.from(grouped.values())
}

function disciplineAliases(key: DisciplineKey): string[] {
  if (key === "muay_thai") {
    return ["muay thai", "muaythai", "boxeo tailandes"]
  }

  if (key === "mixed") {
    return ["kickboxing", "kick boxing", "muay thai", "muaythai"]
  }

  return ["kickboxing", "kick boxing", "kick-boxing", "k1", "k-1"]
}

function resolveByAliases<T extends ReferenceDoc>(
  docs: T[],
  aliases: string[],
): T | undefined {
  const normalizedAliases = aliases.map(normalize)

  return docs.find((doc) => {
    const values = [doc.nombre ?? "", doc.slug?.current ?? ""].map(normalize)
    return values.some((value) =>
      normalizedAliases.some(
        (alias) => value === alias || value.includes(alias),
      ),
    )
  })
}

function resolveExactName<T extends ReferenceDoc>(
  docs: T[],
  name: string,
): T | undefined {
  const target = normalize(name)
  return docs.find((doc) => normalize(doc.nombre ?? "") === target)
}

function levenshteinDistance(left: string, right: string): number {
  const rows = left.length + 1
  const columns = right.length + 1
  const matrix = Array.from({length: rows}, () =>
    Array<number>(columns).fill(0),
  )

  for (let row = 0; row < rows; row += 1) matrix[row][0] = row
  for (let column = 0; column < columns; column += 1) {
    matrix[0][column] = column
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      )
    }
  }

  return matrix[left.length][right.length]
}

function nameSimilarity(left: string, right: string): number {
  const normalizedLeft = normalize(left)
  const normalizedRight = normalize(right)
  const longest = Math.max(normalizedLeft.length, normalizedRight.length)
  if (longest === 0) return 1

  return (
    1 -
    levenshteinDistance(normalizedLeft, normalizedRight) / longest
  )
}

function resolveProbableFighter(
  fighters: FighterDoc[],
  participant: SourceParticipant,
  disciplineId?: string,
  organizationId?: string,
): FighterDoc | undefined {
  const name = text(participant.name)
  if (!name) return undefined

  return fighters
    .filter((fighter) => {
      const sameDiscipline =
        !disciplineId ||
        baseId(fighter.disciplina?._ref ?? "") === baseId(disciplineId)
      const sameOrganization =
        !organizationId ||
        !fighter.organizacion?._ref ||
        baseId(fighter.organizacion._ref) === baseId(organizationId)

      return sameDiscipline && sameOrganization
    })
    .map((fighter) => ({
      fighter,
      similarity: nameSimilarity(name, fighter.nombre ?? ""),
    }))
    .filter((candidate) => candidate.similarity >= 0.86)
    .sort((left, right) => right.similarity - left.similarity)[0]?.fighter
}

function resolveCategory(
  categories: CategoryDoc[],
  participant: SourceParticipant,
  disciplineId?: string,
): CategoryDoc | undefined {
  const relevant = categories.filter((doc) => {
    return (
      !disciplineId ||
      baseId(doc.disciplina?._ref ?? "") === baseId(disciplineId)
    )
  })

  const limit = participant.limitKg
  const gender =
    participant.gender && participant.gender !== "otro"
      ? normalize(participant.gender)
      : undefined
  const ageGroup =
    participant.ageGroup && participant.ageGroup !== "otro"
      ? normalize(participant.ageGroup)
      : undefined

  return relevant.find((doc) => {
    const sameUnit = !doc.unidad || doc.unidad === "kg"
    const sameLimit =
      typeof limit === "number" &&
      typeof doc.limitePeso === "number" &&
      Math.abs(doc.limitePeso - limit) < 0.001

    if (!sameUnit || !sameLimit) return false

    const name = normalize(doc.nombre ?? "")
    if (gender && !name.includes(gender)) return false
    if (ageGroup && !name.includes(ageGroup)) return false

    return true
  })
}

function validateEnv(): string | null {
  if (!projectId) {
    return "Falta NEXT_PUBLIC_SANITY_PROJECT_ID o SANITY_STUDIO_PROJECT_ID."
  }
  if (!dataset) {
    return "Falta NEXT_PUBLIC_SANITY_DATASET o SANITY_STUDIO_DATASET."
  }
  if (!token) return "Falta SANITY_API_WRITE_TOKEN."
  return null
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCors(new NextResponse(null, {status: 204}))
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const envError = validateEnv()
    if (envError) {
      return withCors(
        NextResponse.json({ok: false, error: envError}, {status: 500}),
      )
    }

    let body: RequestBody
    try {
      body = (await request.json()) as RequestBody
    } catch {
      return withCors(
        NextResponse.json(
          {ok: false, error: "El body no es un JSON válido."},
          {status: 400},
        ),
      )
    }

    if (!body.confirm) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error:
              "Falta confirmación explícita para crear participantes FEKM.",
          },
          {status: 400},
        ),
      )
    }

    const participants = Array.isArray(body.participants)
      ? body.participants
      : []

    if (participants.length === 0) {
      return withCors(
        NextResponse.json(
          {ok: false, error: "No se recibieron participantes FEKM."},
          {status: 400},
        ),
      )
    }

    const [disciplineDocs, organizationDocs, categoryDocs, fighterDocs] =
      await Promise.all([
        client.fetch<ReferenceDoc[]>(
          `*[_type == "disciplina"]{_id,nombre,slug}`,
          {},
          {perspective: "raw"},
        ),
        client.fetch<ReferenceDoc[]>(
          `*[_type == "organizacion"]{_id,nombre,slug}`,
          {},
          {perspective: "raw"},
        ),
        client.fetch<CategoryDoc[]>(
          `*[_type == "categoriaPeso"]{_id,nombre,slug,limitePeso,unidad,disciplina}`,
          {},
          {perspective: "raw"},
        ),
        client.fetch<FighterDoc[]>(
          `*[_type == "luchador"]{_id,nombre,slug,disciplina,organizacion,categoriaPeso}`,
          {},
          {perspective: "raw"},
        ),
      ])

    const disciplines = preferDraft(disciplineDocs)
    const organizations = preferDraft(organizationDocs)
    const categories = preferDraft(categoryDocs)
    const fighters = preferDraft(fighterDocs)
    const fekm = resolveByAliases(organizations, [
      "FEKM",
      "Federación Española de Kickboxing y Muaythai",
      "Federacion Espanola de Kickboxing y Muaythai",
    ])

    const created: Array<{
      name: string
      draftId: string
      discipline: string
      organization: string
      category: string
    }> = []
    const skipped: Array<{
      name: string
      reason: string
      blockingReasons?: string[]
      existingFighter?: FighterDoc | null
    }> = []
    const failed: Array<{name: string; error: string}> = []
    const seenNames = new Set<string>()

    for (const participant of participants) {
      const name = text(participant.name)
      const normalizedName = normalize(name)
      const blockingReasons: string[] = []

      if (!name) blockingReasons.push("nombre_deportista_obligatorio")
      if (participant.reviewRequired) {
        blockingReasons.push("revision_manual_requerida")
      }
      if (participant.confidence !== "alta") {
        blockingReasons.push(
          "confianza_insuficiente_para_creacion_automatica",
        )
      }

      const disciplineKey = participant.discipline ?? "kickboxing"
      const discipline = resolveByAliases(
        disciplines,
        disciplineAliases(disciplineKey),
      )
      if (!discipline) {
        blockingReasons.push("disciplina_no_resuelta_en_sanity")
      }
      if (!fekm) {
        blockingReasons.push("organizacion_fekm_no_resuelta_en_sanity")
      }

      const category = resolveCategory(
        categories,
        participant,
        discipline?._id,
      )
      const categoryExpected = Boolean(
        participant.categoryLabel ||
          participant.weightLabel ||
          typeof participant.limitKg === "number",
      )
      if (categoryExpected && !category) {
        blockingReasons.push("categoria_peso_no_resuelta_en_sanity")
      }

      const exactFighter = name
        ? resolveExactName(fighters, name)
        : undefined
      const probableFighter =
        !exactFighter && name
          ? resolveProbableFighter(
              fighters,
              participant,
              discipline?._id,
              fekm?._id,
            )
          : undefined

      if (exactFighter) blockingReasons.push("luchador_ya_existente")
      if (probableFighter) {
        blockingReasons.push("posible_luchador_duplicado")
      }
      if (normalizedName && seenNames.has(normalizedName)) {
        blockingReasons.push("duplicado_en_la_peticion")
      }

      const uniqueBlockingReasons = unique(blockingReasons)
      if (uniqueBlockingReasons.length > 0) {
        skipped.push({
          name,
          reason: uniqueBlockingReasons[0],
          blockingReasons: uniqueBlockingReasons,
          existingFighter: exactFighter ?? probableFighter ?? null,
        })
        continue
      }

      seenNames.add(normalizedName)

      const slug = slugify(name)
      const documentId = `fekm-participant-${slug}`
      const draftId = `drafts.${documentId}`

      try {
        await client.createIfNotExists({
          _id: draftId,
          _type: "luchador",
          nombre: name,
          slug: {_type: "slug", current: slug},
          disciplina: reference(discipline!._id),
          organizacion: reference(fekm!._id),
          categoriaPeso: reference(category!._id),
        })

        fighters.push({
          _id: draftId,
          nombre: name,
          slug: {current: slug},
          disciplina: reference(discipline!._id),
          organizacion: reference(fekm!._id),
          categoriaPeso: reference(category!._id),
        })

        created.push({
          name,
          draftId,
          discipline: discipline!.nombre ?? disciplineKey,
          organization: fekm!.nombre ?? "FEKM",
          category: category!.nombre ?? participant.categoryLabel ?? "",
        })
      } catch (error) {
        failed.push({
          name,
          error:
            error instanceof Error
              ? error.message
              : "Error desconocido creando el participante.",
        })
      }
    }

    return withCors(
      NextResponse.json({
        ok: failed.length === 0,
        source: "fekm",
        summary: {
          received: participants.length,
          created: created.length,
          skipped: skipped.length,
          failed: failed.length,
        },
        created,
        skipped,
        failed,
      }),
    )
  } catch (error) {
    console.error("Error creando participantes FEKM:", error)
    return withCors(
      NextResponse.json(
        {
          ok: false,
          source: "fekm",
          error:
            error instanceof Error
              ? error.message
              : "Error desconocido creando participantes FEKM.",
        },
        {status: 500},
      ),
    )
  }
}
