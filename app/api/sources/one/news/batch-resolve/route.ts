import {createClient} from "@sanity/client";
import {NextResponse} from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OneOfficialNewsItem = {
  id: string;
  title: string;
  summary?: string;
  bodyText?: string;
  sourceUrl: string;
  canonicalUrl: string;
  publishedAt?: string;
  imageUrl?: string;
};

type SanityNewsRecord = {
  _id: string;
  titulo?: string;
  fuente?: string;
  fuenteId?: string;
  fuenteUrl?: string;
};

type BatchStatus =
  | "existente"
  | "nueva_apta"
  | "sin_contenido"
  | "requiere_revision";

type BatchItem = {
  sourceId: string;
  title: string;
  canonicalUrl: string;
  publishedAt?: string;
  status: BatchStatus;
  existingSanityId?: string;
  existingTitle?: string;
  matchStrategy?: "fuenteId" | "fuenteUrl" | "titulo";
  reasons: string[];
};

const projectId =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
  process.env.SANITY_STUDIO_PROJECT_ID;

const dataset =
  process.env.NEXT_PUBLIC_SANITY_DATASET ||
  process.env.SANITY_STUDIO_DATASET ||
  "production";

const apiVersion =
  process.env.NEXT_PUBLIC_SANITY_API_VERSION ||
  "2025-02-19";

const token = process.env.SANITY_API_WRITE_TOKEN;

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.search = "";

    return url.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return trimmed.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  }
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function baseId(value: string): string {
  return value.replace(/^drafts\./, "");
}

function preferDraft(records: SanityNewsRecord[]): SanityNewsRecord[] {
  const grouped = new Map<string, SanityNewsRecord[]>();

  for (const record of records) {
    const key = baseId(record._id);
    const current = grouped.get(key) ?? [];
    current.push(record);
    grouped.set(key, current);
  }

  return Array.from(grouped.values()).map((group) => {
    return (
      group.find((item) => item._id.startsWith("drafts.")) ??
      group[0]
    );
  });
}

function hasEnoughContent(item: OneOfficialNewsItem): boolean {
  const sourceText =
    getString(item.bodyText) || getString(item.summary);

  return sourceText.length >= 80;
}

function analyzeItem(
  item: OneOfficialNewsItem,
  sanityNews: SanityNewsRecord[]
): BatchItem {
  const canonicalUrl = normalizeUrl(
    item.canonicalUrl || item.sourceUrl
  );

  const bySourceId = sanityNews.find(
    (news) =>
      getString(news.fuenteId) &&
      getString(news.fuenteId) === item.id
  );

  if (bySourceId) {
    return {
      sourceId: item.id,
      title: item.title,
      canonicalUrl,
      publishedAt: item.publishedAt,
      status: "existente",
      existingSanityId: bySourceId._id,
      existingTitle: bySourceId.titulo,
      matchStrategy: "fuenteId",
      reasons: [],
    };
  }

  const bySourceUrl = canonicalUrl
    ? sanityNews.find(
        (news) =>
          normalizeUrl(getString(news.fuenteUrl)) === canonicalUrl
      )
    : undefined;

  if (bySourceUrl) {
    return {
      sourceId: item.id,
      title: item.title,
      canonicalUrl,
      publishedAt: item.publishedAt,
      status: "existente",
      existingSanityId: bySourceUrl._id,
      existingTitle: bySourceUrl.titulo,
      matchStrategy: "fuenteUrl",
      reasons: [],
    };
  }

  const normalizedTitle = normalizeTitle(item.title);
  const byTitle = normalizedTitle
    ? sanityNews.find(
        (news) =>
          normalizeTitle(getString(news.titulo)) === normalizedTitle
      )
    : undefined;

  if (byTitle) {
    return {
      sourceId: item.id,
      title: item.title,
      canonicalUrl,
      publishedAt: item.publishedAt,
      status: "requiere_revision",
      existingSanityId: byTitle._id,
      existingTitle: byTitle.titulo,
      matchStrategy: "titulo",
      reasons: [
        "Existe una noticia con el mismo título normalizado, pero sin identidad de fuente coincidente.",
      ],
    };
  }

  if (!hasEnoughContent(item)) {
    return {
      sourceId: item.id,
      title: item.title,
      canonicalUrl,
      publishedAt: item.publishedAt,
      status: "sin_contenido",
      reasons: [
        "La fuente no aporta al menos 80 caracteres entre resumen y cuerpo.",
      ],
    };
  }

  const reasons: string[] = [];

  if (!canonicalUrl) {
    reasons.push("La noticia no tiene URL canónica válida.");
  }

  if (!getString(item.imageUrl)) {
    reasons.push("La noticia no tiene imagen oficial.");
  }

  if (reasons.length > 0) {
    return {
      sourceId: item.id,
      title: item.title,
      canonicalUrl,
      publishedAt: item.publishedAt,
      status: "requiere_revision",
      reasons,
    };
  }

  return {
    sourceId: item.id,
    title: item.title,
    canonicalUrl,
    publishedAt: item.publishedAt,
    status: "nueva_apta",
    reasons: [],
  };
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!projectId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falta el projectId de Sanity.",
        },
        {
          status: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
          },
        }
      );
    }

    let body: {
      items?: OneOfficialNewsItem[];
    } = {};

    const rawBody = await request.text();

    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody) as {
          items?: OneOfficialNewsItem[];
        };
      } catch {
        return NextResponse.json(
          {
            ok: false,
            error: "El cuerpo recibido no es un JSON válido.",
          },
          {
            status: 400,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "no-store",
            },
          }
        );
      }
    }

    let items = Array.isArray(body.items)
      ? body.items.filter(
          (item) =>
            item &&
            getString(item.id) &&
            getString(item.title)
        )
      : [];

    if (items.length === 0) {
      const origin = new URL(request.url).origin;
      const newsResponse = await fetch(`${origin}/api/sources/one/news`, {
        method: "GET",
        cache: "no-store",
      });

      const newsData = (await newsResponse.json()) as {
        ok?: boolean;
        items?: OneOfficialNewsItem[];
        error?: string;
      };

      if (!newsResponse.ok || !newsData.ok) {
        return NextResponse.json(
          {
            ok: false,
            error:
              newsData.error ||
              "No se pudieron cargar noticias ONE Championship para analizarlas.",
          },
          {
            status: 500,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "no-store",
            },
          }
        );
      }

      items = Array.isArray(newsData.items)
        ? newsData.items.filter(
            (item) =>
              item &&
              getString(item.id) &&
              getString(item.title)
          )
        : [];
    }

    if (items.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se encontraron noticias ONE Championship válidas para analizar.",
        },
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const client = createClient({
      projectId,
      dataset,
      apiVersion,
      token,
      useCdn: false,
      perspective: "raw",
    });

    const records = await client.fetch<SanityNewsRecord[]>(
      `*[
        _type == "noticia" &&
        (
          fuente == "one" ||
          defined(fuenteId) ||
          defined(fuenteUrl)
        )
      ]{
        _id,
        titulo,
        fuente,
        fuenteId,
        fuenteUrl
      }`
    );

    const sanityNews = preferDraft(records);
    const analyzedItems = items.map((item) =>
      analyzeItem(item, sanityNews)
    );

    const summary = {
      existing: analyzedItems.filter(
        (item) => item.status === "existente"
      ).length,
      ready: analyzedItems.filter(
        (item) => item.status === "nueva_apta"
      ).length,
      withoutContent: analyzedItems.filter(
        (item) => item.status === "sin_contenido"
      ).length,
      requiresReview: analyzedItems.filter(
        (item) => item.status === "requiere_revision"
      ).length,
    };

    return NextResponse.json(
      {
        ok: true,
        count: analyzedItems.length,
        summary,
        items: analyzedItems,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Error desconocido analizando noticias ONE Championship.",
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
