import {NextResponse} from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

type SourceEvent = {
  id?: string
  name?: string
  startDate?: string
  endDate?: string
  timeText?: string
  venue?: string
  city?: string
  region?: string
  country?: string
  locationText?: string
  description?: string
  sourceUrl?: string
  canonicalUrl?: string
  imageUrl?: string
  status?: "proximo" | "celebrado" | "cancelado"
  discipline?: "kickboxing" | "muay_thai" | "mixed"
  disciplineLabel?: string
  category?: string
  scope?: "nacional" | "internacional" | "autonomico" | "otro"
}

type RequestBody = {
  event?: SourceEvent
  confirm?: boolean
}

type JsonRecord = Record<string, unknown>

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

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function numberFrom(record: JsonRecord, key: string): number {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

async function postJson(
  origin: string,
  path: string,
  body: unknown,
): Promise<JsonRecord> {
  const response = await fetch(new URL(path, origin), {
    method: "POST",
    cache: "no-store",
    headers: {"Content-Type": "application/json", Accept: "application/json"},
    body: JSON.stringify(body),
  })

  const payload = asRecord(await response.json())
  if (!response.ok || payload.ok !== true) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : `Falló ${path} con estado ${response.status}.`
    throw new Error(message)
  }

  return payload
}

function toCategoryInput(participant: JsonRecord): JsonRecord {
  return {
    label: participant.categoryLabel,
    discipline: participant.discipline,
    gender: participant.gender,
    ageGroup: participant.ageGroup,
    modality: participant.modality,
    eventCode: participant.eventCode,
    weightLabel: participant.weightLabel,
    limitKg: participant.limitKg,
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCors(new NextResponse(null, {status: 204}))
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = asRecord(await request.json()) as RequestBody & JsonRecord
    const event = body.event
    const confirm = body.confirm === true

    if (!event?.name || !event.startDate) {
      return withCors(
        NextResponse.json(
          {ok: false, source: "fekm", error: "Selecciona un evento FEKM con nombre y fecha."},
          {status: 400},
        ),
      )
    }

    const origin = new URL(request.url).origin
    const matchPayload = await postJson(
      origin,
      "/api/sources/fekm/events/match-document",
      {event},
    )
    const match = asRecord(matchPayload.match)
    const document = asRecord(match.document)

    if (!document.pdfUrl || !document.title) {
      return withCors(
        NextResponse.json({
          ok: true,
          source: "fekm",
          mode: confirm ? "execute" : "analyze",
          event,
          match: matchPayload.match ?? null,
          alternatives: matchPayload.alternatives ?? [],
          readyToExecute: false,
          blockingReasons: ["documento_resultados_no_resuelto"],
          warnings: [],
        }),
      )
    }

    if (confirm && match.automatic !== true) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            source: "fekm",
            error: "El documento asociado no tiene una coincidencia automática suficientemente segura.",
            match: matchPayload.match ?? null,
          },
          {status: 409},
        ),
      )
    }

    const extractPayload = await postJson(
      origin,
      "/api/sources/fekm/participants/extract",
      {title: document.title, pdfUrl: document.pdfUrl},
    )
    const participants = asArray(extractPayload.participants).map(asRecord)
    const categories = participants.map(toCategoryInput)

    const categoriesResolvedBefore = await postJson(
      origin,
      "/api/sources/fekm/categories/resolve",
      {categories},
    )

    const participantsWithEvent = participants.map((participant) => ({
      ...participant,
      eventName: event.name,
      sourceDocumentTitle: document.title,
      sourcePdfUrl: document.pdfUrl,
    }))

    const participantsResolvedBefore = await postJson(
      origin,
      "/api/sources/fekm/participants/resolve",
      {participants: participantsWithEvent},
    )

    let organizationResult: JsonRecord | null = null
    let eventResult: JsonRecord | null = null
    let categoriesCreated: JsonRecord | null = null
    let participantsResolvedAfter = participantsResolvedBefore
    let participantsCreated: JsonRecord | null = null

    if (confirm) {
      organizationResult = await postJson(
        origin,
        "/api/sources/fekm/events/create-organization",
        {confirm: true},
      )

      eventResult = await postJson(
        origin,
        "/api/sources/fekm/events/create-event",
        {confirm: true, event},
      )

      const categoryItems = asArray(categoriesResolvedBefore.items).map(asRecord)
      const categoriesToCreate = categoryItems
        .filter((item) => item.readyToCreate === true)
        .map((item) => asRecord(item.source))

      categoriesCreated = await postJson(
        origin,
        "/api/sources/fekm/categories/create",
        {confirm: true, categories: categoriesToCreate},
      )

      participantsResolvedAfter = await postJson(
        origin,
        "/api/sources/fekm/participants/resolve",
        {participants: participantsWithEvent},
      )

      const participantItems = asArray(participantsResolvedAfter.items).map(asRecord)
      const participantsToCreate = participantItems
        .filter((item) => asRecord(item.resolution).readyToCreate === true)
        .map((item) => asRecord(item.source))

      participantsCreated = await postJson(
        origin,
        "/api/sources/fekm/participants/create",
        {confirm: true, participants: participantsToCreate},
      )
    }

    const extractionSummary = asRecord(extractPayload.summary)
    const categoriesBeforeSummary = asRecord(categoriesResolvedBefore.summary)
    const participantsBeforeSummary = asRecord(participantsResolvedBefore.summary)
    const participantsAfterSummary = asRecord(participantsResolvedAfter.summary)
    const categoriesCreateSummary = asRecord(categoriesCreated?.summary)
    const participantsCreateSummary = asRecord(participantsCreated?.summary)

    const warnings: string[] = []
    if (numberFrom(extractionSummary, "reviewRequired") > 0) {
      warnings.push("Hay participantes inscritos en varias modalidades o categorías que requieren revisión manual.")
    }
    if (numberFrom(participantsAfterSummary, "unresolvedCategories") > 0) {
      warnings.push("Quedan categorías sin resolver; esos participantes no se han creado.")
    }

    return withCors(
      NextResponse.json({
        ok: true,
        source: "fekm",
        mode: confirm ? "execute" : "analyze",
        event,
        match: matchPayload.match ?? null,
        alternatives: matchPayload.alternatives ?? [],
        readyToExecute: match.automatic === true,
        document: {
          title: document.title,
          pdfUrl: document.pdfUrl,
        },
        summary: {
          extractedParticipants: numberFrom(extractionSummary, "participants"),
          highConfidence: numberFrom(extractionSummary, "highConfidence"),
          reviewRequired: numberFrom(extractionSummary, "reviewRequired"),
          categoriesReadyBefore: numberFrom(categoriesBeforeSummary, "readyToCreate"),
          categoriesExistingBefore: numberFrom(categoriesBeforeSummary, "existing"),
          participantsExistingBefore: numberFrom(participantsBeforeSummary, "existing"),
          participantsReadyBefore: numberFrom(participantsBeforeSummary, "readyToCreate"),
          unresolvedCategoriesBefore: numberFrom(participantsBeforeSummary, "unresolvedCategories"),
          categoriesCreated: numberFrom(categoriesCreateSummary, "created"),
          categoriesSkipped: numberFrom(categoriesCreateSummary, "skipped"),
          participantsExistingAfter: numberFrom(participantsAfterSummary, "existing"),
          participantsReadyAfter: numberFrom(participantsAfterSummary, "readyToCreate"),
          unresolvedCategoriesAfter: numberFrom(participantsAfterSummary, "unresolvedCategories"),
          participantsCreated: numberFrom(participantsCreateSummary, "created"),
          participantsUpdated: numberFrom(participantsCreateSummary, "updated"),
          participantsSkipped: numberFrom(participantsCreateSummary, "skipped"),
          participantsFailed: numberFrom(participantsCreateSummary, "failed"),
        },
        organizationResult,
        eventResult,
        categoriesResult: categoriesCreated,
        participantsResult: participantsCreated,
        warnings,
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
              : "No se pudo preparar el evento FEKM completo.",
        },
        {status: 500},
      ),
    )
  }
}
