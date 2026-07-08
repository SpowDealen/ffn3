import { NextResponse } from "next/server";
import { client } from "../../../../../../sanity/lib/client";
import type {
  ExternalNewsItem,
  ExternalSourceId,
} from "../../../../../../_laboratorio/laboratorio-ia/src/sources/types";
import {
  getExternalNewsSource,
  getEnabledExternalNewsSources,
} from "../../../../../../_laboratorio/laboratorio-ia/src/sources/sourceRegistry";
import { isExternalSourceId } from "../../../../../../_laboratorio/laboratorio-ia/src/sources/types";

type ExternalNewsBatchResolveStatus =
  | "apta"
  | "revision"
  | "insuficiente"
  | "descartar"
  | "duplicada"
  | "error";

type ExternalNewsBatchResolveItem = {
  id: string;
  title: string;
  sourceName: string;
  url: string;
  status: ExternalNewsBatchResolveStatus;
  reason: string;
  relevancia: "alta" | "media" | "baja" | "descartar";
  confidence: number;
  disciplineLabel: string;
  organizationLabel: string;
  fighterHints: string[];
  warnings: string[];
};

type ExternalNewsBatchResolveSummary = {
  total: number;
  aptas: number;
  revision: number;
  insuficientes: number;
  descartadas: number;
  duplicadas: number;
  errores: number;
};

type ExternalNewsBatchResolveResponse =
  | {
      ok: true;
      data: {
        source: ExternalSourceId;
        sourceName: string;
        resolvedAt: string;
        summary: ExternalNewsBatchResolveSummary;
        items: ExternalNewsBatchResolveItem[];
      };
    }
  | {
      ok: false;
      error: string;
    };

type BatchResolveBody = {
  source?: string;
  items?: ExternalNewsItem[];
};

type ExistingNewsDoc = {
  _id: string;
  titulo?: string;
  fuenteId?: string;
  fuenteUrl?: string;
  _createdAt?: string;
};

const MAX_BATCH_ITEMS = 15;
const MIN_BODY_LENGTH = 220;
const GOOD_BODY_LENGTH = 900;

const COMBAT_KEYWORDS = [
  "ufc",
  "mma",
  "boxeo",
  "boxeador",
  "boxeadora",
  "combate",
  "peleador",
  "peleadora",
  "bkfc",
  "bare knuckle",
  "one championship",
  "kickboxing",
  "muay thai",
  "grappling",
  "jiu jitsu",
  "jijitsu",
  "mma fighting",
] as const;

const HIGH_RELEVANCE_KEYWORDS = [
  "ufc",
  "bkfc",
  "one championship",
  "título",
  "titulo",
  "campeón",
  "campeona",
  "campeonato",
  "pelea estelar",
  "main event",
  "ko",
  "nocaut",
  "sumisión",
  "decision",
  "resultado",
  "firma",
  "fichaje",
  "lesión",
  "lesion",
] as const;

function getAllowedOrigin(request: Request): string {
  const origin = request.headers.get("origin")?.trim();

  if (!origin) {
    return "*";
  }

  const allowedOrigins = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);

  return allowedOrigins.has(origin) ? origin : "*";
}

function jsonWithCors(
  request: Request,
  payload: ExternalNewsBatchResolveResponse,
  init?: ResponseInit
): NextResponse {
  const response = NextResponse.json(payload, init);
  response.headers.set("Content-Type", "application/json; charset=utf-8");
  response.headers.set("Access-Control-Allow-Origin", getAllowedOrigin(request));
  response.headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Vary", "Origin");

  return response;
}

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", getAllowedOrigin(request));
  response.headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Vary", "Origin");
  return response;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSourceUrl(value: string | undefined): string {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value.trim());

    url.hash = "";

    for (const key of Array.from(url.searchParams.keys())) {
      const normalizedKey = key.toLowerCase();

      if (
        normalizedKey.startsWith("utm_") ||
        normalizedKey === "fbclid" ||
        normalizedKey === "gclid" ||
        normalizedKey === "igshid" ||
        normalizedKey === "ref" ||
        normalizedKey === "outputtype"
      ) {
        url.searchParams.delete(key);
      }
    }

    return url.toString().replace(/\/+$/, "");
  } catch {
    return value.trim().replace(/\/+$/, "");
  }
}

function getExternalItemDuplicateKeys(item: ExternalNewsItem): string[] {
  return [
    item.id ? `id:${item.id}` : "",
    item.canonicalUrl ? `url:${item.canonicalUrl}` : "",
    item.sourceUrl ? `url:${item.sourceUrl}` : "",
    item.canonicalUrl ? `url-normalized:${normalizeSourceUrl(item.canonicalUrl)}` : "",
    item.sourceUrl ? `url-normalized:${normalizeSourceUrl(item.sourceUrl)}` : "",
  ].filter(Boolean);
}

function getSearchText(item: ExternalNewsItem): string {
  return normalizeText(
    [
      item.title,
      item.excerpt,
      item.bodyText,
      item.canonicalUrl,
      item.sourceUrl,
      ...item.tags,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function hasAnyKeyword(searchText: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => searchText.includes(normalizeText(keyword)));
}

function inferDisciplineLabel(searchText: string): string {
  if (searchText.includes("bare knuckle") || searchText.includes("bkfc")) {
    return "Bare Knuckle";
  }

  if (searchText.includes("kickboxing") || searchText.includes("glory")) {
    return "Kickboxing";
  }

  if (searchText.includes("muay thai") || searchText.includes("one championship")) {
    return "Muay Thai / MMA";
  }

  if (searchText.includes("boxeo") || searchText.includes("boxeador")) {
    return "Boxeo";
  }

  if (searchText.includes("jiu jitsu") || searchText.includes("jijitsu") || searchText.includes("grappling")) {
    return "Jiu-Jitsu";
  }

  if (searchText.includes("ufc") || searchText.includes("mma") || searchText.includes("pfl") || searchText.includes("bellator")) {
    return "MMA";
  }

  return "Pendiente de análisis";
}

function inferOrganizationLabel(searchText: string): string {
  if (searchText.includes("ufc")) {
    return "UFC";
  }

  if (searchText.includes("bkfc")) {
    return "BKFC";
  }

  if (searchText.includes("one championship") || searchText.includes("one fc")) {
    return "ONE Championship";
  }

  if (searchText.includes("pfl")) {
    return "PFL";
  }

  if (searchText.includes("bellator")) {
    return "Bellator";
  }

  if (searchText.includes("glory")) {
    return "GLORY";
  }

  return "Pendiente de análisis";
}

function inferFighterHints(item: ExternalNewsItem): string[] {
  const sourceValues = [item.title, item.excerpt ?? ""];
  const candidates = new Set<string>();

  for (const value of sourceValues) {
    const matches = value.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}\b/g);

    for (const match of matches ?? []) {
      const clean = match.trim();
      const normalized = normalizeText(clean);

      if (
        clean.length >= 5 &&
        !normalized.includes("full fight") &&
        !normalized.includes("marca") &&
        !normalized.includes("deportes")
      ) {
        candidates.add(clean);
      }
    }
  }

  return Array.from(candidates).slice(0, 6);
}

function getQualityWarnings(item: ExternalNewsItem): string[] {
  const warnings: string[] = [];
  const bodyLength = item.bodyText?.trim().length ?? 0;

  if (bodyLength === 0) {
    warnings.push("Sin cuerpo completo fiable.");
  } else if (bodyLength < GOOD_BODY_LENGTH) {
    warnings.push("Cuerpo corto: revisar contexto antes de convertir en borrador.");
  }

  if (!item.publishedAt) {
    warnings.push("Fecha no disponible.");
  }

  if (!item.image?.url) {
    warnings.push("Sin imagen principal.");
  }

  return warnings;
}

function buildExistingKeySet(existingNews: ExistingNewsDoc[]): Set<string> {
  const keys = new Set<string>();

  for (const item of existingNews) {
    if (item.fuenteId) {
      keys.add(`id:${item.fuenteId}`);
    }

    if (item.fuenteUrl) {
      keys.add(`url:${item.fuenteUrl}`);
      keys.add(`url-normalized:${normalizeSourceUrl(item.fuenteUrl)}`);
    }
  }

  return keys;
}


function getDuplicateReadClient() {
  const token = process.env.SANITY_API_WRITE_TOKEN;

  return client.withConfig({
    useCdn: false,
    token,
    perspective: token ? "raw" : "published",
  });
}

async function fetchExistingNews(items: ExternalNewsItem[]): Promise<ExistingNewsDoc[]> {
  const ids = Array.from(new Set(items.map((item) => item.id).filter(Boolean)));
  const urls = Array.from(
    new Set(
      items
        .flatMap((item) => [item.canonicalUrl, item.sourceUrl])
        .filter(Boolean)
    )
  );

  if (ids.length === 0 && urls.length === 0) {
    return [];
  }

  const duplicateClient = getDuplicateReadClient();

  return duplicateClient.fetch<ExistingNewsDoc[]>(
    `
      *[_type == "noticia" && (
        fuenteId in $ids ||
        fuenteUrl in $urls ||
        defined(fuenteId) ||
        defined(fuenteUrl)
      )] | order(_createdAt desc)[0...1500] {
        _id,
        _createdAt,
        titulo,
        fuenteId,
        fuenteUrl
      }
    `,
    { ids, urls },
    { cache: "no-store" }
  );
}

function classifyExternalNewsItem(
  item: ExternalNewsItem,
  existingKeys: Set<string>
): ExternalNewsBatchResolveItem {
  try {
    const searchText = getSearchText(item);
    const bodyLength = item.bodyText?.trim().length ?? 0;
    const warnings = getQualityWarnings(item);
    const duplicateKeys = getExternalItemDuplicateKeys(item);
    const isDuplicate = duplicateKeys.some((key) => existingKeys.has(key));
    const isCombatRelevant = hasAnyKeyword(searchText, COMBAT_KEYWORDS);
    const isHighRelevance = hasAnyKeyword(searchText, HIGH_RELEVANCE_KEYWORDS);
    const disciplineLabel = inferDisciplineLabel(searchText);
    const organizationLabel = inferOrganizationLabel(searchText);
    const fighterHints = inferFighterHints(item);

    if (isDuplicate) {
      return {
        id: item.id,
        title: item.title,
        sourceName: item.sourceName,
        url: item.canonicalUrl || item.sourceUrl,
        status: "duplicada",
        reason: "Ya existe una noticia con el mismo identificador o URL de fuente.",
        relevancia: "baja",
        confidence: 95,
        disciplineLabel,
        organizationLabel,
        fighterHints,
        warnings,
      };
    }

    if (!isCombatRelevant) {
      return {
        id: item.id,
        title: item.title,
        sourceName: item.sourceName,
        url: item.canonicalUrl || item.sourceUrl,
        status: "descartar",
        reason: "No parece suficientemente relacionada con deportes de combate.",
        relevancia: "descartar",
        confidence: 65,
        disciplineLabel,
        organizationLabel,
        fighterHints,
        warnings,
      };
    }

    if (bodyLength > 0 && bodyLength < MIN_BODY_LENGTH) {
      return {
        id: item.id,
        title: item.title,
        sourceName: item.sourceName,
        url: item.canonicalUrl || item.sourceUrl,
        status: "insuficiente",
        reason: "Contenido demasiado corto para preparar un borrador fiable.",
        relevancia: "baja",
        confidence: 70,
        disciplineLabel,
        organizationLabel,
        fighterHints,
        warnings,
      };
    }

    if (bodyLength === 0) {
      return {
        id: item.id,
        title: item.title,
        sourceName: item.sourceName,
        url: item.canonicalUrl || item.sourceUrl,
        status: "insuficiente",
        reason: "No hay cuerpo completo; requiere revisión manual antes de redactar.",
        relevancia: isHighRelevance ? "media" : "baja",
        confidence: 55,
        disciplineLabel,
        organizationLabel,
        fighterHints,
        warnings,
      };
    }

    if (disciplineLabel === "Pendiente de análisis" || organizationLabel === "Pendiente de análisis") {
      return {
        id: item.id,
        title: item.title,
        sourceName: item.sourceName,
        url: item.canonicalUrl || item.sourceUrl,
        status: "revision",
        reason: "Relevante, pero necesita confirmar disciplina u organización antes de crear noticia.",
        relevancia: isHighRelevance ? "media" : "baja",
        confidence: 62,
        disciplineLabel,
        organizationLabel,
        fighterHints,
        warnings,
      };
    }

    if (warnings.length > 0) {
      return {
        id: item.id,
        title: item.title,
        sourceName: item.sourceName,
        url: item.canonicalUrl || item.sourceUrl,
        status: "revision",
        reason: "Parece útil, pero tiene avisos de calidad que conviene revisar.",
        relevancia: isHighRelevance ? "alta" : "media",
        confidence: isHighRelevance ? 78 : 70,
        disciplineLabel,
        organizationLabel,
        fighterHints,
        warnings,
      };
    }

    return {
      id: item.id,
      title: item.title,
      sourceName: item.sourceName,
      url: item.canonicalUrl || item.sourceUrl,
      status: "apta",
      reason: "Noticia relevante con contenido suficiente para análisis editorial individual.",
      relevancia: isHighRelevance ? "alta" : "media",
      confidence: isHighRelevance ? 88 : 80,
      disciplineLabel,
      organizationLabel,
      fighterHints,
      warnings,
    };
  } catch (error) {
    return {
      id: item.id,
      title: item.title || "Noticia sin título",
      sourceName: item.sourceName || "Fuente externa",
      url: item.canonicalUrl || item.sourceUrl || "",
      status: "error",
      reason:
        error instanceof Error
          ? error.message
          : "Error desconocido clasificando la noticia.",
      relevancia: "descartar",
      confidence: 0,
      disciplineLabel: "Pendiente de análisis",
      organizationLabel: "Pendiente de análisis",
      fighterHints: [],
      warnings: [],
    };
  }
}

function createSummary(items: ExternalNewsBatchResolveItem[]): ExternalNewsBatchResolveSummary {
  return {
    total: items.length,
    aptas: items.filter((item) => item.status === "apta").length,
    revision: items.filter((item) => item.status === "revision").length,
    insuficientes: items.filter((item) => item.status === "insuficiente").length,
    descartadas: items.filter((item) => item.status === "descartar").length,
    duplicadas: items.filter((item) => item.status === "duplicada").length,
    errores: items.filter((item) => item.status === "error").length,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as BatchResolveBody;
    const rawSource = body.source?.trim() ?? "";

    if (!isExternalSourceId(rawSource)) {
      return jsonWithCors(
        request,
        {
          ok: false,
          error: `Fuente externa no soportada. Fuentes activas: ${getEnabledExternalNewsSources()
            .map((source) => source.name)
            .join(", ")}.`,
        },
        { status: 400 }
      );
    }

    const sourceDefinition = getExternalNewsSource(rawSource);

    if (!sourceDefinition?.enabled) {
      return jsonWithCors(
        request,
        {
          ok: false,
          error: "La fuente externa solicitada no está activa.",
        },
        { status: 400 }
      );
    }

    const inputItems = Array.isArray(body.items) ? body.items : [];
    const items = inputItems
      .filter((item) => item.source === rawSource && item.title && item.id)
      .slice(0, MAX_BATCH_ITEMS);

    if (items.length === 0) {
      return jsonWithCors(
        request,
        {
          ok: false,
          error: "No se recibieron noticias externas válidas para preparar.",
        },
        { status: 400 }
      );
    }

    const existingNews = await fetchExistingNews(items);
    const existingKeys = buildExistingKeySet(existingNews);
    const resolvedItems = items.map((item) => classifyExternalNewsItem(item, existingKeys));

    return jsonWithCors(request, {
      ok: true,
      data: {
        source: rawSource,
        sourceName: sourceDefinition.name,
        resolvedAt: new Date().toISOString(),
        summary: createSummary(resolvedItems),
        items: resolvedItems,
      },
    });
  } catch (error) {
    return jsonWithCors(
      request,
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Error desconocido preparando noticias externas.",
      },
      { status: 500 }
    );
  }
}
