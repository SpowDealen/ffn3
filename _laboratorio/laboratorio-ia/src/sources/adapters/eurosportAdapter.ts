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

const EUROSPORT_BASE_URL = "https://www.eurosport.es";
const EUROSPORT_SOURCE = getExternalNewsSource("eurosport");
const EUROSPORT_SOURCE_NAME = EUROSPORT_SOURCE?.name ?? "Eurosport España";
const MAX_LISTING_LINKS = 50;
const MAX_ITEMS = 12;
const MIN_BODY_LENGTH = 160;
const MAX_BODY_LENGTH = 25_000;

const EUROSPORT_START_URLS = [
  `${EUROSPORT_BASE_URL}/mma/`,
  `${EUROSPORT_BASE_URL}/mma/ufc/`,
  `${EUROSPORT_BASE_URL}/boxeo/`,
  `${EUROSPORT_BASE_URL}/deportes-de-combate/`,
] as const;

const COMBAT_KEYWORDS = [
  "ufc",
  "mma",
  "artes marciales mixtas",
  "boxeo",
  "boxeador",
  "boxeadora",
  "combate",
  "combates",
  "deportes de combate",
  "deportes de contacto",
  "lucha",
  "bkfc",
  "bare knuckle",
  "jiu jitsu",
  "jijitsu",
  "grappling",
  "kickboxing",
  "muay thai",
  "bellator",
  "pfl",
  "one championship",
  "glory",
  "canelo",
  "topuria",
  "mcgregor",
] as const;

const ALLOWED_SECTIONS = [
  "/mma/",
  "/boxeo/",
  "/deportes-de-combate/",
] as const;

type JsonLdRecord = Record<string, unknown>;

type EurosportArticleCandidate = {
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
  const normalizedValue = value.toLocaleLowerCase("es");
  return COMBAT_KEYWORDS.some((keyword) => normalizedValue.includes(keyword));
}

function isLikelyEurosportArticlePath(pathname: string): boolean {
  const normalizedPath = pathname.toLowerCase();

  if (!ALLOWED_SECTIONS.some((section) => normalizedPath.startsWith(section))) {
    return false;
  }

  if (
    normalizedPath.includes("/resultados/") ||
    normalizedPath.includes("/calendario/") ||
    normalizedPath.includes("/clasificacion/") ||
    normalizedPath.includes("/video.shtml") ||
    normalizedPath.includes("/videos/") ||
    normalizedPath.includes("/directo/")
  ) {
    return false;
  }

  return /_sto\d+\/story\.shtml$/i.test(normalizedPath);
}

function isValidEurosportArticleCandidate(href: string, text: string): boolean {
  if (!href) {
    return false;
  }

  try {
    const url = new URL(normalizeUrl(href, EUROSPORT_BASE_URL));

    if (!url.hostname.endsWith("eurosport.es")) {
      return false;
    }

    if (!isLikelyEurosportArticlePath(url.pathname)) {
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

function chooseBestDecodedHtml(buffer: ArrayBuffer, contentType: string): string {
  const declaredCharset = getDeclaredCharset(contentType);
  const candidates = [declaredCharset, "utf-8", "windows-1252", "iso-8859-1"]
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

function collectJsonLdRecord(value: unknown, records: JsonLdRecord[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonLdRecord(item, records);
    }
    return;
  }

  if (!isObjectRecord(value)) {
    return;
  }

  const graph = value["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) {
      collectJsonLdRecord(item, records);
    }
  }

  records.push(value);
}

function getJsonLdRecords($: cheerio.CheerioAPI): JsonLdRecord[] {
  const records: JsonLdRecord[] = [];

  $('script[type="application/ld+json"]').each((_: number, element: AnyNode) => {
    const rawJson = $(element).contents().text().trim();

    if (!rawJson) {
      return;
    }

    try {
      collectJsonLdRecord(JSON.parse(rawJson) as unknown, records);
    } catch {
      // JSON-LD parcial o inválido no debe tumbar toda la fuente.
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
    const firstString = image.find((item): item is string => typeof item === "string");
    if (firstString) {
      return firstString;
    }

    const firstObject = image.find(isObjectRecord);
    return firstObject ? getString(firstObject.url) || undefined : undefined;
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

function extractArticleUrls(html: string): EurosportArticleCandidate[] {
  const $ = cheerio.load(html);
  const candidates = new Map<string, EurosportArticleCandidate>();

  $("a[href]").each((_: number, element: AnyNode) => {
    if (candidates.size >= MAX_LISTING_LINKS) {
      return false;
    }

    const href = $(element).attr("href")?.trim() ?? "";
    const listingTitle = cleanOptionalInlineText(
      $(element).attr("aria-label") || $(element).text(),
    ) ?? "";

    if (!isValidEurosportArticleCandidate(href, listingTitle)) {
      return;
    }

    const canonicalUrl = createCanonicalUrl(href, EUROSPORT_BASE_URL);

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

  $('[class*="tag"] a, [data-testid*="tag"] a, [rel="tag"]').each(
    (_: number, element: AnyNode) => {
      const value = $(element).text();
      if (value) {
        tags.push(value);
      }
    },
  );

  return uniqueStrings(tags);
}

function isNoiseParagraph(paragraph: string): boolean {
  const normalized = paragraph.toLocaleLowerCase("es");

  return (
    /^publicidad$/i.test(paragraph) ||
    normalized === "anuncio" ||
    normalized.includes("regístrate") ||
    normalized.includes("suscríbete") ||
    normalized.includes("abónate aquí") ||
    normalized.includes("plan hbo max deportes") ||
    normalized.includes("descarga la app de eurosport") ||
    normalized.includes("todos los deportes") ||
    normalized.includes("más noticias del día") ||
    normalized.includes("contenido patrocinado") ||
    normalized.includes("fuente de la imagen") ||
    normalized.includes("autor del vídeo") ||
    normalized.includes("condiciones de uso") ||
    normalized.includes("política de privacidad")
  );
}

function extractBodyFromSelectors($: cheerio.CheerioAPI): string | undefined {
  const selectors = [
    '[data-testid*="article"] p',
    '[data-testid*="story"] p',
    "article p",
    '[class*="article-body"] p',
    '[class*="article-content"] p',
    '[class*="story"] p',
    '[class*="content"] p',
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
      'meta[name="sailthru.date"]',
    ]) ||
    $("time[datetime]").first().attr("datetime");

  if (!rawDate) {
    return undefined;
  }

  const parsedDate = new Date(rawDate);
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate.toISOString();
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

  return rawImage ? normalizeUrl(rawImage, canonicalUrl) || undefined : undefined;
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
      $('[class*="subtitle"], [class*="standfirst"], [class*="summary"], h2')
        .first()
        .text(),
    )
  );
}

function extractCanonicalUrl($: cheerio.CheerioAPI, url: string): string {
  const canonicalHref = $('link[rel="canonical"]').first().attr("href");
  return createCanonicalUrl(canonicalHref || url, EUROSPORT_BASE_URL);
}

async function fetchArticle(
  candidate: EurosportArticleCandidate,
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
        'meta[name="parsely-author"]',
      ]),
    ),
  ]);
  const tags = uniqueStrings([
    ...extractTags($),
    ...COMBAT_KEYWORDS.filter((keyword) =>
      `${title} ${excerpt ?? ""} ${canonicalUrl}`
        .toLocaleLowerCase("es")
        .includes(keyword),
    ),
  ]);

  if (!title || !bodyText || bodyText.length < MIN_BODY_LENGTH) {
    return undefined;
  }

  if (!isProbablyCombatText(`${title} ${excerpt ?? ""} ${bodyText.slice(0, 800)} ${canonicalUrl}`)) {
    return undefined;
  }

  return createExternalNewsItem({
    source: "eurosport",
    sourceName: EUROSPORT_SOURCE_NAME,
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

async function fetchEurosportNews(): Promise<ExternalNewsFetchResult> {
  const fetchedAt = new Date().toISOString();

  try {
    const candidatesByUrl = new Map<string, EurosportArticleCandidate>();

    for (const startUrl of EUROSPORT_START_URLS) {
      try {
        const html = await fetchHtml(startUrl);
        const candidates = extractArticleUrls(html);

        for (const candidate of candidates) {
          if (!candidatesByUrl.has(candidate.url)) {
            candidatesByUrl.set(candidate.url, candidate);
          }
        }
      } catch {
        // Una sección puede fallar sin tumbar el adaptador completo.
      }
    }

    const candidates = Array.from(candidatesByUrl.values()).slice(
      0,
      MAX_LISTING_LINKS,
    );
    const settledItems = await Promise.allSettled(
      candidates.map((candidate) => fetchArticle(candidate, fetchedAt)),
    );

    const items = settledItems
      .map((result: PromiseSettledResult<ExternalNewsItem | undefined>) =>
        result.status === "fulfilled" ? result.value : undefined,
      )
      .filter((item): item is ExternalNewsItem => Boolean(item))
      .sort((itemA, itemB) => {
        const timeA = itemA.publishedAt ? new Date(itemA.publishedAt).getTime() : 0;
        const timeB = itemB.publishedAt ? new Date(itemB.publishedAt).getTime() : 0;
        return timeB - timeA;
      })
      .slice(0, MAX_ITEMS);

    if (candidates.length === 0) {
      throw new Error(
        "Eurosport España no devolvió enlaces editoriales compatibles en sus secciones de combate.",
      );
    }

    return {
      ok: true,
      source: "eurosport",
      sourceName: EUROSPORT_SOURCE_NAME,
      fetchedAt,
      count: items.length,
      items,
      ...(items.length === 0
        ? {
            error:
              "Eurosport España devolvió enlaces, pero ninguna noticia aportó cuerpo editorial suficiente.",
          }
        : {}),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar las noticias externas de Eurosport España.";

    return {
      ok: false,
      source: "eurosport",
      sourceName: EUROSPORT_SOURCE_NAME,
      fetchedAt,
      count: 0,
      items: [],
      error: message,
    };
  }
}

export const eurosportAdapter: ExternalNewsAdapter = {
  source: EUROSPORT_SOURCE ?? {
    id: "eurosport",
    name: EUROSPORT_SOURCE_NAME,
    baseUrl: EUROSPORT_BASE_URL,
    enabled: true,
    language: "es",
    kind: "medio_externo",
    refreshIntervalSeconds: 300,
  },
  fetchNews: fetchEurosportNews,
};
