import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEKM_BASE_URL = "https://fekm.es";
const FEKM_EVENTS_URL = `${FEKM_BASE_URL}/events/`;
const FEKM_CALENDAR_URL = `${FEKM_BASE_URL}/calendario/`;
const FEKM_WP_EVENTS_URL = `${FEKM_BASE_URL}/wp-json/wp/v2/mec-events?per_page=40&_embed=1`;
const MAX_ITEMS = 24;

type EventStatus = "proximo" | "celebrado" | "cancelado";
type FekmDisciplineKey = "kickboxing" | "muay_thai" | "mixed";

type FekmEventApiItem = {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  timeText?: string;
  city?: string;
  region?: string;
  country?: string;
  venue?: string;
  locationText?: string;
  description?: string;
  sourceUrl: string;
  canonicalUrl: string;
  imageUrl?: string;
  status: EventStatus;
  discipline: FekmDisciplineKey;
  disciplineLabel: "Kickboxing" | "Muay Thai" | "Kickboxing y Muay Thai";
  category?: string;
  scope?: "nacional" | "internacional" | "autonomico" | "otro";
};

type FekmEventsApiResponse = {
  ok: boolean;
  source: "fekm";
  fetchedAt: string;
  count: number;
  items: FekmEventApiItem[];
  error?: string;
};

type JsonRecord = Record<string, unknown>;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function withCors<T>(response: NextResponse<T>): NextResponse<T> {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return cheerio.load(`<div>${value}</div>`)("div").text().trim();
}

function cleanText(value: string): string {
  return normalizeWhitespace(decodeHtml(value));
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugify(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 110);
}

function absoluteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${FEKM_BASE_URL}${trimmed}`;
  return `${FEKM_BASE_URL}/${trimmed}`;
}

function canonicalUrl(value: string): string {
  return absoluteUrl(value).split("?")[0].split("#")[0].replace(/\/+$/, "");
}

function eventId(url: string, name: string): string {
  try {
    const parsed = new URL(url);
    const slug = parsed.pathname.replace(/^\/+|\/+$/g, "");
    return `fekm-event-${slugify(slug || name)}`;
  } catch {
    return `fekm-event-${slugify(name)}`;
  }
}

function isEventUrl(value: string): boolean {
  try {
    const url = new URL(absoluteUrl(value));
    return url.hostname.endsWith("fekm.es") && /^\/events\/[^/]+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

async function fetchText(url: string, accept = "text/html,application/xhtml+xml"): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: accept,
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.6",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        Referer: `${FEKM_BASE_URL}/`,
      },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${url} respondió con estado ${response.status}.`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function getRendered(value: unknown): string {
  const record = asRecord(value);
  return typeof record?.rendered === "string" ? record.rendered : "";
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function collectEventLinksFromHtml(html: string): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();

  $('a[href*="/events/"]').each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const normalized = canonicalUrl(href);
    if (isEventUrl(normalized)) links.add(normalized);
  });

  return Array.from(links);
}

function collectEventLinksFromWp(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return Array.from(
      new Set(
        parsed
          .map((item) => getString(asRecord(item)?.link))
          .map(canonicalUrl)
          .filter(isEventUrl)
      )
    );
  } catch {
    return [];
  }
}

function getMeta($: cheerio.CheerioAPI, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const value = $(selector).first().attr("content");
    if (value?.trim()) return cleanText(value);
  }
  return undefined;
}

function extractJsonLd($: cheerio.CheerioAPI): JsonRecord[] {
  const result: JsonRecord[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).html()?.trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const visit = (value: unknown): void => {
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        const record = asRecord(value);
        if (!record) return;
        result.push(record);
        if (Array.isArray(record["@graph"])) visit(record["@graph"]);
      };
      visit(parsed);
    } catch {
      // JSON-LD inválido: ignorar.
    }
  });
  return result;
}

function jsonLdEvent(records: JsonRecord[]): JsonRecord | undefined {
  return records.find((record) => {
    const type = record["@type"];
    const types = Array.isArray(type) ? type : [type];
    return types.some((item) => item === "Event" || item === "SportsEvent");
  });
}

function valueFromRecord(record: JsonRecord | undefined, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return cleanText(value);
  }
  return undefined;
}

function parseDateValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function parseCompactUtcDate(value: string | null): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return undefined;

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )
  );

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function extractGoogleCalendarData($: cheerio.CheerioAPI): {
  startDate?: string;
  endDate?: string;
  location?: string;
} {
  const href = $('a[href*="calendar.google.com/calendar/render"]').first().attr("href");
  if (!href) return {};

  try {
    const url = new URL(href);
    const [startRaw, endRaw] = (url.searchParams.get("dates") ?? "").split("/");
    const location = cleanText(url.searchParams.get("location") ?? "");

    return {
      startDate: parseCompactUtcDate(startRaw || null),
      endDate: parseCompactUtcDate(endRaw || null),
      location: location || undefined,
    };
  } catch {
    return {};
  }
}

const SPANISH_MONTHS: Record<string, number> = {
  ene: 0,
  enero: 0,
  feb: 1,
  febrero: 1,
  mar: 2,
  marzo: 2,
  abr: 3,
  abril: 3,
  may: 4,
  mayo: 4,
  jun: 5,
  junio: 5,
  jul: 6,
  julio: 6,
  ago: 7,
  agosto: 7,
  sep: 8,
  sept: 8,
  septiembre: 8,
  oct: 9,
  octubre: 9,
  nov: 10,
  noviembre: 10,
  dic: 11,
  diciembre: 11,
};

function parseSpanishDateRange(text: string): { startDate?: string; endDate?: string } {
  const normalized = stripDiacritics(text.toLowerCase()).replace(/\s+/g, " ");
  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();

  const match = normalized.match(
    /\b(\d{1,2})(?:\s*(?:-|–|a)\s*(\d{1,2}))?\s+(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:t|tiembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)\b/
  );
  if (!match) return {};

  const startDay = Number(match[1]);
  const endDay = match[2] ? Number(match[2]) : startDay;
  const month = SPANISH_MONTHS[match[3]];
  if (month === undefined) return {};

  return {
    startDate: new Date(Date.UTC(year, month, startDay, 9, 0, 0)).toISOString(),
    endDate: new Date(Date.UTC(year, month, endDay, 18, 0, 0)).toISOString(),
  };
}

function inferDiscipline(name: string, description: string): {
  key: FekmDisciplineKey;
  label: FekmEventApiItem["disciplineLabel"];
} {
  const text = stripDiacritics(`${name} ${description}`.toLowerCase());
  const hasKickboxing = /\bkick\s*-?\s*boxing\b|\bkstl\b|\bstars league\b|\bwako\b/.test(text);
  const hasMuayThai = /\bmuay\s*thai\b|\bmuaythai\b|\bifma\b/.test(text);

  if (hasKickboxing && hasMuayThai) {
    return { key: "mixed", label: "Kickboxing y Muay Thai" };
  }
  if (hasMuayThai) return { key: "muay_thai", label: "Muay Thai" };
  return { key: "kickboxing", label: "Kickboxing" };
}

function inferScope(name: string, description: string): FekmEventApiItem["scope"] {
  const text = stripDiacritics(`${name} ${description}`.toLowerCase());
  if (/mundial|world cup|world championship|european|europa|internacional|world games|fisu|eusa/.test(text)) {
    return "internacional";
  }
  if (/campeonato de espana|seleccion espanola|nacional|stars league|kstl/.test(text)) {
    return "nacional";
  }
  if (/autonom|regional|territorial/.test(text)) return "autonomico";
  return "otro";
}

function statusFromDates(startDate?: string, endDate?: string, text = ""): EventStatus {
  if (/cancelad[oa]/i.test(text)) return "cancelado";
  const now = Date.now();
  const comparison = endDate ?? startDate;
  if (comparison) {
    const time = new Date(comparison).getTime();
    if (!Number.isNaN(time) && time < now) return "celebrado";
  }
  return "proximo";
}

function textAfterLabel($: cheerio.CheerioAPI, labels: string[]): string | undefined {
  let found: string | undefined;

  $("body *").each((_, element) => {
    if (found) return;
    const ownText = cleanText($(element).clone().children().remove().end().text());
    if (!ownText) return;
    const normalized = stripDiacritics(ownText.toLowerCase());
    if (!labels.some((label) => normalized === stripDiacritics(label.toLowerCase()))) return;

    const parentText = cleanText($(element).parent().text());
    const withoutLabel = parentText.replace(new RegExp(ownText, "i"), "").trim();
    if (withoutLabel) found = withoutLabel;
  });

  return found;
}

function collapseRepeatedLocationWords(value: string): string {
  const words = cleanText(value).split(" ").filter(Boolean);
  const collapsed: string[] = [];

  for (const word of words) {
    const previous = collapsed[collapsed.length - 1];
    if (previous && stripDiacritics(previous.toLowerCase()) === stripDiacritics(word.toLowerCase())) {
      continue;
    }
    collapsed.push(word);
  }

  return collapsed.join(" ");
}

function parseLocation(value: string | undefined): {
  venue?: string;
  city?: string;
  region?: string;
  country?: string;
  locationText?: string;
} {
  const raw = value ? cleanText(value) : undefined;
  if (!raw) return {};

  const parts = raw
    .split(",")
    .map((part) => collapseRepeatedLocationWords(part))
    .filter(Boolean);

  const city = parts[0];
  const region = parts.length > 1 ? parts.slice(1).join(", ") : undefined;
  const country = parts.some((part) => /españa/i.test(part)) ? "España" : undefined;
  const locationText = [city, region].filter(Boolean).join(", ");

  return {
    venue: city,
    city,
    region,
    country,
    locationText: locationText || undefined,
  };
}

async function parseEventPage(url: string): Promise<FekmEventApiItem | null> {
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const records = extractJsonLd($);
  const eventJson = jsonLdEvent(records);

  const name = cleanText(
    valueFromRecord(eventJson, ["name", "headline"]) ||
      getMeta($, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
      $("h1").first().text() ||
      $(".mec-single-title").first().text()
  ).replace(/\s*[-|]\s*Federación Española.*$/i, "");

  if (!name || name.length < 4) return null;

  const description = cleanText(
    valueFromRecord(eventJson, ["description"]) ||
      getMeta($, ['meta[name="description"]', 'meta[property="og:description"]']) ||
      $(".mec-single-event-description, .entry-content").first().text()
  ).slice(0, 3000);

  const pageText = cleanText($("body").text());
  const calendarData = extractGoogleCalendarData($);
  const jsonStart = parseDateValue(valueFromRecord(eventJson, ["startDate"]));
  const jsonEnd = parseDateValue(valueFromRecord(eventJson, ["endDate"]));
  const dateText =
    textAfterLabel($, ["Fecha"]) ||
    cleanText($(".mec-single-event-date, .mec-event-date").first().text()) ||
    pageText;
  const parsedDates = parseSpanishDateRange(dateText);
  const startDate = calendarData.startDate ?? jsonStart ?? parsedDates.startDate;
  const endDate = calendarData.endDate ?? jsonEnd ?? parsedDates.endDate;

  const timeText =
    textAfterLabel($, ["Hora"]) || cleanText($(".mec-single-event-time, .mec-event-time").first().text()) || undefined;

  const locationRaw =
    calendarData.location ||
    textAfterLabel($, ["Localización", "Localizacion", "Lugar"]) ||
    cleanText($(".mec-single-event-location, .mec-event-location").first().text()) ||
    valueFromRecord(asRecord(eventJson?.location), ["name", "address"]);
  const location = parseLocation(locationRaw);

  const canonical = canonicalUrl(
    getMeta($, ['link[rel="canonical"]', 'meta[property="og:url"]']) || url
  );
  const imageUrl = absoluteUrl(
    getMeta($, ['meta[property="og:image"]', 'meta[name="twitter:image"]']) ||
      $(".mec-event-image img, .entry-content img").first().attr("src") ||
      ""
  ) || undefined;

  const category =
    textAfterLabel($, ["Categoría", "Categoria"]) ||
    cleanText($(".mec-event-meta .mec-events-event-categories").first().text()) ||
    undefined;

  const discipline = inferDiscipline(name, description);

  return {
    id: eventId(canonical, name),
    name,
    startDate,
    endDate,
    timeText,
    ...location,
    description: description || undefined,
    sourceUrl: canonical,
    canonicalUrl: canonical,
    imageUrl,
    status: statusFromDates(startDate, endDate, `${name} ${description}`),
    discipline: discipline.key,
    disciplineLabel: discipline.label,
    category,
    scope: inferScope(name, description),
  };
}

function isEditorialEvent(item: FekmEventApiItem): boolean {
  const text = stripDiacritics(`${item.name} ${item.category ?? ""}`.toLowerCase());

  if (/\bprueba[-\s]?formacion\b/.test(text)) return false;
  if (/\bformacion\b/.test(text) && !/campeonato|copa|liga|open|games|cup|competicion/.test(text)) {
    return false;
  }

  return Boolean(item.startDate);
}

async function discoverEventLinks(): Promise<string[]> {
  const links = new Set<string>();

  try {
    const wpRaw = await fetchText(FEKM_WP_EVENTS_URL, "application/json,text/plain,*/*");
    collectEventLinksFromWp(wpRaw).forEach((url) => links.add(url));
  } catch {
    // El tipo de contenido MEC puede no estar expuesto por REST.
  }

  for (const sourceUrl of [FEKM_EVENTS_URL, FEKM_CALENDAR_URL]) {
    try {
      const html = await fetchText(sourceUrl);
      collectEventLinksFromHtml(html).forEach((url) => links.add(url));
    } catch {
      // Continuar con la siguiente superficie pública.
    }
  }

  return Array.from(links).slice(0, MAX_ITEMS * 2);
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(): Promise<NextResponse<FekmEventsApiResponse>> {
  const fetchedAt = new Date().toISOString();

  try {
    const links = await discoverEventLinks();
    if (!links.length) {
      return withCors(
        NextResponse.json({
          ok: false,
          source: "fekm",
          fetchedAt,
          count: 0,
          items: [],
          error: "FEKM no devolvió enlaces compatibles en su calendario o archivo de eventos.",
        })
      );
    }

    const settled = await Promise.allSettled(links.slice(0, MAX_ITEMS).map(parseEventPage));
    const unique = new Map<string, FekmEventApiItem>();

    for (const result of settled) {
      if (result.status !== "fulfilled" || !result.value) continue;
      const item = result.value;
      if (!isEditorialEvent(item)) continue;
      const key = `${slugify(item.name)}|${item.startDate?.slice(0, 10) ?? "sin-fecha"}`;
      if (!unique.has(key)) unique.set(key, item);
    }

    const items = Array.from(unique.values())
      .sort((a, b) => {
        const aTime = a.startDate ? new Date(a.startDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.startDate ? new Date(b.startDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })
      .slice(0, MAX_ITEMS);

    return withCors(
      NextResponse.json({
        ok: items.length > 0,
        source: "fekm",
        fetchedAt,
        count: items.length,
        items,
        ...(items.length
          ? {}
          : { error: "FEKM devolvió enlaces, pero no fue posible normalizar eventos válidos." }),
      })
    );
  } catch (error) {
    return withCors(
      NextResponse.json({
        ok: false,
        source: "fekm",
        fetchedAt,
        count: 0,
        items: [],
        error: error instanceof Error ? error.message : "No se pudieron cargar los eventos FEKM.",
      })
    );
  }
}
