import {createClient} from "@sanity/client"
import {NextResponse} from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type FekmDisciplineKey = "kickboxing" | "muay_thai"
type FekmGender = "masculino" | "femenino" | "mixto"
type FekmAgeGroup = "senior" | "junior" | "juvenil" | "cadete" | "escolar" | "otro"

type SourceCategory = {
  label?: string
  discipline?: FekmDisciplineKey | string
  gender?: FekmGender | string
  ageGroup?: FekmAgeGroup | string
}

type RequestBody = {
  confirm?: boolean
  categories?: SourceCategory[]
}

type ReferenceDoc = {
  _id: string
  nombre?: string
}

type CategoryDoc = ReferenceDoc & {
  limitePeso?: number
  unidad?: "kg" | "lb"
  disciplina?: {_ref?: string} | null
}

type Candidate = {
  sourceLabel: string
  disciplineKey: FekmDisciplineKey
  discipline: ReferenceDoc
  gender?: FekmGender
  ageGroup?: FekmAgeGroup
  limitKg: number
  nombre: string
  slug: string
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

function withCors(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(CORS_HEADERS)) response.headers.set(key, value)
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
    .replace(/[–—−]/g, "-")
    .replace(/[^a-z0-9+.,-]+/g, " ")
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
  return {_type: "reference", _ref: baseId(id)}
}

function normalizeDiscipline(value: string): FekmDisciplineKey | null {
  const normalized = normalize(value)
  if (normalized.includes("muay") || normalized.includes("thai")) return "muay_thai"
  if (normalized.includes("kick") || normalized === "kb") return "kickboxing"
  return null
}

function normalizeGender(value: string): FekmGender | undefined {
  const normalized = normalize(value)
  if (!normalized) return undefined
  if (/\b(fem|female|women|woman|mujer|femenin)/.test(normalized)) return "femenino"
  if (/\b(masc|male|men|man|hombre|masculin)/.test(normalized)) return "masculino"
  if (/\bmixt/.test(normalized)) return "mixto"
  return undefined
}

function normalizeAgeGroup(value: string): FekmAgeGroup | undefined {
  const normalized = normalize(value)
  if (!normalized) return undefined
  if (normalized.includes("senior")) return "senior"
  if (normalized.includes("junior")) return "junior"
  if (normalized.includes("juvenil")) return "juvenil"
  if (normalized.includes("cadete")) return "cadete"
  if (normalized.includes("escolar") || normalized.includes("infantil")) return "escolar"
  return "otro"
}

function parseLimitKg(label: string): number | null {
  const normalized = normalize(label)
  const explicit = normalized.match(/(?:hasta|menos de|under|<|^-)?\s*(\d{2,3}(?:[.,]\d+)?)\s*(?:kg|kgs|kilogramos?)/i)
  const leadingMinus = normalized.match(/(?:^|\s)-(\d{2,3}(?:[.,]\d+)?)(?:\s|$)/)
  const bareNumber = normalized.match(/(?:^|\s)(\d{2,3}(?:[.,]\d+)?)(?:\s|$)/)
  const raw = explicit?.[1] || leadingMinus?.[1] || bareNumber?.[1]
  if (!raw) return null
  const value = Number(raw.replace(",", "."))
  return Number.isFinite(value) && value >= 20 && value <= 200 ? value : null
}

function formatKg(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",")
}

function findDiscipline(key: FekmDisciplineKey, disciplines: ReferenceDoc[]): ReferenceDoc | null {
  const aliases = key === "muay_thai"
    ? ["muay thai", "muaythai"]
    : ["kickboxing", "kick boxing", "kick-boxing"]
  return disciplines.find((doc) => aliases.includes(normalize(text(doc.nombre)))) || null
}

function buildCandidate(input: SourceCategory, disciplines: ReferenceDoc[]): Candidate | null {
  const sourceLabel = text(input.label)
  const disciplineKey = normalizeDiscipline(text(input.discipline))
  const limitKg = parseLimitKg(sourceLabel)
  if (!sourceLabel || !disciplineKey || limitKg === null) return null

  const discipline = findDiscipline(disciplineKey, disciplines)
  if (!discipline) return null

  const gender = normalizeGender(text(input.gender) || sourceLabel)
  const ageGroup = normalizeAgeGroup(text(input.ageGroup) || sourceLabel)
  const disciplineLabel = disciplineKey === "muay_thai" ? "Muay Thai" : "Kickboxing"
  const qualifiers = [ageGroup && ageGroup !== "otro" ? ageGroup : "", gender && gender !== "mixto" ? gender : ""]
    .filter(Boolean)
    .join(" ")
  const nombre = `Hasta ${formatKg(limitKg)} kg${qualifiers ? ` · ${qualifiers}` : ""}`

  return {
    sourceLabel,
    disciplineKey,
    discipline,
    gender,
    ageGroup,
    limitKg,
    nombre,
    slug: slugify(`${nombre}-${disciplineLabel}`),
  }
}

function findExisting(candidate: Candidate, categories: CategoryDoc[]): CategoryDoc | null {
  const disciplineId = baseId(candidate.discipline._id)
  return categories.find((doc) => {
    const sameDiscipline = baseId(text(doc.disciplina?._ref)) === disciplineId
    const sameUnit = doc.unidad === "kg"
    const sameLimit = typeof doc.limitePeso === "number" && Math.abs(doc.limitePeso - candidate.limitKg) < 0.001
    const sameName = normalize(text(doc.nombre)) === normalize(candidate.nombre)
    return sameDiscipline && sameUnit && (sameName || sameLimit)
  }) || null
}

function validateEnv(): string | null {
  if (!projectId) return "Falta NEXT_PUBLIC_SANITY_PROJECT_ID o SANITY_STUDIO_PROJECT_ID."
  if (!dataset) return "Falta NEXT_PUBLIC_SANITY_DATASET o SANITY_STUDIO_DATASET."
  if (!token) return "Falta SANITY_API_WRITE_TOKEN."
  return null
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCors(new NextResponse(null, {status: 204}))
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const envError = validateEnv()
    if (envError) return withCors(NextResponse.json({ok: false, error: envError}, {status: 500}))

    let body: RequestBody
    try {
      body = (await request.json()) as RequestBody
    } catch {
      return withCors(NextResponse.json({ok: false, error: "El body no es un JSON válido."}, {status: 400}))
    }

    if (!body.confirm) {
      return withCors(NextResponse.json({ok: false, error: "Falta confirmación explícita para crear categorías FEKM."}, {status: 400}))
    }

    const inputs = Array.isArray(body.categories) ? body.categories : []
    if (inputs.length === 0) {
      return withCors(NextResponse.json({ok: false, error: "No se recibieron categorías FEKM."}, {status: 400}))
    }

    const [disciplines, existingCategories] = await Promise.all([
      client.fetch<ReferenceDoc[]>(`*[_type == "disciplina"]{_id,nombre}`, {}, {perspective: "raw"}),
      client.fetch<CategoryDoc[]>(`*[_type == "categoriaPeso"]{_id,nombre,limitePeso,unidad,disciplina}`, {}, {perspective: "raw"}),
    ])

    const created: Array<{sourceLabel: string; nombre: string; draftId: string; discipline: string; limitKg: number}> = []
    const skipped: Array<{sourceLabel: string; reason: string}> = []
    const failed: Array<{sourceLabel: string; error: string}> = []
    const seen = new Set<string>()

    for (const input of inputs) {
      const sourceLabel = text(input.label)
      const candidate = buildCandidate(input, disciplines)
      if (!candidate) {
        skipped.push({sourceLabel, reason: "categoria_o_disciplina_no_normalizable"})
        continue
      }

      const key = `${baseId(candidate.discipline._id)}::${candidate.limitKg}`
      if (seen.has(key)) {
        skipped.push({sourceLabel, reason: "duplicada_en_la_peticion"})
        continue
      }
      seen.add(key)

      const existing = findExisting(candidate, existingCategories)
      if (existing) {
        skipped.push({sourceLabel, reason: "categoria_ya_existente"})
        continue
      }

      const documentId = `fekm-category-${candidate.slug}`
      const draftId = `drafts.${documentId}`

      try {
        await client.createIfNotExists({
          _id: draftId,
          _type: "categoriaPeso",
          nombre: candidate.nombre,
          slug: {_type: "slug", current: candidate.slug},
          disciplina: reference(candidate.discipline._id),
          limitePeso: candidate.limitKg,
          unidad: "kg",
          descripcion: `Categoría de ${candidate.discipline.nombre || "deporte de combate"} normalizada desde documentación oficial FEKM. Límite máximo: ${formatKg(candidate.limitKg)} kg.`,
        })

        created.push({
          sourceLabel: candidate.sourceLabel,
          nombre: candidate.nombre,
          draftId,
          discipline: candidate.discipline.nombre || candidate.disciplineKey,
          limitKg: candidate.limitKg,
        })
      } catch (error) {
        failed.push({
          sourceLabel: candidate.sourceLabel,
          error: error instanceof Error ? error.message : "Error desconocido creando la categoría.",
        })
      }
    }

    return withCors(NextResponse.json({
      ok: failed.length === 0,
      source: "fekm",
      summary: {
        received: inputs.length,
        created: created.length,
        skipped: skipped.length,
        failed: failed.length,
      },
      created,
      skipped,
      failed,
    }))
  } catch (error) {
    console.error("Error creando categorías FEKM:", error)
    return withCors(NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Error desconocido creando categorías FEKM.",
    }, {status: 500}))
  }
}
