import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONE_BASE_URL = "https://www.onefc.com";
const ONE_EVENTS_URL = `${ONE_BASE_URL}/events/`;
const MAX_ITEMS = 12;
const MAX_DESCRIPTION_LENGTH = 5000;

type JsonLdRecord = Record<string, unknown>;
type EventStatus = "proximo" | "celebrado" | "cancelado";
type FightStatus = "programado" | "finalizado" | "cancelado";
type FightCardSection = "principal" | "preliminar";

type OneDisciplineKey = "mma" | "muay_thai" | "kickboxing" | "submission_grappling" | "jiu_jitsu" | "mixed";

type OneFightCardItem = {
  id: string;
  section: FightCardSection;
  sectionLabel: "Main Card" | "Prelims";
  order: number;
  redFighter: string;
  blueFighter: string;
  weightClass?: string;
  discipline?: OneDisciplineKey;
  disciplineLabel?: string;
  titleFight: boolean;
  status: FightStatus;
  winnerName?: string;
  method?: string;
  round?: number;
  time?: string;
};

type OneEventApiItem = {
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
  status: EventStatus;
  primaryDiscipline?: OneDisciplineKey;
  primaryDisciplineLabel?: string;
  fightCard: OneFightCardItem[];
};

type OneEventsApiResponse = {
  ok: boolean;
  source: "one";
  fetchedAt: string;
  count: number;
  items: OneEventApiItem[];
  error?: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function withCors<T>(response: NextResponse<T>): NextResponse<T> {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
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
    ["&amp;", "&"],
    ["&#038;", "&"],
    ["&hellip;", "…"],
    ["&#8217;", "’"],
    ["&#8216;", "‘"],
    ["&#8220;", "“"],
    ["&#8221;", "”"],
  ];

  let repaired = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const previous = repaired;
    for (const [broken, correct] of replacements) {
      repaired = repaired.split(broken).join(correct);
    }
    if (repaired === previous) break;
  }
  return repaired;
}

function cleanText(value: string): string {
  return normalizeParagraphs(repairMojibake(value));
}

function cleanInlineText(value: string): string {
  return normalizeWhitespace(repairMojibake(value));
}

function createAbsoluteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${ONE_BASE_URL}${trimmed}`;
  return `${ONE_BASE_URL}/${trimmed}`;
}

function createCanonicalUrl(value: string): string {
  return createAbsoluteUrl(value).split("?")[0].split("#")[0].replace(/\/+$/, "");
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 110);
}

function createItemId(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    const path = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\//g, "-");
    return `one-event-${slugify(path)}`;
  } catch {
    return `one-event-${slugify(sourceUrl)}`;
  }
}

function isValidEventUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(createAbsoluteUrl(value));
    return (
      url.hostname.endsWith("onefc.com") &&
      /^\/events\/[^/]+\/?$/i.test(url.pathname) &&
      url.pathname.toLowerCase() !== "/events/"
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
      "User-Agent": "Mozilla/5.0 (compatible; FullFightNewsOneEventsReader/1.0)",
    },
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`${url} respondió con estado ${response.status}.`);
  }

  const buffer = await response.arrayBuffer();
  return new TextDecoder("utf-8").decode(buffer);
}

function asRecord(value: unknown): JsonLdRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonLdRecord)
    : undefined;
}

function flattenJsonLd(value: unknown): JsonLdRecord[] {
  if (Array.isArray(value)) return value.flatMap((item) => flattenJsonLd(item));
  const record = asRecord(value);
  if (!record) return [];
  const graph = record["@graph"];
  if (Array.isArray(graph)) return [record, ...graph.flatMap((item) => flattenJsonLd(item))];
  return [record];
}

function extractJsonLdRecords($: cheerio.CheerioAPI): JsonLdRecord[] {
  const records: JsonLdRecord[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).html()?.trim();
    if (!raw) return;
    try {
      records.push(...flattenJsonLd(JSON.parse(raw) as unknown));
    } catch {
      // JSON-LD inválido: ignorar.
    }
  });
  return records;
}

function getJsonLdTypes(record: JsonLdRecord): string[] {
  const value = record["@type"];
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function findEventJsonLd(records: JsonLdRecord[]): JsonLdRecord | undefined {
  const acceptedTypes = new Set(["Event", "SportsEvent", "BusinessEvent"]);
  return records.find((record) => getJsonLdTypes(record).some((type) => acceptedTypes.has(type)));
}

function getStringValue(record: JsonLdRecord | undefined, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      const cleaned = cleanInlineText(value);
      if (cleaned) return cleaned;
    }
  }
  return undefined;
}

function getMetaContent($: cheerio.CheerioAPI, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const value = $(selector).first().attr("content");
    if (value) {
      const cleaned = cleanInlineText(value);
      if (cleaned) return cleaned;
    }
  }
  return undefined;
}

function getImageFromJsonLd(record: JsonLdRecord | undefined): string | undefined {
  if (!record) return undefined;
  const image = record.image;
  if (typeof image === "string") return createAbsoluteUrl(image);
  if (Array.isArray(image)) {
    for (const item of image) {
      if (typeof item === "string") return createAbsoluteUrl(item);
      const itemRecord = asRecord(item);
      const itemUrl = getStringValue(itemRecord, ["url", "contentUrl"]);
      if (itemUrl) return createAbsoluteUrl(itemUrl);
    }
  }
  const imageRecord = asRecord(image);
  const imageUrl = getStringValue(imageRecord, ["url", "contentUrl"]);
  return imageUrl ? createAbsoluteUrl(imageUrl) : undefined;
}

function extractEventUrls(html: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();

  $('a[href*="/events/"]').each((_, element) => {
    if (urls.size >= MAX_ITEMS) return false;
    const href = $(element).attr("href")?.trim() ?? "";
    if (isValidEventUrl(href)) urls.add(createCanonicalUrl(href));
  });

  return Array.from(urls).slice(0, MAX_ITEMS);
}

function extractTextLines($: cheerio.CheerioAPI): string[] {
  const clonedBody = $("body").clone();

  clonedBody
    .find(
      [
        "script",
        "style",
        "nav",
        "aside",
        "footer",
        "form",
        "button",
        ".newsletter",
        ".social",
        ".share",
        ".advertisement",
        ".promo",
        '[class*="newsletter"]',
        '[class*="social"]',
        '[class*="share"]',
        '[class*="advert"]',
        '[class*="promo"]',
      ].join(","),
    )
    .remove();

  return clonedBody
    .text()
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => cleanInlineText(line))
    .filter((line) => line.length >= 2)
    .filter((line, index, lines) => index === 0 || line !== lines[index - 1]);
}

function extractLocationFromText(lines: string[]): {
  venue?: string;
  city?: string;
  country?: string;
  locationText?: string;
} {
  const venueLine = lines.find((line) => /stadium|arena|center|centre|lumpinee|impact|ryogoku|mall of asia/i.test(line));

  if (!venueLine) return {};

  const parts = venueLine.split(",").map((part) => cleanInlineText(part)).filter(Boolean);

  if (parts.length >= 2) {
    return {
      venue: parts[0],
      city: parts[1],
      country: parts.at(-1),
      locationText: venueLine,
    };
  }

  const nextIndex = lines.indexOf(venueLine) + 1;
  const nextLine = lines[nextIndex];

  return {
    venue: venueLine,
    city: nextLine && nextLine.length < 80 ? nextLine.split(",")[0] : undefined,
    locationText: nextLine ? `${venueLine}, ${nextLine}` : venueLine,
  };
}

function normalizeDateToIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = cleanInlineText(value);
  const direct = Date.parse(cleaned);
  if (!Number.isNaN(direct)) return new Date(direct).toISOString();

  const match = cleaned.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (!match) return undefined;

  const parsed = Date.parse(`${match[1]} ${match[2]}, ${match[3]} 12:00 UTC`);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function determineEventStatus(startDate: string | undefined, pageText: string): EventStatus {
  const normalized = pageText.toLowerCase();

  if (normalized.includes("cancelled") || normalized.includes("canceled")) {
    return "cancelado";
  }

  if (startDate) {
    const timestamp = new Date(startDate).getTime();
    if (!Number.isNaN(timestamp)) {
      return timestamp < Date.now() ? "celebrado" : "proximo";
    }
  }

  if (normalized.includes("results") || normalized.includes("finished") || normalized.includes("win ")) {
    return "celebrado";
  }

  return "proximo";
}

function inferDisciplineFromText(value: string): {
  key: OneDisciplineKey;
  label: string;
} {
  const normalized = value.toLowerCase();

  if (/\bsubmission grappling\b|\bgrappling\b|\bjiu-jitsu\b|\bjiu jitsu\b|\bbjj\b/.test(normalized)) {
    return { key: "submission_grappling", label: "Submission Grappling" };
  }

  if (/\bkickboxing\b/.test(normalized)) {
    return { key: "kickboxing", label: "Kickboxing" };
  }

  if (/\bmuay thai\b|\bmuaythai\b/.test(normalized)) {
    return { key: "muay_thai", label: "Muay Thai" };
  }

  if (/\bmma\b|mixed martial arts|martial arts rules/.test(normalized)) {
    return { key: "mma", label: "MMA" };
  }

  return { key: "mixed", label: "Mixto" };
}

function containsEditorialNoise(value: string): boolean {
  const normalized = cleanInlineText(value).toLowerCase();

  return (
    /\bone\s+(fight\s+night|friday\s+fights|championship|samurai)\b/.test(normalized) ||
    /\b(the\s+inner\s+circle|prime\s+video|full\s+card|results?|highlights?|watch|preview|reasons?\s+to\s+watch)\b/.test(normalized) ||
    /\b(added\s+to|set\s+for|announced|revealed|live\s+on|on\s+prime\s+video|june|july|august|september|october|november|december)\b/.test(normalized) ||
    /\b(news|tickets|how\s+to\s+watch|press\s+conference|weigh-ins?)\b/.test(normalized)
  );
}

function normalizeFighterName(value: string): string | undefined {
  const cleaned = cleanInlineText(value)
    .replace(/\bWIN\b/gi, "")
    .replace(/\bLOSS\b/gi, "")
    .replace(/\bVS\.?\b/gi, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (
    !cleaned ||
    cleaned.length < 3 ||
    cleaned.length > 60 ||
    /^TBD$/i.test(cleaned) ||
    /^(win|loss|country|vs|main card|prelims?|event)$/i.test(cleaned) ||
    /\d{2,}/.test(cleaned) ||
    /[,:;|]/.test(cleaned) ||
    containsEditorialNoise(cleaned)
  ) {
    return undefined;
  }

  return cleaned;
}

function isValidFightPair(redFighter: string, blueFighter: string, rawLine: string, eventName: string): boolean {
  const normalizedLine = cleanInlineText(rawLine);
  const normalizedEvent = cleanInlineText(eventName).toLowerCase();

  if (containsEditorialNoise(normalizedLine)) return false;
  if (redFighter.toLowerCase() === blueFighter.toLowerCase()) return false;

  const lineLower = normalizedLine.toLowerCase();
  if (normalizedEvent && lineLower === normalizedEvent) return false;
  if (/^one\s/i.test(redFighter) || /prime video/i.test(blueFighter)) return false;
  if (/\b(card|event|night|fight\s+night|friday\s+fights)\b/i.test(redFighter)) return false;
  if (/\b(card|event|night|fight\s+night|friday\s+fights)\b/i.test(blueFighter)) return false;

  return true;
}

function inferWeightClass(context: string): string | undefined {
  const cleaned = cleanInlineText(context);

  const patterns = [
    /women'?s?\s+atomweight/i,
    /atomweight/i,
    /women'?s?\s+strawweight/i,
    /strawweight/i,
    /women'?s?\s+flyweight/i,
    /flyweight/i,
    /women'?s?\s+bantamweight/i,
    /bantamweight/i,
    /featherweight/i,
    /lightweight/i,
    /welterweight/i,
    /middleweight/i,
    /light heavyweight/i,
    /heavyweight/i,
    /catchweight/i,
  ];

  const match = patterns.map((pattern) => cleaned.match(pattern)?.[0]).find(Boolean);
  return match ? cleanInlineText(match) : undefined;
}

function extractResult(value: string): {
  winnerName?: string;
  method?: string;
  round?: number;
  status: FightStatus;
} {
  const text = cleanInlineText(value);
  const isFinished = /\b(defeated?|stopp?ed|knocked\s+out|submitted|wins?\s+(?:by|via)|via\s+(?:ko|tko|submission|decision)|unanimous\s+decision|split\s+decision|majority\s+decision)\b/i.test(text);

  const method = isFinished
    ? text.match(/\bTKO\b/i)?.[0] ||
      text.match(/\bKO\b/i)?.[0] ||
      text.match(/\bUD\b/i)?.[0] ||
      text.match(/\bSD\b/i)?.[0] ||
      text.match(/\bsubmission\b/i)?.[0] ||
      text.match(/\bdecision\b/i)?.[0]
    : undefined;

  const roundText = isFinished ? text.match(/\bR(?:ound)?\s*(\d{1,2})\b/i)?.[1] : undefined;

  return {
    method,
    round: roundText ? Number(roundText) : undefined,
    status: isFinished ? "finalizado" : "programado",
  };
}

function extractFightCard(lines: string[], eventName: string): OneFightCardItem[] {
  const fights: OneFightCardItem[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    const match = line.match(/^(.{2,80}?)\s+vs\.?\s+(.{2,80}?)$/i);
    if (!match) continue;

    const redFighter = normalizeFighterName(match[1]);
    const blueFighter = normalizeFighterName(match[2]);

    if (!redFighter || !blueFighter) continue;
    if (!isValidFightPair(redFighter, blueFighter, line, eventName)) continue;

    const normalizedKey = [redFighter.toLowerCase(), blueFighter.toLowerCase()].sort().join("|");
    if (seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);

    const context = [
      lines[index - 4],
      lines[index - 3],
      lines[index - 2],
      lines[index - 1],
      line,
      lines[index + 1],
      lines[index + 2],
    ]
      .filter(Boolean)
      .join(" ");

    const discipline = inferDisciplineFromText(context || eventName);
    const result = extractResult(context);
    const weightClass = inferWeightClass(context);

    fights.push({
      id: `one-fight-${slugify(eventName)}-${slugify(redFighter)}-vs-${slugify(blueFighter)}`.slice(0, 180),
      section: fights.length < 6 ? "principal" : "preliminar",
      sectionLabel: fights.length < 6 ? "Main Card" : "Prelims",
      order: fights.length + 1,
      redFighter,
      blueFighter,
      weightClass,
      discipline: discipline.key,
      disciplineLabel: discipline.label,
      titleFight: /world title|championship|belt|gold/i.test(context),
      status: result.status,
      method: result.method,
      round: result.round,
    });
  }

  return fights.slice(0, 24);
}

function extractMainEvent(fightCard: OneFightCardItem[], eventName: string): string | undefined {
  if (fightCard[0]?.redFighter && fightCard[0]?.blueFighter) {
    return `${fightCard[0].redFighter} vs ${fightCard[0].blueFighter}`;
  }

  const match = eventName.match(/:\s*(.+)$/);
  return match?.[1]?.includes("vs") ? cleanInlineText(match[1]) : undefined;
}

function extractDescription($: cheerio.CheerioAPI, eventJsonLd: JsonLdRecord | undefined): string | undefined {
  const jsonLdDescription = getStringValue(eventJsonLd, ["description", "abstract"]);
  if (jsonLdDescription) return jsonLdDescription.slice(0, MAX_DESCRIPTION_LENGTH);

  const metaDescription = getMetaContent($, [
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]',
  ]);

  if (metaDescription) return metaDescription.slice(0, MAX_DESCRIPTION_LENGTH);

  const paragraphs = $("main p, article p, .entry-content p, p")
    .toArray()
    .map((element) => cleanText($(element).text()))
    .filter((paragraph) => paragraph.length >= 40)
    .slice(0, 4);

  return paragraphs.length > 0 ? paragraphs.join("\n\n").slice(0, MAX_DESCRIPTION_LENGTH) : undefined;
}

async function parseEventPage(url: string): Promise<OneEventApiItem | null> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const records = extractJsonLdRecords($);
  const eventJsonLd = findEventJsonLd(records);
  const lines = extractTextLines($);
  const pageText = lines.join("\n");

  const name =
    getStringValue(eventJsonLd, ["name"]) ||
    getMetaContent($, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
    cleanInlineText($("h1").first().text());

  if (!name) return null;

  const canonicalUrl =
    createCanonicalUrl($('link[rel="canonical"]').attr("href") || url);

  const sourceUrl = canonicalUrl;
  const startDate =
    normalizeDateToIso(getStringValue(eventJsonLd, ["startDate"])) ||
    normalizeDateToIso($("time[datetime]").first().attr("datetime")) ||
    normalizeDateToIso(lines.find((line) => /\b\d{4}\b/.test(line) && /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(line)));

  const imageUrl =
    getImageFromJsonLd(eventJsonLd) ||
    getMetaContent($, ['meta[property="og:image"]', 'meta[name="twitter:image"]']);

  const locationRecord = asRecord(eventJsonLd?.location);
  const addressRecord = asRecord(locationRecord?.address);

  const locationFromText = extractLocationFromText(lines);

  const venue =
    getStringValue(locationRecord, ["name"]) ||
    locationFromText.venue;

  const city =
    getStringValue(addressRecord, ["addressLocality"]) ||
    locationFromText.city ||
    "Bangkok";

  const country =
    getStringValue(addressRecord, ["addressCountry"]) ||
    locationFromText.country ||
    (city.toLowerCase().includes("bangkok") ? "Tailandia" : undefined);

  const fightCard = extractFightCard(lines, name);
  const mainEvent = extractMainEvent(fightCard, name);

  const disciplineCounts = new Map<OneDisciplineKey, number>();
  for (const fight of fightCard) {
    if (!fight.discipline || fight.discipline === "mixed") continue;
    disciplineCounts.set(fight.discipline, (disciplineCounts.get(fight.discipline) ?? 0) + 1);
  }

  const primaryDiscipline =
    Array.from(disciplineCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    inferDisciplineFromText(`${name} ${pageText}`).key;

  const primaryDisciplineLabel = {
    mma: "MMA",
    muay_thai: "Muay Thai",
    kickboxing: "Kickboxing",
    submission_grappling: "Submission Grappling",
    jiu_jitsu: "Jiu-Jitsu",
    mixed: "Mixto",
  }[primaryDiscipline];

  return {
    id: createItemId(canonicalUrl),
    name,
    headline: mainEvent,
    mainEvent,
    startDate,
    venue,
    city,
    country,
    locationText: [venue, city, country].filter(Boolean).join(", ") || locationFromText.locationText,
    watchText: "ONE Championship / onefc.com",
    description: extractDescription($, eventJsonLd),
    sourceUrl,
    canonicalUrl,
    imageUrl,
    status: determineEventStatus(startDate, pageText),
    primaryDiscipline,
    primaryDisciplineLabel,
    fightCard,
  };
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(): Promise<NextResponse<OneEventsApiResponse>> {
  try {
    const eventsHtml = await fetchHtml(ONE_EVENTS_URL);
    const eventUrls = extractEventUrls(eventsHtml);

    if (eventUrls.length === 0) {
      throw new Error("No se encontraron enlaces de eventos ONE en la fuente oficial.");
    }

    const settled = await Promise.allSettled(eventUrls.map((url) => parseEventPage(url)));
    const items = settled
      .filter((result): result is PromiseFulfilledResult<OneEventApiItem | null> => result.status === "fulfilled")
      .map((result) => result.value)
      .filter((item): item is OneEventApiItem => item !== null)
      .slice(0, MAX_ITEMS);

    return withCors(
      NextResponse.json({
        ok: true,
        source: "one",
        fetchedAt: new Date().toISOString(),
        count: items.length,
        items,
      }),
    );
  } catch (error) {
    console.error("Error leyendo eventos oficiales ONE:", error);

    return withCors(
      NextResponse.json(
        {
          ok: false,
          source: "one",
          fetchedAt: new Date().toISOString(),
          count: 0,
          items: [],
          error:
            error instanceof Error
              ? error.message
              : "Error desconocido leyendo eventos ONE Championship.",
        },
        { status: 500 },
      ),
    );
  }
}
