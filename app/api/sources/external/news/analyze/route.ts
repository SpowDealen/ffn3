import { NextResponse } from "next/server";
import OpenAI from "openai";
import { client } from "../../../../../../sanity/lib/client";
import type { ExternalNewsItem } from "../../../../../../_laboratorio/laboratorio-ia/src/sources/types";

type ReferenceDoc = {
  _id: string;
  nombre?: string;
  slug?: { current?: string };
};

type DisciplineDoc = ReferenceDoc;

type OrganizationDoc = ReferenceDoc & {
  disciplinas?: Array<{ _ref?: string } | null> | null;
};

type EventDoc = ReferenceDoc & {
  fecha?: string;
  cartelPrincipal?: string;
  disciplina?: { _ref?: string } | null;
  organizacion?: { _ref?: string } | null;
};

type FighterDoc = ReferenceDoc & {
  apodo?: string;
  disciplina?: { _ref?: string } | null;
  organizacion?: { _ref?: string } | null;
};

type FightDoc = {
  _id: string;
  evento?: { _ref?: string } | null;
  eventoNombre?: string;
  disciplinaId?: string;
  organizacionId?: string;
  luchadorRojo?: { _ref?: string } | null;
  luchadorAzul?: { _ref?: string } | null;
  rojoNombre?: string;
  azulNombre?: string;
  estado?: string;
};

type SanityContext = {
  disciplinas: DisciplineDoc[];
  organizaciones: OrganizationDoc[];
  eventos: EventDoc[];
  luchadores: FighterDoc[];
  combates: FightDoc[];
};

type AnalyzeExternalNewsBody = {
  item?: ExternalNewsItem;
};

type EditorialAnalysisOutput = {
  relevancia: "alta" | "media" | "baja" | "descartar";
  debeCrearNoticia: boolean;
  necesitaRevisionManual: boolean;
  razonRevisionManual: string;
  motivoRelevancia: string;
  temaPrincipal:
    | "combate"
    | "evento"
    | "declaraciones"
    | "resultado"
    | "lesion"
    | "rumor"
    | "fichaje"
    | "ranking"
    | "legal"
    | "obituario"
    | "otro";
  disciplinaPrincipal: string;
  organizacionPrincipal: string;
  eventoPrincipal: string;
  combatePrincipal: string;
  luchadoresPrincipales: string[];
  luchadoresSecundarios: string[];
  entidadesMencionadas: string[];
  fuenteFormulario: "ufc" | "bkfc" | "otra";
  anguloEditorial: string;
  hechoPrincipal: string;
  contextoPrevio: string;
  instruccionesRedaccion: string;
  confianzaRelaciones: number;
};

type ResolvedReference = {
  id: string;
  label: string;
} | null;

type ResolvedFight = {
  id: string;
  label: string;
  eventoId?: string;
  eventoLabel?: string;
} | null;

type AnalyzeExternalNewsResponse = {
  ok: true;
  data: {
    analysis: EditorialAnalysisOutput;
    resolved: {
      disciplina: ResolvedReference;
      organizacion: ResolvedReference;
      evento: ResolvedReference;
      combate: ResolvedFight;
      luchadoresPrincipales: Array<{ id: string; label: string }>;
      luchadoresSecundarios: Array<{ id: string; label: string }>;
    };
    warnings: string[];
  };
} | {
  ok: false;
  error: string;
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

function jsonWithCors(
  request: Request,
  payload: AnalyzeExternalNewsResponse,
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

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function limitText(value: string, maxLength: number): string {
  const clean = value.trim();
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/\bvs\.?\b/g, " vs ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const clean = value.trim();
    const key = normalizeLabel(clean);

    if (!clean || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(clean);
  }

  return result;
}

function createCandidateList<T extends ReferenceDoc>(items: T[], maxItems = 160): string {
  return items
    .slice(0, maxItems)
    .map((item) => `- ${item.nombre || item._id}`)
    .join("\n");
}

function createFighterCandidateList(items: FighterDoc[], maxItems = 260): string {
  return items
    .slice(0, maxItems)
    .map((item) => {
      const parts = [item.nombre || item._id, item.apodo ? `apodo: ${item.apodo}` : ""].filter(Boolean);
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");
}

function createFightCandidateList(items: FightDoc[], maxItems = 220): string {
  return items
    .slice(0, maxItems)
    .map((item) => {
      const fightLabel = `${item.rojoNombre || "Sin rojo"} vs ${item.azulNombre || "Sin azul"}`;
      return `- ${fightLabel}${item.eventoNombre ? ` | evento: ${item.eventoNombre}` : ""}${item.estado ? ` | estado: ${item.estado}` : ""}`;
    })
    .join("\n");
}

async function fetchSanityContext(): Promise<SanityContext> {
  const [disciplinas, organizaciones, eventos, luchadores, combates] = await Promise.all([
    client.fetch<DisciplineDoc[]>(`
      *[_type == "disciplina"] | order(nombre asc) {
        _id,
        nombre,
        slug
      }
    `),
    client.fetch<OrganizationDoc[]>(`
      *[_type == "organizacion"] | order(nombre asc) {
        _id,
        nombre,
        slug,
        disciplinas
      }
    `),
    client.fetch<EventDoc[]>(`
      *[_type == "evento"] | order(fecha desc)[0...220] {
        _id,
        nombre,
        slug,
        fecha,
        cartelPrincipal,
        disciplina,
        organizacion
      }
    `),
    client.fetch<FighterDoc[]>(`
      *[_type == "luchador"] | order(nombre asc) {
        _id,
        nombre,
        slug,
        apodo,
        disciplina,
        organizacion
      }
    `),
    client.fetch<FightDoc[]>(`
      *[_type == "combate"] | order(_createdAt desc)[0...260] {
        _id,
        evento,
        "eventoNombre": evento->nombre,
        "disciplinaId": evento->disciplina._ref,
        "organizacionId": evento->organizacion._ref,
        luchadorRojo,
        luchadorAzul,
        "rojoNombre": luchadorRojo->nombre,
        "azulNombre": luchadorAzul->nombre,
        estado
      }
    `),
  ]);

  return { disciplinas, organizaciones, eventos, luchadores, combates };
}

function findByLabel<T extends ReferenceDoc>(items: T[], label: string): T | undefined {
  const normalizedLabel = normalizeLabel(label);

  if (!normalizedLabel) {
    return undefined;
  }

  return items.find((item) => normalizeLabel(item.nombre || "") === normalizedLabel);
}

function getTokens(value: string): string[] {
  return normalizeLabel(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function hasStrongNameOverlap(candidateName: string, requestedLabel: string): boolean {
  const candidate = normalizeLabel(candidateName);
  const requested = normalizeLabel(requestedLabel);

  if (!candidate || !requested) {
    return false;
  }

  if (candidate === requested) {
    return true;
  }

  if (candidate.length >= 8 && requested.length >= 8) {
    if (candidate.includes(requested) || requested.includes(candidate)) {
      return true;
    }
  }

  const candidateTokens = getTokens(candidate);
  const requestedTokens = getTokens(requested);

  if (candidateTokens.length === 0 || requestedTokens.length === 0) {
    return false;
  }

  const candidateSet = new Set(candidateTokens);
  const overlap = requestedTokens.filter((token) => candidateSet.has(token));

  // Nombre + apellido, o apellido distintivo cuando el nombre solicitado es largo.
  if (overlap.length >= 2) {
    return true;
  }

  const candidateLastName = candidateTokens[candidateTokens.length - 1];
  const requestedLastName = requestedTokens[requestedTokens.length - 1];

  return (
    requestedTokens.length >= 2 &&
    candidateTokens.length >= 2 &&
    candidateLastName === requestedLastName &&
    overlap.length >= 1
  );
}

function findFighterByLabel(items: FighterDoc[], label: string): FighterDoc | undefined {
  const normalizedLabel = normalizeLabel(label);

  if (!normalizedLabel) {
    return undefined;
  }

  return items.find((item) => {
    const normalizedName = normalizeLabel(item.nombre || "");
    const normalizedNickname = normalizeLabel(item.apodo || "");

    return (
      normalizedName === normalizedLabel ||
      normalizedNickname === normalizedLabel ||
      hasStrongNameOverlap(item.nombre || "", label) ||
      Boolean(item.apodo && hasStrongNameOverlap(item.apodo, label))
    );
  });
}

function findFightByLabel(items: FightDoc[], label: string): FightDoc | undefined {
  const normalizedLabel = normalizeLabel(label);

  if (!normalizedLabel) {
    return undefined;
  }

  return items.find((item) => {
    const fightLabel = normalizeLabel(`${item.rojoNombre || ""} vs ${item.azulNombre || ""}`);
    const reverseFightLabel = normalizeLabel(`${item.azulNombre || ""} vs ${item.rojoNombre || ""}`);
    const eventLabel = normalizeLabel(item.eventoNombre || "");

    return (
      fightLabel === normalizedLabel ||
      reverseFightLabel === normalizedLabel ||
      (eventLabel && normalizedLabel.includes(fightLabel) && normalizedLabel.includes(eventLabel))
    );
  });
}

function findById<T extends ReferenceDoc>(items: T[], id?: string | null): T | undefined {
  if (!id) {
    return undefined;
  }

  return items.find((item) => item._id === id);
}

function fightContainsFighter(fight: FightDoc, fighter: FighterDoc): boolean {
  return (
    fight.luchadorRojo?._ref === fighter._id ||
    fight.luchadorAzul?._ref === fighter._id ||
    hasStrongNameOverlap(fight.rojoNombre || "", fighter.nombre || "") ||
    hasStrongNameOverlap(fight.azulNombre || "", fighter.nombre || "")
  );
}

function findFightByResolvedFighters(
  fights: FightDoc[],
  fighters: FighterDoc[],
  disciplinaId?: string,
  organizacionId?: string
): FightDoc | undefined {
  const uniqueFighters = Array.from(
    new Map(fighters.map((fighter) => [fighter._id, fighter])).values()
  );

  if (uniqueFighters.length < 2) {
    return undefined;
  }

  const scored = fights
    .map((fight) => {
      const matchedFighters = uniqueFighters.filter((fighter) =>
        fightContainsFighter(fight, fighter)
      );

      if (matchedFighters.length < 2) {
        return null;
      }

      let score = matchedFighters.length * 100;

      if (disciplinaId && fight.disciplinaId === disciplinaId) {
        score += 30;
      }

      if (organizacionId && fight.organizacionId === organizacionId) {
        score += 30;
      }

      if (fight.estado === "programado" || fight.estado === "finalizado") {
        score += 5;
      }

      return { fight, score };
    })
    .filter((item): item is { fight: FightDoc; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.fight;
}

function findEventMentionedInText(
  events: EventDoc[],
  text: string,
  disciplinaId?: string,
  organizacionId?: string
): EventDoc | undefined {
  const normalizedText = normalizeLabel(text);

  if (!normalizedText) {
    return undefined;
  }

  const scored = events
    .map((event) => {
      const eventName = event.nombre || "";
      const normalizedEventName = normalizeLabel(eventName);

      if (!normalizedEventName || !normalizedText.includes(normalizedEventName)) {
        return null;
      }

      let score = normalizedEventName.length;

      if (disciplinaId && event.disciplina?._ref === disciplinaId) {
        score += 25;
      }

      if (organizacionId && event.organizacion?._ref === organizacionId) {
        score += 25;
      }

      return { event, score };
    })
    .filter((item): item is { event: EventDoc; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.event;
}


function getDateDistanceScore(eventDate?: string, publishedAt?: string): number {
  if (!eventDate || !publishedAt) {
    return 0;
  }

  const eventTime = new Date(eventDate).getTime();
  const publishedTime = new Date(publishedAt).getTime();

  if (!Number.isFinite(eventTime) || !Number.isFinite(publishedTime)) {
    return 0;
  }

  const distanceDays = Math.abs(eventTime - publishedTime) / (1000 * 60 * 60 * 24);

  if (distanceDays <= 14) {
    return 25;
  }

  if (distanceDays <= 45) {
    return 15;
  }

  if (distanceDays <= 90) {
    return 8;
  }

  return 0;
}

function getSignificantTokens(value: string): string[] {
  const stopWords = new Set([
    "ufc",
    "bkfc",
    "fight",
    "night",
    "the",
    "de",
    "del",
    "la",
    "el",
    "las",
    "los",
    "en",
    "un",
    "una",
    "y",
    "vs",
    "versus",
    "evento",
    "velada",
    "combate",
    "pelea",
    "casa",
    "blanca",
  ]);

  return getTokens(value).filter((token) => !stopWords.has(token));
}

function getTokenOverlapScore(candidateValue: string, contextValue: string): number {
  const candidateTokens = getSignificantTokens(candidateValue);
  const contextTokens = new Set(getSignificantTokens(contextValue));

  if (candidateTokens.length === 0 || contextTokens.size === 0) {
    return 0;
  }

  const overlap = candidateTokens.filter((token) => contextTokens.has(token));

  if (overlap.length === 0) {
    return 0;
  }

  const ratio = overlap.length / candidateTokens.length;

  if (ratio >= 1) {
    return 55;
  }

  if (ratio >= 0.66) {
    return 40;
  }

  if (ratio >= 0.5) {
    return 28;
  }

  return Math.min(18, overlap.length * 7);
}

function getFighterEventScore(event: EventDoc, fighter: FighterDoc, eventFights: FightDoc[]): number {
  const fighterName = fighter.nombre || "";
  const eventName = event.nombre || "";
  const cartelPrincipal = event.cartelPrincipal || "";

  let score = 0;

  if (fighterName && hasStrongNameOverlap(eventName, fighterName)) {
    score += 35;
  }

  if (fighterName && hasStrongNameOverlap(cartelPrincipal, fighterName)) {
    score += 45;
  }

  if (eventFights.some((fight) => fightContainsFighter(fight, fighter))) {
    score += 40;
  }

  return score;
}

function findEventByContext(params: {
  events: EventDoc[];
  fights: FightDoc[];
  analysis: EditorialAnalysisOutput;
  sourceText: string;
  primaryFighters: FighterDoc[];
  disciplinaId?: string;
  organizacionId?: string;
  publishedAt?: string;
}): { event: EventDoc; score: number; reasons: string[] } | undefined {
  const {
    events,
    fights,
    analysis,
    sourceText,
    primaryFighters,
    disciplinaId,
    organizacionId,
    publishedAt,
  } = params;

  const contextText = [
    sourceText,
    analysis.eventoPrincipal,
    analysis.combatePrincipal,
    analysis.hechoPrincipal,
    analysis.contextoPrevio,
    analysis.entidadesMencionadas.join(" "),
    analysis.luchadoresPrincipales.join(" "),
  ].join(" ");

  const scored = events
    .map((event) => {
      const eventFights = fights.filter((fight) => fight.evento?._ref === event._id);
      const reasons: string[] = [];
      let score = 0;

      const eventName = event.nombre || "";
      const cartelPrincipal = event.cartelPrincipal || "";

      if (disciplinaId && event.disciplina?._ref === disciplinaId) {
        score += 18;
        reasons.push("misma disciplina");
      }

      if (organizacionId && event.organizacion?._ref === organizacionId) {
        score += 22;
        reasons.push("misma organización");
      }

      if (analysis.eventoPrincipal && hasStrongNameOverlap(eventName, analysis.eventoPrincipal)) {
        score += 70;
        reasons.push("nombre de evento parecido al mencionado");
      } else {
        const eventNameScore = getTokenOverlapScore(eventName, contextText);
        if (eventNameScore > 0) {
          score += eventNameScore;
          reasons.push("tokens del evento presentes en la noticia");
        }
      }

      if (cartelPrincipal) {
        const cartelScore = getTokenOverlapScore(cartelPrincipal, contextText);
        if (cartelScore > 0) {
          score += cartelScore;
          reasons.push("cartel principal compatible con la noticia");
        }
      }

      for (const fighter of primaryFighters) {
        const fighterScore = getFighterEventScore(event, fighter, eventFights);
        if (fighterScore > 0) {
          score += fighterScore;
          reasons.push(`protagonista presente en evento/cartelera: ${fighter.nombre || fighter._id}`);
        }
      }

      const dateScore = getDateDistanceScore(event.fecha, publishedAt);
      if (dateScore > 0) {
        score += dateScore;
        reasons.push("fecha cercana a la noticia");
      }

      const hasCoreContext = Boolean(
        (disciplinaId && event.disciplina?._ref === disciplinaId) ||
        (organizacionId && event.organizacion?._ref === organizacionId)
      );
      const hasFighterSignal = primaryFighters.some((fighter) =>
        getFighterEventScore(event, fighter, eventFights) > 0
      );
      const hasNameSignal =
        getTokenOverlapScore(eventName, contextText) >= 18 ||
        Boolean(analysis.eventoPrincipal && hasStrongNameOverlap(eventName, analysis.eventoPrincipal));

      if (!hasCoreContext && !hasFighterSignal) {
        return null;
      }

      if (!hasFighterSignal && !hasNameSignal && score < 95) {
        return null;
      }

      return { event, score, reasons };
    })
    .filter((item): item is { event: EventDoc; score: number; reasons: string[] } => Boolean(item))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];

  if (!best || best.score < 80) {
    return undefined;
  }

  // Evita asignaciones dudosas cuando hay dos eventos casi empatados.
  if (second && best.score - second.score < 12 && best.score < 125) {
    return undefined;
  }

  return best;
}

function getSourceValueFromAnalysis(analysis: EditorialAnalysisOutput): "ufc" | "bkfc" | "otra" {
  const organization = normalizeLabel(analysis.organizacionPrincipal);
  const discipline = normalizeLabel(analysis.disciplinaPrincipal);

  if (analysis.fuenteFormulario === "ufc" && organization === "ufc" && discipline === "mma") {
    return "ufc";
  }

  if (analysis.fuenteFormulario === "bkfc" && organization === "bkfc") {
    return "bkfc";
  }

  return "otra";
}

function validateAnalysis(value: unknown): EditorialAnalysisOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("OpenAI no devolvió un análisis válido.");
  }

  const record = value as Record<string, unknown>;

  const relevancia = getString(record.relevancia) as EditorialAnalysisOutput["relevancia"];
  const temaPrincipal = getString(record.temaPrincipal) as EditorialAnalysisOutput["temaPrincipal"];
  const fuenteFormulario = getString(record.fuenteFormulario) as EditorialAnalysisOutput["fuenteFormulario"];

  return {
    relevancia: ["alta", "media", "baja", "descartar"].includes(relevancia) ? relevancia : "media",
    debeCrearNoticia: Boolean(record.debeCrearNoticia),
    necesitaRevisionManual: Boolean(record.necesitaRevisionManual),
    razonRevisionManual: limitText(getString(record.razonRevisionManual), 500),
    motivoRelevancia: limitText(getString(record.motivoRelevancia), 700),
    temaPrincipal: [
      "combate",
      "evento",
      "declaraciones",
      "resultado",
      "lesion",
      "rumor",
      "fichaje",
      "ranking",
      "legal",
      "obituario",
      "otro",
    ].includes(temaPrincipal) ? temaPrincipal : "otro",
    disciplinaPrincipal: limitText(getString(record.disciplinaPrincipal), 120),
    organizacionPrincipal: limitText(getString(record.organizacionPrincipal), 120),
    eventoPrincipal: limitText(getString(record.eventoPrincipal), 180),
    combatePrincipal: limitText(getString(record.combatePrincipal), 180),
    luchadoresPrincipales: uniqueStrings(Array.isArray(record.luchadoresPrincipales) ? record.luchadoresPrincipales.map(getString) : []),
    luchadoresSecundarios: uniqueStrings(Array.isArray(record.luchadoresSecundarios) ? record.luchadoresSecundarios.map(getString) : []),
    entidadesMencionadas: uniqueStrings(Array.isArray(record.entidadesMencionadas) ? record.entidadesMencionadas.map(getString) : []),
    fuenteFormulario: ["ufc", "bkfc", "otra"].includes(fuenteFormulario) ? fuenteFormulario : "otra",
    anguloEditorial: limitText(getString(record.anguloEditorial), 500),
    hechoPrincipal: limitText(getString(record.hechoPrincipal), 700),
    contextoPrevio: limitText(getString(record.contextoPrevio), 1500),
    instruccionesRedaccion: limitText(getString(record.instruccionesRedaccion), 1600),
    confianzaRelaciones:
      typeof record.confianzaRelaciones === "number" && Number.isFinite(record.confianzaRelaciones)
        ? Math.max(0, Math.min(100, Math.round(record.confianzaRelaciones)))
        : 50,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return jsonWithCors(request, { ok: false, error: "Falta OPENAI_API_KEY en .env.local." }, { status: 500 });
    }

    let body: AnalyzeExternalNewsBody;

    try {
      body = (await request.json()) as AnalyzeExternalNewsBody;
    } catch {
      return jsonWithCors(request, { ok: false, error: "El body no es un JSON válido." }, { status: 400 });
    }

    const item = body.item;

    if (!item?.title || !item.sourceUrl) {
      return jsonWithCors(request, { ok: false, error: "Falta la noticia externa a analizar." }, { status: 400 });
    }

    const sanityContext = await fetchSanityContext();
    const openai = new OpenAI({ apiKey });
    const sourceText = [
      `TÍTULO: ${item.title}`,
      item.excerpt ? `EXTRACTO: ${item.excerpt}` : "",
      item.bodyText ? `CUERPO: ${limitText(item.bodyText, 9000)}` : "",
      item.tags?.length ? `TAGS: ${item.tags.join(", ")}` : "",
      item.authors?.length ? `AUTORES: ${item.authors.join(", ")}` : "",
      `URL: ${item.canonicalUrl || item.sourceUrl}`,
      item.publishedAt ? `FECHA: ${item.publishedAt}` : "",
    ].filter(Boolean).join("\n");

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: [
        "Eres el analizador editorial de Full Fight News, un medio español de deportes de combate.",
        "Tu tarea NO es hacer match simple por palabras clave: debes leer la noticia completa, entender el sujeto gramatical, el enfoque, los protagonistas, el contexto deportivo y la relación lógica entre entidades.",
        "Diferencia menciones principales de menciones secundarias. Si una noticia habla de Justin Gaethje explicando una victoria sobre Ilia Topuria, ambos son luchadores principales.",
        "No asignes UFC/MMA por ruido. UFC solo es organización principal si la noticia trata claramente de UFC. Si trata de kickboxing, boxeo, GLORY, K-1 o una velada híbrida, no conviertas la organización en UFC solo porque aparezca una mención lateral.",
        "Si la noticia mezcla deportes o no hay seguridad suficiente, usa fuenteFormulario 'otra' y necesitaRevisionManual true.",
        "Usa exclusivamente nombres que existan en las listas de Sanity cuando relaciones disciplina, organización, evento, combate o luchadores. Si no existe coincidencia clara, devuelve cadena vacía para esa relación.",
        "Si la noticia habla claramente de una pelea entre dos luchadores, rellena combatePrincipal como 'Luchador A vs Luchador B' aunque el nombre del evento no esté claro; el sistema intentará cruzarlo con combates reales de Sanity.",
        "No inventes eventoPrincipal. Si el evento aparece con nombre comercial o de prensa, explica la pista; el sistema intentará resolverlo por contexto usando organización, disciplina, luchadores, combates y fecha.",
        "Evalúa si la noticia merece ser publicada en Full Fight News: relevancia alta/media/baja/descartar.",
        "Devuelve exclusivamente JSON válido con el esquema solicitado.",
      ].join("\n"),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "NOTICIA EXTERNA A ANALIZAR:",
                sourceText,
                "",
                "DISCIPLINAS EXISTENTES EN SANITY:",
                createCandidateList(sanityContext.disciplinas),
                "",
                "ORGANIZACIONES EXISTENTES EN SANITY:",
                createCandidateList(sanityContext.organizaciones),
                "",
                "EVENTOS RECIENTES EXISTENTES EN SANITY:",
                createCandidateList(sanityContext.eventos),
                "",
                "LUCHADORES EXISTENTES EN SANITY:",
                createFighterCandidateList(sanityContext.luchadores),
                "",
                "COMBATES EXISTENTES EN SANITY:",
                createFightCandidateList(sanityContext.combates),
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "analisis_noticia_externa",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              relevancia: { type: "string", enum: ["alta", "media", "baja", "descartar"] },
              debeCrearNoticia: { type: "boolean" },
              necesitaRevisionManual: { type: "boolean" },
              razonRevisionManual: { type: "string" },
              motivoRelevancia: { type: "string" },
              temaPrincipal: {
                type: "string",
                enum: ["combate", "evento", "declaraciones", "resultado", "lesion", "rumor", "fichaje", "ranking", "legal", "obituario", "otro"],
              },
              disciplinaPrincipal: { type: "string" },
              organizacionPrincipal: { type: "string" },
              eventoPrincipal: { type: "string" },
              combatePrincipal: { type: "string" },
              luchadoresPrincipales: { type: "array", items: { type: "string" } },
              luchadoresSecundarios: { type: "array", items: { type: "string" } },
              entidadesMencionadas: { type: "array", items: { type: "string" } },
              fuenteFormulario: { type: "string", enum: ["ufc", "bkfc", "otra"] },
              anguloEditorial: { type: "string" },
              hechoPrincipal: { type: "string" },
              contextoPrevio: { type: "string" },
              instruccionesRedaccion: { type: "string" },
              confianzaRelaciones: { type: "number" },
            },
            required: [
              "relevancia",
              "debeCrearNoticia",
              "necesitaRevisionManual",
              "razonRevisionManual",
              "motivoRelevancia",
              "temaPrincipal",
              "disciplinaPrincipal",
              "organizacionPrincipal",
              "eventoPrincipal",
              "combatePrincipal",
              "luchadoresPrincipales",
              "luchadoresSecundarios",
              "entidadesMencionadas",
              "fuenteFormulario",
              "anguloEditorial",
              "hechoPrincipal",
              "contextoPrevio",
              "instruccionesRedaccion",
              "confianzaRelaciones",
            ],
          },
        },
      },
    });

    if (!response.output_text) {
      throw new Error("OpenAI no devolvió contenido.");
    }

    const analysis = validateAnalysis(JSON.parse(response.output_text));
    const disciplinaDoc = findByLabel(sanityContext.disciplinas, analysis.disciplinaPrincipal);
    const organizacionDoc = findByLabel(sanityContext.organizaciones, analysis.organizacionPrincipal);

    const primaryFighterDocs = analysis.luchadoresPrincipales
      .map((label) => findFighterByLabel(sanityContext.luchadores, label))
      .filter((fighter): fighter is FighterDoc => Boolean(fighter));

    const secondaryFighterDocs = analysis.luchadoresSecundarios
      .map((label) => findFighterByLabel(sanityContext.luchadores, label))
      .filter((fighter): fighter is FighterDoc => Boolean(fighter))
      .filter((fighter) => !primaryFighterDocs.some((primary) => primary._id === fighter._id));

    const directEventoDoc = findByLabel(sanityContext.eventos, analysis.eventoPrincipal);
    const directCombateDoc = findFightByLabel(sanityContext.combates, analysis.combatePrincipal);
    const inferredCombateDoc = directCombateDoc || findFightByResolvedFighters(
      sanityContext.combates,
      primaryFighterDocs,
      disciplinaDoc?._id,
      organizacionDoc?._id
    );
    const eventoFromCombateDoc = findById(sanityContext.eventos, inferredCombateDoc?.evento?._ref);
    const mentionedEventoDoc = findEventMentionedInText(
      sanityContext.eventos,
      sourceText,
      disciplinaDoc?._id,
      organizacionDoc?._id
    );
    const contextualEventoMatch = findEventByContext({
      events: sanityContext.eventos,
      fights: sanityContext.combates,
      analysis,
      sourceText,
      primaryFighters: primaryFighterDocs,
      disciplinaId: disciplinaDoc?._id,
      organizacionId: organizacionDoc?._id,
      publishedAt: item.publishedAt,
    });

    const eventoDoc = directEventoDoc || eventoFromCombateDoc || mentionedEventoDoc || contextualEventoMatch?.event;
    const combateDoc = inferredCombateDoc;

    const primaryFighters = primaryFighterDocs.map((fighter) => ({
      id: fighter._id,
      label: fighter.nombre || fighter._id,
    }));

    const secondaryFighters = secondaryFighterDocs.map((fighter) => ({
      id: fighter._id,
      label: fighter.nombre || fighter._id,
    }));

    const sourceValue = getSourceValueFromAnalysis(analysis);
    const normalizedAnalysis: EditorialAnalysisOutput = {
      ...analysis,
      fuenteFormulario: sourceValue,
    };

    const warnings: string[] = [];

    if (!directCombateDoc && combateDoc) {
      warnings.push(`Combate inferido por coincidencia fuerte de luchadores: ${combateDoc.rojoNombre || "Sin rojo"} vs ${combateDoc.azulNombre || "Sin azul"}`);
    }

    if (!directEventoDoc && eventoDoc && eventoFromCombateDoc) {
      warnings.push(`Evento inferido a partir del combate relacionado: ${eventoDoc.nombre || eventoDoc._id}`);
    }

    if (!directEventoDoc && !eventoFromCombateDoc && contextualEventoMatch?.event) {
      warnings.push(`Evento inferido por contexto: ${contextualEventoMatch.event.nombre || contextualEventoMatch.event._id} (score ${contextualEventoMatch.score}; ${contextualEventoMatch.reasons.slice(0, 4).join(", ")})`);
    }

    if (analysis.disciplinaPrincipal && !disciplinaDoc) {
      warnings.push(`Disciplina sugerida no encontrada en Sanity: ${analysis.disciplinaPrincipal}`);
    }

    if (analysis.organizacionPrincipal && !organizacionDoc) {
      warnings.push(`Organización sugerida no encontrada en Sanity: ${analysis.organizacionPrincipal}`);
    }

    if (analysis.eventoPrincipal && !eventoDoc) {
      warnings.push(`Evento sugerido no encontrado en Sanity: ${analysis.eventoPrincipal}`);
    }

    if (analysis.combatePrincipal && !combateDoc) {
      warnings.push(`Combate sugerido no encontrado en Sanity: ${analysis.combatePrincipal}`);
    }

    return jsonWithCors(request, {
      ok: true,
      data: {
        analysis: normalizedAnalysis,
        resolved: {
          disciplina: disciplinaDoc ? { id: disciplinaDoc._id, label: disciplinaDoc.nombre || disciplinaDoc._id } : null,
          organizacion: organizacionDoc ? { id: organizacionDoc._id, label: organizacionDoc.nombre || organizacionDoc._id } : null,
          evento: eventoDoc ? { id: eventoDoc._id, label: eventoDoc.nombre || eventoDoc._id } : null,
          combate: combateDoc
            ? {
                id: combateDoc._id,
                label: `${combateDoc.rojoNombre || "Sin rojo"} vs ${combateDoc.azulNombre || "Sin azul"}`,
                eventoId: combateDoc.evento?._ref,
                eventoLabel: combateDoc.eventoNombre,
              }
            : null,
          luchadoresPrincipales: primaryFighters,
          luchadoresSecundarios: secondaryFighters,
        },
        warnings,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido analizando la noticia externa.";
    console.error("Error en análisis editorial externo:", error);

    return jsonWithCors(request, { ok: false, error: message }, { status: 500 });
  }
}
