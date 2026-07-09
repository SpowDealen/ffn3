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

const ESPABOX_BASE_URL = "https://www.espabox.com";
const ESPABOX_SOURCE = getExternalNewsSource("espabox");
const ESPABOX_SOURCE_NAME = ESPABOX_SOURCE?.name ?? "Espabox";
const MAX_LISTING_LINKS = 60;
const MAX_ITEMS = 12;
const MIN_BODY_LENGTH = 140;
const MAX_BODY_LENGTH = 25_000;

const ESPABOX_START_URLS = [
  `${ESPABOX_BASE_URL}/`,
  `${ESPABOX_BASE_URL}/category/nac/`,
  `${ESPABOX_BASE_URL}/category/int/`,
  `${ESPABOX_BASE_URL}/category/veladas/`,
  `${ESPABOX_BASE_URL}/category/las-voces-del-boxeo/`,
  `${ESPABOX_BASE_URL}/feed/`,
  `${ESPABOX_BASE_URL}/category/nac/feed/`,
  `${ESPABOX_BASE_URL}/category/int/feed/`,
  `${ESPABOX_BASE_URL}/category/veladas/feed/`,
  `${ESPABOX_BASE_URL}/category/las-voces-del-boxeo/feed/`,
] as const;

const STATIC_OR_NON_EDITORIAL_PATHS = [
  "/category/",
  "/tag/",
  "/author/",
  "/page/",
  "/feed/",
  "/wp-json/",
  "/wp-admin/",
  "/wp-content/",
  "/descargas/",
  "/ranking-espabox/",
  "/agenda-espabox/",
  "/agenda/",
  "/cuadro-de-campeones/",
  "/el-pugil-del-mes",
  "/premios-espabox/",
  "/guia-espabox/",
  "/contacto/",
  "/sobre-nosotros/",
] as const;

const NON_NEWS_TITLE_PATTERNS = [
  /^guía espabox/i,
  /^ranking espabox/i,
  /^cuadro de campeones/i,
  /^agenda espabox/i,
  /^programación boxeo tv/i,
  /^el púgil del mes/i,
  /^premios espabox/i,
] as const;

type JsonLdRecord = Record<string, unknown>;

type EspaboxArticleCandidate = {
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

function isLikelyEspaboxArticleUrl(value: string): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(normalizeUrl(value, ESPABOX_BASE_URL));
    const normalizedPath = url.pathname
      .toLowerCase()
      .replace(/\/+$/, "");

    if (!url.hostname.endsWith("espabox.com")) {
      return false;
    }

    if (!normalizedPath || normalizedPath === "/") {
      return false;
    }

    if (
      STATIC_OR_NON_EDITORIAL_PATHS.some((path) => {
        const normalizedStaticPath = path.replace(/\/+$/, "");
        return (
          normalizedPath === normalizedStaticPath ||
          normalizedPath.startsWith(`${normalizedStaticPath}/`)
        );
      })
    ) {
      return false;
    }

    const pathParts = normalizedPath.split("/").filter(Boolean);
    return pathParts.length === 1 && pathParts[0].length >= 8;
  } catch {
    return false;
  }
}

function isLikelyEditorialTitle(value: string): boolean {
  const title = value.trim();

  if (!title || title.length < 8) {
    return false;
  }

  return !NON_NEWS_TITLE_PATTERNS.some((pattern) => pattern.test(title));
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
      Accept: "text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.6",
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
      // Algunos plugins insertan JSON-LD incompleto; se ignora ese bloque.
    }
  });

  return records;
}

function getJsonLdTypes(record: JsonLdRecord): string[] {
  return getStringArray(record["@type"]).map((type) => type.toLowerCase());
}

function findArticleJsonLd($: cheerio.CheerioAPI): JsonLdRecord | undefined {
  return getJsonLdRecords($).find((record) => {
    const types = getJsonLdTypes(record);
    return types.some((type) =>
      ["newsarticle", "article", "reportagenewsarticle", "blogposting"].includes(type),
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
    const value = getString(record[key]);

    if (value) {
      return cleanOptionalText(value);
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
    for (const item of image) {
      if (typeof item === "string") {
        return item;
      }

      if (isObjectRecord(item)) {
        const url = getString(item.url) || getString(item.contentUrl);
        if (url) {
          return url;
        }
      }
    }
  }

  if (isObjectRecord(image)) {
    return getString(image.url) || getString(image.contentUrl) || undefined;
  }

  return undefined;
}

function getJsonLdAuthors(record: JsonLdRecord | undefined): string[] {
  if (!record) {
    return [];
  }

  const author = record.author;
  const authors = Array.isArray(author) ? author : [author];

  return authors
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

function extractCandidatesFromListing(html: string): EspaboxArticleCandidate[] {
  const $ = cheerio.load(html);
  const candidates: EspaboxArticleCandidate[] = [];

  $("item").each((_: number, element: AnyNode) => {
    const item = $(element);
    const rawUrl = item.children("link").first().text().trim();
    const listingTitle = cleanOptionalInlineText(
      item.children("title").first().text(),
    );
    const url = createCanonicalUrl(rawUrl, ESPABOX_BASE_URL);

    if (
      url &&
      isLikelyEspaboxArticleUrl(url) &&
      (!listingTitle || isLikelyEditorialTitle(listingTitle))
    ) {
      candidates.push({ url, listingTitle });
    }
  });

  $("a[href]").each((_: number, element: AnyNode) => {
    const anchor = $(element);
    const rawHref = anchor.attr("href") ?? "";
    const listingTitle = cleanOptionalInlineText(
      anchor.attr("title") || anchor.text(),
    );
    const url = createCanonicalUrl(rawHref, ESPABOX_BASE_URL);

    if (
      !url ||
      !isLikelyEspaboxArticleUrl(url) ||
      (listingTitle && !isLikelyEditorialTitle(listingTitle))
    ) {
      return;
    }

    candidates.push({ url, listingTitle });
  });

  const uniqueByUrl = new Map<string, EspaboxArticleCandidate>();

  for (const candidate of candidates) {
    const previous = uniqueByUrl.get(candidate.url);

    if (!previous || (!previous.listingTitle && candidate.listingTitle)) {
      uniqueByUrl.set(candidate.url, candidate);
    }
  }

  return Array.from(uniqueByUrl.values()).slice(0, MAX_LISTING_LINKS);
}

function isNoiseParagraph(value: string): boolean {
  const paragraph = value.trim();
  const normalized = paragraph.toLocaleLowerCase("es");

  if (!paragraph || paragraph.length < 20) {
    return true;
  }

  return (
    normalized === "publicidad" ||
    normalized.includes("facebook twitter whatsapp telegram") ||
    normalized.includes("desde 1994, espabox") ||
    normalized.includes("este es el equipo de redacción") ||
    normalized.includes("contáctanos:") ||
    normalized.includes("síguenos") ||
    normalized.includes("política de privacidad") ||
    normalized.includes("aviso legal") ||
    normalized.includes("más noticias") ||
    normalized.includes("artículos relacionados") ||
    normalized.includes("puede interesarte") ||
    normalized.includes("compartir en") ||
    normalized.includes("etiquetas:") ||
    normalized.includes("comments") ||
    normalized.includes("leave a reply") ||
    normalized.includes("guardar mi nombre")
  );
}

function extractBodyFromSelectors($: cheerio.CheerioAPI): string | undefined {
  const selectors = [
    ".td-post-content p",
    ".entry-content p",
    ".post-content p",
    ".article-content p",
    "article .tdb-block-inner p",
    "article p",
    "main .td-post-content p",
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
    $("article img[src], .td-post-featured-image img[src], main img[src]")
      .first()
      .attr("src");

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
    cleanOptionalInlineText($("h1.entry-title, h1.tdb-title-text, h1").first().text()) ||
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
      $(".td-post-sub-title, .entry-summary, .post-excerpt, article h2")
        .first()
        .text(),
    )
  );
}

function extractCanonicalUrl($: cheerio.CheerioAPI, url: string): string {
  const canonicalHref = $('link[rel="canonical"]').first().attr("href");
  return createCanonicalUrl(canonicalHref || url, ESPABOX_BASE_URL);
}

function extractTags($: cheerio.CheerioAPI): string[] {
  const tags: string[] = ["Boxeo"];

  const keywordContent = getMetaContent($, [
    'meta[name="keywords"]',
    'meta[property="article:section"]',
  ]);

  if (keywordContent) {
    tags.push(...keywordContent.split(","));
  }

  $('meta[property="article:tag"]').each((_: number, element: AnyNode) => {
    const value = $(element).attr("content");
    if (value) {
      tags.push(value);
    }
  });

  $(".td-post-category, .entry-categories a, .post-tags a, a[rel='tag']").each(
    (_: number, element: AnyNode) => {
      tags.push($(element).text());
    },
  );

  return uniqueStrings(tags);
}

async function fetchArticle(
  candidate: EspaboxArticleCandidate,
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
    cleanOptionalInlineText(
      $(".td-post-author-name, .author-name, [rel='author']").first().text(),
    ) ?? "",
  ]);
  const tags = extractTags($);

  if (
    !title ||
    !isLikelyEditorialTitle(title) ||
    !bodyText ||
    bodyText.length < MIN_BODY_LENGTH
  ) {
    return undefined;
  }

  return createExternalNewsItem({
    source: "espabox",
    sourceName: ESPABOX_SOURCE_NAME,
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
      editorialFocus: "boxeo_espanol_e_internacional",
    },
  });
}

async function fetchEspaboxNews(): Promise<ExternalNewsFetchResult> {
  const fetchedAt = new Date().toISOString();

  try {
    const candidatesByUrl = new Map<string, EspaboxArticleCandidate>();

    for (const startUrl of ESPABOX_START_URLS) {
      try {
        const html = await fetchHtml(startUrl);
        const candidates = extractCandidatesFromListing(html);

        for (const candidate of candidates) {
          const previous = candidatesByUrl.get(candidate.url);

          if (!previous || (!previous.listingTitle && candidate.listingTitle)) {
            candidatesByUrl.set(candidate.url, candidate);
          }
        }
      } catch {
        // Una sección o feed puede fallar sin tumbar la fuente completa.
      }
    }

    const candidates = Array.from(candidatesByUrl.values()).slice(
      0,
      MAX_LISTING_LINKS,
    );

    if (candidates.length === 0) {
      throw new Error(
        "Espabox no devolvió enlaces editoriales compatibles en sus secciones de boxeo.",
      );
    }

    const settledItems = await Promise.allSettled(
      candidates.map((candidate) => fetchArticle(candidate, fetchedAt)),
    );

    const items = settledItems
      .map((result: PromiseSettledResult<ExternalNewsItem | undefined>) =>
        result.status === "fulfilled" ? result.value : undefined,
      )
      .filter((item): item is ExternalNewsItem => Boolean(item))
      .sort((itemA, itemB) => {
        const timeA = itemA.publishedAt
          ? new Date(itemA.publishedAt).getTime()
          : 0;
        const timeB = itemB.publishedAt
          ? new Date(itemB.publishedAt).getTime()
          : 0;

        return timeB - timeA;
      })
      .slice(0, MAX_ITEMS);

    return {
      ok: true,
      source: "espabox",
      sourceName: ESPABOX_SOURCE_NAME,
      fetchedAt,
      count: items.length,
      items,
      ...(items.length === 0
        ? {
            error:
              "Espabox devolvió enlaces, pero ninguna noticia aportó cuerpo editorial suficiente.",
          }
        : {}),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar las noticias externas de Espabox.";

    return {
      ok: false,
      source: "espabox",
      sourceName: ESPABOX_SOURCE_NAME,
      fetchedAt,
      count: 0,
      items: [],
      error: message,
    };
  }
}

export const espaboxAdapter: ExternalNewsAdapter = {
  source: ESPABOX_SOURCE ?? {
    id: "espabox",
    name: ESPABOX_SOURCE_NAME,
    baseUrl: ESPABOX_BASE_URL,
    enabled: true,
    language: "es",
    kind: "medio_externo",
    refreshIntervalSeconds: 300,
  },
  fetchNews: fetchEspaboxNews,
};
