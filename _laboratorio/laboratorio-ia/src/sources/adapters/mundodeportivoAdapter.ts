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

const MD_BASE_URL = "https://www.mundodeportivo.com";
const MD_SOURCE = getExternalNewsSource("mundodeportivo");
const MD_SOURCE_NAME = MD_SOURCE?.name ?? "Mundo Deportivo";
const MAX_LISTING_LINKS = 60;
const MAX_ITEMS = 12;
const MIN_BODY_LENGTH = 160;
const MAX_BODY_LENGTH = 25_000;

const MD_START_URLS = [
  `${MD_BASE_URL}/ufc`,
  `${MD_BASE_URL}/boxeo`,
] as const;

const COMBAT_KEYWORDS = [
  "ufc",
  "mma",
  "artes marciales mixtas",
  "boxeo",
  "boxeador",
  "boxeadora",
  "combate",
  "pelea",
  "kickboxing",
  "kick boxing",
  "muay thai",
  "pfl",
  "one championship",
  "bkfc",
  "bare knuckle",
  "wow fc",
  "bellator",
  "glory",
  "canelo",
  "topuria",
  "mcgregor",
] as const;

const BLOCKED_PATH_PARTS = [
  "/videos/",
  "/video/",
  "/fotogalerias/",
  "/galerias/",
  "/temas/",
  "/autor/",
  "/opinion/",
  "/servicios/",
  "/horarios/",
  "/resultados/",
  "/clasificacion/",
  "/directo/",
] as const;

type JsonLdRecord = Record<string, unknown>;

type MundoDeportivoCandidate = {
  url: string;
  listingTitle?: string;
};

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCombatText(value: string): boolean {
  const normalized = value.toLocaleLowerCase("es");
  return COMBAT_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function isLikelyArticlePath(pathname: string): boolean {
  const path = pathname.toLowerCase().replace(/\/+$/, "");

  if (!(path.startsWith("/ufc/") || path.startsWith("/boxeo/"))) {
    return false;
  }

  if (BLOCKED_PATH_PARTS.some((part) => path.includes(part))) {
    return false;
  }

  return /^\/(ufc|boxeo)\/\d{8}\/\d+\/[a-z0-9-]+\.html$/i.test(path);
}

function isValidCandidate(href: string, text: string): boolean {
  if (!href) {
    return false;
  }

  try {
    const url = new URL(normalizeUrl(href, MD_BASE_URL));

    if (!url.hostname.endsWith("mundodeportivo.com")) {
      return false;
    }

    if (!isLikelyArticlePath(url.pathname)) {
      return false;
    }

    return isCombatText(`${url.pathname} ${text}`);
  } catch {
    return false;
  }
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.7",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${url} respondió con estado ${response.status}.`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
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

function collectJsonLd(value: unknown, records: JsonLdRecord[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLd(item, records));
    return;
  }

  if (!isObjectRecord(value)) {
    return;
  }

  const graph = value["@graph"];
  if (Array.isArray(graph)) {
    graph.forEach((item) => collectJsonLd(item, records));
  }

  records.push(value);
}

function getJsonLdRecords($: cheerio.CheerioAPI): JsonLdRecord[] {
  const records: JsonLdRecord[] = [];

  $('script[type="application/ld+json"]').each((_: number, element: AnyNode) => {
    const raw = $(element).contents().text().trim();
    if (!raw) {
      return;
    }

    try {
      collectJsonLd(JSON.parse(raw) as unknown, records);
    } catch {
      // Un bloque JSON-LD roto no debe invalidar la noticia completa.
    }
  });

  return records;
}

function findArticleRecord($: cheerio.CheerioAPI): JsonLdRecord | undefined {
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
  const image = record?.image;

  if (typeof image === "string") {
    return image;
  }

  if (Array.isArray(image)) {
    for (const item of image) {
      if (typeof item === "string") {
        return item;
      }
      if (isObjectRecord(item) && typeof item.url === "string") {
        return item.url;
      }
    }
  }

  if (isObjectRecord(image) && typeof image.url === "string") {
    return image.url;
  }

  return undefined;
}

function getJsonLdAuthors(record: JsonLdRecord | undefined): string[] {
  const author = record?.author;
  const values = Array.isArray(author) ? author : author ? [author] : [];

  return uniqueStrings(
    values.map((item) => {
      if (typeof item === "string") {
        return item;
      }
      return isObjectRecord(item) ? getString(item.name) : "";
    }),
  );
}

function extractCandidates(html: string): MundoDeportivoCandidate[] {
  const $ = cheerio.load(html);
  const candidates: MundoDeportivoCandidate[] = [];

  $("a[href]").each((_: number, element: AnyNode) => {
    const href = $(element).attr("href") ?? "";
    const listingTitle = cleanOptionalInlineText(
      $(element).attr("title") || $(element).text(),
    );

    if (!isValidCandidate(href, listingTitle ?? "")) {
      return;
    }

    const url = createCanonicalUrl(href, MD_BASE_URL);
    if (url) {
      candidates.push({ url, listingTitle });
    }
  });

  const unique = new Map<string, MundoDeportivoCandidate>();
  for (const candidate of candidates) {
    const previous = unique.get(candidate.url);
    if (!previous || (!previous.listingTitle && candidate.listingTitle)) {
      unique.set(candidate.url, candidate);
    }
  }

  return Array.from(unique.values()).slice(0, MAX_LISTING_LINKS);
}

function isNoiseParagraph(value: string): boolean {
  const normalized = value.toLocaleLowerCase("es").trim();

  if (!normalized || normalized.length < 20) {
    return true;
  }

  return (
    normalized === "publicidad" ||
    normalized.includes("lee también") ||
    normalized.includes("al minuto") ||
    normalized.includes("más noticias") ||
    normalized.includes("contenido patrocinado") ||
    normalized.includes("suscríbete") ||
    normalized.includes("todos los derechos reservados") ||
    normalized.includes("política de privacidad") ||
    normalized.includes("compartir en") ||
    normalized.includes("facebook twitter whatsapp")
  );
}

function extractBodyFromSelectors($: cheerio.CheerioAPI): string | undefined {
  const selectors = [
    "article .article-body p",
    "article .content p",
    "article .body p",
    ".article-content p",
    ".article__content p",
    ".content-article p",
    ".story-content p",
    "article p",
    "main article p",
  ];

  for (const selector of selectors) {
    const paragraphs: string[] = [];

    $(selector).each((_: number, element: AnyNode) => {
      const paragraph = cleanText($(element).text());
      if (!isNoiseParagraph(paragraph)) {
        paragraphs.push(paragraph);
      }
    });

    const bodyText = uniqueStrings(paragraphs).join("\n\n").trim();
    if (bodyText.length >= MIN_BODY_LENGTH) {
      return bodyText.slice(0, MAX_BODY_LENGTH).trim();
    }
  }

  return undefined;
}

function extractBodyFromJsonLd(
  record: JsonLdRecord | undefined,
): string | undefined {
  const rawBody = getJsonLdString(record, ["articleBody", "text"]);
  if (!rawBody) {
    return undefined;
  }

  const bodyText = cleanText(rawBody);
  return bodyText.length >= MIN_BODY_LENGTH
    ? bodyText.slice(0, MAX_BODY_LENGTH).trim()
    : undefined;
}

function extractPublishedAt(
  $: cheerio.CheerioAPI,
  record: JsonLdRecord | undefined,
): string | undefined {
  const rawDate =
    getJsonLdString(record, ["datePublished", "dateCreated"]) ||
    getMetaContent($, [
      'meta[property="article:published_time"]',
      'meta[name="date"]',
      'meta[name="parsely-pub-date"]',
    ]) ||
    $("time[datetime]").first().attr("datetime");

  if (!rawDate) {
    return undefined;
  }

  const parsed = new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function extractTags($: cheerio.CheerioAPI): string[] {
  const tags: string[] = [];
  const section = getMetaContent($, ['meta[property="article:section"]']);
  const keywords = getMetaContent($, ['meta[name="keywords"]']);

  if (section) {
    tags.push(section);
  }
  if (keywords) {
    tags.push(...keywords.split(","));
  }

  $('meta[property="article:tag"]').each((_: number, element: AnyNode) => {
    const value = $(element).attr("content");
    if (value) {
      tags.push(value);
    }
  });

  return uniqueStrings(tags);
}

async function fetchArticle(
  candidate: MundoDeportivoCandidate,
  detectedAt: string,
): Promise<ExternalNewsItem | undefined> {
  const html = await fetchHtml(candidate.url);
  const $ = cheerio.load(html);
  const articleRecord = findArticleRecord($);
  const canonicalUrl = createCanonicalUrl(
    $('link[rel="canonical"]').first().attr("href") || candidate.url,
    MD_BASE_URL,
  );
  const title =
    getJsonLdString(articleRecord, ["headline", "name"]) ||
    getMetaContent($, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
    ]) ||
    cleanOptionalInlineText($("h1").first().text()) ||
    candidate.listingTitle ||
    "";
  const excerpt =
    getJsonLdString(articleRecord, ["description"]) ||
    getMetaContent($, [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]) ||
    cleanOptionalText($("article h2, .subtitle, .article-subtitle").first().text());
  const bodyText =
    extractBodyFromJsonLd(articleRecord) || extractBodyFromSelectors($);
  const publishedAt = extractPublishedAt($, articleRecord);
  const rawImage =
    getJsonLdImage(articleRecord) ||
    getMetaContent($, [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
    ]);
  const imageUrl = rawImage
    ? normalizeUrl(rawImage, canonicalUrl) || undefined
    : undefined;
  const authors = uniqueStrings([
    ...getJsonLdAuthors(articleRecord),
    getMetaContent($, [
      'meta[name="author"]',
      'meta[property="article:author"]',
    ]) ?? "",
    cleanOptionalInlineText(
      $(".author, .article-author, [rel='author']").first().text(),
    ) ?? "",
  ]);
  const tags = extractTags($);

  if (
    !title ||
    !bodyText ||
    bodyText.length < MIN_BODY_LENGTH ||
    !isCombatText(`${title} ${excerpt ?? ""} ${bodyText.slice(0, 500)} ${tags.join(" ")}`)
  ) {
    return undefined;
  }

  return createExternalNewsItem({
    source: "mundodeportivo",
    sourceName: MD_SOURCE_NAME,
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
      editorialFocus: "deportes_de_combate",
    },
  });
}

async function fetchMundoDeportivoNews(): Promise<ExternalNewsFetchResult> {
  const fetchedAt = new Date().toISOString();

  try {
    const candidatesByUrl = new Map<string, MundoDeportivoCandidate>();

    for (const startUrl of MD_START_URLS) {
      try {
        const html = await fetchHtml(startUrl);
        for (const candidate of extractCandidates(html)) {
          const previous = candidatesByUrl.get(candidate.url);
          if (!previous || (!previous.listingTitle && candidate.listingTitle)) {
            candidatesByUrl.set(candidate.url, candidate);
          }
        }
      } catch {
        // Una sección puede fallar sin tumbar toda la fuente.
      }
    }

    const candidates = Array.from(candidatesByUrl.values()).slice(
      0,
      MAX_LISTING_LINKS,
    );

    if (candidates.length === 0) {
      throw new Error(
        "Mundo Deportivo no devolvió enlaces editoriales compatibles de UFC o boxeo.",
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
      source: "mundodeportivo",
      sourceName: MD_SOURCE_NAME,
      fetchedAt,
      count: items.length,
      items,
      ...(items.length === 0
        ? {
            error:
              "Mundo Deportivo devolvió enlaces, pero ninguna noticia aportó cuerpo editorial suficiente.",
          }
        : {}),
    };
  } catch (error) {
    return {
      ok: false,
      source: "mundodeportivo",
      sourceName: MD_SOURCE_NAME,
      fetchedAt,
      count: 0,
      items: [],
      error:
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las noticias externas de Mundo Deportivo.",
    };
  }
}

export const mundoDeportivoAdapter: ExternalNewsAdapter = {
  source: MD_SOURCE ?? {
    id: "mundodeportivo",
    name: MD_SOURCE_NAME,
    baseUrl: MD_BASE_URL,
    enabled: true,
    language: "es",
    kind: "medio_externo",
    refreshIntervalSeconds: 300,
  },
  fetchNews: fetchMundoDeportivoNews,
};
