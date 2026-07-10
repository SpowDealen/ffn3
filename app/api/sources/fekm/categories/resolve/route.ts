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
  category?: SourceCategory
  categories?: SourceCategory[]
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

type NormalizedCategory = {
  sourceLabel: string
  disciplineKey: FekmDisciplineKey
  disciplineLabel: "Kickboxing" | "Muay Thai"
  gender?: FekmGender
  ageGroup?: FekmAgeGroup
  limitKg: number
  canonicalName: string
  canonicalSlug: string
  confidence: "alta" | "media"
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

const client = createClient({
  projectId: projectId || "",
  dataset,
  apiVersion,
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
  if (normalized.includes("senior") || normalized.includes("sénior")) return "senior"
  if (normalized.includes("junior") || normalized.includes("júnior")) return "junior"
  if (normalized.includes("juvenil")) return "juvenil"
  if (normalized.includes("cadete")) return "cadete"
  if (normalized.includes("escolar") || normalized.includes("infantil")) return "escolar"
  return "otro"
}

function parseLimitKg(label: string): {limitKg: number; confidence: "alta" | "media"} | null {
  const normalized = normalize(label)
  if (!normalized) return null

  const explicitKg = normalized.match(/(?:hasta|menos de|under|<|^-)?\s*(\d{2,3}(?:[.,]\d+)?)\s*(?:kg|kgs|kilogramos?)/i)
  if (explicitKg) {
    const limitKg = Number(explicitKg[1].replace(",", "."))
    if (Number.isFinite(limitKg) && limitKg >= 20 && limitKg <= 200) {
      return {limitKg, confidence: "alta"}
    }
  }

  const leadingMinus = normalized.match(/(?:^|\s)-(\d{2,3}(?:[.,]\d+)?)(?:\s|$)/)
  if (leadingMinus) {
    const limitKg = Number(leadingMinus[1].replace(",", "."))
    if (Number.isFinite(limitKg) && limitKg >= 20 && limitKg <= 200) {
      return {limitKg, confidence: "alta"}
    }
  }

  const bareNumber = normalized.match(/(?:^|\s)(\d{2,3}(?:[.,]\d+)?)(?:\s|$)/)
  if (bareNumber) {
    const limitKg = Number(bareNumber[1].replace(",", "."))
    if (Number.isFinite(limitKg) && limitKg >= 20 && limitKg <= 200) {
      return {limitKg, confidence: "media"}
    }
  }

  return null
}

function formatKg(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",")
}

function buildCanonicalCategory(input: SourceCategory): NormalizedCategory | null {
  const sourceLabel = text(input.label)
  if (!sourceLabel) return null

  const disciplineKey = normalizeDiscipline(text(input.discipline))
  if (!disciplineKey) return null

  const parsed = parseLimitKg(sourceLabel)
  if (!parsed) return null

  const gender = normalizeGender(text(input.gender) || sourceLabel)
  const ageGroup = normalizeAgeGroup(text(input.ageGroup) || sourceLabel)
  const disciplineLabel = disciplineKey === "muay_thai" ? "Muay Thai" : "Kickboxing"
  const qualifiers = [ageGroup && ageGroup !== "otro" ? ageGroup : "", gender && gender !== "mixto" ? gender : ""]
    .filter(Boolean)
    .join(" ")

  const canonicalName = `Hasta ${formatKg(parsed.limitKg)} kg${qualifiers ? ` · ${qualifiers}` : ""}`
  const canonicalSlug = slugify(`${canonicalName}-${disciplineLabel}`)

  return {
    sourceLabel,
    disciplineKey,
    disciplineLabel,
    gender,
    ageGroup,
    limitKg: parsed.limitKg,
    canonicalName,
    canonicalSlug,
    confidence: parsed.confidence,
  }
}

function findDiscipline(category: NormalizedCategory, disciplines: ReferenceDoc[]): ReferenceDoc | null {
  const aliases = category.disciplineKey === "muay_thai"
    ? ["muay thai", "muaythai"]
    : ["kickboxing", "kick boxing", "kick-boxing"]

  return disciplines.find((doc) => aliases.includes(normalize(text(doc.nombre)))) || null
}

function findExistingCategory(
  category: NormalizedCategory,
  discipline: ReferenceDoc,
  categories: CategoryDoc[],
): CategoryDoc | null {
  const targetDiscipline = baseId(discipline._id)
  const targetName = normalize(category.canonicalName)

  return categories.find((doc) => {
    const sameDiscipline = baseId(text(doc.disciplina?._ref)) === targetDiscipline
    const sameUnit = doc.unidad === "kg"
    const sameLimit = typeof doc.limitePeso === "number" && Math.abs(doc.limitePeso - category.limitKg) < 0.001
    const sameName = normalize(text(doc.nombre)) === targetName
    return sameDiscipline && sameUnit && (sameName || sameLimit)
  }) || null
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCors(new NextResponse(null, {status: 204}))
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    let body: RequestBody
    try {
      body = (await request.json()) as RequestBody
    } catch {
      return withCors(NextResponse.json({ok: false, error: "El body no es un JSON válido."}, {status: 400}))
    }

    const inputs = [
      ...(body.category ? [body.category] : []),
      ...(Array.isArray(body.categories) ? body.categories : []),
    ]

    if (inputs.length === 0) {
      return withCors(NextResponse.json({ok: false, error: "No se recibieron categorías FEKM."}, {status: 400}))
    }

    const [disciplines, existingCategories] = await Promise.all([
      client.fetch<ReferenceDoc[]>(`*[_type == "disciplina"]{_id,nombre,slug}`, {}, {perspective: "raw"}),
      client.fetch<CategoryDoc[]>(`*[_type == "categoriaPeso"]{_id,nombre,slug,limitePeso,unidad,disciplina}`, {}, {perspective: "raw"}),
    ])

    const resolved = inputs.map((input) => {
      const normalizedCategory = buildCanonicalCategory(input)
      if (!normalizedCategory) {
        return {
          source: input,
          normalized: null,
          discipline: null,
          existingCategory: null,
          readyToCreate: false,
          blockingReasons: ["categoria_o_disciplina_no_normalizable"],
        }
      }

      const discipline = findDiscipline(normalizedCategory, disciplines)
      const existingCategory = discipline
        ? findExistingCategory(normalizedCategory, discipline, existingCategories)
        : null

      return {
        source: input,
        normalized: normalizedCategory,
        discipline,
        existingCategory,
        readyToCreate: Boolean(discipline && !existingCategory),
        blockingReasons: discipline ? [] : ["disciplina_no_resuelta_en_sanity"],
      }
    })

    return withCors(NextResponse.json({
      ok: true,
      source: "fekm",
      summary: {
        received: inputs.length,
        normalized: resolved.filter((item) => item.normalized).length,
        existing: resolved.filter((item) => item.existingCategory).length,
        readyToCreate: resolved.filter((item) => item.readyToCreate).length,
        blocked: resolved.filter((item) => item.blockingReasons.length > 0).length,
      },
      items: resolved,
    }))
  } catch (error) {
    console.error("Error resolviendo categorías FEKM:", error)
    return withCors(NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Error desconocido resolviendo categorías FEKM.",
    }, {status: 500}))
  }
}
