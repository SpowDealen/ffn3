import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type {
  ExternalNewsAdapter,
  ExternalNewsFetchResult,
  ExternalNewsItem,
} from "../types";
import { getExternalNewsSource } from "../sourceRegistry";
import {
  cleanOptionalInlineText,
  cleanOptionalText,
  cleanText,
  createCanonicalUrl,
  createExternalNewsItem,
  normalizeUrl,
  uniqueStrings,
} from "../normalizeExternalNews";

const AS_BASE_URL = "https://as.com";
const AS_SOURCE = getExternalNewsSource("as");
const AS_SOURCE_NAME = AS_SOURCE?.name ?? "AS";
const MAX_LISTING_LINKS = 40;
const MAX_ITEMS = 12;
const MIN_BODY_LENGTH = 120;
const MAX_BODY_LENGTH = 25_000;

const AS_START_URLS = [
  `${AS_BASE_URL}/noticias/deportes-combate/`,
  `${AS_BASE_URL}/noticias/ufc-ultimate-fighting-championship/`,
  `${AS_BASE_URL}/masdeporte/`,
] as const;

const COMBAT_KEYWORDS = [
  "ufc",
  "mma",
  "artes marciales mixtas",
  "boxeo",
  "combate",
  "combates",
  "deportes combate",
  "deportes de combate",
  "lucha",
  "bkfc",
  "bare-knuckle",
  "bareknuckle",
  "jiu-jitsu",
  "jijitsu",
  "grappling",
  "kickboxing",
  "muay thai",
  "muay-thai",
  "bellator",
  "pfl",
  "one championship",
  "glory",
  "canelo",
  "topuria",
  "mcgregor",
] as const;

type JsonLdRecord = Record<string, unknown>;

type AsArticleCandidate = {
  url: string;
  listingTitle?: string;
};

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(getString).filter(Boolean);
  }

  const stringValue = getString(value);

  return stringValue ? [stringValue] : [];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isProbablyCombatText(value: string): boolean {
  const normalizedValue = value.toLowerCase();

  return COMBAT_KEYWORDS.some((keyword) =>
    normalizedValue.includes(keyword),
  );
}

function isLikelyAsArticlePath(pathname: string): boolean {
  if (!pathname || pathname === "/") {
    return false;
  }

  if (
    pathname.includes("/noticias/") ||
    pathname.includes("/album/") ||
    pathname.includes("/videos/") ||
    pathname.includes("/directo/") ||
    pathname.includes("/radio/") ||
    pathname.includes("/apuestas/") ||
    pathname.includes("/resultados/") ||
    pathname.includes("/tag/")
  ) {
    return false;
  }

  if (!pathname.startsWith("/masdeporte/")) {
    return false;
  }

  return (
    /-n\/?$/i.test(pathname) ||
    /-f20\d{4}-n\/?$/i.test(pathname) ||
    /\/20\d{2}\//.test(pathname)
  );
}

function isValidAsArticleCandidate(href: string, text: string): boolean {
  if (!href) {
    return false;
  }

  try {
    const url = new URL(normalizeUrl(href, AS_BASE_URL));

    if (!url.hostname.endsWith("as.com")) {
      return false;
    }

    if (!isLikelyAsArticlePath(url.pathname)) {
      return false;
    }

    return isProbablyCombatText(`${url.pathname} ${url.search} ${text}`);
  } catch {
    return false;
  }
}

function countBrokenEncodingMarkers(value: string): number {
  const matches = value.match(/Ã|Â|â€|â€™|â€œ|â€\u009d|â€¦|â€“|â€”|ï¿½|�/g);

  return matches?.length ?? 0;
}

function decodeHtmlWithCharset(
  buffer: ArrayBuffer,
  charset: string,
): string | undefined {
  try {
    return new TextDecoder(charset, { fatal: false }).decode(buffer);
  } catch {
    return undefined;
  }
}

function getDeclaredCharset(contentType: string): string | undefined {
  const charsetMatch = contentType.match(/charset=([^;]+)/i);
  const rawCharset = charsetMatch?.[1]?.trim().replace(/["']/g, "").toLowerCase();

  if (!rawCharset) {
    return undefined;
  }

  if (["iso-8859-1", "latin1", "latin-1", "windows-1252", "cp1252"].includes(rawCharset)) {
    return "windows-1252";
  }

  return rawCharset;
}

function chooseBestDecodedHtml(
  buffer: ArrayBuffer,
  contentType: string,
): string {
  const declaredCharset = getDeclaredCharset(contentType);
  const candidates = [
    declaredCharset,
    "utf-8",
    "windows-1252",
    "iso-8859-1",
  ]
    .filter((charset): charset is string => Boolean(charset))
    .map((charset) => ({
      charset,
      html: decodeHtmlWithCharset(buffer, charset),
    }))
    .filter(
      (candidate): candidate is { charset: string; html: string } =>
        Boolean(candidate.html),
    );

  candidates.sort((candidateA, candidateB) => {
    const scoreA =
      countBrokenEncodingMarkers(candidateA.html) +
      (candidateA.html.includes("�") ? 100 : 0);
    const scoreB =
      countBrokenEncodingMarkers(candidateB.html) +
      (candidateB.html.includes("�") ? 100 : 0);

    return scoreA - scoreB;
  });

  return candidates[0]?.html ?? new TextDecoder("utf-8").decode(buffer);
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.7",
      "User-Agent":
        "Mozilla/5.0 (compatible; FullFightNewsExternalSourceReader/1.0)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`${url} respondió con estado ${response.status}.`);
  }

  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "";

  return chooseBestDecodedHtml(buffer, contentType);
}

function getMetaContent(
  $: cheerio.CheerioAPI,
  selectors: string[],
): string | undefined {
  for (const selector of selectors) {
    const value = $(selector).first().attr("content");

    if (value) {
      return cleanOptionalInlineText(value);
    }
  }

  return undefined;
}

function getJsonLdRecords($: cheerio.CheerioAPI): JsonLdRecord[] {
  const records: JsonLdRecord[] = [];

  $('script[type="application/ld+json"]').each((_: number, element: AnyNode) => {
    const rawJson = $(element).contents().text().trim();

    if (!rawJson) {
      return;
    }

    try {
      const parsedJson: unknown = JSON.parse(rawJson);

      if (Array.isArray(parsedJson)) {
        records.push(...parsedJson.filter(isObjectRecord));
        return;
      }

      if (!isObjectRecord(parsedJson)) {
        return;
      }

      const graph = parsedJson["@graph"];

      if (Array.isArray(graph)) {
        records.push(...graph.filter(isObjectRecord));
      }

      records.push(parsedJson);
    } catch {
      // Algunos medios dejan JSON-LD parcial o escapado. No debe tumbar la fuente.
    }
  });

  return records;
}

function findArticleJsonLd($: cheerio.CheerioAPI): JsonLdRecord | undefined {
  return getJsonLdRecords($).find((record) => {
    const type = record["@type"];
    const types = Array.isArray(type) ? type.map(getString) : [getString(type)];

    return types.some((item) =>
      ["NewsArticle", "Article", "ReportageNewsArticle"].includes(item),
    );
  });
}

function getJsonLdString(
  record: JsonLdRecord | undefined,
  keys: string[],
): string | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return cleanOptionalInlineText(value);
    }
  }

  return undefined;
}

function getJsonLdImage(record: JsonLdRecord | undefined): string | undefined {
  if (!record) {
    return undefined;
  }

  const image = record.image;

  if (typeof image === "string") {
    return image;
  }

  if (Array.isArray(image)) {
    const firstString = image.find((item): item is string =>
      typeof item === "string",
    );

    if (firstString) {
      return firstString;
    }

    const firstObject = image.find(isObjectRecord);
    const firstObjectUrl = firstObject ? getString(firstObject.url) : "";

    return firstObjectUrl || undefined;
  }

  if (isObjectRecord(image)) {
    return getString(image.url) || undefined;
  }

  return undefined;
}

function getJsonLdAuthors(record: JsonLdRecord | undefined): string[] {
  if (!record) {
    return [];
  }

  const author = record.author;

  if (typeof author === "string") {
    return [author];
  }

  if (Array.isArray(author)) {
    return author
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (isObjectRecord(item)) {
          return getString(item.name);
        }

        return "";
      })
      .filter(Boolean);
  }

  if (isObjectRecord(author)) {
    return getStringArray(author.name);
  }

  return [];
}

function extractArticleUrls(html: string): AsArticleCandidate[] {
  const $ = cheerio.load(html);
  const candidates = new Map<string, AsArticleCandidate>();

  $("a[href]").each((_: number, element: AnyNode) => {
    if (candidates.size >= MAX_LISTING_LINKS) {
      return false;
    }

    const href = $(element).attr("href")?.trim() ?? "";
    const listingTitle = cleanOptionalInlineText($(element).text()) ?? "";

    if (!isValidAsArticleCandidate(href, listingTitle)) {
      return;
    }

    const canonicalUrl = createCanonicalUrl(href, AS_BASE_URL);

    if (!canonicalUrl || candidates.has(canonicalUrl)) {
      return;
    }

    candidates.set(canonicalUrl, {
      url: canonicalUrl,
      listingTitle: listingTitle || undefined,
    });
  });

  return Array.from(candidates.values());
}

function extractTags($: cheerio.CheerioAPI): string[] {
  const tags: string[] = [];

  $('meta[property="article:tag"]').each((_: number, element: AnyNode) => {
    const value = $(element).attr("content");

    if (value) {
      tags.push(value);
    }
  });

  $(
    '[class*="tag"] a, [class*="tags"] a, [data-testid*="tag"] a, [rel="tag"]',
  ).each((_: number, element: AnyNode) => {
    const value = $(element).text();

    if (value) {
      tags.push(value);
    }
  });

  return uniqueStrings(tags);
}

function isNoiseParagraph(paragraph: string): boolean {
  return (
    /^publicidad$/i.test(paragraph) ||
    /^síguenos en/i.test(paragraph) ||
    /^también puedes seguirnos/i.test(paragraph) ||
    /newsletter/i.test(paragraph) ||
    /suscríbete/i.test(paragraph) ||
    /preferir AS en Google/i.test(paragraph) ||
    /normas de participación/i.test(paragraph) ||
    /comenta esta noticia/i.test(paragraph)
  );
}

function extractBodyFromSelectors($: cheerio.CheerioAPI): string | undefined {
  const selectors = [
    "article p",
    '[class*="article"] p',
    '[class*="story"] p',
    '[class*="content"] p',
    '[class*="cuerpo"] p',
    '[class*="body"] p',
    "main p",
  ];

  for (const selector of selectors) {
    const paragraphs: string[] = [];

    $(selector).each((_: number, element: AnyNode) => {
      const paragraph = cleanText($(element).text());

      if (!paragraph || isNoiseParagraph(paragraph)) {
        return;
      }

      paragraphs.push(paragraph);
    });

    const bodyText = uniqueStrings(paragraphs).join("\n\n").trim();

    if (bodyText.length >= MIN_BODY_LENGTH) {
      return bodyText.slice(0, MAX_BODY_LENGTH).trim();
    }
  }

  return undefined;
}

function extractBodyFromJsonLd(
  articleRecord: JsonLdRecord | undefined,
): string | undefined {
  const bodyText = getJsonLdString(articleRecord, ["articleBody", "text"]);

  if (!bodyText || bodyText.length < MIN_BODY_LENGTH) {
    return undefined;
  }

  return cleanText(bodyText).slice(0, MAX_BODY_LENGTH).trim();
}

function extractPublishedAt(
  $: cheerio.CheerioAPI,
  articleRecord: JsonLdRecord | undefined,
): string | undefined {
  const rawDate =
    getJsonLdString(articleRecord, ["datePublished", "dateCreated"]) ||
    getMetaContent($, [
      'meta[property="article:published_time"]',
      'meta[name="date"]',
      'meta[name="DC.date.issued"]',
      'meta[name="parsely-pub-date"]',
    ]) ||
    $("time[datetime]").first().attr("datetime");

  if (!rawDate) {
    return undefined;
  }

  const parsedDate = new Date(rawDate);

  if (Number.isNaN(parsedDate.getTime())) {
    return undefined;
  }

  return parsedDate.toISOString();
}

function extractImage(
  $: cheerio.CheerioAPI,
  articleRecord: JsonLdRecord | undefined,
  canonicalUrl: string,
): string | undefined {
  const rawImage =
    getJsonLdImage(articleRecord) ||
    getMetaContent($, [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[name="thumbnail"]',
    ]) ||
    $("article img[src], main img[src]").first().attr("src");

  if (!rawImage) {
    return undefined;
  }

  return normalizeUrl(rawImage, canonicalUrl) || undefined;
}

function extractTitle(
  $: cheerio.CheerioAPI,
  articleRecord: JsonLdRecord | undefined,
  fallbackTitle?: string,
): string {
  return (
    getJsonLdString(articleRecord, ["headline", "name"]) ||
    getMetaContent($, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
    ]) ||
    cleanOptionalInlineText($("h1").first().text()) ||
    cleanOptionalInlineText(fallbackTitle) ||
    ""
  );
}

function extractExcerpt(
  $: cheerio.CheerioAPI,
  articleRecord: JsonLdRecord | undefined,
): string | undefined {
  return (
    getJsonLdString(articleRecord, ["description"]) ||
    getMetaContent($, [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]) ||
    cleanOptionalText(
      $(
        '[class*="subtitle"], [class*="entradilla"], [class*="summary"], h2',
      )
        .first()
        .text(),
    )
  );
}

function extractCanonicalUrl($: cheerio.CheerioAPI, url: string): string {
  const canonicalHref = $('link[rel="canonical"]').first().attr("href");

  return createCanonicalUrl(canonicalHref || url, AS_BASE_URL);
}

async function fetchArticle(
  candidate: AsArticleCandidate,
  detectedAt: string,
): Promise<ExternalNewsItem | undefined> {
  const html = await fetchHtml(candidate.url);
  const $ = cheerio.load(html);
  const articleRecord = findArticleJsonLd($);
  const canonicalUrl = extractCanonicalUrl($, candidate.url);
  const title = extractTitle($, articleRecord, candidate.listingTitle);
  const excerpt = extractExcerpt($, articleRecord);
  const bodyText =
    extractBodyFromJsonLd(articleRecord) || extractBodyFromSelectors($);
  const publishedAt = extractPublishedAt($, articleRecord);
  const imageUrl = extractImage($, articleRecord, canonicalUrl);
  const authors = uniqueStrings([
    ...getJsonLdAuthors(articleRecord),
    ...getStringArray(
      getMetaContent($, [
        'meta[name="author"]',
        'meta[property="article:author"]',
      ]),
    ),
  ]);
  const tags = uniqueStrings([
    ...extractTags($),
    ...COMBAT_KEYWORDS.filter((keyword) =>
      `${title} ${excerpt ?? ""} ${canonicalUrl}`
        .toLowerCase()
        .includes(keyword),
    ),
  ]);

  if (!bodyText || bodyText.length < MIN_BODY_LENGTH) {
    return undefined;
  }

  return createExternalNewsItem({
    source: "as",
    sourceName: AS_SOURCE_NAME,
    title,
    sourceUrl: candidate.url,
    canonicalUrl,
    excerpt,
    bodyText,
    publishedAt,
    image: imageUrl ? { url: imageUrl, alt: title } : undefined,
    authors,
    tags,
    language: "es",
    detectedAt,
    raw: {
      listingTitle: candidate.listingTitle,
      hasJsonLd: Boolean(articleRecord),
    },
  });
}

async function fetchAsNews(): Promise<ExternalNewsFetchResult> {
  const fetchedAt = new Date().toISOString();

  try {
    const candidatesByUrl = new Map<string, AsArticleCandidate>();

    for (const startUrl of AS_START_URLS) {
      try {
        const html = await fetchHtml(startUrl);
        const candidates = extractArticleUrls(html);

        for (const candidate of candidates) {
          if (!candidatesByUrl.has(candidate.url)) {
            candidatesByUrl.set(candidate.url, candidate);
          }
        }
      } catch {
        // Una portada puede fallar sin tumbar el adaptador entero.
      }
    }

    const candidates = Array.from(candidatesByUrl.values()).slice(
      0,
      MAX_ITEMS,
    );

    const settledItems = await Promise.allSettled(
      candidates.map((candidate) => fetchArticle(candidate, fetchedAt)),
    );

    const items = settledItems
      .map((result: PromiseSettledResult<ExternalNewsItem | undefined>) =>
        result.status === "fulfilled" ? result.value : undefined,
      )
      .filter((item: ExternalNewsItem | undefined): item is ExternalNewsItem => Boolean(item));

    return {
      ok: true,
      source: "as",
      sourceName: AS_SOURCE_NAME,
      fetchedAt,
      count: items.length,
      items,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar las noticias externas de AS.";

    return {
      ok: false,
      source: "as",
      sourceName: AS_SOURCE_NAME,
      fetchedAt,
      count: 0,
      items: [],
      error: message,
    };
  }
}

export const asAdapter: ExternalNewsAdapter = {
  source: AS_SOURCE ?? {
    id: "as",
    name: AS_SOURCE_NAME,
    baseUrl: AS_BASE_URL,
    enabled: true,
    language: "es",
    kind: "medio_externo",
    refreshIntervalSeconds: 300,
  },
  fetchNews: fetchAsNews,
};
