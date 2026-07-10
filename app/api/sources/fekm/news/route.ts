import {NextResponse} from "next/server";
import * as cheerio from "cheerio";
import type {AnyNode} from "domhandler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEKM_BASE_URL = "https://fekm.es";
const FEKM_NEWS_URLS = [
  `${FEKM_BASE_URL}/noticias/`,
  `${FEKM_BASE_URL}/`,
];

const FEKM_WORDPRESS_POSTS_URL =
  `${FEKM_BASE_URL}/wp-json/wp/v2/posts?per_page=20&status=publish&_fields=link,slug`;

const MAX_ITEMS = 12;
const MAX_BODY_LENGTH = 25_000;
const MIN_BODY_LENGTH = 140;
const MIN_BODY_PARAGRAPHS = 2;

type JsonLdRecord = Record<string, unknown>;

type FekmNewsApiItem = {
  id: string;
  title: string;
  summary?: string;
  bodyText?: string;
  sourceUrl: string;
  canonicalUrl: string;
  publishedAt?: string;
  imageUrl?: string;
  author?: string;
  tags?: string[];
  inferredDiscipline?: "kickboxing" | "muay_thai" | "mixed";
};

type FekmNewsApiResponse = {
  ok: boolean;
  source: "fekm";
  fetchedAt: string;
  count: number;
  items: FekmNewsApiItem[];
  error?: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const BLOCKED_PATHS = new Set([
  "",
  "calendario",
  "resultados",
  "events",
  "eventos",
  "documentos",
  "document-category",
  "circulares",
  "circulares-competicion",
  "normativa",
  "antidopaje",
  "la-federacion",
  "conocenos",
  "organizacion",
  "transparencia",
  "licencias-federate",
  "federaciones-autonomicas",
  "contacto",
  "politica-de-privacidad",
  "aviso-legal",
  "politica-de-cookies",
  "senior",
  "junior",
]);

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

function decodeEntities(value: string): string {
  return cheerio.load(`<div>${value}</div>`)("div").text();
}

function cleanText(value: string): string {
  return normalizeParagraphs(decodeEntities(value));
}

function cleanInlineText(value: string): string {
  return normalizeWhitespace(decodeEntities(value));
}

function createAbsoluteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${FEKM_BASE_URL}${trimmed}`;
  return `${FEKM_BASE_URL}/${trimmed}`;
}

function createCanonicalUrl(value: string): string {
  return createAbsoluteUrl(value)
    .split("?")[0]
    .split("#")[0]
    .replace(/\/+$/, "");
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function createItemId(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    return `fekm-news-${slugify(url.pathname)}`;
  } catch {
    return `fekm-news-${slugify(sourceUrl)}`;
  }
}

function isValidNewsUrl(value: string): boolean {
  if (!value) return false;

  try {
    const url = new URL(createAbsoluteUrl(value));
    if (!url.hostname.endsWith("fekm.es")) return false;

    const segments = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean);

    if (segments.length !== 1) return false;

    const slug = segments[0].toLowerCase();
    if (BLOCKED_PATHS.has(slug)) return false;
    if (/^(page|tag|category|author|feed|wp-|search)/i.test(slug)) return false;
    if (/\.(pdf|docx?|xlsx?|zip|jpg|jpeg|png|webp)$/i.test(slug)) return false;

    return slug.length >= 12;
  } catch {
    return false;
  }
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es-ES,es;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${url} respondió con estado ${response.status}.`);
    }

    const buffer = await response.arrayBuffer();
    return new TextDecoder("utf-8").decode(buffer);
  } finally {
    clearTimeout(timeoutId);
  }
}


async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "es-ES,es;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${url} respondió con estado ${response.status}.`);
    }

    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractWordPressPostUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const urls = new Set<string>();

  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;

    const record = item as Record<string, unknown>;
    const link = typeof record.link === "string" ? record.link : "";

    if (isValidNewsUrl(link)) {
      urls.add(createCanonicalUrl(link));
    }

    if (urls.size >= MAX_ITEMS) break;
  }

  return Array.from(urls);
}

function extractNewsUrls(html: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();

  const selectors = [
    ".et_pb_blog_grid .et_pb_post .entry-title a[href]",
    ".et_pb_blog_grid .et_pb_post .entry-featured-image-url[href]",
    ".et_pb_blog_grid .et_pb_post a.more-link[href]",
    ".et_pb_post .entry-title a[href]",
    ".et_pb_post .entry-featured-image-url[href]",
    ".et_pb_post a[href]",
    "article a[href]",
    ".post-content a[href]",
    ".entry-title a[href]",
    ".more-link[href]",
    'a[rel="bookmark"][href]',
  ];

  $(selectors.join(",")).each((_, element) => {
    if (urls.size >= MAX_ITEMS) return false;
    const href = $(element).attr("href")?.trim() ?? "";
    if (isValidNewsUrl(href)) urls.add(createCanonicalUrl(href));
  });

  return Array.from(urls);
}

function asRecord(value: unknown): JsonLdRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonLdRecord)
    : undefined;
}

function flattenJsonLd(value: unknown): JsonLdRecord[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  const record = asRecord(value);
  if (!record) return [];
  const graph = record["@graph"];
  return Array.isArray(graph)
    ? [record, ...graph.flatMap(flattenJsonLd)]
    : [record];
}

function extractJsonLdRecords($: cheerio.CheerioAPI): JsonLdRecord[] {
  const records: JsonLdRecord[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).html()?.trim();
    if (!raw) return;
    try {
      records.push(...flattenJsonLd(JSON.parse(raw) as unknown));
    } catch {
      // JSON-LD inválido: se ignora.
    }
  });
  return records;
}

function getJsonLdTypes(record: JsonLdRecord): string[] {
  const value = record["@type"];
  if (typeof value === "string") return [value];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function findArticleJsonLd(records: JsonLdRecord[]): JsonLdRecord | undefined {
  const accepted = new Set([
    "Article",
    "NewsArticle",
    "BlogPosting",
    "Report",
  ]);
  return records.find((record) =>
    getJsonLdTypes(record).some((type) => accepted.has(type)),
  );
}

function getStringValue(
  record: JsonLdRecord | undefined,
  keys: string[],
): string | undefined {
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

function getMetaContent(
  $: cheerio.CheerioAPI,
  selectors: string[],
): string | undefined {
  for (const selector of selectors) {
    const value = $(selector).first().attr("content");
    if (value?.trim()) return cleanInlineText(value);
  }
  return undefined;
}

function getJsonLdImage(record: JsonLdRecord | undefined): string | undefined {
  if (!record) return undefined;
  const value = record.image;
  if (typeof value === "string") return createAbsoluteUrl(value);
  if (Array.isArray(value)) {
    const first = value.find((item): item is string => typeof item === "string");
    if (first) return createAbsoluteUrl(first);
  }
  const imageRecord = asRecord(value);
  if (imageRecord) {
    const url = imageRecord.url ?? imageRecord.contentUrl;
    if (typeof url === "string") return createAbsoluteUrl(url);
  }
  return undefined;
}

function extractBodyText($: cheerio.CheerioAPI): string | undefined {
  const selectors = [
    ".entry-content",
    ".post-content",
    "article .et_pb_post_content",
    "article .et_pb_text_inner",
    "article",
    "main",
  ];

  const excluded = [
    "script",
    "style",
    "noscript",
    "nav",
    "footer",
    "aside",
    "form",
    ".sharedaddy",
    ".share",
    ".social",
    ".et_social_inline",
    ".related-posts",
    ".post-meta",
    ".author",
    ".cookie",
  ].join(",");

  for (const selector of selectors) {
    const container = $(selector).first().clone();
    if (!container.length) continue;
    container.find(excluded).remove();

    const paragraphs: string[] = [];
    container.find("p, li").each((_, element: AnyNode) => {
      const text = cleanInlineText($(element).text());
      if (text.length >= 25 && !paragraphs.includes(text)) paragraphs.push(text);
    });

    const body = cleanText(paragraphs.join("\n\n")).slice(0, MAX_BODY_LENGTH);
    if (
      body.length >= MIN_BODY_LENGTH &&
      body.split(/\n{2,}/).filter(Boolean).length >= MIN_BODY_PARAGRAPHS
    ) {
      return body;
    }
  }

  return undefined;
}

function inferDiscipline(text: string): FekmNewsApiItem["inferredDiscipline"] {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const hasMuayThai = /muay\s*thai|muaythai|ifma/.test(normalized);
  const hasKickboxing = /kick\s*boxing|kickboxing|wako|k1|kick light|full contact|point fighting|light contact/.test(normalized);

  if (hasMuayThai && hasKickboxing) return "mixed";
  if (hasMuayThai) return "muay_thai";
  if (hasKickboxing) return "kickboxing";
  return "mixed";
}

function extractTags($: cheerio.CheerioAPI, article: JsonLdRecord | undefined): string[] | undefined {
  const values = new Set<string>();
  const keywords = article?.keywords;
  if (typeof keywords === "string") {
    keywords.split(",").forEach((value) => {
      const cleaned = cleanInlineText(value);
      if (cleaned) values.add(cleaned);
    });
  } else if (Array.isArray(keywords)) {
    keywords.forEach((value) => {
      if (typeof value === "string") {
        const cleaned = cleanInlineText(value);
        if (cleaned) values.add(cleaned);
      }
    });
  }

  $('a[rel="tag"], .post-tags a, .entry-tags a').each((_, element) => {
    const cleaned = cleanInlineText($(element).text());
    if (cleaned) values.add(cleaned);
  });

  return values.size > 0 ? Array.from(values).slice(0, 12) : undefined;
}

async function extractNewsItem(url: string): Promise<FekmNewsApiItem | null> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const records = extractJsonLdRecords($);
  const article = findArticleJsonLd(records);

  const canonicalUrl = createCanonicalUrl(
    $('link[rel="canonical"]').attr("href") || url,
  );

  const title =
    getStringValue(article, ["headline", "name"]) ||
    getMetaContent($, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
    cleanInlineText($("h1").first().text());

  if (!title || title.length < 12) return null;

  const summary =
    getStringValue(article, ["description"]) ||
    getMetaContent($, [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]);

  const bodyText = extractBodyText($);
  if (!bodyText && (!summary || summary.length < MIN_BODY_LENGTH)) return null;

  const publishedAt =
    getStringValue(article, ["datePublished", "dateCreated"]) ||
    getMetaContent($, [
      'meta[property="article:published_time"]',
      'meta[name="date"]',
      'meta[itemprop="datePublished"]',
    ]) ||
    $("time[datetime]").first().attr("datetime")?.trim();

  const imageUrl =
    getJsonLdImage(article) ||
    getMetaContent($, [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[itemprop="image"]',
    ]);

  const authorRecord = asRecord(article?.author);
  const author =
    getStringValue(authorRecord, ["name"]) ||
    cleanInlineText($(".author, .post-author, [rel=author]").first().text()) ||
    "FEKM";

  const combinedText = `${title}\n${summary ?? ""}\n${bodyText ?? ""}`;

  return {
    id: createItemId(canonicalUrl),
    title,
    summary,
    bodyText,
    sourceUrl: canonicalUrl,
    canonicalUrl,
    publishedAt,
    imageUrl: imageUrl ? createAbsoluteUrl(imageUrl) : undefined,
    author,
    tags: extractTags($, article),
    inferredDiscipline: inferDiscipline(combinedText),
  };
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCors(new NextResponse(null, {status: 204}));
}

export async function GET(): Promise<NextResponse<FekmNewsApiResponse>> {
  const fetchedAt = new Date().toISOString();

  try {
    const discoveredUrls = new Set<string>();

    try {
      const wordpressPosts = await fetchJson(FEKM_WORDPRESS_POSTS_URL);
      extractWordPressPostUrls(wordpressPosts).forEach((url) =>
        discoveredUrls.add(url),
      );
    } catch {
      // La API pública de WordPress es la vía principal, pero no debe bloquear el fallback HTML.
    }

    if (discoveredUrls.size < MAX_ITEMS) {
      for (const listingUrl of FEKM_NEWS_URLS) {
        try {
          const html = await fetchHtml(listingUrl);
          extractNewsUrls(html).forEach((url) => discoveredUrls.add(url));
        } catch {
          // Una página secundaria no debe bloquear toda la fuente.
        }
        if (discoveredUrls.size >= MAX_ITEMS) break;
      }
    }

    const urls = Array.from(discoveredUrls).slice(0, MAX_ITEMS);

    if (urls.length === 0) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            source: "fekm",
            fetchedAt,
            count: 0,
            items: [],
            error: "FEKM no devolvió enlaces editoriales compatibles en su sección de noticias.",
          },
          {status: 502},
        ),
      );
    }

    const settled = await Promise.allSettled(urls.map(extractNewsItem));
    const items = settled
      .filter(
        (result): result is PromiseFulfilledResult<FekmNewsApiItem | null> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value)
      .filter((item): item is FekmNewsApiItem => Boolean(item))
      .slice(0, MAX_ITEMS);

    return withCors(
      NextResponse.json({
        ok: true,
        source: "fekm",
        fetchedAt,
        count: items.length,
        items,
      }),
    );
  } catch (error) {
    return withCors(
      NextResponse.json(
        {
          ok: false,
          source: "fekm",
          fetchedAt,
          count: 0,
          items: [],
          error:
            error instanceof Error
              ? error.message
              : "Error desconocido cargando noticias oficiales FEKM.",
        },
        {status: 500},
      ),
    );
  }
}
