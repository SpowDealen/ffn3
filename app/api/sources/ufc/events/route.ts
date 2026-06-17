import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UFC_BASE_URL = "https://www.ufc.com";
const UFC_EVENTS_URL = `${UFC_BASE_URL}/events`;

const MAX_ITEMS = 12;
const MAX_DESCRIPTION_LENGTH = 5_000;

type JsonLdRecord = Record<string, unknown>;

type EventStatus = "proximo" | "celebrado" | "cancelado";

type FightCardSection = "principal" | "preliminar";

type UfcFightCardItem = {
  id: string;
  section: FightCardSection;
  sectionLabel: "Main Card" | "Prelims" | "Early Prelims";
  order: number;
  redFighter: string;
  blueFighter: string;
  weightClass?: string;
  titleFight: boolean;
  status: "programado" | "finalizado" | "cancelado";
  winnerName?: string;
  method?: string;
  round?: number;
  time?: string;
};

type ParsedOfficialDescription = {
  officialName?: string;
  mainEvent?: string;
  venue?: string;
  city?: string;
  region?: string;
  country?: string;
  dateText?: string;
};

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
  status: EventStatus;
  fightCard: UfcFightCardItem[];
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
  "Minnesota",
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
]);

const TIMEZONE_OFFSETS: Record<string, number> = {
  UTC: 0,
  GMT: 0,
  BST: 1,
  CET: 1,
  CEST: 2,
  EET: 2,
  EEST: 3,
  EST: -5,
  EDT: -4,
  CST: -6,
  CDT: -5,
  MST: -7,
  MDT: -6,
  PST: -8,
  PDT: -7,
};

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
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

function cleanInlineText(value: string): string {
  return normalizeWhitespace(repairMojibake(value));
}

function cleanOptionalText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned = cleanText(value);

  return cleaned || undefined;
}

function cleanOptionalInlineText(
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned = cleanInlineText(value);

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
  const acceptedTypes = new Set([
    "Event",
    "SportsEvent",
    "BusinessEvent",
  ]);

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

    const imageUrl = getStringValue(firstRecord, [
      "url",
      "contentUrl",
    ]);

    return imageUrl ? createAbsoluteUrl(imageUrl) : undefined;
  }

  const imageRecord = asRecord(image);
  const imageUrl = getStringValue(imageRecord, [
    "url",
    "contentUrl",
  ]);

  return imageUrl ? createAbsoluteUrl(imageUrl) : undefined;
}

function getLocationRecord(
  eventJsonLd: JsonLdRecord | undefined,
): JsonLdRecord | undefined {
  return eventJsonLd
    ? asRecord(eventJsonLd.location)
    : undefined;
}

function getAddressRecord(
  locationRecord: JsonLdRecord | undefined,
): JsonLdRecord | undefined {
  return locationRecord
    ? asRecord(locationRecord.address)
    : undefined;
}

function removeUfcSuffix(value: string): string {
  return cleanInlineText(
    value
      .replace(/\s*\|\s*UFC\s*$/i, "")
      .replace(/\s+-\s+UFC\s*$/i, ""),
  );
}

function normalizeMainEvent(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = cleanInlineText(value)
    .replace(/\s+vs\.?\s+/i, " vs ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    !normalized ||
    !/\bvs\b/i.test(normalized) ||
    /^TBD\s+vs\s+TBD$/i.test(normalized)
  ) {
    return undefined;
  }

  return normalized;
}

function parseOfficialDescription(
  description: string | undefined,
): ParsedOfficialDescription {
  if (!description) {
    return {};
  }

  const normalized = cleanInlineText(description);

  const match = normalized.match(
    /(?:Don't Miss A Moment Of\s+)?(.+?),\s*Live From\s+(.+?)\s+In\s+(.+?)\s+On\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})\.?$/i,
  );

  if (!match) {
    return {};
  }

  const officialName = removeUfcSuffix(match[1]);
  const venue = cleanInlineText(match[2]);
  const rawLocation = cleanInlineText(match[3]);
  const dateText = cleanInlineText(match[4]);

  const locationParts = rawLocation
    .split(",")
    .map((part) => cleanInlineText(part))
    .filter(Boolean);

  let city: string | undefined;
  let region: string | undefined;
  let country: string | undefined;

  if (locationParts.length === 1) {
    city = locationParts[0];
  } else if (locationParts.length === 2) {
    city = locationParts[0];

    if (US_REGIONS.has(locationParts[1])) {
      region = locationParts[1];
      country = "Estados Unidos";
    } else {
      country = locationParts[1];
    }
  } else if (locationParts.length >= 3) {
    city = locationParts[0];
    region = locationParts[1];

    const lastPart = locationParts.at(-1);

    country = lastPart
      ? US_REGIONS.has(lastPart)
        ? "Estados Unidos"
        : lastPart
      : undefined;

    if (region && US_REGIONS.has(region)) {
      country = "Estados Unidos";
    }
  }

  const titleMatch = officialName.match(
    /^(UFC(?:\s+Fight Night|\s+\d+|\s+Freedom\s+\d+)?)\s*:\s*(.+)$/i,
  );

  const mainEvent = normalizeMainEvent(titleMatch?.[2]);

  return {
    officialName,
    mainEvent,
    venue,
    city,
    region,
    country,
    dateText,
  };
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
    .map((value) => cleanInlineText(value))
    .filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.toLowerCase() === eventName.toLowerCase()) {
      continue;
    }

    const normalized = normalizeMainEvent(candidate);

    if (normalized) {
      return normalized;
    }
  }

  const pageTitle =
    getMetaContent($, ['meta[property="og:title"]']) ||
    cleanInlineText($("title").first().text());

  const match = pageTitle.match(
    /:\s*(.+?\s+vs\.?\s+.+?)(?:\s*\||$)/i,
  );

  return normalizeMainEvent(match?.[1]);
}

function extractPlatforms($: cheerio.CheerioAPI): string | undefined {
  const fullText = cleanInlineText($("body").text());

  const platformPatterns: Array<{
    pattern: RegExp;
    label: string;
  }> = [
    {
      pattern: /\bUFC Fight Pass\b/i,
      label: "UFC Fight Pass",
    },
    {
      pattern: /\bParamount\+\b/i,
      label: "Paramount+",
    },
    {
      pattern: /\bESPN\+\b/i,
      label: "ESPN+",
    },
    {
      pattern: /\bDAZN\b/i,
      label: "DAZN",
    },
    {
      pattern: /\bEurosport\b/i,
      label: "Eurosport",
    },
    {
      pattern: /\bStarzplay\b/i,
      label: "Starzplay",
    },
    {
      pattern: /\bTNT Sports\b/i,
      label: "TNT Sports",
    },
  ];

  const platforms = platformPatterns
    .filter(({ pattern }) => pattern.test(fullText))
    .map(({ label }) => label);

  return platforms.length > 0
    ? Array.from(new Set(platforms)).join(" · ")
    : undefined;
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

function extractImageFromDom(
  $: cheerio.CheerioAPI,
): string | undefined {
  const directSelectors = [
    ".c-hero img",
    ".hero img",
    "main img",
    "article img",
    'img[class*="hero"]',
    'img[class*="event"]',
  ];

  for (const selector of directSelectors) {
    const element = $(selector).first();

    const candidates = [
      element.attr("src"),
      element.attr("data-src"),
      element.attr("data-lazy-src"),
      element.attr("data-original"),
    ];

    for (const candidate of candidates) {
      if (candidate?.trim()) {
        return createAbsoluteUrl(candidate.trim());
      }
    }

    const srcSet =
      element.attr("srcset") ||
      element.attr("data-srcset");

    if (srcSet) {
      const firstUrl = srcSet
        .split(",")
        .map((entry) => entry.trim().split(/\s+/)[0])
        .find(Boolean);

      if (firstUrl) {
        return createAbsoluteUrl(firstUrl);
      }
    }
  }

  const styledElements = $(
    '[style*="background-image"], [data-bg], [data-background-image]',
  );

  let backgroundUrl: string | undefined;

  styledElements.each((_, element) => {
    if (backgroundUrl) {
      return;
    }

    const style = $(element).attr("style") || "";
    const dataBg =
      $(element).attr("data-bg") ||
      $(element).attr("data-background-image");

    const styleMatch = style.match(
      /background-image\s*:\s*url\(["']?([^"')]+)["']?\)/i,
    );

    const candidate = dataBg || styleMatch?.[1];

    if (candidate) {
      backgroundUrl = createAbsoluteUrl(candidate);
    }
  });

  return backgroundUrl;
}

function parseEnglishDate(dateText: string): {
  year: number;
  monthIndex: number;
  day: number;
} | null {
  const match = dateText.match(
    /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/,
  );

  if (!match) {
    return null;
  }

  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];

  const monthIndex = monthNames.indexOf(
    match[1].toLowerCase(),
  );

  if (monthIndex < 0) {
    return null;
  }

  return {
    year: Number(match[3]),
    monthIndex,
    day: Number(match[2]),
  };
}

function extractMainCardTime(
  $: cheerio.CheerioAPI,
): {
  hour: number;
  minute: number;
  timezone: string;
} | null {
  const bodyText = cleanInlineText($("body").text());

  const match = bodyText.match(
    /Main Card.{0,120}?(\d{1,2}):(\d{2})\s*(AM|PM)\s*([A-Z]{2,5})/i,
  );

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();
  const timezone = match[4].toUpperCase();

  if (period === "PM" && hour !== 12) {
    hour += 12;
  }

  if (period === "AM" && hour === 12) {
    hour = 0;
  }

  return {
    hour,
    minute,
    timezone,
  };
}

function createDateFromDescription(
  dateText: string | undefined,
  $: cheerio.CheerioAPI,
): string | undefined {
  if (!dateText) {
    return undefined;
  }

  const parsedDate = parseEnglishDate(dateText);

  if (!parsedDate) {
    return undefined;
  }

  const mainCardTime = extractMainCardTime($);

  if (mainCardTime) {
    const offset = TIMEZONE_OFFSETS[mainCardTime.timezone];

    if (typeof offset === "number") {
      const utcTimestamp = Date.UTC(
        parsedDate.year,
        parsedDate.monthIndex,
        parsedDate.day,
        mainCardTime.hour - offset,
        mainCardTime.minute,
        0,
      );

      return new Date(utcTimestamp).toISOString();
    }
  }

  return new Date(
    Date.UTC(
      parsedDate.year,
      parsedDate.monthIndex,
      parsedDate.day,
      12,
      0,
      0,
    ),
  ).toISOString();
}

function determineEventStatus(
  startDate: string | undefined,
  pageText: string,
): EventStatus {
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
      return timestamp < Date.now()
        ? "celebrado"
        : "proximo";
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

function buildEventName(params: {
  rawName: string;
  officialName?: string;
  mainEvent?: string;
  sourceUrl: string;
}): string {
  const {
    rawName,
    officialName,
    mainEvent,
    sourceUrl,
  } = params;

  if (
    officialName &&
    officialName.length >= 3 &&
    officialName.length <= 140
  ) {
    return officialName;
  }

  const cleanedRawName = removeUfcSuffix(rawName);

  if (
    mainEvent &&
    /^UFC Fight Night$/i.test(cleanedRawName)
  ) {
    return `UFC Fight Night: ${mainEvent}`;
  }

  if (
    mainEvent &&
    /^UFC\s+\d+$/i.test(cleanedRawName)
  ) {
    return `${cleanedRawName}: ${mainEvent}`;
  }

  if (
    cleanedRawName &&
    !/^UFC Fight Night$/i.test(cleanedRawName)
  ) {
    return cleanedRawName;
  }

  try {
    const pathname = new URL(sourceUrl).pathname;

    const numericMatch = pathname.match(
      /\/event\/(ufc-\d+)/i,
    );

    if (numericMatch) {
      const fallbackBase = numericMatch[1]
        .replace("-", " ")
        .toUpperCase();

      return mainEvent
        ? `${fallbackBase}: ${mainEvent}`
        : fallbackBase;
    }
  } catch {
    // Mantiene el fallback inferior.
  }

  return mainEvent
    ? `UFC Fight Night: ${mainEvent}`
    : "UFC Fight Night";
}


function getFirstCleanText(
  $: cheerio.CheerioAPI,
  container: cheerio.Cheerio<AnyNode>,
  selectors: string[],
): string | undefined {
  for (const selector of selectors) {
    const value = cleanInlineText(
      container.find(selector).first().text(),
    );

    if (value) {
      return value;
    }
  }

  return undefined;
}

function normalizeFighterName(
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned = cleanInlineText(value)
    .replace(/\bWin\b/gi, "")
    .replace(/\bLoss\b/gi, "")
    .replace(/\bDraw\b/gi, "")
    .replace(/\bNC\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (
    !cleaned ||
    /^TBD$/i.test(cleaned) ||
    /^To Be Determined$/i.test(cleaned)
  ) {
    return undefined;
  }

  return cleaned;
}

function parseSectionLabel(
  value: string,
): {
  section: FightCardSection;
  sectionLabel: "Main Card" | "Prelims" | "Early Prelims";
} | null {
  const normalized = cleanInlineText(value).toLowerCase();

  if (normalized.includes("early prelim")) {
    return {
      section: "preliminar",
      sectionLabel: "Early Prelims",
    };
  }

  if (normalized.includes("prelim")) {
    return {
      section: "preliminar",
      sectionLabel: "Prelims",
    };
  }

  if (
    normalized.includes("main card") ||
    normalized.includes("main event")
  ) {
    return {
      section: "principal",
      sectionLabel: "Main Card",
    };
  }

  return null;
}

function buildFightSectionMap(
  $: cheerio.CheerioAPI,
): Map<
  AnyNode,
  {
    section: FightCardSection;
    sectionLabel: "Main Card" | "Prelims" | "Early Prelims";
  }
> {
  const sectionMap = new Map<
    AnyNode,
    {
      section: FightCardSection;
      sectionLabel: "Main Card" | "Prelims" | "Early Prelims";
    }
  >();

  let currentSection: {
    section: FightCardSection;
    sectionLabel: "Main Card" | "Prelims" | "Early Prelims";
  } = {
    section: "principal",
    sectionLabel: "Main Card",
  };

  const orderedSelectors = [
    "h2",
    "h3",
    "h4",
    ".view-grouping-header",
    ".c-card-event--fight-card__headline",
    '[class*="fight-card__headline"]',
    '[class*="fight-card__title"]',
    ".c-listing-fight",
  ].join(",");

  $(orderedSelectors).each((_, element) => {
    const node = $(element);

    if (node.hasClass("c-listing-fight")) {
      sectionMap.set(element, currentSection);
      return;
    }

    const parsedSection = parseSectionLabel(node.text());

    if (parsedSection) {
      currentSection = parsedSection;
    }
  });

  return sectionMap;
}

function extractKnownMethod(
  containerText: string,
): string | undefined {
  const normalized = cleanInlineText(containerText);

  const patterns: Array<{
    regex: RegExp;
    label: string;
  }> = [
    {
      regex: /\bTKO\b/i,
      label: "TKO",
    },
    {
      regex: /\bKO\b/i,
      label: "KO",
    },
    {
      regex: /\bSubmission\b/i,
      label: "Sumisión",
    },
    {
      regex: /\bUnanimous Decision\b/i,
      label: "Decisión unánime",
    },
    {
      regex: /\bSplit Decision\b/i,
      label: "Decisión dividida",
    },
    {
      regex: /\bMajority Decision\b/i,
      label: "Decisión mayoritaria",
    },
    {
      regex: /\bDecision\b/i,
      label: "Decisión",
    },
    {
      regex: /\bDoctor Stoppage\b/i,
      label: "Parada médica",
    },
    {
      regex: /\bDisqualification\b/i,
      label: "Descalificación",
    },
    {
      regex: /\bNo Contest\b/i,
      label: "No contest",
    },
  ];

  return patterns.find(({ regex }) => regex.test(normalized))?.label;
}

function extractFightStatus(params: {
  eventStatus: EventStatus;
  containerText: string;
  winnerName?: string;
  method?: string;
  time?: string;
}): "programado" | "finalizado" | "cancelado" {
  const {
    eventStatus,
    containerText,
    winnerName,
    method,
    time,
  } = params;

  const normalized = containerText.toLowerCase();

  if (
    normalized.includes("cancelled") ||
    normalized.includes("canceled")
  ) {
    return "cancelado";
  }

  if (eventStatus === "proximo") {
    return "programado";
  }

  if (
    winnerName ||
    method ||
    time ||
    normalized.includes("official result")
  ) {
    return "finalizado";
  }

  return eventStatus === "celebrado"
    ? "finalizado"
    : "programado";
}

function extractFightCard(
  $: cheerio.CheerioAPI,
  eventStatus: EventStatus,
): UfcFightCardItem[] {
  const fightSelectors = [
    ".c-listing-fight",
    ".c-listing-fight__content",
    '[class*="listing-fight"]',
    '[data-fight-id]',
  ];

  const rawElements: AnyNode[] = [];
  const seenElements = new Set<AnyNode>();

  for (const selector of fightSelectors) {
    $(selector).each((_, element) => {
      const root =
        $(element).hasClass("c-listing-fight")
          ? element
          : $(element).closest(".c-listing-fight").get(0) || element;

      if (!seenElements.has(root)) {
        seenElements.add(root);
        rawElements.push(root);
      }
    });

    if (rawElements.length > 0) {
      break;
    }
  }

  const sectionMap = buildFightSectionMap($);

  const fights: UfcFightCardItem[] = [];
  const sectionCounters: Record<
    "Main Card" | "Prelims" | "Early Prelims",
    number
  > = {
    "Main Card": 0,
    Prelims: 0,
    "Early Prelims": 0,
  };

  for (const element of rawElements) {
    const container = $(element);
    const containerText = cleanInlineText(container.text());

    const nameSelectors = [
      ".c-listing-fight__corner-name",
      ".c-listing-fight__corner-name a",
      ".c-listing-fight__corner-body--red .c-listing-fight__corner-name",
      ".c-listing-fight__corner-body--blue .c-listing-fight__corner-name",
      '[class*="corner-name"]',
      '[class*="fighter-name"]',
    ];

    const allNames = container
      .find(nameSelectors.join(","))
      .map((_, node) => normalizeFighterName($(node).text()))
      .get()
      .filter((value): value is string => Boolean(value));

    const uniqueNames = Array.from(
      new Set(allNames.map((name) => cleanInlineText(name))),
    );

    let redFighter = uniqueNames[0];
    let blueFighter = uniqueNames[1];

    if (!redFighter || !blueFighter) {
      const links = container
        .find('a[href*="/athlete/"]')
        .map((_, node) => normalizeFighterName($(node).text()))
        .get()
        .filter((value): value is string => Boolean(value));

      const uniqueLinks = Array.from(new Set(links));

      redFighter = redFighter || uniqueLinks[0];
      blueFighter = blueFighter || uniqueLinks[1];
    }

    if (!redFighter || !blueFighter || redFighter === blueFighter) {
      continue;
    }

    const sectionInfo =
      sectionMap.get(element) ?? {
        section: "principal" as const,
        sectionLabel: "Main Card" as const,
      };

    sectionCounters[sectionInfo.sectionLabel] += 1;

    const weightClass = getFirstCleanText($, container, [
      ".c-listing-fight__class-text",
      ".c-listing-fight__class",
      '[class*="weight"]',
      '[class*="class-text"]',
    ]);

    const roundText = getFirstCleanText($, container, [
      ".c-listing-fight__result-round",
      '[class*="result-round"]',
    ]);

    const rawTime = getFirstCleanText($, container, [
      ".c-listing-fight__result-time",
      '[class*="result-time"]',
    ]);

    const validTime =
      rawTime && /^\d{1,2}:\d{2}$/.test(rawTime)
        ? rawTime
        : undefined;

    const roundMatch = roundText?.match(/\d+/);

    let winnerName: string | undefined;

    const redCornerText = cleanInlineText(
      container
        .find(
          ".c-listing-fight__corner-body--red, .c-listing-fight__corner--red",
        )
        .first()
        .text(),
    );

    const blueCornerText = cleanInlineText(
      container
        .find(
          ".c-listing-fight__corner-body--blue, .c-listing-fight__corner--blue",
        )
        .first()
        .text(),
    );

    if (/\bwin\b/i.test(redCornerText)) {
      winnerName = redFighter;
    } else if (/\bwin\b/i.test(blueCornerText)) {
      winnerName = blueFighter;
    }

    const method =
      eventStatus === "celebrado"
        ? extractKnownMethod(containerText)
        : undefined;

    const status = extractFightStatus({
      eventStatus,
      containerText,
      winnerName,
      method,
      time: validTime,
    });

    const titleFight =
      /\btitle bout\b/i.test(containerText) ||
      /\bchampionship\b/i.test(containerText) ||
      /\binterim title\b/i.test(containerText);

    fights.push({
      id: `fight-${fights.length + 1}-${redFighter
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}-vs-${blueFighter
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}`,
      section: sectionInfo.section,
      sectionLabel: sectionInfo.sectionLabel,
      order: sectionCounters[sectionInfo.sectionLabel],
      redFighter,
      blueFighter,
      weightClass,
      titleFight,
      status,
      winnerName:
        status === "finalizado"
          ? winnerName
          : undefined,
      method:
        status === "finalizado"
          ? method
          : undefined,
      round:
        status === "finalizado" && roundMatch
          ? Number(roundMatch[0])
          : undefined,
      time:
        status === "finalizado"
          ? validTime
          : undefined,
    });
  }

  const sectionPriority: Record<
    "Main Card" | "Prelims" | "Early Prelims",
    number
  > = {
    "Main Card": 0,
    Prelims: 1,
    "Early Prelims": 2,
  };

  return fights.sort((a, b) => {
    const sectionDifference =
      sectionPriority[a.sectionLabel] -
      sectionPriority[b.sectionLabel];

    if (sectionDifference !== 0) {
      return sectionDifference;
    }

    return a.order - b.order;
  });
}

function sanitizeEvent(
  item: UfcEventApiItem,
): UfcEventApiItem {
  return {
    id: cleanInlineText(item.id),
    name: cleanInlineText(item.name),
    headline: cleanOptionalInlineText(item.headline),
    mainEvent: normalizeMainEvent(item.mainEvent),
    startDate: cleanOptionalInlineText(item.startDate),
    endDate: cleanOptionalInlineText(item.endDate),
    venue: cleanOptionalInlineText(item.venue),
    city: cleanOptionalInlineText(item.city),
    region: cleanOptionalInlineText(item.region),
    country: cleanOptionalInlineText(item.country),
    locationText: cleanOptionalInlineText(item.locationText),
    watchText: cleanOptionalInlineText(item.watchText),
    description: cleanOptionalText(item.description),
    sourceUrl: item.sourceUrl,
    canonicalUrl: item.canonicalUrl,
    imageUrl: item.imageUrl,
    status: item.status,
    fightCard: item.fightCard.map((fight) => ({
      ...fight,
      redFighter: cleanInlineText(fight.redFighter),
      blueFighter: cleanInlineText(fight.blueFighter),
      weightClass: cleanOptionalInlineText(fight.weightClass),
      winnerName: cleanOptionalInlineText(fight.winnerName),
      method: cleanOptionalInlineText(fight.method),
      time: cleanOptionalInlineText(fight.time),
    })),
  };
}

function extractEvent(
  html: string,
  sourceUrl: string,
): UfcEventApiItem {
  const $ = cheerio.load(html);

  const jsonLdRecords = extractJsonLdRecords($);
  const eventJsonLd = findEventJsonLd(jsonLdRecords);

  const canonicalHref =
    $('link[rel="canonical"]')
      .first()
      .attr("href")
      ?.trim() || sourceUrl;

  const canonicalUrl = createCanonicalUrl(canonicalHref);

  const rawName =
    getStringValue(eventJsonLd, ["name", "headline"]) ||
    getMetaContent($, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
    ]) ||
    cleanInlineText($("h1").first().text()) ||
    cleanInlineText($("title").first().text()) ||
    "Evento UFC";

  const headline =
    getStringValue(eventJsonLd, ["headline"]) ||
    getMetaContent($, ['meta[property="og:title"]']);

  const description = extractDescription(
    $,
    eventJsonLd,
  );

  const parsedDescription =
    parseOfficialDescription(description);

  const domMainEvent = extractMainEvent(
    $,
    rawName,
  );

  const mainEvent =
    parsedDescription.mainEvent ||
    domMainEvent;

  const startDateFromPage =
    getStringValue(eventJsonLd, [
      "startDate",
      "doorTime",
    ]) ||
    $("time[datetime]")
      .first()
      .attr("datetime")
      ?.trim() ||
    undefined;

  const startDate =
    startDateFromPage ||
    createDateFromDescription(
      parsedDescription.dateText,
      $,
    );

  const endDate =
    getStringValue(eventJsonLd, ["endDate"]);

  const locationRecord =
    getLocationRecord(eventJsonLd);

  const addressRecord =
    getAddressRecord(locationRecord);

  const jsonLdVenue =
    getStringValue(locationRecord, ["name"]);

  const jsonLdCity =
    getStringValue(addressRecord, [
      "addressLocality",
      "locality",
      "city",
    ]);

  const jsonLdRegion =
    getStringValue(addressRecord, [
      "addressRegion",
      "region",
      "state",
    ]);

  const jsonLdCountry =
    getStringValue(addressRecord, [
      "addressCountry",
      "country",
    ]);

  const venue =
    jsonLdVenue ||
    parsedDescription.venue;

  const city =
    jsonLdCity ||
    parsedDescription.city;

  const region =
    jsonLdRegion ||
    parsedDescription.region;

  const country =
    jsonLdCountry ||
    parsedDescription.country;

  const locationParts = [
    venue,
    city,
    region,
    country,
  ].filter(Boolean);

  const locationText =
    locationParts.length > 0
      ? Array.from(new Set(locationParts)).join(", ")
      : undefined;

  const watchText = extractPlatforms($);

  const imageUrl =
    getImageFromJsonLd(eventJsonLd) ||
    getMetaContent($, [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[property="twitter:image"]',
    ]) ||
    extractImageFromDom($);

  const pageText =
    cleanInlineText($("body").text());

  const status = determineEventStatus(
    startDate,
    pageText,
  );

  const name = buildEventName({
    rawName,
    officialName:
      parsedDescription.officialName,
    mainEvent,
    sourceUrl: canonicalUrl,
  });

  const fightCard = extractFightCard($, status);

  return sanitizeEvent({
    id: createItemId(canonicalUrl),
    name,
    headline: removeUfcSuffix(headline || rawName),
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
    imageUrl: imageUrl
      ? createAbsoluteUrl(imageUrl)
      : undefined,
    status,
    fightCard,
  });
}

async function fetchEvent(
  sourceUrl: string,
): Promise<UfcEventApiItem | null> {
  try {
    const html = await fetchHtml(sourceUrl);

    return extractEvent(
      html,
      sourceUrl,
    );
  } catch (error) {
    console.error(
      `No se pudo leer ${sourceUrl}`,
      error,
    );

    return null;
  }
}

function createResponseHeaders(): HeadersInit {
  return {
    "Content-Type":
      "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods":
      "GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type",
    "Cache-Control":
      "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function createJsonResponse(
  payload: UfcEventsApiResponse,
  status: number,
): NextResponse {
  return new NextResponse(
    JSON.stringify(payload),
    {
      status,
      headers: createResponseHeaders(),
    },
  );
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: createResponseHeaders(),
  });
}

export async function GET(): Promise<NextResponse> {
  const fetchedAt =
    new Date().toISOString();

  try {
    const listingHtml =
      await fetchHtml(UFC_EVENTS_URL);

    const eventUrls =
      extractEventUrls(listingHtml);

    const eventResults =
      await Promise.all(
        eventUrls.map((url) =>
          fetchEvent(url),
        ),
      );

    const items = eventResults
      .filter(
        (
          item,
        ): item is UfcEventApiItem =>
          item !== null,
      )
      .map((item) =>
        sanitizeEvent(item),
      )
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

    return createJsonResponse(
      payload,
      200,
    );
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

    return createJsonResponse(
      payload,
      500,
    );
  }
}