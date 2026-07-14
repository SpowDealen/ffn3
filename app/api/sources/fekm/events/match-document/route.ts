import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DisciplineKey = "kickboxing" | "muay_thai" | "mixed";

type FekmEvent = {
  id?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  city?: string;
  venue?: string;
  discipline?: DisciplineKey;
  disciplineLabel?: string;
  canonicalUrl?: string;
  sourceUrl?: string;
};

type FekmDocument = {
  id?: string;
  title?: string;
  year?: number;
  discipline?: Exclude<DisciplineKey, "mixed">;
  disciplineLabel?: string;
  scope?: string;
  sourcePageUrl?: string;
  pdfUrl?: string;
};

type MatchRequest = {
  event?: FekmEvent;
  documents?: FekmDocument[];
};

type MatchCandidate = {
  document: FekmDocument;
  score: number;
  confidence: "alta" | "media" | "baja";
  reasons: string[];
  warnings: string[];
};

const STOP_WORDS = new Set([
  "resultado",
  "resultados",
  "result",
  "results",
  "book",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "y",
  "en",
  "por",
  "para",
  "cto",
  "campeonato",
  "espana",
  "espanol",
  "espanola",
  "fekm",
  "2024",
  "2025",
  "2026",
]);

function withCors(response: NextResponse): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalize(value: unknown): string {
  if (typeof value !== "string") return "";

  return stripDiacritics(value)
    .toLowerCase()
    .replace(/\bmuay\s*thai\b/g, "muaythai")
    .replace(/\bkick\s*boxing\b/g, "kickboxing")
    .replace(/\bkb\b/g, "kickboxing")
    .replace(/\bkst\b/g, "kickboxing stars league")
    .replace(/\bcto\.?\b/g, "campeonato")
    .replace(/\besp\.?\b/g, "espana")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: unknown): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function eventYear(event: FekmEvent): number | undefined {
  const match = event.startDate?.match(/^(\d{4})/);
  if (!match) return undefined;

  const year = Number(match[1]);
  return Number.isFinite(year) ? year : undefined;
}

function intersectionSize(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  return unique(left).filter((item) => rightSet.has(item)).length;
}

function tokenSimilarity(left: string[], right: string[]): number {
  const leftUnique = unique(left);
  const rightUnique = unique(right);
  const union = new Set([...leftUnique, ...rightUnique]);

  if (union.size === 0) return 0;

  return intersectionSize(leftUnique, rightUnique) / union.size;
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function inferEventProfile(event: FekmEvent): {
  senior: boolean;
  junior: boolean;
  cadet: boolean;
  child: boolean;
  schoolAge: boolean;
  veteran: boolean;
  starsLeague: boolean;
  santander: boolean;
  muayThai: boolean;
} {
  const value = normalize(
    `${event.name ?? ""} ${event.city ?? ""} ${event.venue ?? ""}`,
  );

  return {
    senior: value.includes("senior"),
    junior: value.includes("junior"),
    cadet: includesAny(value, ["cadete", "cadet"]),
    child: includesAny(value, ["infantil", "child"]),
    schoolAge: includesAny(value, [
      "edad escolar",
      "escolar",
      "cesa",
      "junior cadete infantil",
    ]),
    veteran: includesAny(value, ["veterano", "veteranos"]),
    starsLeague: includesAny(value, [
      "kickboxing stars league",
      "stars league",
    ]),
    santander: value.includes("santander"),
    muayThai:
      event.discipline === "muay_thai" || value.includes("muaythai"),
  };
}

function inferDocumentProfile(document: FekmDocument): ReturnType<typeof inferEventProfile> {
  return inferEventProfile({
    name: document.title,
    discipline: document.discipline,
  });
}

function scoreCandidate(
  event: FekmEvent,
  document: FekmDocument,
): MatchCandidate {
  let score = 0;
  const reasons: string[] = [];
  const warnings: string[] = [];

  const eventName = normalize(event.name);
  const documentTitle = normalize(document.title);
  const eventTokens = tokenize(event.name);
  const documentTokens = tokenize(document.title);
  const year = eventYear(event);

  if (
    event.discipline &&
    event.discipline !== "mixed" &&
    document.discipline &&
    event.discipline !== document.discipline
  ) {
    return {
      document,
      score: 0,
      confidence: "baja",
      reasons: [],
      warnings: ["disciplina_incompatible"],
    };
  }

  if (event.discipline && document.discipline) {
    score += 20;
    reasons.push("misma_disciplina");
  }

  if (year && document.year === year) {
    score += 30;
    reasons.push("mismo_ano");
  } else if (year && document.year && document.year !== year) {
    score -= 35;
    warnings.push("ano_distinto");
  }

  const similarity = tokenSimilarity(eventTokens, documentTokens);
  const similarityPoints = Math.round(similarity * 35);
  score += similarityPoints;

  if (similarity >= 0.5) {
    reasons.push("nombre_muy_similar");
  } else if (similarity >= 0.25) {
    reasons.push("nombre_parcialmente_similar");
  }

  const city = normalize(event.city);
  if (city && documentTitle.includes(city)) {
    score += 20;
    reasons.push("misma_ciudad");
  }

  const eventProfile = inferEventProfile(event);
  const documentProfile = inferDocumentProfile(document);

  if (eventProfile.muayThai && documentProfile.muayThai) {
    score += 15;
    reasons.push("muaythai_coincidente");
  }

  if (eventProfile.starsLeague && documentProfile.starsLeague) {
    score += 20;
    reasons.push("stars_league_coincidente");
  }

  if (
    eventProfile.starsLeague &&
    eventProfile.santander &&
    documentProfile.starsLeague &&
    documentProfile.santander
  ) {
    score += 20;
    reasons.push("stars_league_santander_exacta");
  }

  if (eventProfile.senior && documentProfile.senior) {
    score += 15;
    reasons.push("grupo_senior_coincidente");
  }

  if (eventProfile.veteran && documentProfile.veteran) {
    score += 10;
    reasons.push("grupo_veteranos_coincidente");
  }

  if (eventProfile.schoolAge) {
    const exactSchoolAgeDocument =
      documentProfile.schoolAge ||
      (documentProfile.junior &&
        documentProfile.cadet &&
        documentProfile.child)

    if (exactSchoolAgeDocument) {
      score += 38;
      reasons.push("edad_escolar_exacta");
    } else if (
      documentProfile.junior ||
      documentProfile.cadet ||
      documentProfile.child
    ) {
      score += 12;
      reasons.push("edad_escolar_parcial");
    }

    if (
      documentProfile.senior ||
      documentProfile.veteran
    ) {
      score -= 28;
      warnings.push("documento_senior_no_prioritario_para_edad_escolar");
    }
  }

  if (
    eventProfile.senior &&
    (documentProfile.schoolAge ||
      documentProfile.cadet ||
      documentProfile.child)
  ) {
    score -= 24;
    warnings.push("documento_edad_escolar_no_prioritario_para_senior");
  }

  if (
    eventProfile.junior &&
    documentProfile.junior
  ) {
    score += 8;
    reasons.push("grupo_junior_coincidente");
  }

  if (
    eventName.includes("campeonato espana") &&
    documentTitle.includes("campeonato espana")
  ) {
    score += 12;
    reasons.push("campeonato_espana_coincidente");
  }

  score = Math.max(0, Math.min(100, score));

  const confidence: MatchCandidate["confidence"] =
    score >= 75 ? "alta" : score >= 50 ? "media" : "baja";

  return {
    document,
    score,
    confidence,
    reasons: unique(reasons),
    warnings: unique(warnings),
  };
}

async function loadDocuments(request: Request): Promise<FekmDocument[]> {
  const url = new URL(request.url);
  const documentsUrl = new URL(
    "/api/sources/fekm/participants/documents",
    url.origin,
  );

  documentsUrl.searchParams.set("refresh", String(Date.now()));

  const response = await fetch(documentsUrl, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const payload = (await response.json()) as {
    ok?: boolean;
    items?: FekmDocument[];
    error?: string;
  };

  if (!response.ok || payload.ok !== true || !Array.isArray(payload.items)) {
    throw new Error(
      payload.error || "No se pudieron cargar los documentos FEKM.",
    );
  }

  return payload.items;
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as MatchRequest;
    const event = body.event;

    if (!event?.name || !event.startDate) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            source: "fekm",
            error: "Debes enviar un evento FEKM con nombre y fecha.",
          },
          { status: 400 },
        ),
      );
    }

    const documents =
      Array.isArray(body.documents) && body.documents.length > 0
        ? body.documents
        : await loadDocuments(request);

    const ranked = documents
      .map((document) => scoreCandidate(event, document))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score);

    const best = ranked[0] ?? null;
    const second = ranked[1] ?? null;
    const scoreGap = best && second ? best.score - second.score : best?.score ?? 0;

    const automatic =
      Boolean(best) &&
      best!.confidence === "alta" &&
      scoreGap >= 10 &&
      !best!.warnings.includes("disciplina_incompatible");

    return withCors(
      NextResponse.json({
        ok: true,
        source: "fekm",
        event,
        match: best
          ? {
              automatic,
              scoreGap,
              document: best.document,
              score: best.score,
              confidence: best.confidence,
              reasons: best.reasons,
              warnings: best.warnings,
            }
          : null,
        alternatives: ranked.slice(1, 5),
        summary: {
          documentsChecked: documents.length,
          candidates: ranked.length,
          automatic,
          confidence: best?.confidence ?? "baja",
        },
      }),
    );
  } catch (error) {
    return withCors(
      NextResponse.json(
        {
          ok: false,
          source: "fekm",
          error:
            error instanceof Error
              ? error.message
              : "No se pudo relacionar el evento FEKM con su documento.",
        },
        { status: 500 },
      ),
    );
  }
}
