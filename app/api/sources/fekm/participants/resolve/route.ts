import {createClient} from "@sanity/client"
import {NextResponse} from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const sanityClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-03-01",
  token: process.env.SANITY_API_WRITE_TOKEN,
  useCdn: false,
  perspective: "raw",
})

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
  rank?: number
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

type EventDoc = ReferenceDoc & {
  fecha?: string
}

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

function baseId(value: string): string {
  return value.replace(/^drafts\./, "")
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
  const name = participant.name?.trim()
  if (!name) return undefined

  const candidates = fighters.filter((fighter) => {
    const sameDiscipline =
      !disciplineId ||
      baseId(fighter.disciplina?._ref ?? "") === baseId(disciplineId)
    const sameOrganization =
      !organizationId ||
      !fighter.organizacion?._ref ||
      baseId(fighter.organizacion._ref) === baseId(organizationId)

    return sameDiscipline && sameOrganization
  })

  return candidates
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

  const label = normalize(
    participant.categoryLabel ?? participant.weightLabel ?? "",
  )
  const limit = participant.limitKg
  const gender =
    participant.gender && participant.gender !== "otro"
      ? normalize(participant.gender)
      : undefined
  const ageGroup =
    participant.ageGroup && participant.ageGroup !== "otro"
      ? normalize(participant.ageGroup)
      : undefined

  const structural = relevant.find((doc) => {
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

  if (structural) return structural

  return relevant.find((doc) => {
    const name = normalize(doc.nombre ?? "")
    if (label && (name === label || name.includes(label) || label.includes(name))) {
      return true
    }

    if (typeof limit === "number") {
      const normalizedLimit = String(limit).replace(".", "[.,]")
      if (!new RegExp(`\\b${normalizedLimit}(?:[.,]0)?\\b`).test(name)) {
        return false
      }
    }

    if (gender && !name.includes(gender)) return false
    if (ageGroup && !name.includes(ageGroup)) return false

    return typeof limit === "number"
  })
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, {status: 204}))
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as
      | {participants?: SourceParticipant[]}
      | SourceParticipant[]

    const participants = Array.isArray(body)
      ? body
      : Array.isArray(body.participants)
        ? body.participants
        : []

    if (!participants.length) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error: "participants debe contener al menos un deportista.",
          },
          {status: 400},
        ),
      )
    }

    const [disciplineDocs, organizationDocs, categoryDocs, fighterDocs, eventDocs] =
      await Promise.all([
        sanityClient.fetch<ReferenceDoc[]>(
          `*[_type == "disciplina"]{_id,nombre,slug}`,
        ),
        sanityClient.fetch<ReferenceDoc[]>(
          `*[_type == "organizacion"]{_id,nombre,slug}`,
        ),
        sanityClient.fetch<CategoryDoc[]>(
          `*[_type == "categoriaPeso"]{_id,nombre,slug,limitePeso,unidad,disciplina}`,
        ),
        sanityClient.fetch<FighterDoc[]>(
          `*[_type == "luchador"]{_id,nombre,slug,disciplina,organizacion,categoriaPeso}`,
        ),
        sanityClient.fetch<EventDoc[]>(
          `*[_type == "evento"]{_id,nombre,slug,fecha}`,
        ),
      ])

    const disciplines = preferDraft(disciplineDocs)
    const organizations = preferDraft(organizationDocs)
    const categories = preferDraft(categoryDocs)
    const fighters = preferDraft(fighterDocs)
    const events = preferDraft(eventDocs)
    const fekm = resolveByAliases(organizations, [
      "FEKM",
      "Federación Española de Kickboxing y Muaythai",
      "Federacion Espanola de Kickboxing y Muaythai",
    ])

    const items = participants.map((participant) => {
      const name =
        typeof participant.name === "string" ? participant.name.trim() : ""
      const disciplineKey = participant.discipline ?? "kickboxing"
      const discipline = resolveByAliases(
        disciplines,
        disciplineAliases(disciplineKey),
      )
      const category = resolveCategory(
        categories,
        participant,
        discipline?._id,
      )
      const existingFighter = name
        ? resolveExactName(fighters, name)
        : undefined
      const probableFighter =
        !existingFighter && name
          ? resolveProbableFighter(
              fighters,
              participant,
              discipline?._id,
              fekm?._id,
            )
          : undefined
      const event = participant.eventName
        ? resolveExactName(events, participant.eventName)
        : undefined
      const blockingReasons: string[] = []
      const warnings: string[] = [...(participant.warnings ?? [])]

      if (!name) blockingReasons.push("nombre_deportista_obligatorio")
      if (!discipline) {
        blockingReasons.push("disciplina_no_resuelta_en_sanity")
      }
      if (!fekm) {
        blockingReasons.push("organizacion_fekm_no_resuelta_en_sanity")
      }

      const categoryExpected = Boolean(
        participant.categoryLabel ||
          participant.weightLabel ||
          typeof participant.limitKg === "number",
      )
      if (categoryExpected && !category) {
        blockingReasons.push("categoria_peso_no_resuelta_en_sanity")
      }

      if (participant.reviewRequired) {
        blockingReasons.push("revision_manual_requerida")
      }
      if (participant.confidence && participant.confidence !== "alta") {
        blockingReasons.push("confianza_insuficiente_para_creacion_automatica")
      }
      if (probableFighter) {
        blockingReasons.push("posible_luchador_duplicado")
        warnings.push("coincidencia_aproximada_en_sanity")
      }
      if (participant.eventName && !event) {
        warnings.push("evento_no_resuelto_en_sanity")
      }
      if (!participant.federationCode) {
        warnings.push("federacion_autonomica_no_informada")
      }

      const uniqueBlockingReasons = unique(blockingReasons)
      const uniqueWarnings = unique(warnings)

      return {
        source: participant,
        resolution: {
          readyToCreate:
            uniqueBlockingReasons.length === 0 &&
            !existingFighter &&
            !probableFighter,
          existing: Boolean(existingFighter),
          exactMatch: Boolean(existingFighter),
          probableMatch: Boolean(probableFighter),
          existingFighter: existingFighter ?? null,
          probableFighter: probableFighter ?? null,
          discipline: discipline ?? null,
          organization: fekm ?? null,
          category: category ?? null,
          event: event ?? null,
          blockingReasons: uniqueBlockingReasons,
          warnings: uniqueWarnings,
        },
      }
    })

    return withCors(
      NextResponse.json({
        ok: true,
        source: "fekm",
        summary: {
          received: items.length,
          existing: items.filter((item) => item.resolution.existing).length,
          probableMatches: items.filter(
            (item) => item.resolution.probableMatch,
          ).length,
          readyToCreate: items.filter(
            (item) => item.resolution.readyToCreate,
          ).length,
          blocked: items.filter(
            (item) => item.resolution.blockingReasons.length > 0,
          ).length,
          reviewRequired: items.filter((item) =>
            item.resolution.blockingReasons.includes(
              "revision_manual_requerida",
            ),
          ).length,
          unresolvedCategories: items.filter((item) =>
            item.resolution.blockingReasons.includes(
              "categoria_peso_no_resuelta_en_sanity",
            ),
          ).length,
        },
        items,
      }),
    )
  } catch (error) {
    return withCors(
      NextResponse.json(
        {
          ok: false,
          source: "fekm",
          error:
            error instanceof Error
              ? error.message
              : "No se pudieron resolver los participantes FEKM.",
        },
        {status: 500},
      ),
    )
  }
}
