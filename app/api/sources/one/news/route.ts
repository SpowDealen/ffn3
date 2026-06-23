import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONE_BASE_URL = "https://www.onefc.com";
const ONE_NEWS_URL = `${ONE_BASE_URL}/category/news`;

const MAX_ITEMS = 12;
const MAX_BODY_LENGTH = 25_000;
const MIN_BODY_LENGTH = 180;
const MIN_BODY_PARAGRAPHS = 2;

type JsonLdRecord = Record<string, unknown>;

type OneNewsApiItem = {
  id: string;
  title: string;
  summary?: string;
  bodyText?: string;
  sourceUrl: string;
  canonicalUrl: string;
  publishedAt?: string;
  imageUrl?: string;
};

type OneNewsApiResponse = {
  ok: boolean;
  source: "one";
  fetchedAt: string;
  count: number;
  items: OneNewsApiItem[];
  error?: string;
};

const MOJIBAKE_REPLACEMENTS: ReadonlyArray<
  readonly [string, string]
> = [
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

  ["\u00f0\u0178\u00a4\u00a9", "\ud83e\udd29"],
  ["\u00f0\u0178\u00a5\u0160", "\ud83e\udd4a"],
  ["\u00f0\u0178\u201d\u00a5", "\ud83d\udd25"],
  ["\u00f0\u0178\u2018\u0160", "\ud83d\udc4a"],
  ["\u00f0\u0178\u2019\u00a5", "\ud83d\udca5"],
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

function cleanOptionalText(
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleanedValue = cleanText(value);

  return cleanedValue || undefined;
}

function createAbsoluteUrl(value: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  if (
    trimmedValue.startsWith("http://") ||
    trimmedValue.startsWith("https://")
  ) {
    return trimmedValue;
  }

  if (trimmedValue.startsWith("//")) {
    return `https:${trimmedValue}`;
  }

  if (trimmedValue.startsWith("/")) {
    return `${ONE_BASE_URL}${trimmedValue}`;
  }

  return `${ONE_BASE_URL}/${trimmedValue}`;
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

    return `one-${normalizedPath}`;
  } catch {
    const normalizedValue = sourceUrl
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();

    return `one-news-${normalizedValue}`;
  }
}

function isValidNewsUrl(value: string): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(createAbsoluteUrl(value));

    return (
      url.hostname.endsWith("onefc.com") &&
      url.pathname.startsWith("/news/") &&
      url.pathname !== "/news/"
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
        "Mozilla/5.0 (compatible; FullFightNewsOneSourceReader/1.0)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `${url} respondió con estado ${response.status}.`,
    );
  }

  const buffer = await response.arrayBuffer();

  return new TextDecoder("utf-8").decode(buffer);
}

function extractNewsUrls(html: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();

  $('a[href*="/news/"]').each((_, element) => {
    if (urls.size >= MAX_ITEMS) {
      return false;
    }

    const href = $(element).attr("href")?.trim() ?? "";

    if (!isValidNewsUrl(href)) {
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

    const cleanedValue = cleanText(value);

    if (cleanedValue) {
      return cleanedValue;
    }
  }

  return undefined;
}

function asRecord(
  value: unknown,
): JsonLdRecord | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as JsonLdRecord;
  }

  return undefined;
}

function getJsonLdTypes(
  record: JsonLdRecord,
): string[] {
  const typeValue = record["@type"];

  if (typeof typeValue === "string") {
    return [typeValue];
  }

  if (Array.isArray(typeValue)) {
    return typeValue.filter(
      (item): item is string =>
        typeof item === "string",
    );
  }

  return [];
}

function flattenJsonLd(
  value: unknown,
): JsonLdRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      flattenJsonLd(item),
    );
  }

  const record = asRecord(value);

  if (!record) {
    return [];
  }

  const graph = record["@graph"];

  if (Array.isArray(graph)) {
    return [
      record,
      ...graph.flatMap((item) =>
        flattenJsonLd(item),
      ),
    ];
  }

  return [record];
}

function extractJsonLdRecords(
  $: cheerio.CheerioAPI,
): JsonLdRecord[] {
  const records: JsonLdRecord[] = [];

  $('script[type="application/ld+json"]').each(
    (_, element) => {
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
    },
  );

  return records;
}

function findArticleJsonLd(
  records: JsonLdRecord[],
): JsonLdRecord | undefined {
  const acceptedTypes = new Set([
    "Article",
    "NewsArticle",
    "BlogPosting",
    "ReportageNewsArticle",
  ]);

  return records.find((record) =>
    getJsonLdTypes(record).some((type) =>
      acceptedTypes.has(type),
    ),
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

    const cleanedValue = cleanText(value);

    if (cleanedValue) {
      return cleanedValue;
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
      (item): item is string =>
        typeof item === "string",
    );

    if (firstString) {
      return createAbsoluteUrl(firstString);
    }

    const firstRecord = image
      .map((item) => asRecord(item))
      .find(
        (item): item is JsonLdRecord =>
          item !== undefined,
      );

    const imageUrl = getStringValue(firstRecord, [
      "url",
      "contentUrl",
    ]);

    return imageUrl
      ? createAbsoluteUrl(imageUrl)
      : undefined;
  }

  const imageRecord = asRecord(image);

  const imageUrl = getStringValue(imageRecord, [
    "url",
    "contentUrl",
  ]);

  return imageUrl
    ? createAbsoluteUrl(imageUrl)
    : undefined;
}

function isPromotionalParagraph(
  value: string,
): boolean {
  const normalizedValue = value.toLowerCase();

  const blockedPatterns = [
    "watch every ufc event",
    "watch the entire event",
    "register your interest here",
    "stay informed with the free ufc newsletter",
    "subscribe on youtube",
    "follow zuffa boxing",
    "don't miss a moment",
    "more ufc vegas",
    "more ufc freedom",
    "ufc freedom 250 rewind",
    "zuffa boxing is coming",
    "presented by crypto.com",
    "rewatch ufc",
    "click here",
    "watch:",
    "official scorecards",
    "bonus coverage",
    "download the one app",
    "sign up now",
    "take one championship wherever you go",
    "watch.onefc.com",
    "watch one",
    "watch one",
    "order now",
    "buy tickets",
    "tickets are available",
    "sign up for one",
    "one app",
  ];

  return blockedPatterns.some((pattern) =>
    normalizedValue.includes(pattern),
  );
}

function isSuspiciousBody(value: string): boolean {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    value.length < MIN_BODY_LENGTH ||
    paragraphs.length < MIN_BODY_PARAGRAPHS
  );
}

function cleanArticleBody(
  value: string,
): string | undefined {
  const paragraphs = cleanText(value)
    .split(/\n{2,}/)
    .map((paragraph) =>
      normalizeWhitespace(paragraph),
    )
    .filter((paragraph) => paragraph.length >= 35)
    .filter(
      (paragraph) =>
        !isPromotionalParagraph(paragraph),
    );

  const uniqueParagraphs: string[] = [];
  const seen = new Set<string>();

  for (const paragraph of paragraphs) {
    const key = paragraph.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueParagraphs.push(paragraph);
  }

  if (uniqueParagraphs.length === 0) {
    return undefined;
  }

  const bodyText = uniqueParagraphs
    .join("\n\n")
    .slice(0, MAX_BODY_LENGTH)
    .trim();

  if (isSuspiciousBody(bodyText)) {
    return undefined;
  }

  return bodyText;
}

function removeUnwantedElements(
  container: cheerio.Cheerio<AnyNode>,
): void {
  container
    .find(
      [
        "script",
        "style",
        "nav",
        "aside",
        "footer",
        "form",
        "button",
        "figure",
        "figcaption",
        ".related",
        ".recommended",
        ".newsletter",
        ".social",
        ".share",
        ".advertisement",
        ".promo",
        ".c-card",
        ".view-related",
        '[class*="related"]',
        '[class*="recommended"]',
        '[class*="newsletter"]',
        '[class*="social"]',
        '[class*="share"]',
        '[class*="advert"]',
        '[class*="promo"]',
      ].join(","),
    )
    .remove();
}

function collectParagraphs(
  container: cheerio.Cheerio<AnyNode>,
): string[] {
  const clonedContainer = container.clone();

  removeUnwantedElements(clonedContainer);

  const paragraphs: string[] = [];

  clonedContainer
    .find("p")
    .each((_, element) => {
      const paragraph = cleanText(
        clonedContainer.find(element).text(),
      );

      if (
        paragraph.length >= 35 &&
        !isPromotionalParagraph(paragraph)
      ) {
        paragraphs.push(paragraph);
      }
    });

  return paragraphs;
}

function calculateContainerScore(
  paragraphs: string[],
): number {
  const totalLength = paragraphs.reduce(
    (sum, paragraph) =>
      sum + paragraph.length,
    0,
  );

  const longParagraphs = paragraphs.filter(
    (paragraph) => paragraph.length >= 120,
  ).length;

  return totalLength + longParagraphs * 250;
}

function extractBodyFromDom(
  $: cheerio.CheerioAPI,
): string | undefined {
  const selectors = [
    ".field--name-body",
    ".field--type-text-with-summary",
    ".article-body",
    ".article__body",
    ".c-article-body",
    ".node__content",
    ".page-node-type-article article",
    "article",
    "main",
  ];

  let bestParagraphs: string[] = [];
  let bestScore = 0;

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const container = $(element);
      const paragraphs =
        collectParagraphs(container);

      const score =
        calculateContainerScore(paragraphs);

      if (score > bestScore) {
        bestScore = score;
        bestParagraphs = paragraphs;
      }
    });
  }

  if (bestParagraphs.length === 0) {
    return undefined;
  }

  return cleanArticleBody(
    bestParagraphs.join("\n\n"),
  );
}

function parseLooseDate(value: string): string | undefined {
  const cleanedValue = cleanText(value)
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanedValue) {
    return undefined;
  }

  const directDate = new Date(cleanedValue);

  if (!Number.isNaN(directDate.getTime())) {
    return directDate.toISOString();
  }

  const monthNames: Record<string, number> = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    sept: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };

  const textualMatch = cleanedValue.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/i,
  );

  if (textualMatch) {
    const month = monthNames[textualMatch[1].toLowerCase()];
    const day = Number(textualMatch[2]);
    const year = Number(textualMatch[3]);

    if (
      typeof month === "number" &&
      Number.isInteger(day) &&
      Number.isInteger(year)
    ) {
      return new Date(Date.UTC(year, month, day, 12, 0, 0)).toISOString();
    }
  }

  const numericMatch = cleanedValue.match(
    /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/,
  );

  if (numericMatch) {
    const first = Number(numericMatch[1]);
    const second = Number(numericMatch[2]);
    const rawYear = Number(numericMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;

    if (
      Number.isInteger(first) &&
      Number.isInteger(second) &&
      Number.isInteger(year)
    ) {
      const month = first > 12 ? second - 1 : first - 1;
      const day = first > 12 ? first : second;

      return new Date(Date.UTC(year, month, day, 12, 0, 0)).toISOString();
    }
  }

  return undefined;
}

function extractPublishedAt(
  $: cheerio.CheerioAPI,
  articleJsonLd?: JsonLdRecord,
): string | undefined {
  const jsonLdDate = getStringValue(
    articleJsonLd,
    ["datePublished", "dateCreated", "dateModified", "uploadDate"],
  );

  if (jsonLdDate) {
    return parseLooseDate(jsonLdDate) || jsonLdDate;
  }

  const metaDate = getMetaContent($, [
    'meta[property="article:published_time"]',
    'meta[name="article:published_time"]',
    'meta[property="og:published_time"]',
    'meta[name="date"]',
    'meta[name="publish-date"]',
    'meta[name="pubdate"]',
    'meta[name="publish_date"]',
    'meta[name="published-date"]',
    'meta[itemprop="datePublished"]',
    'meta[itemprop="dateCreated"]',
    'meta[itemprop="dateModified"]',
  ]);

  if (metaDate) {
    return parseLooseDate(metaDate) || metaDate;
  }

  const timeDate =
    $("time[datetime]")
      .first()
      .attr("datetime")
      ?.trim() ||
    $("time")
      .first()
      .attr("content")
      ?.trim() ||
    $("time")
      .first()
      .text()
      ?.trim();

  if (timeDate) {
    return parseLooseDate(timeDate) || timeDate;
  }

  const visibleDateCandidates = [
    $("[class*='date']").first().text(),
    $("[class*='Date']").first().text(),
    $("[class*='published']").first().text(),
    $("[class*='Published']").first().text(),
    $("[class*='post-meta']").first().text(),
    $("[class*='meta']").first().text(),
  ];

  for (const candidate of visibleDateCandidates) {
    const parsedDate = parseLooseDate(candidate);

    if (parsedDate) {
      return parsedDate;
    }
  }

  return undefined;
}

function sanitizeArticle(
  item: OneNewsApiItem,
): OneNewsApiItem {
  return {
    id: cleanText(item.id),
    title: cleanText(item.title),
    summary: cleanOptionalText(item.summary),
    bodyText: cleanOptionalText(item.bodyText),
    sourceUrl: item.sourceUrl,
    canonicalUrl: item.canonicalUrl,
    publishedAt: cleanOptionalText(
      item.publishedAt,
    ),
    imageUrl: item.imageUrl,
  };
}

function extractArticle(
  html: string,
  sourceUrl: string,
): OneNewsApiItem {
  const $ = cheerio.load(html);

  const jsonLdRecords =
    extractJsonLdRecords($);

  const articleJsonLd =
    findArticleJsonLd(jsonLdRecords);

  const title =
    getStringValue(articleJsonLd, [
      "headline",
      "name",
    ]) ||
    getMetaContent($, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
    ]) ||
    cleanText($("h1").first().text()) ||
    cleanText($("title").first().text()) ||
    "Noticia oficial de ONE Championship";

  const summary =
    getStringValue(articleJsonLd, [
      "description",
      "abstract",
    ]) ||
    getMetaContent($, [
      'meta[property="og:description"]',
      'meta[name="description"]',
      'meta[name="twitter:description"]',
    ]);

  const jsonLdBody = getStringValue(
    articleJsonLd,
    ["articleBody", "text"],
  );

  const bodyText =
    (jsonLdBody
      ? cleanArticleBody(jsonLdBody)
      : undefined) ||
    extractBodyFromDom($);

  const jsonLdImage =
    getImageFromJsonLd(articleJsonLd);

  const metaImage = getMetaContent($, [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
  ]);

  const imageUrl = jsonLdImage
    ? createAbsoluteUrl(jsonLdImage)
    : metaImage
      ? createAbsoluteUrl(metaImage)
      : undefined;

  const canonicalHref =
    $('link[rel="canonical"]')
      .first()
      .attr("href")
      ?.trim() || sourceUrl;

  const canonicalUrl =
    createCanonicalUrl(canonicalHref);

  const publishedAt = extractPublishedAt(
    $,
    articleJsonLd,
  );

  return sanitizeArticle({
    id: createItemId(canonicalUrl),
    title,
    summary,
    bodyText,
    sourceUrl,
    canonicalUrl,
    publishedAt,
    imageUrl,
  });
}

async function fetchArticle(
  sourceUrl: string,
): Promise<OneNewsApiItem | null> {
  try {
    const html = await fetchHtml(sourceUrl);

    return extractArticle(html, sourceUrl);
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
  payload: OneNewsApiResponse,
  status: number,
): NextResponse {
  const json = JSON.stringify(payload);

  return new NextResponse(json, {
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
    const listingHtml = await fetchHtml(
      ONE_NEWS_URL,
    );

    const articleUrls =
      extractNewsUrls(listingHtml);

    const articleResults = await Promise.all(
      articleUrls.map((url) =>
        fetchArticle(url),
      ),
    );

    const items = articleResults
      .filter(
        (
          item,
        ): item is OneNewsApiItem =>
          item !== null,
      )
      .map((item) => sanitizeArticle(item));

    const payload: OneNewsApiResponse = {
      ok: true,
      source: "one",
      fetchedAt,
      count: items.length,
      items,
    };

    return createJsonResponse(payload, 200);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido consultando ONE Championship.";

    const payload: OneNewsApiResponse = {
      ok: false,
      source: "one",
      fetchedAt,
      count: 0,
      items: [],
      error: cleanText(message),
    };

    return createJsonResponse(payload, 500);
  }
}