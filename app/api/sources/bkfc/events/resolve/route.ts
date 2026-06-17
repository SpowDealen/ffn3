import { NextResponse } from "next/server";
import { createClient } from "@sanity/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sanityClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion:
    process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-03-01",
  token: process.env.SANITY_API_WRITE_TOKEN!,
  useCdn: false,
});

type FightCardSection = "principal" | "preliminar";

type BkfcFightCardItem = {
  id: string;
  section: FightCardSection;
  sectionLabel: "Main Card" | "Prelims";
  order: number;
  redFighter: string;
  blueFighter: string;
  weightClass?: string;
  titleFight: boolean;
  status: "programado" | "finalizado" | "cancelado";
  winnerName?: string;
  method?: string;
  round?: number;
  time?: string;
};

type ResolveEventBody = {
  event?: {
    id?: string;
    name?: string;
    canonicalUrl?: string;
    startDate?: string;
    fightCard?: BkfcFightCardItem[];
  };
};

type SanityReferenceDoc = {
  _id: string;
  nombre?: string;
  slug?: { current?: string };
};

type SanityEventDoc = SanityReferenceDoc & {
  fecha?: string;
  disciplina?: { _ref?: string } | null;
  organizacion?: { _ref?: string } | null;
};

type SanityFighterDoc = SanityReferenceDoc & {
  disciplina?: { _ref?: string } | null;
  organizacion?: { _ref?: string } | null;
  categoriaPeso?: { _ref?: string } | null;
};

type SanityCategoryDoc = SanityReferenceDoc & {
  disciplina?: { _ref?: string } | null;
};

type SanityCombatDoc = {
  _id: string;
  evento?: { _ref?: string } | null;
  luchadorRojo?: { _ref?: string } | null;
  luchadorAzul?: { _ref?: string } | null;
};

type ResolvedReference = {
  sourceName: string;
  normalizedName: string;
  found: boolean;
  sanityId?: string;
  sanityName?: string;
};

type ResolvedCategory = {
  sourceLabel: string;
  normalizedLabel: string;
  found: boolean;
  sanityId?: string;
  sanityName?: string;
};

type ResolvedFight = {
  sourceFightId: string;
  section: FightCardSection;
  sectionLabel: "Main Card" | "Prelims";
  order: number;
  redFighter: ResolvedReference;
  blueFighter: ResolvedReference;
  category: ResolvedCategory;
  titleFight: boolean;
  status: "programado" | "finalizado" | "cancelado";
  winner?: ResolvedReference;
  method?: string;
  round?: number;
  time?: string;
  readyToCreate: boolean;
  alreadyExists: boolean;
  existingSanityId?: string;
  blockingReasons: string[];
};

type ResolveEventResponse =
  | {
      ok: true;
      event: {
        sourceName: string;
        found: boolean;
        sanityId?: string;
        sanityName?: string;
        matchStrategy?: "exact_name" | "exact_slug" | "headliners" | "headliners_and_date";
        candidates?: Array<{
          sanityId: string;
          sanityName?: string;
          slug?: string;
          fecha?: string;
        }>;
      };
      discipline: {
        found: boolean;
        sanityId?: string;
        sanityName?: string;
      };
      organization: {
        found: boolean;
        sanityId?: string;
        sanityName?: string;
      };
      counts: {
        fights: number;
        readyFights: number;
        existingFights: number;
        pendingFights: number;
        existingFighters: number;
        missingFighters: number;
        resolvedCategories: number;
        unresolvedCategories: number;
      };
      existingFighters: ResolvedReference[];
      missingFighters: ResolvedReference[];
      resolvedCategories: ResolvedCategory[];
      unresolvedCategories: ResolvedCategory[];
      fights: ResolvedFight[];
    }
  | {
      ok: false;
      error: string;
    };

const CATEGORY_ALIASES: Record<string, string[]> = {
  "women strawweight": [
    "peso paja femenino",
    "paja femenino",
    "peso paja",
    "paja",
  ],
  "women flyweight": [
    "peso mosca femenino",
    "mosca femenino",
    "peso mosca",
    "mosca",
  ],
  "women bantamweight": [
    "peso gallo femenino",
    "gallo femenino",
    "peso gallo",
    "gallo",
  ],
  "men flyweight": [
    "peso mosca",
    "mosca",
  ],
  "flyweight": [
    "peso mosca",
    "mosca",
  ],
  "bantamweight": [
    "peso gallo",
    "gallo",
  ],
  "featherweight": [
    "peso pluma",
    "pluma",
  ],
  "lightweight": [
    "peso ligero",
    "ligero",
  ],
  "welterweight": [
    "peso wélter",
    "peso welter",
    "wélter",
    "welter",
  ],
  "middleweight": [
    "peso medio",
    "medio",
  ],
  "light heavyweight": [
    "peso semipesado",
    "semipesado",
  ],
  "cruiserweight": [
    "peso crucero",
    "crucero",
  ],
  "heavyweight": [
    "peso pesado",
    "pesado",
  ],
  "catchweight": [
    "peso pactado",
    "catchweight",
  ],
};

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

function withCors(response: NextResponse, request: Request): NextResponse {
  const allowedOrigin = getAllowedOrigin(request);

  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Vary", "Origin");
  response.headers.set("Cache-Control", "no-store");

  return response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeEntityName(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWeightClass(value: string): string {
  return normalizeEntityName(
    value
      .replace(/\binterim\b/gi, "")
      .replace(/\btitle\b/gi, "")
      .replace(/\bbout\b/gi, "")
      .replace(/\bchampionship\b/gi, "")
  );
}

function uniqueByNormalizedName<T extends { normalizedName: string }>(
  items: T[]
): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const item of items) {
    if (seen.has(item.normalizedName)) {
      continue;
    }

    seen.add(item.normalizedName);
    unique.push(item);
  }

  return unique;
}

function uniqueCategories(items: ResolvedCategory[]): ResolvedCategory[] {
  const seen = new Set<string>();
  const unique: ResolvedCategory[] = [];

  for (const item of items) {
    if (seen.has(item.normalizedLabel)) {
      continue;
    }

    seen.add(item.normalizedLabel);
    unique.push(item);
  }

  return unique;
}

function resolveReferenceByName(
  sourceName: string,
  docs: SanityReferenceDoc[]
): ResolvedReference {
  const normalizedName = normalizeEntityName(sourceName);

  const exactMatch = docs.find(
    (doc) => normalizeEntityName(getString(doc.nombre)) === normalizedName
  );

  return exactMatch
    ? {
        sourceName,
        normalizedName,
        found: true,
        sanityId: exactMatch._id,
        sanityName: getString(exactMatch.nombre),
      }
    : {
        sourceName,
        normalizedName,
        found: false,
      };
}

function resolveCategory(
  sourceLabel: string | undefined,
  categories: SanityCategoryDoc[]
): ResolvedCategory {
  const cleanSourceLabel = getString(sourceLabel);
  const normalizedLabel = normalizeWeightClass(cleanSourceLabel);

  if (!cleanSourceLabel || !normalizedLabel) {
    return {
      sourceLabel: cleanSourceLabel,
      normalizedLabel,
      found: false,
    };
  }

  const aliasCandidates = CATEGORY_ALIASES[normalizedLabel] ?? [normalizedLabel];
  const normalizedAliases = aliasCandidates.map(normalizeEntityName);

  const match = categories.find((category) => {
    const categoryName = normalizeEntityName(getString(category.nombre));

    return normalizedAliases.includes(categoryName);
  });

  return match
    ? {
        sourceLabel: cleanSourceLabel,
        normalizedLabel,
        found: true,
        sanityId: match._id,
        sanityName: getString(match.nombre),
      }
    : {
        sourceLabel: cleanSourceLabel,
        normalizedLabel,
        found: false,
      };
}

async function fetchResolutionData(): Promise<{
  discipline?: SanityReferenceDoc;
  organization?: SanityReferenceDoc;
  events: SanityEventDoc[];
  fighters: SanityFighterDoc[];
  categories: SanityCategoryDoc[];
}> {
  const [discipline, organization, events, fighters, categories] =
    await Promise.all([
      sanityClient.fetch<SanityReferenceDoc | null>(
        `*[_type == "disciplina" && lower(nombre) == "bare knuckle"][0]{_id,nombre,slug}`,
        {},
        { perspective: "raw" }
      ),
      sanityClient.fetch<SanityReferenceDoc | null>(
        `*[_type == "organizacion" && lower(nombre) == "bkfc"][0]{_id,nombre,slug}`,
        {},
        { perspective: "raw" }
      ),
      sanityClient.fetch<SanityEventDoc[]>(
        `*[_type == "evento"]{_id,nombre,slug,fecha,disciplina,organizacion}`,
        {},
        { perspective: "raw" }
      ),
      sanityClient.fetch<SanityFighterDoc[]>(
        `*[_type == "luchador"]{_id,nombre,slug,disciplina,organizacion,categoriaPeso}`,
        {},
        { perspective: "raw" }
      ),
      sanityClient.fetch<SanityCategoryDoc[]>(
        `*[_type == "categoriaPeso"]{_id,nombre,slug,disciplina}`,
        {},
        { perspective: "raw" }
      ),
    ]);

  return {
    discipline: discipline ?? undefined,
    organization: organization ?? undefined,
    events: preferDraft(events),
    fighters: preferDraft(fighters),
    categories: preferDraft(categories),
  };
}

function preferDraft<T extends { _id: string }>(
  docs: T[]
): T[] {
  const grouped = new Map<string, T>();

  for (const doc of docs) {
    const baseId = doc._id.replace(/^drafts\./, "");
    const current = grouped.get(baseId);

    if (!current || doc._id.startsWith("drafts.")) {
      grouped.set(baseId, doc);
    }
  }

  return Array.from(grouped.values());
}

function createComparableSlug(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[’‘`´']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractHeadlinerTokens(sourceName: string): string[] {
  const normalized = normalizeEntityName(sourceName)
    .replace(/\bcontra\b/g, " vs ")
    .replace(/\bversus\b/g, " vs ");

  const titlePart = normalized.includes(":")
    ? normalized.split(":").slice(1).join(":")
    : normalized;

  const parts = titlePart
    .split(/\bvs\b/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return [];
  }

  return parts.slice(0, 2).map((part) => {
    const tokens = part.split(" ").filter(Boolean);
    return tokens.at(-1) ?? "";
  }).filter(Boolean);
}

function hasAllHeadliners(
  eventName: string,
  headliners: string[]
): boolean {
  if (headliners.length < 2) {
    return false;
  }

  const normalizedEventName = normalizeEntityName(eventName);

  return headliners.every((token) =>
    normalizedEventName.includes(token)
  );
}

function isSameEventDate(
  sourceStartDate: string | undefined,
  sanityDate: string | undefined
): boolean {
  if (!sourceStartDate || !sanityDate) {
    return false;
  }

  const sourceTimestamp = new Date(sourceStartDate).getTime();
  const sanityTimestamp = new Date(sanityDate).getTime();

  if (
    Number.isNaN(sourceTimestamp) ||
    Number.isNaN(sanityTimestamp)
  ) {
    return false;
  }

  const difference = Math.abs(sourceTimestamp - sanityTimestamp);
  return difference <= 36 * 60 * 60 * 1000;
}

function findEvent(params: {
  sourceName: string;
  sourceStartDate?: string;
  events: SanityEventDoc[];
}): {
  event?: SanityEventDoc;
  strategy?: "exact_name" | "exact_slug" | "headliners" | "headliners_and_date";
} {
  const {
    sourceName,
    sourceStartDate,
    events,
  } = params;

  const preferredEvents = preferDraft(events);
  const normalizedSourceName = normalizeEntityName(sourceName);
  const sourceSlug = createComparableSlug(sourceName);

  const exactName = preferredEvents.find(
    (event) =>
      normalizeEntityName(getString(event.nombre)) ===
      normalizedSourceName
  );

  if (exactName) {
    return {
      event: exactName,
      strategy: "exact_name",
    };
  }

  const exactSlug = preferredEvents.find(
    (event) =>
      createComparableSlug(
        getString(event.slug?.current)
      ) === sourceSlug
  );

  if (exactSlug) {
    return {
      event: exactSlug,
      strategy: "exact_slug",
    };
  }

  const headliners = extractHeadlinerTokens(sourceName);

  const headlinerAndDateMatch = preferredEvents.find(
    (event) =>
      hasAllHeadliners(
        getString(event.nombre),
        headliners
      ) &&
      isSameEventDate(
        sourceStartDate,
        event.fecha
      )
  );

  if (headlinerAndDateMatch) {
    return {
      event: headlinerAndDateMatch,
      strategy: "headliners_and_date",
    };
  }

  const headlinerMatches = preferredEvents.filter(
    (event) =>
      hasAllHeadliners(
        getString(event.nombre),
        headliners
      )
  );

  if (headlinerMatches.length === 1) {
    return {
      event: headlinerMatches[0],
      strategy: "headliners",
    };
  }

  return {};
}


function getEventCandidates(
  sourceStartDate: string | undefined,
  events: SanityEventDoc[]
): Array<{
  sanityId: string;
  sanityName?: string;
  slug?: string;
  fecha?: string;
}> {
  const sourceTimestamp = sourceStartDate
    ? new Date(sourceStartDate).getTime()
    : Number.NaN;

  return preferDraft(events)
    .map((event) => {
      const eventTimestamp = event.fecha
        ? new Date(event.fecha).getTime()
        : Number.NaN;

      const distance =
        Number.isNaN(sourceTimestamp) || Number.isNaN(eventTimestamp)
          ? Number.MAX_SAFE_INTEGER
          : Math.abs(sourceTimestamp - eventTimestamp);

      return {
        sanityId: event._id,
        sanityName: event.nombre,
        slug: event.slug?.current,
        fecha: event.fecha,
        distance,
      };
    })
    .sort((a, b) => {
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }

      return (a.sanityName ?? "").localeCompare(
        b.sanityName ?? "",
        "es"
      );
    })
    .slice(0, 12)
    .map(({ distance: _distance, ...candidate }) => candidate);
}

export async function OPTIONS(request: Request): Promise<NextResponse> {
  return withCors(new NextResponse(null, { status: 204 }), request);
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID) {
      return withCors(
        NextResponse.json(
          { ok: false, error: "Falta NEXT_PUBLIC_SANITY_PROJECT_ID." } satisfies ResolveEventResponse,
          { status: 500 }
        ),
        request
      );
    }

    if (!process.env.NEXT_PUBLIC_SANITY_DATASET) {
      return withCors(
        NextResponse.json(
          { ok: false, error: "Falta NEXT_PUBLIC_SANITY_DATASET." } satisfies ResolveEventResponse,
          { status: 500 }
        ),
        request
      );
    }

    if (!process.env.SANITY_API_WRITE_TOKEN) {
      return withCors(
        NextResponse.json(
          { ok: false, error: "Falta SANITY_API_WRITE_TOKEN." } satisfies ResolveEventResponse,
          { status: 500 }
        ),
        request
      );
    }

    let body: ResolveEventBody;

    try {
      body = (await request.json()) as ResolveEventBody;
    } catch {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error: "El body no es un JSON válido.",
          } satisfies ResolveEventResponse,
          { status: 400 }
        ),
        request
      );
    }

    if (!isRecord(body) || !isRecord(body.event)) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error: "Falta event en el body.",
          } satisfies ResolveEventResponse,
          { status: 400 }
        ),
        request
      );
    }

    const sourceName = getString(body.event.name);
    const sourceStartDate = getString(body.event.startDate) || undefined;
    const fightCard = Array.isArray(body.event.fightCard)
      ? body.event.fightCard
      : [];

    if (!sourceName) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error: "El evento no incluye nombre.",
          } satisfies ResolveEventResponse,
          { status: 400 }
        ),
        request
      );
    }

    if (fightCard.length === 0) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error: "El evento no incluye una cartelera para resolver.",
          } satisfies ResolveEventResponse,
          { status: 400 }
        ),
        request
      );
    }

    const {
      discipline,
      organization,
      events,
      fighters,
      categories,
    } = await fetchResolutionData();

    const bareKnuckleCategories = discipline
      ? categories.filter(
          (category) =>
            !category.disciplina?._ref ||
            category.disciplina._ref === discipline._id
        )
      : categories;

    const bkfcFighters = fighters.filter((fighter) => {
      const matchesDiscipline =
        !discipline ||
        !fighter.disciplina?._ref ||
        fighter.disciplina._ref === discipline._id;

      const matchesOrganization =
        !organization ||
        !fighter.organizacion?._ref ||
        fighter.organizacion._ref === organization._id;

      return matchesDiscipline && matchesOrganization;
    });

    const eventMatch = findEvent({
      sourceName,
      sourceStartDate,
      events,
    });

    const matchedEvent = eventMatch.event;

    const resolvedFights: ResolvedFight[] = fightCard.map((fight) => {
      const redFighter = resolveReferenceByName(
        getString(fight.redFighter),
        bkfcFighters
      );

      const blueFighter = resolveReferenceByName(
        getString(fight.blueFighter),
        bkfcFighters
      );

      const category = resolveCategory(fight.weightClass, bareKnuckleCategories);

      const winnerName = getString(fight.winnerName);
      const winner = winnerName
        ? resolveReferenceByName(winnerName, bkfcFighters)
        : undefined;

      const blockingReasons: string[] = [];

      if (!matchedEvent) {
        blockingReasons.push("evento_no_encontrado");
      }

      if (!discipline) {
        blockingReasons.push("disciplina_bare_knuckle_no_encontrada");
      }

      if (!organization) {
        blockingReasons.push("organizacion_bkfc_no_encontrada");
      }

      if (!redFighter.found) {
        blockingReasons.push("luchador_rojo_no_encontrado");
      }

      if (!blueFighter.found) {
        blockingReasons.push("luchador_azul_no_encontrado");
      }

      if (!category.found) {
        blockingReasons.push("categoria_peso_no_resuelta");
      }

      if (
        fight.status === "finalizado" &&
        winnerName &&
        !winner?.found
      ) {
        blockingReasons.push("ganador_no_encontrado");
      }

      return {
        sourceFightId: fight.id,
        section: fight.section,
        sectionLabel: fight.sectionLabel,
        order: fight.order,
        redFighter,
        blueFighter,
        category,
        titleFight: Boolean(fight.titleFight),
        status: fight.status,
        winner,
        method: getString(fight.method) || undefined,
        round:
          typeof fight.round === "number" && Number.isFinite(fight.round)
            ? fight.round
            : undefined,
        time: getString(fight.time) || undefined,
        readyToCreate: blockingReasons.length === 0,
        alreadyExists: false,
        blockingReasons,
      };
    });

    const existingCombatDocs = matchedEvent
      ? preferDraft(
          await sanityClient.fetch<SanityCombatDoc[]>(
            `*[
              _type == "combate" &&
              references($eventId)
            ]{
              _id,
              evento,
              luchadorRojo,
              luchadorAzul
            }`,
            {
              eventId: matchedEvent._id.replace(/^drafts\./, ""),
            },
            { perspective: "raw" }
          )
        )
      : [];

    const fightsWithExistingState: ResolvedFight[] = resolvedFights.map(
      (fight) => {
        const redId = fight.redFighter.sanityId?.replace(/^drafts\./, "");
        const blueId = fight.blueFighter.sanityId?.replace(/^drafts\./, "");

        const existingCombat = existingCombatDocs.find((combat) => {
          const combatRedId = combat.luchadorRojo?._ref?.replace(
            /^drafts\./,
            ""
          );
          const combatBlueId = combat.luchadorAzul?._ref?.replace(
            /^drafts\./,
            ""
          );

          return combatRedId === redId && combatBlueId === blueId;
        });

        return {
          ...fight,
          alreadyExists: Boolean(existingCombat),
          existingSanityId: existingCombat?._id,
        };
      }
    );

    const allFighterReferences = uniqueByNormalizedName(
      fightsWithExistingState.flatMap((fight) => {
        const values = [fight.redFighter, fight.blueFighter];

        if (fight.winner) {
          values.push(fight.winner);
        }

        return values;
      })
    );

    const existingFighters = allFighterReferences.filter((item) => item.found);
    const missingFighters = allFighterReferences.filter((item) => !item.found);

    const allCategories = uniqueCategories(
      fightsWithExistingState.map((fight) => fight.category)
    );

    const resolvedCategories = allCategories.filter((item) => item.found);
    const unresolvedCategories = allCategories.filter((item) => !item.found);

    const response: ResolveEventResponse = {
      ok: true,
      event: {
        sourceName,
        found: Boolean(matchedEvent),
        sanityId: matchedEvent?._id,
        sanityName: matchedEvent?.nombre,
        matchStrategy: eventMatch.strategy,
        candidates: matchedEvent
          ? undefined
          : getEventCandidates(sourceStartDate, events),
      },
      discipline: {
        found: Boolean(discipline),
        sanityId: discipline?._id,
        sanityName: discipline?.nombre,
      },
      organization: {
        found: Boolean(organization),
        sanityId: organization?._id,
        sanityName: organization?.nombre,
      },
      counts: {
        fights: fightsWithExistingState.length,
        readyFights: fightsWithExistingState.filter(
          (fight) => fight.readyToCreate
        ).length,
        existingFights: fightsWithExistingState.filter(
          (fight) => fight.alreadyExists
        ).length,
        pendingFights: fightsWithExistingState.filter(
          (fight) => fight.readyToCreate && !fight.alreadyExists
        ).length,
        existingFighters: existingFighters.length,
        missingFighters: missingFighters.length,
        resolvedCategories: resolvedCategories.length,
        unresolvedCategories: unresolvedCategories.length,
      },
      existingFighters,
      missingFighters,
      resolvedCategories,
      unresolvedCategories,
      fights: fightsWithExistingState,
    };

    return withCors(NextResponse.json(response), request);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido resolviendo la cartelera.";

    console.error("Error resolviendo cartelera BKFC contra Sanity:", error);

    return withCors(
      NextResponse.json(
        {
          ok: false,
          error: message,
        } satisfies ResolveEventResponse,
        { status: 500 }
      ),
      request
    );
  }
}
