import { NextResponse } from "next/server";
import OpenAI from "openai";
import { client } from "../../../sanity/lib/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TransformOneNewsBody = {
  title?: string;
  summary?: string;
  bodyText?: string;
  sourceUrl?: string;
};

type SuggestedNewsRelations = {
  luchadores: string[];
  evento: string;
  organizacion: string;
  disciplina: string;
};

type TransformOneNewsResponse =
  | {
      ok: true;
      data: {
        titulo: string;
        extracto: string;
        contenido: string;
        relacionesSugeridas: SuggestedNewsRelations;
      };
    }
  | {
      ok: false;
      error?: string;
    };

type SanityReferenceDoc = {
  _id: string;
  nombre?: string;
  slug?: { current?: string } | null;
};

type SanityOrganizationDoc = SanityReferenceDoc & {
  disciplinas?: Array<{ _ref?: string } | null> | null;
};

type SanityEventDoc = SanityReferenceDoc & {
  fecha?: string | null;
  cartelPrincipal?: string | null;
  disciplina?: { _ref?: string; nombre?: string } | null;
  organizacion?: { _ref?: string; nombre?: string } | null;
};

type SanityFighterDoc = SanityReferenceDoc & {
  apodo?: string | null;
  disciplina?: { _ref?: string; nombre?: string } | null;
  organizacion?: { _ref?: string; nombre?: string } | null;
};

type SanityFightDoc = {
  _id: string;
  evento?: { _ref?: string; nombre?: string } | null;
  disciplina?: { _ref?: string; nombre?: string } | null;
  organizacion?: { _ref?: string; nombre?: string } | null;
  luchadorRojo?: { _ref?: string; nombre?: string } | null;
  luchadorAzul?: { _ref?: string; nombre?: string } | null;
  estado?: string | null;
};

type SanityContext = {
  disciplinas: SanityReferenceDoc[];
  organizaciones: SanityOrganizationDoc[];
  eventos: SanityEventDoc[];
  luchadores: SanityFighterDoc[];
  combates: SanityFightDoc[];
};

type Ranked<T> = {
  item: T;
  score: number;
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
  payload: TransformOneNewsResponse,
  init?: ResponseInit
): NextResponse {
  const response = NextResponse.json(payload, init);
  response.headers.set("Content-Type", "application/json; charset=utf-8");
  response.headers.set("Access-Control-Allow-Origin", getAllowedOrigin(request));
  response.headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Vary", "Origin");
  response.headers.set("Cache-Control", "no-store");

  return response;
}

export async function OPTIONS(request: Request): Promise<NextResponse> {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", getAllowedOrigin(request));
  response.headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Vary", "Origin");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function limitText(value: string, maxLength: number): string {
  const clean = value.trim();
  return clean.length <= maxLength
    ? clean
    : `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/&/g, " and ")
    .replace(/\bvs\.?\b/g, " vs ")
    .replace(/[^a-z0-9ñ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForContains(value: string): string {
  const normalized = normalizeText(value);
  return normalized ? ` ${normalized} ` : "";
}

function textContainsPhrase(searchText: string, phrase: string): boolean {
  const normalizedSearchText = normalizeForContains(searchText);
  const normalizedPhrase = normalizeText(phrase);

  if (!normalizedSearchText || !normalizedPhrase) {
    return false;
  }

  return normalizedSearchText.includes(` ${normalizedPhrase} `);
}

function inferDisciplineFromText(value: string): string {
  const normalized = normalizeText(value);

  if (/\b(submission grappling|grappling|jiu jitsu|jiu jitsu|bjj)\b/.test(normalized)) {
    return "Jiu-Jitsu";
  }

  if (/\b(muay thai|thai boxing|lumpinee)\b/.test(normalized)) {
    return "Muay Thai";
  }

  if (/\b(kickboxing|kickboxer|kickboxing world)\b/.test(normalized)) {
    return "Kickboxing";
  }

  if (/\b(mma|mixed martial arts|mixed martial artist|mixed martial)\b/.test(normalized)) {
    return "MMA";
  }

  return "MMA";
}

function parseJsonObject(value: string): unknown {
  const trimmed = value.trim();

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("La IA no devolvió un JSON válido.");
    }

    return JSON.parse(match[0]) as unknown;
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();

  for (const item of value) {
    const label = typeof item === "string" ? item.trim() : "";

    if (label) {
      unique.add(label);
    }
  }

  return Array.from(unique).slice(0, 10);
}

function getOutputString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function getDocLabel(doc: SanityReferenceDoc): string {
  return getString(doc.nombre);
}

function createFighterAliases(label: string): string[] {
  const normalized = normalizeText(
    label
      .replace(/["“”][^"“”]+["“”]/g, " ")
      .replace(/[‘'][^‘']+[’']/g, " ")
      .replace(/\([^)]*\)/g, " ")
  );

  if (!normalized) {
    return [];
  }

  const tokens = normalized.split(" ").filter(Boolean);
  const aliases = new Set<string>([normalized]);

  if (tokens.length >= 2) {
    aliases.add(`${tokens[0]} ${tokens[tokens.length - 1]}`);
  }

  if (tokens.length >= 3) {
    aliases.add(`${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`);
  }

  const lastToken = tokens[tokens.length - 1];

  if (lastToken && lastToken.length >= 5) {
    aliases.add(lastToken);
  }

  return Array.from(aliases).filter((alias) => alias.length >= 5);
}

function scoreLabelMention(searchText: string, label: string): number {
  const cleanLabel = label.trim();

  if (!cleanLabel) {
    return 0;
  }

  if (textContainsPhrase(searchText, cleanLabel)) {
    return 100;
  }

  const aliases = createFighterAliases(cleanLabel);
  let bestScore = 0;

  for (const alias of aliases) {
    if (textContainsPhrase(searchText, alias)) {
      const tokens = alias.split(" ").filter(Boolean);
      bestScore = Math.max(bestScore, tokens.length >= 2 ? 80 : 45);
    }
  }

  return bestScore;
}

function scoreEventMention(searchText: string, event: SanityEventDoc): number {
  const label = getDocLabel(event);

  if (!label) {
    return 0;
  }

  let score = scoreLabelMention(searchText, label);

  const slug = getString(event.slug?.current);

  if (slug && textContainsPhrase(searchText, slug.replace(/-/g, " "))) {
    score = Math.max(score, 80);
  }

  const cartelPrincipal = getString(event.cartelPrincipal);

  if (cartelPrincipal && textContainsPhrase(searchText, cartelPrincipal)) {
    score = Math.max(score, 70);
  }

  return score;
}

function scoreFightMention(searchText: string, fight: SanityFightDoc): number {
  const red = getString(fight.luchadorRojo?.nombre);
  const blue = getString(fight.luchadorAzul?.nombre);

  if (!red || !blue) {
    return 0;
  }

  const redScore = scoreLabelMention(searchText, red);
  const blueScore = scoreLabelMention(searchText, blue);

  if (redScore > 0 && blueScore > 0) {
    return redScore + blueScore + 60;
  }

  return 0;
}

function rankByMention<T>(
  items: T[],
  getScore: (item: T) => number,
  limit: number
): T[] {
  return items
    .map((item): Ranked<T> => ({ item, score: getScore(item) }))
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, limit)
    .map((item) => item.item);
}

function compactList(values: string[], limit: number): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(
    0,
    limit
  );
}

function formatReferenceList(docs: SanityReferenceDoc[], limit: number): string {
  const labels = docs.map(getDocLabel).filter(Boolean).slice(0, limit);
  return labels.length > 0 ? labels.join(" | ") : "Sin coincidencias claras en Sanity.";
}

function formatEvents(events: SanityEventDoc[]): string {
  if (events.length === 0) {
    return "Sin eventos coincidentes en Sanity.";
  }

  return events
    .map((event) => {
      const parts = [
        getDocLabel(event),
        event.fecha ? `fecha: ${event.fecha}` : "",
        event.disciplina?.nombre ? `disciplina: ${event.disciplina.nombre}` : "",
        event.organizacion?.nombre ? `organización: ${event.organizacion.nombre}` : "",
      ].filter(Boolean);

      return parts.join(" · ");
    })
    .join("\n");
}

function formatFighters(fighters: SanityFighterDoc[]): string {
  if (fighters.length === 0) {
    return "Sin luchadores coincidentes en Sanity.";
  }

  return fighters
    .map((fighter) => {
      const parts = [
        getDocLabel(fighter),
        fighter.apodo ? `apodo: ${fighter.apodo}` : "",
        fighter.disciplina?.nombre ? `disciplina: ${fighter.disciplina.nombre}` : "",
        fighter.organizacion?.nombre ? `organización: ${fighter.organizacion.nombre}` : "",
      ].filter(Boolean);

      return parts.join(" · ");
    })
    .join("\n");
}

function formatFights(fights: SanityFightDoc[]): string {
  if (fights.length === 0) {
    return "Sin combates coincidentes en Sanity.";
  }

  return fights
    .map((fight) => {
      const red = getString(fight.luchadorRojo?.nombre) || "Sin rojo";
      const blue = getString(fight.luchadorAzul?.nombre) || "Sin azul";
      const parts = [
        `${red} vs ${blue}`,
        fight.evento?.nombre ? `evento: ${fight.evento.nombre}` : "",
        fight.disciplina?.nombre ? `disciplina: ${fight.disciplina.nombre}` : "",
        fight.organizacion?.nombre ? `organización: ${fight.organizacion.nombre}` : "",
        fight.estado ? `estado: ${fight.estado}` : "",
      ].filter(Boolean);

      return parts.join(" · ");
    })
    .join("\n");
}

async function fetchSanityContext(): Promise<SanityContext> {
  return client.fetch<SanityContext>(
    `{
      "disciplinas": *[_type == "disciplina"] | order(nombre asc){
        _id,
        nombre,
        slug
      },
      "organizaciones": *[_type == "organizacion"] | order(nombre asc){
        _id,
        nombre,
        slug,
        disciplinas
      },
      "eventos": *[_type == "evento"] | order(fecha desc)[0...160]{
        _id,
        nombre,
        slug,
        fecha,
        cartelPrincipal,
        disciplina->{"_ref": _id, nombre},
        organizacion->{"_ref": _id, nombre}
      },
      "luchadores": *[_type == "luchador"] | order(nombre asc){
        _id,
        nombre,
        slug,
        apodo,
        disciplina->{"_ref": _id, nombre},
        organizacion->{"_ref": _id, nombre}
      },
      "combates": *[_type == "combate"] | order(_createdAt desc)[0...220]{
        _id,
        evento->{"_ref": _id, nombre},
        disciplina->{"_ref": _id, nombre},
        organizacion->{"_ref": _id, nombre},
        luchadorRojo->{"_ref": _id, nombre},
        luchadorAzul->{"_ref": _id, nombre},
        estado
      }
    }`,
    {},
    {
      perspective: "raw",
      cache: "no-store",
    }
  );
}

function createContextPrompt(params: {
  sourceText: string;
  fallbackDiscipline: string;
  sanityContext: SanityContext;
}): string {
  const { sourceText, fallbackDiscipline, sanityContext } = params;

  const oneOrganization = sanityContext.organizaciones.find((organization) =>
    normalizeText(getDocLabel(organization)).includes("one championship")
  );

  const candidateDisciplines = sanityContext.disciplinas.filter((discipline) => {
    const label = getDocLabel(discipline);
    return ["MMA", "Muay Thai", "Kickboxing", "Jiu-Jitsu", "Submission Grappling"]
      .some((expected) => normalizeText(label) === normalizeText(expected)) ||
      normalizeText(label) === normalizeText(fallbackDiscipline);
  });

  const candidateEvents = rankByMention(
    sanityContext.eventos,
    (event) => scoreEventMention(sourceText, event),
    20
  );

  const candidateFighters = rankByMention(
    sanityContext.luchadores,
    (fighter) => scoreLabelMention(sourceText, getDocLabel(fighter)),
    45
  );

  const candidateFights = rankByMention(
    sanityContext.combates,
    (fight) => scoreFightMention(sourceText, fight),
    20
  );

  const disciplineLabels = compactList(
    [
      ...candidateDisciplines.map(getDocLabel),
      fallbackDiscipline,
      "MMA",
      "Muay Thai",
      "Kickboxing",
      "Jiu-Jitsu",
    ],
    12
  );

  const organizationLabels = compactList(
    [
      oneOrganization ? getDocLabel(oneOrganization) : "ONE Championship",
      ...sanityContext.organizaciones
        .filter((organization) => scoreLabelMention(sourceText, getDocLabel(organization)) > 0)
        .map(getDocLabel),
    ],
    10
  );

  return [
    "Contexto real disponible en Sanity para resolver relaciones.",
    "Usa estos nombres EXACTOS cuando correspondan. Si una entidad no está en la lista pero aparece claramente en la noticia, usa su nombre oficial textual y el laboratorio la marcará como pendiente.",
    "",
    `Disciplinas candidatas: ${disciplineLabels.join(" | ") || fallbackDiscipline}`,
    `Organizaciones candidatas: ${organizationLabels.join(" | ") || "ONE Championship"}`,
    "",
    "Eventos candidatos detectados en Sanity:",
    formatEvents(candidateEvents),
    "",
    "Luchadores candidatos detectados en Sanity:",
    formatFighters(candidateFighters),
    "",
    "Combates candidatos detectados en Sanity:",
    formatFights(candidateFights),
    "",
    "Criterio de relación:",
    "- Elige una sola disciplina principal por la noticia completa, no por una palabra aislada.",
    "- Si una noticia trata una cartelera/evento completo, el evento es protagonista y los luchadores principales son los del main event y co-main si están claros.",
    "- Si una noticia trata un combate concreto, prioriza esos dos luchadores y el evento de ese combate.",
    "- Si una noticia mezcla dos eventos sin foco único, deja evento vacío salvo que uno sea claramente el foco editorial.",
    "- No metas todos los nombres mencionados: solo protagonistas o secundarios realmente relevantes.",
    "- No inventes entidades, fechas ni combates.",
  ].join("\n");
}

function validateRelations(
  value: Record<string, unknown>,
  fallbackDiscipline: string
): SuggestedNewsRelations {
  const rawRelations = value.relacionesSugeridas;
  const relations =
    typeof rawRelations === "object" && rawRelations !== null && !Array.isArray(rawRelations)
      ? (rawRelations as Record<string, unknown>)
      : {};

  return {
    luchadores: asStringArray(relations.luchadores),
    evento: getOutputString(relations, "evento"),
    organizacion: getOutputString(relations, "organizacion") || "ONE Championship",
    disciplina: getOutputString(relations, "disciplina") || fallbackDiscipline,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return jsonWithCors(
        request,
        {
          ok: false,
          error: "Falta OPENAI_API_KEY para transformar noticias ONE Championship.",
        },
        { status: 500 }
      );
    }

    let body: TransformOneNewsBody;

    try {
      body = (await request.json()) as TransformOneNewsBody;
    } catch {
      return jsonWithCors(
        request,
        {
          ok: false,
          error: "El cuerpo recibido no es un JSON válido.",
        },
        { status: 400 }
      );
    }

    const title = getString(body.title);
    const summary = getString(body.summary);
    const sourceBody = cleanText(getString(body.bodyText));
    const sourceUrl = getString(body.sourceUrl);

    if (!title) {
      return jsonWithCors(
        request,
        {
          ok: false,
          error: "Falta el título de la noticia ONE Championship.",
        },
        { status: 400 }
      );
    }

    const sourceText = cleanText([summary, sourceBody].filter(Boolean).join("\n\n"));

    if (sourceText.length < 80) {
      return jsonWithCors(
        request,
        {
          ok: false,
          error: "La noticia ONE Championship no tiene contenido suficiente para transformarse con seguridad.",
        },
        { status: 400 }
      );
    }

    const fullSourceText = cleanText(`${title}\n\n${summary}\n\n${sourceBody}`);
    const fallbackDiscipline = inferDisciplineFromText(fullSourceText);
    const sanityContext = await fetchSanityContext();
    const contextPrompt = createContextPrompt({
      sourceText: fullSourceText,
      fallbackDiscipline,
      sanityContext,
    });

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_EDITORIAL_MODEL || "gpt-4.1-mini",
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "Eres un editor senior de Full Fight News especializado en deportes de combate.",
            "Transformas fuentes oficiales en borradores periodísticos originales en español de España.",
            "Tu prioridad no es traducir: es entender la noticia completa, detectar el hecho principal y resolver relaciones editoriales útiles.",
            "ONE Championship mezcla MMA, Muay Thai, Kickboxing y Submission Grappling; no asumas MMA por defecto si el texto apunta a otra disciplina.",
            "No copies frases extensas ni traduzcas literalmente.",
            "Conserva hechos, nombres, fechas, resultados, citas y atribución a ONE Championship.",
            "Devuelve solo JSON válido.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "Fuente oficial: ONE Championship",
            `URL: ${sourceUrl || "No disponible"}`,
            `Disciplina de respaldo si el texto no permite inferir otra: ${fallbackDiscipline}`,
            "",
            contextPrompt,
            "",
            `Título original: ${title}`,
            summary ? `Resumen original: ${summary}` : "Resumen original: No disponible",
            "",
            "Texto fuente:",
            limitText(sourceBody || summary, 14000),
            "",
            "Devuelve este JSON exacto:",
            JSON.stringify({
              titulo: "Título periodístico en español, claro y no sensacionalista",
              extracto: "Resumen de 90 a 180 caracteres",
              contenido: "Cuerpo editorial en español con 3 a 7 párrafos separados por doble salto de línea",
              relacionesSugeridas: {
                luchadores: [
                  "Nombres exactos de atletas protagonistas o relevantes; si existen en Sanity usa el nombre exacto listado",
                ],
                evento:
                  "Nombre exacto del evento si hay uno principal claro; si no hay foco único, cadena vacía",
                organizacion: "ONE Championship",
                disciplina:
                  "Disciplina principal: MMA, Muay Thai, Kickboxing, Jiu-Jitsu u otra existente en Sanity",
              },
            }),
          ].join("\n"),
        },
      ],
    });

    const rawContent = completion.choices[0]?.message.content;

    if (!rawContent) {
      throw new Error("La IA no devolvió contenido.");
    }

    const parsed = parseJsonObject(rawContent);

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("La IA devolvió una estructura inválida.");
    }

    const record = parsed as Record<string, unknown>;
    const titulo = getOutputString(record, "titulo") || title;
    const extracto = limitText(getOutputString(record, "extracto") || summary || sourceText, 220);
    const contenido = cleanText(getOutputString(record, "contenido") || sourceText);
    const relacionesSugeridas = validateRelations(record, fallbackDiscipline);

    if (!contenido) {
      throw new Error("La transformación no generó contenido editorial.");
    }

    return jsonWithCors(request, {
      ok: true,
      data: {
        titulo: limitText(titulo, 160),
        extracto,
        contenido,
        relacionesSugeridas,
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
            : "Error desconocido transformando noticia ONE Championship.",
      },
      { status: 500 }
    );
  }
}
