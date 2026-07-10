import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEKM_BASE_URL = "https://fekm.es";
const FEKM_RESULTS_URL = `${FEKM_BASE_URL}/resultados/`;
const MAX_DOCUMENTS = 30;

type DisciplineKey = "kickboxing" | "muay_thai" | "mixed";
type Scope = "nacional" | "internacional" | "otro";

type ResultDocument = {
  id: string;
  title: string;
  year?: number;
  discipline: DisciplineKey;
  disciplineLabel: "Kickboxing" | "Muay Thai" | "Kickboxing y Muay Thai";
  scope: Scope;
  sourcePageUrl: string;
  pdfUrl: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function withCors<T>(response: NextResponse<T>): NextResponse<T> {
  for (const [key, value] of Object.entries(CORS_HEADERS)) response.headers.set(key, value);
  return response;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugify(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
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
  return absoluteUrl(value).split("#")[0].split("?")[0];
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es-ES,es;q=0.9",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        Referer: `${FEKM_BASE_URL}/`,
      },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${url} respondió con estado ${response.status}.`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function inferDiscipline(value: string): DisciplineKey {
  const normalized = stripDiacritics(value).toLowerCase();
  const hasMuay = /muay\s*-?\s*thai|muaythai|\bmt\b/.test(normalized);
  const hasKick = /kick\s*-?\s*boxing|kickboxing|ring sport|tatami sport|\bk1\b|\bk-1\b/.test(normalized);
  if (hasMuay && hasKick) return "mixed";
  if (hasMuay) return "muay_thai";
  return "kickboxing";
}

function disciplineLabel(key: DisciplineKey): ResultDocument["disciplineLabel"] {
  if (key === "muay_thai") return "Muay Thai";
  if (key === "mixed") return "Kickboxing y Muay Thai";
  return "Kickboxing";
}

function inferScope(value: string): Scope {
  const normalized = stripDiacritics(value).toLowerCase();
  if (/world|europe|europeo|mundial|wako|ifma|internacional|world cup/.test(normalized)) return "internacional";
  if (/espana|nacional|selecciones autonomicas|stars league/.test(normalized)) return "nacional";
  return "otro";
}

function extractYear(value: string): number | undefined {
  const match = value.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : undefined;
}

function isPdfUrl(value: string): boolean {
  return /\.pdf(?:$|[?#])/i.test(value);
}

function isDocumentPage(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname.endsWith("fekm.es") && /^\/documentos\//i.test(url.pathname);
  } catch {
    return false;
  }
}

async function resolvePdfFromDocumentPage(pageUrl: string): Promise<string | undefined> {
  const html = await fetchText(pageUrl);
  const $ = cheerio.load(html);
  const candidates = new Set<string>();

  $("a[href], iframe[src], embed[src], object[data]").each((_, element) => {
    const node = $(element);
    const raw = node.attr("href") ?? node.attr("src") ?? node.attr("data") ?? "";
    const url = canonicalUrl(raw);
    if (isPdfUrl(url)) candidates.add(url);
  });

  const htmlMatches = html.match(/https?:\\?\/\\?\/[^"]+?\.pdf/gi) ?? [];
  for (const raw of htmlMatches) {
    const cleaned = raw.replace(/\\\//g, "/");
    if (isPdfUrl(cleaned)) candidates.add(canonicalUrl(cleaned));
  }

  return Array.from(candidates)[0];
}

async function collectDocuments(): Promise<ResultDocument[]> {
  const html = await fetchText(FEKM_RESULTS_URL);
  const $ = cheerio.load(html);
  const rawItems: Array<{ title: string; sourcePageUrl: string; pdfUrl?: string }> = [];

  $("table.posts-data-table tbody tr, tr.post-row").each((_, row) => {
    const node = $(row);
    const download = node.find("a.dlp-download-link[href], a[href$='.pdf'], a[href*='.pdf?']").first();
    const href = canonicalUrl(download.attr("href") ?? "");
    if (!href || !isPdfUrl(href)) return;

    const titleCell = node.find("td").first();
    const title = normalizeWhitespace(titleCell.text());
    if (!title) return;

    rawItems.push({
      title,
      sourcePageUrl: FEKM_RESULTS_URL,
      pdfUrl: href,
    });
  });

  // Fallback para páginas antiguas o cambios del plugin Document Library Pro.
  if (rawItems.length === 0) {
    $("a[href]").each((_, element) => {
      const link = $(element);
      const href = canonicalUrl(link.attr("href") ?? "");
      if (!href) return;

      const row = link.closest("tr");
      const rowTitle = normalizeWhitespace(row.find("td").first().text());
      const ownTitle = normalizeWhitespace(link.text());
      const title = rowTitle || ownTitle || normalizeWhitespace(link.attr("download") ?? "");
      if (!title) return;

      if (isPdfUrl(href)) rawItems.push({ title, sourcePageUrl: FEKM_RESULTS_URL, pdfUrl: href });
      else if (isDocumentPage(href)) rawItems.push({ title, sourcePageUrl: href });
    });
  }

  const seenPages = new Set<string>();
  const candidates = rawItems
    .filter((item) => /resultado/i.test(item.title) || isPdfUrl(item.pdfUrl ?? ""))
    .filter((item) => {
      const key = `${item.sourcePageUrl}|${item.pdfUrl ?? ""}`;
      if (seenPages.has(key)) return false;
      seenPages.add(key);
      return true;
    })
    .slice(0, MAX_DOCUMENTS);

  const documents: ResultDocument[] = [];
  for (const item of candidates) {
    let pdfUrl = item.pdfUrl;
    if (!pdfUrl && isDocumentPage(item.sourcePageUrl)) {
      try {
        pdfUrl = await resolvePdfFromDocumentPage(item.sourcePageUrl);
      } catch {
        pdfUrl = undefined;
      }
    }
    if (!pdfUrl) continue;

    const discipline = inferDiscipline(item.title);
    documents.push({
      id: `fekm-results-${slugify(item.title)}`,
      title: item.title,
      year: extractYear(item.title),
      discipline,
      disciplineLabel: disciplineLabel(discipline),
      scope: inferScope(item.title),
      sourcePageUrl: item.sourcePageUrl,
      pdfUrl,
    });
  }

  return documents
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title, "es"))
    .slice(0, MAX_DOCUMENTS);
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    const items = await collectDocuments();
    return withCors(
      NextResponse.json({
        ok: true,
        source: "fekm",
        fetchedAt: new Date().toISOString(),
        count: items.length,
        items,
      })
    );
  } catch (error) {
    return withCors(
      NextResponse.json(
        {
          ok: false,
          source: "fekm",
          fetchedAt: new Date().toISOString(),
          count: 0,
          items: [],
          error: error instanceof Error ? error.message : "No se pudieron cargar los documentos de resultados FEKM.",
        },
        { status: 500 }
      )
    );
  }
}
