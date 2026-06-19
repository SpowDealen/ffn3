import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TransformarOrganizacionBody = {
  nombre?: string;
  descripcionCorta?: string;
  descripcion?: string;
  paisOrigen?: string;
  sede?: string;
  anioFundacion?: unknown;
  identidad?: string;
  datosCuriosos?: string;
  sitioWeb?: string;
  disciplinas?: unknown;
  enfoqueEditorial?: string;
  rasgosDiferenciales?: string;
  contextoHistorico?: string;
  tono?: string;
};

type TransformedOrganization = {
  descripcionCorta: string;
  descripcion: string;
  paisOrigen: string;
  sede: string;
  anioFundacion?: number;
  identidad: string;
  datosCuriosos: string[];
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

function getOptionalYear(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());

    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => getString(item))
        .filter(Boolean)
    )
  );
}

function splitTextareaLines(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function limitText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function validateTransformedOrganization(value: unknown): TransformedOrganization {
  if (!isRecord(value)) {
    throw new Error("La respuesta de la IA no tiene un formato válido.");
  }

  const descripcionCorta = getString(value.descripcionCorta);
  const descripcion = getString(value.descripcion);
  const paisOrigen = getString(value.paisOrigen);
  const sede = getString(value.sede);
  const anioFundacion = getOptionalYear(value.anioFundacion);
  const identidad = getString(value.identidad);
  const datosCuriosos = getStringArray(value.datosCuriosos).slice(0, 8);

  if (!descripcionCorta) {
    throw new Error("La IA no devolvió una descripción corta válida.");
  }

  if (!descripcion) {
    throw new Error("La IA no devolvió una descripción editorial válida.");
  }

  if (!paisOrigen) {
    throw new Error(
      "La IA no pudo resolver un país de origen. Indícalo manualmente y vuelve a generar."
    );
  }

  return {
    descripcionCorta: limitText(descripcionCorta, 180),
    descripcion: limitText(descripcion, 1600),
    paisOrigen: limitText(paisOrigen, 80),
    sede: limitText(sede, 120),
    anioFundacion,
    identidad: limitText(identidad, 800),
    datosCuriosos: datosCuriosos.map((item) => limitText(item, 220)),
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

    let body: TransformarOrganizacionBody;

    try {
      body = (await request.json()) as TransformarOrganizacionBody;
    } catch {
      return jsonWithCors(
        {
          ok: false,
          error: "El body no es un JSON válido.",
        },
        { status: 400 }
      );
    }

    const nombre = getString(body.nombre);
    const descripcionCorta = getString(body.descripcionCorta);
    const descripcion = getString(body.descripcion);
    const paisOrigen = getString(body.paisOrigen);
    const sede = getString(body.sede);
    const anioFundacion = getOptionalYear(body.anioFundacion);
    const identidad = getString(body.identidad);
    const datosCuriosos = getString(body.datosCuriosos);
    const sitioWeb = getString(body.sitioWeb);
    const disciplinas = getStringArray(body.disciplinas);
    const enfoqueEditorial = getString(body.enfoqueEditorial);
    const rasgosDiferenciales = getString(body.rasgosDiferenciales);
    const contextoHistorico = getString(body.contextoHistorico);
    const tono = getString(body.tono);

    if (!nombre) {
      return jsonWithCors(
        {
          ok: false,
          error: "Falta el nombre de la organización.",
        },
        { status: 400 }
      );
    }

    if (disciplinas.length === 0) {
      return jsonWithCors(
        {
          ok: false,
          error: "Selecciona al menos una disciplina antes de preparar la organización.",
        },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: [
        "Eres editor de Full Fight News, un medio español especializado en deportes de combate.",
        "Convierte los datos de una organización en una ficha editorial original en español.",
        "No inventes logo, banner, URLs, sedes, fechas ni datos concretos si no están indicados o no son ampliamente conocidos.",
        "Puedes usar conocimiento general estable sobre organizaciones muy conocidas, pero si un dato concreto es dudoso devuélvelo vacío.",
        "Mantén intactos nombres propios, siglas y marcas.",
        "Evita tono promocional, exagerado o corporativo.",
        "La descripción corta debe tener entre 20 y 180 caracteres.",
        "La descripción principal debe tener entre 60 y 1600 caracteres.",
        "La identidad debe explicar qué diferencia a la organización sin vender humo.",
        "Los datos curiosos deben ser seguros, breves y no repetidos. Si no hay datos seguros, devuelve array vacío.",
        "Devuelve exclusivamente el JSON solicitado.",
      ].join("\n"),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `NOMBRE: ${nombre}`,
                `DISCIPLINAS: ${disciplinas.join(", ")}`,
                descripcionCorta ? `DESCRIPCIÓN CORTA ACTUAL: ${descripcionCorta}` : "",
                descripcion ? `DESCRIPCIÓN ACTUAL: ${descripcion}` : "",
                paisOrigen ? `PAÍS DE ORIGEN: ${paisOrigen}` : "",
                sede ? `SEDE: ${sede}` : "",
                anioFundacion ? `AÑO DE FUNDACIÓN: ${anioFundacion}` : "",
                identidad ? `IDENTIDAD ACTUAL: ${identidad}` : "",
                datosCuriosos ? `DATOS CURIOSOS ACTUALES: ${datosCuriosos}` : "",
                sitioWeb ? `SITIO WEB: ${sitioWeb}` : "",
                enfoqueEditorial ? `ENFOQUE EDITORIAL: ${enfoqueEditorial}` : "",
                rasgosDiferenciales ? `RASGOS DIFERENCIALES: ${rasgosDiferenciales}` : "",
                contextoHistorico ? `CONTEXTO HISTÓRICO: ${contextoHistorico}` : "",
                tono ? `TONO: ${tono}` : "",
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
          name: "organizacion_transformada_ffn",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              descripcionCorta: { type: "string" },
              descripcion: { type: "string" },
              paisOrigen: { type: "string" },
              sede: { type: "string" },
              anioFundacion: {
                anyOf: [{ type: "number" }, { type: "null" }],
              },
              identidad: { type: "string" },
              datosCuriosos: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: [
              "descripcionCorta",
              "descripcion",
              "paisOrigen",
              "sede",
              "anioFundacion",
              "identidad",
              "datosCuriosos",
            ],
          },
        },
      },
    });

    const outputText = response.output_text;

    if (!outputText) {
      throw new Error("La IA no devolvió texto utilizable.");
    }

    const parsed = JSON.parse(outputText) as unknown;
    const transformed = validateTransformedOrganization(parsed);

    return jsonWithCors({
      ok: true,
      data: transformed,
    });
  } catch (error) {
    return jsonWithCors(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Error desconocido transformando la organización.",
      },
      { status: 500 }
    );
  }
}
