import {NextResponse} from "next/server"
import {extractText} from "unpdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

type DebugResultsRequest = {
  title?: string
  pdfUrl?: string
  pages?: number[]
  maxCharactersPerPage?: number
}

const FEKM_RESULTS_URL = "https://fekm.es/resultados/"

function withCors(response: NextResponse): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", "*")
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
  response.headers.set("Access-Control-Allow-Headers", "Content-Type")
  response.headers.set("Cache-Control", "no-store")
  return response
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u0340/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function defaultPages(): number[] {
  return [
    246, 247, 248, 249, 250,
    251, 252, 253, 254, 255,
    256, 257, 258, 259, 260,
    261, 262, 263, 264, 265,
    266, 267, 268, 269, 270,
    271, 272, 273, 274, 275,
    276, 277, 278, 279, 280,
  ]
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCors(new NextResponse(null, {status: 204}))
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as DebugResultsRequest
    const title = body.title?.trim()
    const pdfUrl = body.pdfUrl?.trim()
    const requestedPages =
      Array.isArray(body.pages) && body.pages.length > 0
        ? body.pages
        : defaultPages()
    const maxCharactersPerPage =
      typeof body.maxCharactersPerPage === "number" &&
      Number.isFinite(body.maxCharactersPerPage)
        ? Math.max(1000, Math.min(30000, Math.trunc(body.maxCharactersPerPage)))
        : 16000

    if (!title || !pdfUrl) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            source: "fekm",
            error: "title_y_pdfUrl_son_obligatorios",
          },
          {status: 400},
        ),
      )
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(pdfUrl)
    } catch {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            source: "fekm",
            error: "pdfUrl_no_valida",
          },
          {status: 400},
        ),
      )
    }

    const pdfResponse = await fetch(parsedUrl, {
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        Referer: FEKM_RESULTS_URL,
        Accept: "application/pdf,*/*",
      },
    })

    if (!pdfResponse.ok) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            source: "fekm",
            error: `No se pudo descargar el PDF. Estado ${pdfResponse.status}.`,
          },
          {status: 502},
        ),
      )
    }

    const pdf = new Uint8Array(await pdfResponse.arrayBuffer())
    const {totalPages, text} = await extractText(pdf, {mergePages: false})
    const pages = Array.isArray(text) ? text : [text]

    const selectedPages = requestedPages
      .map((pageNumber) => {
        const index = pageNumber - 1
        if (index < 0 || index >= pages.length) return null

        const raw = String(pages[index] ?? "")
        const normalized = normalizeWhitespace(raw)

        return {
          page: pageNumber,
          rawCharacters: raw.length,
          normalizedCharacters: normalized.length,
          text: normalized.slice(0, maxCharactersPerPage),
        }
      })
      .filter(
        (
          value,
        ): value is {
          page: number
          rawCharacters: number
          normalizedCharacters: number
          text: string
        } => Boolean(value),
      )

    return withCors(
      NextResponse.json({
        ok: true,
        source: "fekm",
        debugMode: "official_results_page_text_v1",
        document: {
          title,
          pdfUrl,
          totalPages,
        },
        requestedPages,
        selectedPages,
      }),
    )
  } catch (error) {
    console.error("[FEKM results debug]", error)

    return withCors(
      NextResponse.json(
        {
          ok: false,
          source: "fekm",
          error:
            error instanceof Error
              ? error.message
              : "No se pudo inspeccionar el documento FEKM.",
        },
        {status: 500},
      ),
    )
  }
}
