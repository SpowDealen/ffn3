import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TransformEventBody = {
  name?: string;
  headline?: string;
  mainEvent?: string;
  startDate?: string;
  venue?: string;
  city?: string;
  region?: string;
  country?: string;
  locationText?: string;
  watchText?: string;
  description?: string;
  sourceUrl?: string;
  canonicalUrl?: string;
  status?: "proximo" | "celebrado" | "cancelado";
};

type TransformedEvent = {
  nombre: string;
  horaLocal: string;
  ciudad: string;
  pais: string;
  recinto: string;
  cartelPrincipal: string;
  dondeVer: string;
  descripcionCorta: string;
  descripcion: string;
  notas: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function withCors(response: NextResponse): NextResponse {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

function jsonWithCors(
  body: Record<string, unknown>,
  init?: ResponseInit
): NextResponse {
  return withCors(NextResponse.json(body, init));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function limitText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function getSpanishLocalTime(startDate: string): string {
  if (!startDate) {
    return "";
  }

  const date = new Date(startDate);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function validateTransformedEvent(value: unknown): TransformedEvent {
  if (!isRecord(value)) {
    throw new Error("La respuesta de la IA no tiene un formato válido.");
  }

  const transformed: TransformedEvent = {
    nombre: getString(value.nombre),
    horaLocal: getString(value.horaLocal),
    ciudad: getString(value.ciudad),
    pais: getString(value.pais),
    recinto: getString(value.recinto),
    cartelPrincipal: getString(value.cartelPrincipal),
    dondeVer: getString(value.dondeVer),
    descripcionCorta: getString(value.descripcionCorta),
    descripcion: getString(value.descripcion),
    notas: getString(value.notas),
  };

  if (!transformed.nombre) {
    throw new Error("La IA no devolvió un nombre válido.");
  }

  if (!transformed.descripcionCorta) {
    throw new Error("La IA no devolvió una descripción corta válida.");
  }

  if (!transformed.descripcion) {
    throw new Error("La IA no devolvió una descripción editorial válida.");
  }

  return {
    ...transformed,
    nombre: limitText(transformed.nombre, 140),
    horaLocal: limitText(transformed.horaLocal, 60),
    ciudad: limitText(transformed.ciudad, 100),
    pais: limitText(transformed.pais, 100),
    recinto: limitText(transformed.recinto, 140),
    cartelPrincipal: limitText(transformed.cartelPrincipal, 140),
    dondeVer: limitText(transformed.dondeVer, 180),
    descripcionCorta: limitText(transformed.descripcionCorta, 280),
    descripcion: limitText(transformed.descripcion, 3000),
    notas: limitText(transformed.notas, 1200),
  };
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return jsonWithCors(
        {
          ok: false,
          error: "Falta OPENAI_API_KEY en .env.local.",
        },
        { status: 500 }
      );
    }

    let body: TransformEventBody;

    try {
      body = (await request.json()) as TransformEventBody;
    } catch {
      return jsonWithCors(
        {
          ok: false,
          error: "El body no es un JSON válido.",
        },
        { status: 400 }
      );
    }

    const name = getString(body.name);
    const mainEvent = getString(body.mainEvent);
    const startDate = getString(body.startDate);
    const venue = getString(body.venue);
    const city = getString(body.city);
    const region = getString(body.region);
    const country = getString(body.country);
    const locationText = getString(body.locationText);
    const watchText = getString(body.watchText);
    const description = getString(body.description);
    const sourceUrl = getString(body.canonicalUrl) || getString(body.sourceUrl);
    const status = getString(body.status);

    if (!name) {
      return jsonWithCors(
        {
          ok: false,
          error: "Falta el nombre del evento.",
        },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });
    const horaLocal = getSpanishLocalTime(startDate);

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: [
        "Eres editor de Full Fight News, un medio español especializado en deportes de combate.",
        "Convierte los datos oficiales de un evento BKFC en una ficha editorial original en español.",
        "No inventes combates, fechas, horarios, recintos, plataformas ni ubicaciones.",
        "Puedes traducir nombres geográficos al español cuando exista una forma habitual.",
        "Mantén intactos los nombres propios de luchadores, recintos y marcas.",
        "Evita lenguaje promocional y frases corporativas de BKFC.",
        "La descripción corta debe resumir el evento en un máximo de 280 caracteres.",
        "La descripción editorial debe explicar el interés del evento sin inventar cartelera adicional.",
        "Si un dato no está disponible, devuelve una cadena vacía.",
        "Devuelve exclusivamente el JSON solicitado.",
      ].join("\n"),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `NOMBRE OFICIAL: ${name}`,
                mainEvent ? `CARTEL PRINCIPAL: ${mainEvent}` : "",
                startDate ? `FECHA ISO OFICIAL: ${startDate}` : "",
                horaLocal
                  ? `HORA CALCULADA EN ESPAÑA PENINSULAR: ${horaLocal}`
                  : "",
                venue ? `RECINTO: ${venue}` : "",
                city ? `CIUDAD: ${city}` : "",
                region ? `REGIÓN: ${region}` : "",
                country ? `PAÍS: ${country}` : "",
                locationText ? `UBICACIÓN COMPLETA: ${locationText}` : "",
                watchText ? `DÓNDE VER: ${watchText}` : "",
                description ? `DESCRIPCIÓN OFICIAL: ${description}` : "",
                status ? `ESTADO: ${status}` : "",
                sourceUrl ? `FUENTE OFICIAL: ${sourceUrl}` : "",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "evento_transformado",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              nombre: { type: "string" },
              horaLocal: { type: "string" },
              ciudad: { type: "string" },
              pais: { type: "string" },
              recinto: { type: "string" },
              cartelPrincipal: { type: "string" },
              dondeVer: { type: "string" },
              descripcionCorta: { type: "string" },
              descripcion: { type: "string" },
              notas: { type: "string" },
            },
            required: [
              "nombre",
              "horaLocal",
              "ciudad",
              "pais",
              "recinto",
              "cartelPrincipal",
              "dondeVer",
              "descripcionCorta",
              "descripcion",
              "notas",
            ],
          },
        },
      },
    });

    const rawOutput = response.output_text;

    if (!rawOutput) {
      throw new Error("OpenAI no devolvió contenido.");
    }

    let parsedOutput: unknown;

    try {
      parsedOutput = JSON.parse(rawOutput);
    } catch {
      throw new Error("OpenAI devolvió un JSON inválido.");
    }

    const transformed = validateTransformedEvent(parsedOutput);

    return jsonWithCors({
      ok: true,
      data: {
        ...transformed,
        horaLocal: horaLocal || transformed.horaLocal,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido transformando el evento.";

    console.error("Error en transformar-evento:", error);

    return jsonWithCors(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
