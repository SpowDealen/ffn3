import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UFC_BASE_URL = "https://www.ufc.com";
const UFC_EVENTS_URL = `${UFC_BASE_URL}/events`;

const MAX_ITEMS = 12;
const MAX_DESCRIPTION_LENGTH = 5_000;

type JsonLdRecord = Record<string, unknown>;

type UfcEventApiItem = {
  id: string;
  name: string;
  headline?: string;
  mainEvent?: string;
  startDate?: string;
  endDate?: string;
  venue?: string;
  city?: string;
  region?: string;
  country?: string;
  locationText?: string;
  watchText?: string;
  description?: string;
  sourceUrl: string;
  canonicalUrl: string;
  imageUrl?: string;
  status: "proximo" | "celebrado" | "cancelado";
};

type UfcEventsApiResponse = {
  ok: boolean;
  source: "ufc";
  fetchedAt: string;
  count: number;
  items: UfcEventApiItem[];
  error?: string;
};

const MOJIBAKE_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ["\u00e2\u20ac\u2122", "\u2019"],
  ["\u00e2\u20ac\u02dc", "\u2018"],
  ["\u00e2\u20ac\u0153", "\u201c"],
  ["\u00e2\u20ac\u009d", "\u201d"],
  ["\u00e2\u20ac\u017e", "\u201e"],
  ["\u00e2\u20ac\u00a6", "\u2026"],
  ["\u00e2\u20ac\u201d", "\u2014"],
  ["\u00e2\u20ac\u201c", "\u2013"],
  ["\u00e2\u20ac\u00a2", "\u2022"],
  ["\u00e2\u201e\u00a2", "\u2122"],
  ["\u00c2\u00a0", " "],
  ["\u00c2\u00a9", "\u00a9"],
  ["\u00c2\u00ae", "\u00ae"],
  ["\u00c2\u00b0", "\u00b0"],
  ["\u00c2\u00b7", "\u00b7"],
];

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizeParagraphs(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function repairMojibake(value: string): string {
  if (!value) {
    return value;
  }

  let repaired = value;

  for (let pass = 0; pass < 3; pass += 1) {
    const previousValue = repaired;

    for (const [broken, correct] of MOJIBAKE_REPLACEMENTS) {
      repaired = repaired.split(broken).join(correct);
    }

    repaired = repaired.split("\u00c2").join("");

    if (repaired === previousValue) {
      break;
    }
  }

  return repaired;
}

function cleanText(value: string): string {
  return normalizeParagraphs(repairMojibake(value));
}

function cleanOptionalText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned = cleanText(value);

  return cleaned || undefined;
}

function createAbsoluteUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith("/")) {
    return `${UFC_BASE_URL}${trimmed}`;
  }

  return `${UFC_BASE_URL}/${trimmed}`;
}

function createCanonicalUrl(value: string): string {
  return createAbsoluteUrl(value).split("?")[0].split("#")[0];
}

function createItemId(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);

    const normalizedPath = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .replace(/\//g, "-")
      .toLowerCase();

    return `ufc-${normalizedPath}`;
  } catch {
    const normalizedValue = sourceUrl
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();

    return `ufc-event-${normalizedValue}`;
  }
}

function isValidEventUrl(value: string): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(createAbsoluteUrl(value));

    return (
      url.hostname.endsWith("ufc.com") &&
      url.pathname.startsWith("/event/") &&
      url.pathname !== "/event/"
    );
  } catch {
    return false;
  }
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (compatible; FullFightNewsSourceReader/1.0)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`${url} respondió con estado ${response.status}.`);
  }

  const buffer = await response.arrayBuffer();

  return new TextDecoder("utf-8").decode(buffer);
}

function extractEventUrls(html: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();

  $('a[href*="/event/"]').each((_, element) => {
    if (urls.size >= MAX_ITEMS) {
      return false;
    }

    const href = $(element).attr("href")?.trim() ?? "";

    if (!isValidEventUrl(href)) {
      return;
    }

    urls.add(createCanonicalUrl(href));
  });

  return Array.from(urls);
}

function getMetaContent(
  $: cheerio.CheerioAPI,
  selectors: string[],
): string | undefined {
  for (const selector of selectors) {
    const value = $(selector).first().attr("content");

    if (!value) {
      continue;
    }

    const cleaned = cleanText(value);

    if (cleaned) {
      return cleaned;
    }
  }

  return undefined;
}

function asRecord(value: unknown): JsonLdRecord | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as JsonLdRecord;
  }

  return undefined;
}

function flattenJsonLd(value: unknown): JsonLdRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenJsonLd(item));
  }

  const record = asRecord(value);

  if (!record) {
    return [];
  }

  const graph = record["@graph"];

  if (Array.isArray(graph)) {
    return [record, ...graph.flatMap((item) => flattenJsonLd(item))];
  }

  return [record];
}

function extractJsonLdRecords($: cheerio.CheerioAPI): JsonLdRecord[] {
  const records: JsonLdRecord[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const rawValue = $(element).html()?.trim();

    if (!rawValue) {
      return;
    }

    try {
      const parsed = JSON.parse(rawValue) as unknown;
      records.push(...flattenJsonLd(parsed));
    } catch {
      // Algunos bloques JSON-LD externos pueden ser inválidos.
    }
  });

  return records;
}

function getJsonLdTypes(record: JsonLdRecord): string[] {
  const typeValue = record["@type"];

  if (typeof typeValue === "string") {
    return [typeValue];
  }

  if (Array.isArray(typeValue)) {
    return typeValue.filter(
      (item): item is string => typeof item === "string",
    );
  }

  return [];
}

function findEventJsonLd(
  records: JsonLdRecord[],
): JsonLdRecord | undefined {
  const acceptedTypes = new Set(["Event", "SportsEvent", "BusinessEvent"]);

  return records.find((record) =>
    getJsonLdTypes(record).some((type) => acceptedTypes.has(type)),
  );
}

function getStringValue(
  record: JsonLdRecord | undefined,
  keys: string[],
): string | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];

    if (typeof value !== "string") {
      continue;
    }

    const cleaned = cleanText(value);

    if (cleaned) {
      return cleaned;
    }
  }

  return undefined;
}

function getImageFromJsonLd(
  record: JsonLdRecord | undefined,
): string | undefined {
  if (!record) {
    return undefined;
  }

  const image = record.image;

  if (typeof image === "string") {
    return createAbsoluteUrl(image);
  }

  if (Array.isArray(image)) {
    const firstString = image.find(
      (item): item is string => typeof item === "string",
    );

    if (firstString) {
      return createAbsoluteUrl(firstString);
    }

    const firstRecord = image
      .map((item) => asRecord(item))
      .find((item): item is JsonLdRecord => item !== undefined);

    const imageUrl = getStringValue(firstRecord, ["url", "contentUrl"]);

    return imageUrl ? createAbsoluteUrl(imageUrl) : undefined;
  }

  const imageRecord = asRecord(image);
  const imageUrl = getStringValue(imageRecord, ["url", "contentUrl"]);

  return imageUrl ? createAbsoluteUrl(imageUrl) : undefined;
}

function getLocationRecord(
  eventJsonLd: JsonLdRecord | undefined,
): JsonLdRecord | undefined {
  if (!eventJsonLd) {
    return undefined;
  }

  return asRecord(eventJsonLd.location);
}

function getAddressRecord(
  locationRecord: JsonLdRecord | undefined,
): JsonLdRecord | undefined {
  if (!locationRecord) {
    return undefined;
  }

  return asRecord(locationRecord.address);
}

function extractMainEvent(
  $: cheerio.CheerioAPI,
  eventName: string,
): string | undefined {
  const candidates = [
    $(".c-hero__headline-suffix").first().text(),
    $(".c-hero__headline").first().text(),
    $("h1").first().text(),
  ]
    .map((value) => cleanText(value))
    .filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.toLowerCase() === eventName.toLowerCase()) {
      continue;
    }

    if (/\bvs\.?\b/i.test(candidate)) {
      return candidate;
    }
  }

  const pageTitle =
    getMetaContent($, ['meta[property="og:title"]']) ||
    cleanText($("title").first().text());

  const match = pageTitle.match(/:\s*(.+?\s+vs\.?\s+.+?)(?:\s*\||$)/i);

  return match?.[1] ? cleanText(match[1]) : undefined;
}

function extractWatchText($: cheerio.CheerioAPI): string | undefined {
  const candidates: string[] = [];

  $("main, article, body")
    .find("a, span, div, p")
    .each((_, element) => {
      const text = cleanText($(element).text());

      if (
        text &&
        /watch on|order on|ufc fight pass|paramount\+|espn\+|dazn|eurosport/i.test(
          text,
        )
      ) {
        candidates.push(text);
      }
    });

  const unique = Array.from(new Set(candidates))
    .filter((value) => value.length <= 180)
    .slice(0, 4);

  return unique.length > 0 ? unique.join(" · ") : undefined;
}

function extractDescription(
  $: cheerio.CheerioAPI,
  eventJsonLd: JsonLdRecord | undefined,
): string | undefined {
  const jsonLdDescription = getStringValue(eventJsonLd, [
    "description",
    "abstract",
  ]);

  if (jsonLdDescription) {
    return jsonLdDescription.slice(0, MAX_DESCRIPTION_LENGTH);
  }

  const metaDescription = getMetaContent($, [
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]',
  ]);

  return metaDescription?.slice(0, MAX_DESCRIPTION_LENGTH);
}

function determineEventStatus(
  startDate: string | undefined,
  pageText: string,
): "proximo" | "celebrado" | "cancelado" {
  const normalizedPageText = pageText.toLowerCase();

  if (
    normalizedPageText.includes("event cancelled") ||
    normalizedPageText.includes("event canceled") ||
    normalizedPageText.includes("cancelled") ||
    normalizedPageText.includes("canceled")
  ) {
    return "cancelado";
  }

  if (startDate) {
    const timestamp = new Date(startDate).getTime();

    if (!Number.isNaN(timestamp)) {
      return timestamp < Date.now() ? "celebrado" : "proximo";
    }
  }

  if (
    normalizedPageText.includes("official results") ||
    normalizedPageText.includes("final main card results")
  ) {
    return "celebrado";
  }

  return "proximo";
}

function sanitizeEvent(item: UfcEventApiItem): UfcEventApiItem {
  return {
    id: cleanText(item.id),
    name: cleanText(item.name),
    headline: cleanOptionalText(item.headline),
    mainEvent: cleanOptionalText(item.mainEvent),
    startDate: cleanOptionalText(item.startDate),
    endDate: cleanOptionalText(item.endDate),
    venue: cleanOptionalText(item.venue),
    city: cleanOptionalText(item.city),
    region: cleanOptionalText(item.region),
    country: cleanOptionalText(item.country),
    locationText: cleanOptionalText(item.locationText),
    watchText: cleanOptionalText(item.watchText),
    description: cleanOptionalText(item.description),
    sourceUrl: item.sourceUrl,
    canonicalUrl: item.canonicalUrl,
    imageUrl: item.imageUrl,
    status: item.status,
  };
}

function extractEvent(html: string, sourceUrl: string): UfcEventApiItem {
  const $ = cheerio.load(html);

  const jsonLdRecords = extractJsonLdRecords($);
  const eventJsonLd = findEventJsonLd(jsonLdRecords);

  const canonicalHref =
    $('link[rel="canonical"]').first().attr("href")?.trim() || sourceUrl;

  const canonicalUrl = createCanonicalUrl(canonicalHref);

  const name =
    getStringValue(eventJsonLd, ["name", "headline"]) ||
    getMetaContent($, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
    ]) ||
    cleanText($("h1").first().text()) ||
    cleanText($("title").first().text()) ||
    "Evento UFC";

  const headline =
    getStringValue(eventJsonLd, ["headline"]) ||
    getMetaContent($, ['meta[property="og:title"]']);

  const startDate =
    getStringValue(eventJsonLd, ["startDate", "doorTime"]) ||
    $("time[datetime]").first().attr("datetime")?.trim() ||
    undefined;

  const endDate = getStringValue(eventJsonLd, ["endDate"]);

  const locationRecord = getLocationRecord(eventJsonLd);
  const addressRecord = getAddressRecord(locationRecord);

  const venue = getStringValue(locationRecord, ["name"]);

  const city = getStringValue(addressRecord, [
    "addressLocality",
    "locality",
    "city",
  ]);

  const region = getStringValue(addressRecord, [
    "addressRegion",
    "region",
    "state",
  ]);

  const country = getStringValue(addressRecord, [
    "addressCountry",
    "country",
  ]);

  const locationParts = [venue, city, region, country].filter(Boolean);
  const locationText =
    locationParts.length > 0 ? locationParts.join(", ") : undefined;

  const mainEvent = extractMainEvent($, name);
  const watchText = extractWatchText($);
  const description = extractDescription($, eventJsonLd);

  const imageUrl =
    getImageFromJsonLd(eventJsonLd) ||
    getMetaContent($, [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
    ]);

  const pageText = cleanText($("body").text());
  const status = determineEventStatus(startDate, pageText);

  return sanitizeEvent({
    id: createItemId(canonicalUrl),
    name,
    headline,
    mainEvent,
    startDate,
    endDate,
    venue,
    city,
    region,
    country,
    locationText,
    watchText,
    description,
    sourceUrl,
    canonicalUrl,
    imageUrl: imageUrl ? createAbsoluteUrl(imageUrl) : undefined,
    status,
  });
}

async function fetchEvent(sourceUrl: string): Promise<UfcEventApiItem | null> {
  try {
    const html = await fetchHtml(sourceUrl);

    return extractEvent(html, sourceUrl);
  } catch (error) {
    console.error(`No se pudo leer ${sourceUrl}`, error);

    return null;
  }
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
  };
}

function createJsonResponse(
  payload: UfcEventsApiResponse,
  status: number,
): NextResponse {
  return new NextResponse(JSON.stringify(payload), {
    status,
    headers: createResponseHeaders(),
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: createResponseHeaders(),
  });
}

export async function GET(): Promise<NextResponse> {
  const fetchedAt = new Date().toISOString();

  try {
    const listingHtml = await fetchHtml(UFC_EVENTS_URL);
    const eventUrls = extractEventUrls(listingHtml);

    const eventResults = await Promise.all(
      eventUrls.map((url) => fetchEvent(url)),
    );

    const items = eventResults
      .filter((item): item is UfcEventApiItem => item !== null)
      .map((item) => sanitizeEvent(item))
      .sort((a, b) => {
        const timeA = a.startDate
          ? new Date(a.startDate).getTime()
          : Number.MAX_SAFE_INTEGER;
        const timeB = b.startDate
          ? new Date(b.startDate).getTime()
          : Number.MAX_SAFE_INTEGER;

        return timeA - timeB;
      });

    const payload: UfcEventsApiResponse = {
      ok: true,
      source: "ufc",
      fetchedAt,
      count: items.length,
      items,
    };

    return createJsonResponse(payload, 200);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido consultando los eventos de UFC.";

    const payload: UfcEventsApiResponse = {
      ok: false,
      source: "ufc",
      fetchedAt,
      count: 0,
      items: [],
      error: cleanText(message),
    };

    return createJsonResponse(payload, 500);
  }
}
