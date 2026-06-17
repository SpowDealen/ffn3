import {NextResponse} from "next/server"
import * as cheerio from "cheerio"
import type {AnyNode} from "domhandler"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BKFC_BASE_URL = "https://www.bkfc.com"
const BKFC_EVENTS_URL = `${BKFC_BASE_URL}/events`
const BKFC_PAST_EVENTS_URL = `${BKFC_BASE_URL}/event-past/past`

const MAX_ITEMS = 14
const MAX_DESCRIPTION_LENGTH = 5000

type JsonLdRecord = Record<string, unknown>

type EventStatus = "proximo" | "celebrado" | "cancelado"
type FightStatus = "programado" | "finalizado" | "cancelado"
type FightCardSection = "principal" | "preliminar"

type BkfcFightCardItem = {
  id: string
  section: FightCardSection
  sectionLabel: "Main Card" | "Prelims"
  order: number
  redFighter: string
  blueFighter: string
  weightClass?: string
  titleFight: boolean
  status: FightStatus
  winnerName?: string
  method?: string
  round?: number
  time?: string
}

type BkfcEventApiItem = {
  id: string
  name: string
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
  sourceUrl: string
  canonicalUrl: string
  imageUrl?: string
  status: EventStatus
  fightCard: BkfcFightCardItem[]
}

type BkfcEventsApiResponse = {
  ok: boolean
  source: "bkfc"
  fetchedAt: string
  count: number
  items: BkfcEventApiItem[]
  error?: string
}

const US_REGIONS = new Set([
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
  "District of Columbia",
  "D.C.",
  "DC",
])

function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
}

function normalizeParagraphs(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean)
    .join("\n\n")
    .trim()
}

function repairMojibake(value: string): string {
  if (!value) {
    return value
  }

  const replacements: ReadonlyArray<readonly [string, string]> = [
    ["â€™", "’"],
    ["â€˜", "‘"],
    ["â€œ", "“"],
    ["â€", "”"],
    ["â€¦", "…"],
    ["â€”", "—"],
    ["â€“", "–"],
    ["Â ", " "],
    ["Â", ""],
  ]

  let repaired = value

  for (let pass = 0; pass < 3; pass += 1) {
    const previous = repaired

    for (const [broken, correct] of replacements) {
      repaired = repaired.split(broken).join(correct)
    }

    if (repaired === previous) {
      break
    }
  }

  return repaired
}

function decodeHtmlEntities(value: string): string {
  if (!value) {
    return value
  }

  return cheerio.load(`<body>${value}</body>`)("body").text()
}

function cleanText(value: string): string {
  return normalizeParagraphs(
    repairMojibake(decodeHtmlEntities(value)),
  )
}

function cleanInlineText(value: string): string {
  return normalizeWhitespace(
    repairMojibake(decodeHtmlEntities(value)),
  )
}

function cleanOptionalText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const cleaned = cleanText(value)
  return cleaned || undefined
}

function cleanOptionalInlineText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const cleaned = cleanInlineText(value)
  return cleaned || undefined
}

function createAbsoluteUrl(value: string): string {
  const trimmed = value.trim()

  if (!trimmed) {
    return ""
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`
  }

  if (trimmed.startsWith("/")) {
    return `${BKFC_BASE_URL}${trimmed}`
  }

  return `${BKFC_BASE_URL}/${trimmed}`
}

function createCanonicalUrl(value: string): string {
  return createAbsoluteUrl(value).split("?")[0].split("#")[0].replace(/\/+$/, "")
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function createItemId(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl)
    const pathname = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\//g, "-")
    return `bkfc-${slugify(pathname)}`
  } catch {
    return `bkfc-event-${slugify(sourceUrl)}`
  }
}

function isValidEventUrl(value: string): boolean {
  if (!value) {
    return false
  }

  try {
    const url = new URL(createAbsoluteUrl(value))
    return (
      url.hostname.endsWith("bkfc.com") &&
      /^\/events\/[^/]+\/?$/i.test(url.pathname) &&
      url.pathname.toLowerCase() !== "/events/"
    )
  } catch {
    return false
  }
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (compatible; FullFightNewsSourceReader/1.0; +https://fullfightnews.com)",
    },
    cache: "no-store",
    redirect: "follow",
  })

  if (!response.ok) {
    throw new Error(`${url} respondió con estado ${response.status}.`)
  }

  const buffer = await response.arrayBuffer()
  return new TextDecoder("utf-8").decode(buffer)
}

function extractEventUrls(html: string): string[] {
  const $ = cheerio.load(html)
  const urls = new Set<string>()

  $('a[href*="/events/"]').each((_, element) => {
    const href = $(element).attr("href")?.trim() ?? ""

    if (isValidEventUrl(href)) {
      urls.add(createCanonicalUrl(href))
    }
  })

  return Array.from(urls).slice(0, MAX_ITEMS)
}

function getMetaContent(
  $: cheerio.CheerioAPI,
  selectors: string[],
): string | undefined {
  for (const selector of selectors) {
    const value = $(selector).first().attr("content")

    if (value) {
      const cleaned = cleanText(value)

      if (cleaned) {
        return cleaned
      }
    }
  }

  return undefined
}

function asRecord(value: unknown): JsonLdRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonLdRecord)
    : undefined
}

function flattenJsonLd(value: unknown): JsonLdRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenJsonLd(item))
  }

  const record = asRecord(value)

  if (!record) {
    return []
  }

  const graph = record["@graph"]

  if (Array.isArray(graph)) {
    return [record, ...graph.flatMap((item) => flattenJsonLd(item))]
  }

  return [record]
}

function extractJsonLdRecords($: cheerio.CheerioAPI): JsonLdRecord[] {
  const records: JsonLdRecord[] = []

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).html()?.trim()

    if (!raw) {
      return
    }

    try {
      records.push(...flattenJsonLd(JSON.parse(raw) as unknown))
    } catch {
      // Bloques externos inválidos se ignoran.
    }
  })

  return records
}

function getJsonLdTypes(record: JsonLdRecord): string[] {
  const value = record["@type"]

  if (typeof value === "string") {
    return [value]
  }

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function findEventJsonLd(records: JsonLdRecord[]): JsonLdRecord | undefined {
  const acceptedTypes = new Set(["Event", "SportsEvent", "BusinessEvent"])

  return records.find((record) =>
    getJsonLdTypes(record).some((type) => acceptedTypes.has(type)),
  )
}

function getStringValue(
  record: JsonLdRecord | undefined,
  keys: string[],
): string | undefined {
  if (!record) {
    return undefined
  }

  for (const key of keys) {
    const value = record[key]

    if (typeof value === "string") {
      const cleaned = cleanText(value)

      if (cleaned) {
        return cleaned
      }
    }
  }

  return undefined
}

function getImageFromJsonLd(
  record: JsonLdRecord | undefined,
): string | undefined {
  if (!record) {
    return undefined
  }

  const image = record.image

  if (typeof image === "string") {
    return createAbsoluteUrl(image)
  }

  if (Array.isArray(image)) {
    for (const item of image) {
      if (typeof item === "string") {
        return createAbsoluteUrl(item)
      }

      const imageRecord = asRecord(item)
      const url = getStringValue(imageRecord, ["url", "contentUrl"])

      if (url) {
        return createAbsoluteUrl(url)
      }
    }
  }

  const imageRecord = asRecord(image)
  const imageUrl = getStringValue(imageRecord, ["url", "contentUrl"])

  return imageUrl ? createAbsoluteUrl(imageUrl) : undefined
}

function getLocationRecord(
  eventJsonLd: JsonLdRecord | undefined,
): JsonLdRecord | undefined {
  return eventJsonLd ? asRecord(eventJsonLd.location) : undefined
}

function getAddressRecord(
  locationRecord: JsonLdRecord | undefined,
): JsonLdRecord | undefined {
  return locationRecord ? asRecord(locationRecord.address) : undefined
}

function normalizeMainEvent(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const normalized = cleanInlineText(value)
    .replace(/\s+vs\.?\s+/i, " vs ")
    .replace(/\s+/g, " ")
    .trim()

  if (
    !normalized ||
    !/\bvs\b/i.test(normalized) ||
    /^TBD\s+vs\s+TBD$/i.test(normalized)
  ) {
    return undefined
  }

  return normalized
}

function extractMainEventFromName(value: string): string | undefined {
  const cleaned = cleanInlineText(value)

  const finalPair = cleaned.match(
    /([A-Za-zÀ-ÿ'’.-]+)\s+vs\.?\s+([A-Za-zÀ-ÿ'’.-]+)$/i,
  )

  if (!finalPair) {
    return undefined
  }

  const redFighter = finalPair[1]
  const blueFighter = finalPair[2]

  if (!redFighter || !blueFighter) {
    return undefined
  }

  return normalizeMainEvent(
    `${redFighter.trim()} vs ${blueFighter.trim()}`,
  )
}

function extractPlatforms($: cheerio.CheerioAPI): string | undefined {
  const bodyText = cleanInlineText($("body").text())

  const platforms = [
    {pattern: /\bDAZN\b/i, label: "DAZN"},
    {pattern: /\bBKFC\+\b/i, label: "BKFC+"},
    {pattern: /\bBKFC App\b/i, label: "BKFC App"},
    {pattern: /\bYouTube\b/i, label: "YouTube"},
    {pattern: /\bTrillerTV\b/i, label: "TrillerTV"},
  ]
    .filter(({pattern}) => pattern.test(bodyText))
    .map(({label}) => label)

  return platforms.length > 0
    ? Array.from(new Set(platforms)).join(" · ")
    : undefined
}

function extractDescription(
  $: cheerio.CheerioAPI,
  eventJsonLd: JsonLdRecord | undefined,
): string | undefined {
  const jsonLdDescription = getStringValue(eventJsonLd, [
    "description",
    "abstract",
  ])

  if (jsonLdDescription) {
    return jsonLdDescription.slice(0, MAX_DESCRIPTION_LENGTH)
  }

  return getMetaContent($, [
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]',
  ])?.slice(0, MAX_DESCRIPTION_LENGTH)
}

function extractImageFromDom($: cheerio.CheerioAPI): string | undefined {
  const selectors = [
    'img[class*="event"]',
    'img[class*="hero"]',
    ".event-banner img",
    ".banner img",
    "main img",
  ]

  for (const selector of selectors) {
    const element = $(selector).first()

    const candidates = [
      element.attr("src"),
      element.attr("data-src"),
      element.attr("data-lazy-src"),
      element.attr("data-original"),
    ]

    for (const candidate of candidates) {
      if (candidate?.trim()) {
        return createAbsoluteUrl(candidate.trim())
      }
    }

    const srcset = element.attr("srcset") || element.attr("data-srcset")

    if (srcset) {
      const firstUrl = srcset
        .split(",")
        .map((entry) => entry.trim().split(/\s+/)[0])
        .find(Boolean)

      if (firstUrl) {
        return createAbsoluteUrl(firstUrl)
      }
    }
  }

  return undefined
}

function parseLocationText(value: string): {
  venue?: string
  city?: string
  region?: string
  country?: string
} {
  const parts = cleanInlineText(value)
    .split(",")
    .map((part) => cleanInlineText(part))
    .filter(Boolean)

  if (parts.length === 0) {
    return {}
  }

  if (parts.length === 1) {
    return {city: parts[0]}
  }

  if (parts.length === 2) {
    if (US_REGIONS.has(parts[1])) {
      return {
        city: parts[0],
        region: parts[1],
        country: "Estados Unidos",
      }
    }

    return {
      city: parts[0],
      country: parts[1],
    }
  }

  const venue = parts[0]
  const city = parts[1]
  const region = parts[2]
  const last = parts.at(-1)

  return {
    venue,
    city,
    region,
    country:
      region && US_REGIONS.has(region)
        ? "Estados Unidos"
        : last,
  }
}

function extractDateFromText(value: string): string | undefined {
  const cleaned = cleanInlineText(value)

  const patterns = [
    /([A-Za-z]+\s+\d{1,2},\s+\d{4})(?:\s+(\d{1,2}:\d{2}\s*(?:AM|PM)))?/i,
    /(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+(\d{1,2}:\d{2}\s*(?:AM|PM)))?/i,
  ]

  for (const pattern of patterns) {
    const match = cleaned.match(pattern)

    if (!match) {
      continue
    }

    const candidate = `${match[1]}${match[2] ? ` ${match[2]}` : " 12:00 PM"}`
    const date = new Date(candidate)

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }

  return undefined
}

function normalizeDateToIso(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const cleaned = cleanInlineText(value)

  const dateOnlyMatch = cleaned.match(
    /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?$/i,
  )

  if (dateOnlyMatch) {
    const monthAliases: Record<string, number> = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    }

    const monthName = dateOnlyMatch[1]
    const dayText = dateOnlyMatch[2]
    const yearText = dateOnlyMatch[3]

    if (!monthName || !dayText || !yearText) {
      return undefined
    }

    const monthIndex = monthAliases[monthName.toLowerCase()]

    if (typeof monthIndex === "number") {
      let hour = dateOnlyMatch[4] ? Number(dateOnlyMatch[4]) : 12
      const minute = dateOnlyMatch[5] ? Number(dateOnlyMatch[5]) : 0
      const period = dateOnlyMatch[6]?.toUpperCase()

      if (period === "PM" && hour !== 12) {
        hour += 12
      }

      if (period === "AM" && hour === 12) {
        hour = 0
      }

      return new Date(
        Date.UTC(
          Number(yearText),
          monthIndex,
          Number(dayText),
          hour,
          minute,
          0,
        ),
      ).toISOString()
    }
  }

  const directTimestamp = Date.parse(cleaned)

  return Number.isNaN(directTimestamp)
    ? undefined
    : new Date(directTimestamp).toISOString()
}

function determineEventStatus(
  startDate: string | undefined,
  pageText: string,
): EventStatus {
  const normalized = pageText.toLowerCase()

  if (
    normalized.includes("event cancelled") ||
    normalized.includes("event canceled") ||
    normalized.includes("cancelled") ||
    normalized.includes("canceled")
  ) {
    return "cancelado"
  }

  if (startDate) {
    const timestamp = new Date(startDate).getTime()

    if (!Number.isNaN(timestamp)) {
      return timestamp < Date.now()
        ? "celebrado"
        : "proximo"
    }
  }

  if (
    normalized.includes("official fight results") ||
    normalized.includes("official results for") ||
    normalized.includes("full event replay")
  ) {
    return "celebrado"
  }

  return "proximo"
}

function normalizeFighterName(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const cleaned = cleanInlineText(value)
    .replace(/\bWin\b/gi, "")
    .replace(/\bLoss\b/gi, "")
    .replace(/\bDraw\b/gi, "")
    .replace(/\bNo Contest\b/gi, "")
    .replace(/\bWinner\b/gi, "")
    .replace(/\bTotals?\b/gi, "")
    .replace(/\bRound\s+\d+\b/gi, "")
    .replace(/\bPunch summary\b/gi, "")
    .replace(/\bSee The Stats\b/gi, "")
    .replace(/\bWatch the fight\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()

  if (
    !cleaned ||
    /^TBD$/i.test(cleaned) ||
    /^Fighter\s+\d+$/i.test(cleaned) ||
    /WinLoss|DrawNo|NoContest/i.test(cleaned) ||
    /^(VS|W|L|D|NC)$/i.test(cleaned) ||
    /\d{3,}/.test(cleaned) ||
    cleaned.length < 3 ||
    cleaned.length > 80
  ) {
    return undefined
  }

  return cleaned
}

function extractKnownMethod(value: string): string | undefined {
  const text = cleanInlineText(value)

  const methods = [
    {pattern: /\bTKO\b/i, label: "TKO"},
    {pattern: /\bKO\b/i, label: "KO"},
    {pattern: /\bUnanimous Decision\b/i, label: "Decisión unánime"},
    {pattern: /\bSplit Decision\b/i, label: "Decisión dividida"},
    {pattern: /\bMajority Decision\b/i, label: "Decisión mayoritaria"},
    {pattern: /\bDecision\b/i, label: "Decisión"},
    {pattern: /\bDoctor Stoppage\b/i, label: "Parada médica"},
    {pattern: /\bDisqualification\b/i, label: "Descalificación"},
    {pattern: /\bNo Contest\b/i, label: "No contest"},
  ]

  return methods.find(({pattern}) => pattern.test(text))?.label
}

const KNOWN_WEIGHT_CLASSES = [
  "Women Strawweight",
  "Women Flyweight",
  "Women Bantamweight",
  "Men Flyweight",
  "Bantamweight",
  "Featherweight",
  "Lightweight",
  "Welterweight",
  "Middleweight",
  "Light Heavyweight",
  "Cruiserweight",
  "Heavyweight",
] as const

function sanitizeWeightClass(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const cleaned = cleanInlineText(value)

  const known = KNOWN_WEIGHT_CLASSES.find((item) =>
    cleaned.toLowerCase().includes(item.toLowerCase()),
  )

  if (known) {
    return known
  }

  const poundsMatch = cleaned.match(/^(\d{3})/)

  if (!poundsMatch?.[1]) {
    return undefined
  }

  const pounds = Number(poundsMatch[1])

  if (!Number.isFinite(pounds)) {
    return undefined
  }

  if (pounds <= 115) {
    return "Women Strawweight"
  }

  if (pounds <= 125) {
    return "Men Flyweight"
  }

  if (pounds <= 135) {
    return "Bantamweight"
  }

  if (pounds <= 145) {
    return "Featherweight"
  }

  if (pounds <= 155) {
    return "Lightweight"
  }

  if (pounds <= 175) {
    return "Welterweight"
  }

  if (pounds <= 185) {
    return "Middleweight"
  }

  if (pounds <= 205) {
    return "Light Heavyweight"
  }

  if (pounds <= 225) {
    return "Cruiserweight"
  }

  return "Heavyweight"
}

function normalizeFighterKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['"’.-]/g, " ")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function getNameTokens(value: string): string[] {
  return normalizeFighterKey(value)
    .split(" ")
    .filter(Boolean)
}

function areFighterNamesCompatible(
  first: string,
  second: string,
): boolean {
  const firstKey = normalizeFighterKey(first)
  const secondKey = normalizeFighterKey(second)

  if (firstKey === secondKey) {
    return true
  }

  const firstTokens = getNameTokens(first)
  const secondTokens = getNameTokens(second)

  if (firstTokens.length === 0 || secondTokens.length === 0) {
    return false
  }

  const firstLast = firstTokens.at(-1)
  const secondLast = secondTokens.at(-1)

  if (firstLast && secondLast && firstLast === secondLast) {
    return true
  }

  if (
    firstTokens.length === 1 &&
    secondTokens.includes(firstTokens[0])
  ) {
    return true
  }

  if (
    secondTokens.length === 1 &&
    firstTokens.includes(secondTokens[0])
  ) {
    return true
  }

  return false
}

function areFightPairsCompatible(
  first: BkfcFightCardItem,
  second: BkfcFightCardItem,
): boolean {
  const sameOrientation =
    areFighterNamesCompatible(
      first.redFighter,
      second.redFighter,
    ) &&
    areFighterNamesCompatible(
      first.blueFighter,
      second.blueFighter,
    )

  const reversedOrientation =
    areFighterNamesCompatible(
      first.redFighter,
      second.blueFighter,
    ) &&
    areFighterNamesCompatible(
      first.blueFighter,
      second.redFighter,
    )

  return sameOrientation || reversedOrientation
}

function getFightQuality(item: BkfcFightCardItem): number {
  const redWords = item.redFighter.split(/\s+/).filter(Boolean).length
  const blueWords = item.blueFighter.split(/\s+/).filter(Boolean).length

  return (
    redWords * 25 +
    blueWords * 25 +
    item.redFighter.length +
    item.blueFighter.length +
    (item.weightClass ? 30 : 0) +
    (item.titleFight ? 10 : 0)
  )
}

function deduplicateFightCard(
  fights: BkfcFightCardItem[],
): BkfcFightCardItem[] {
  const deduplicated: BkfcFightCardItem[] = []

  for (const fight of fights) {
    const existingIndex = deduplicated.findIndex((existing) =>
      areFightPairsCompatible(existing, fight),
    )

    if (existingIndex < 0) {
      deduplicated.push(fight)
      continue
    }

    const existing = deduplicated[existingIndex]

    if (
      existing &&
      getFightQuality(fight) > getFightQuality(existing)
    ) {
      deduplicated[existingIndex] = fight
    }
  }

  let mainOrder = 0
  let prelimOrder = 0

  return deduplicated.map((fight, index) => {
    if (fight.section === "preliminar") {
      prelimOrder += 1
    } else {
      mainOrder += 1
    }

    return {
      ...fight,
      id: `fight-${index + 1}-${slugify(fight.redFighter)}-vs-${slugify(
        fight.blueFighter,
      )}`,
      order:
        fight.section === "preliminar"
          ? prelimOrder
          : mainOrder,
    }
  })
}

function extractFightCard(
  $: cheerio.CheerioAPI,
  eventStatus: EventStatus,
): BkfcFightCardItem[] {
  const bodyText = cleanInlineText($("body").text())

  if (
    /fights?\s+(?:to be announced|coming soon)/i.test(bodyText) ||
    /card\s+(?:to be announced|coming soon)/i.test(bodyText)
  ) {
    return []
  }

  const candidateSelectors = [
    '[class*="fight-card"] [class*="fight"]',
    '[class*="main-card"] [class*="fight"]',
    '[class*="event-card"] [class*="fighter"]',
    '[class*="bout"]',
    '[data-fight-id]',
  ]

  const roots: AnyNode[] = []
  const seen = new Set<AnyNode>()

  for (const selector of candidateSelectors) {
    $(selector).each((_, element) => {
      const root =
        $(element).closest(
          '[class*="fight"], [class*="bout"], [data-fight-id]',
        ).get(0) || element

      if (!seen.has(root)) {
        seen.add(root)
        roots.push(root)
      }
    })

    if (roots.length > 0) {
      break
    }
  }

  const fights: BkfcFightCardItem[] = []
  let mainOrder = 0
  let prelimOrder = 0

  for (const element of roots) {
    const container = $(element)
    const containerText = cleanInlineText(container.text())

    const fighterSelectors = [
      '[class*="fighter-name"]',
      '[class*="fighter"] h3',
      '[class*="fighter"] h4',
      '[class*="corner-name"]',
      'a[href*="/fighters/"]',
      'a[href*="/fighter/"]',
    ]

    const names = container
      .find(fighterSelectors.join(","))
      .map((_, node) => normalizeFighterName($(node).text()))
      .get()
      .filter((value): value is string => Boolean(value))

    const uniqueNames = Array.from(new Set(names))

    let redFighter: string | undefined = uniqueNames[0]
    let blueFighter: string | undefined = uniqueNames[1]

    if (!redFighter || !blueFighter) {
      const vsMatch = containerText.match(
        /([A-Za-zÀ-ÿ'. -]{2,60})\s+vs\.?\s+([A-Za-zÀ-ÿ'. -]{2,60})/i,
      )

      redFighter = redFighter || normalizeFighterName(vsMatch?.[1])
      blueFighter = blueFighter || normalizeFighterName(vsMatch?.[2])
    }

    if (!redFighter || !blueFighter || redFighter === blueFighter) {
      continue
    }

    const safeRedFighter: string = redFighter
    const safeBlueFighter: string = blueFighter

    const isPrelim =
      /prelim/i.test(
        cleanInlineText(
          container
            .parentsUntil("body")
            .addBack()
            .prevAll("h2,h3,h4")
            .first()
            .text(),
        ),
      ) || /prelim/i.test(containerText)

    const section: FightCardSection = isPrelim ? "preliminar" : "principal"
    const sectionLabel = isPrelim ? "Prelims" : "Main Card"

    if (isPrelim) {
      prelimOrder += 1
    } else {
      mainOrder += 1
    }

    const order = isPrelim ? prelimOrder : mainOrder

    const weightClass = sanitizeWeightClass(
      cleanOptionalInlineText(
        container
          .find(
            '[class*="weight"], [class*="division"], [class*="class"]',
          )
          .first()
          .text(),
      ),
    )

    const rawTime = cleanOptionalInlineText(
      container.find('[class*="time"]').first().text(),
    )

    const time =
      rawTime && /^\d{1,2}:\d{2}$/.test(rawTime)
        ? rawTime
        : undefined

    const roundText = cleanOptionalInlineText(
      container.find('[class*="round"]').first().text(),
    )
    const roundMatch = roundText?.match(/\d+/)

    let winnerName: string | undefined

    const winnerElement = container.find(
      '[class*="winner"], [data-winner="true"]',
    ).first()

    if (winnerElement.length > 0) {
      const winnerText = normalizeFighterName(winnerElement.text())

      if (winnerText === safeRedFighter || winnerText === safeBlueFighter) {
        winnerName = winnerText
      }
    }

    if (!winnerName) {
      if (new RegExp(`\\b${safeRedFighter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b.{0,30}\\bwin\\b`, "i").test(containerText)) {
        winnerName = safeRedFighter
      } else if (new RegExp(`\\b${safeBlueFighter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b.{0,30}\\bwin\\b`, "i").test(containerText)) {
        winnerName = safeBlueFighter
      }
    }

    const method =
      eventStatus === "celebrado"
        ? extractKnownMethod(containerText)
        : undefined

    const status: FightStatus =
      /cancelled|canceled/i.test(containerText)
        ? "cancelado"
        : eventStatus === "proximo"
        ? "programado"
        : winnerName || method || time
        ? "finalizado"
        : "finalizado"

    const titleFight =
      /\btitle\b/i.test(containerText) ||
      /\bchampionship\b/i.test(containerText)

    fights.push({
      id: `fight-${fights.length + 1}-${slugify(safeRedFighter)}-vs-${slugify(
        safeBlueFighter,
      )}`,
      section,
      sectionLabel,
      order,
      redFighter: safeRedFighter,
      blueFighter: safeBlueFighter,
      weightClass,
      titleFight,
      status,
      winnerName: status === "finalizado" ? winnerName : undefined,
      method: status === "finalizado" ? method : undefined,
      round:
        status === "finalizado" && roundMatch
          ? Number(roundMatch[0])
          : undefined,
      time: status === "finalizado" ? time : undefined,
    })
  }

  return deduplicateFightCard(fights)
}

function extractEvent(
  html: string,
  sourceUrl: string,
): BkfcEventApiItem {
  const $ = cheerio.load(html)
  const jsonLdRecords = extractJsonLdRecords($)
  const eventJsonLd = findEventJsonLd(jsonLdRecords)

  const canonicalHref =
    $('link[rel="canonical"]').first().attr("href")?.trim() || sourceUrl

  const canonicalUrl = createCanonicalUrl(canonicalHref)

  const rawName =
    getStringValue(eventJsonLd, ["name", "headline"]) ||
    getMetaContent($, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
    ]) ||
    cleanInlineText($("h1").first().text()) ||
    cleanInlineText($("title").first().text()) ||
    "Evento BKFC"

  const name = cleanInlineText(
    rawName
      .replace(/\s*\|\s*BKFC.*$/i, "")
      .replace(/\s*-\s*BKFC.*$/i, ""),
  )

  const headline =
    getStringValue(eventJsonLd, ["headline"]) ||
    getMetaContent($, ['meta[property="og:title"]'])

  const description = extractDescription($, eventJsonLd)

  const rawStartDate =
    getStringValue(eventJsonLd, ["startDate", "doorTime"]) ||
    $("time[datetime]").first().attr("datetime")?.trim() ||
    extractDateFromText($("body").text())

  const rawEndDate = getStringValue(eventJsonLd, ["endDate"])

  const startDate = normalizeDateToIso(rawStartDate)
  const endDate = normalizeDateToIso(rawEndDate)

  const locationRecord = getLocationRecord(eventJsonLd)
  const addressRecord = getAddressRecord(locationRecord)

  const jsonLdVenue = getStringValue(locationRecord, ["name"])
  const jsonLdCity = getStringValue(addressRecord, [
    "addressLocality",
    "locality",
    "city",
  ])
  const jsonLdRegion = getStringValue(addressRecord, [
    "addressRegion",
    "region",
    "state",
  ])
  const jsonLdCountry = getStringValue(addressRecord, [
    "addressCountry",
    "country",
  ])

  const bodyText = cleanInlineText($("body").text())

  const venue = jsonLdVenue
  const city = jsonLdCity
  const region = jsonLdRegion
  const country =
    jsonLdCountry ||
    (region && US_REGIONS.has(region) ? "Estados Unidos" : undefined)

  const locationText = Array.from(
    new Set([venue, city, region, country].filter(Boolean)),
  ).join(", ") || undefined

  const watchText = extractPlatforms($)

  const imageUrl =
    getImageFromJsonLd(eventJsonLd) ||
    getMetaContent($, [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[property="twitter:image"]',
    ]) ||
    extractImageFromDom($)

  const status = determineEventStatus(startDate, bodyText)

  const fightCard = extractFightCard($, status)

  const firstFight = fightCard[0]

  const mainEvent =
    firstFight
      ? `${firstFight.redFighter} vs ${firstFight.blueFighter}`
      : extractMainEventFromName(name) ||
        normalizeMainEvent(
          cleanOptionalInlineText(
            $('[class*="main-event"]').first().text(),
          ),
        )

  return {
    id: createItemId(canonicalUrl),
    name,
    headline: cleanOptionalInlineText(headline),
    mainEvent,
    startDate: cleanOptionalInlineText(startDate),
    endDate: cleanOptionalInlineText(endDate),
    venue: cleanOptionalInlineText(venue),
    city: cleanOptionalInlineText(city),
    region: cleanOptionalInlineText(region),
    country: cleanOptionalInlineText(country),
    locationText: cleanOptionalInlineText(locationText),
    watchText: cleanOptionalInlineText(watchText),
    description: cleanOptionalText(description),
    sourceUrl,
    canonicalUrl,
    imageUrl: imageUrl ? createAbsoluteUrl(imageUrl) : undefined,
    status,
    fightCard,
  }
}

async function fetchEvent(
  sourceUrl: string,
): Promise<BkfcEventApiItem | null> {
  try {
    const html = await fetchHtml(sourceUrl)
    return extractEvent(html, sourceUrl)
  } catch (error) {
    console.error(`No se pudo leer ${sourceUrl}`, error)
    return null
  }
}

function deduplicateEvents(
  items: BkfcEventApiItem[],
): BkfcEventApiItem[] {
  const byCanonicalUrl = new Map<string, BkfcEventApiItem>()

  for (const item of items) {
    const key = createCanonicalUrl(item.canonicalUrl)

    const existing = byCanonicalUrl.get(key)

    if (!existing) {
      byCanonicalUrl.set(key, item)
      continue
    }

    const existingScore =
      (existing.startDate ? 20 : 0) +
      (existing.description ? 5 : 0) +
      existing.fightCard.length * 10

    const candidateScore =
      (item.startDate ? 20 : 0) +
      (item.description ? 5 : 0) +
      item.fightCard.length * 10

    if (candidateScore > existingScore) {
      byCanonicalUrl.set(key, item)
    }
  }

  return Array.from(byCanonicalUrl.values())
}

function createResponseHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  }
}

function createJsonResponse(
  payload: BkfcEventsApiResponse,
  status: number,
): NextResponse {
  return new NextResponse(JSON.stringify(payload), {
    status,
    headers: createResponseHeaders(),
  })
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: createResponseHeaders(),
  })
}

export async function GET(): Promise<NextResponse> {
  const fetchedAt = new Date().toISOString()

  try {
    const [upcomingHtml, pastHtml] = await Promise.all([
      fetchHtml(BKFC_EVENTS_URL),
      fetchHtml(BKFC_PAST_EVENTS_URL).catch(() => ""),
    ])

    const eventUrls = Array.from(
      new Set([
        ...extractEventUrls(upcomingHtml),
        ...extractEventUrls(pastHtml),
      ]),
    ).slice(0, MAX_ITEMS)

    const eventResults = await Promise.all(
      eventUrls.map((url) => fetchEvent(url)),
    )

    const items = deduplicateEvents(
      eventResults.filter(
        (item): item is BkfcEventApiItem => item !== null,
      ),
    ).sort((a, b) => {
        const timeA = a.startDate
          ? new Date(a.startDate).getTime()
          : Number.MAX_SAFE_INTEGER
        const timeB = b.startDate
          ? new Date(b.startDate).getTime()
          : Number.MAX_SAFE_INTEGER

        return timeA - timeB
      })

    return createJsonResponse(
      {
        ok: true,
        source: "bkfc",
        fetchedAt,
        count: items.length,
        items,
      },
      200,
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido consultando los eventos de BKFC."

    return createJsonResponse(
      {
        ok: false,
        source: "bkfc",
        fetchedAt,
        count: 0,
        items: [],
        error: cleanText(message),
      },
      500,
    )
  }
}
