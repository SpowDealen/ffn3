import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TransformarNoticiaBody = {
  title?: string;
  summary?: string;
  bodyText?: string;
  sourceUrl?: string;
};

type TransformedNews = {
  titulo: string;
  extracto: string;
  contenido: string;
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

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateTransformedNews(value: unknown): TransformedNews {
  if (!isRecord(value)) {
    throw new Error("La respuesta de la IA no tiene un formato válido.");
  }

  const titulo = getString(value.titulo);
  const extracto = getString(value.extracto);
  const contenido = getString(value.contenido);

  if (!titulo) {
    throw new Error("La IA no devolvió un título válido.");
  }

  if (!extracto) {
    throw new Error("La IA no devolvió un extracto válido.");
  }

  if (!contenido) {
    throw new Error("La IA no devolvió contenido válido.");
  }

  return {
    titulo,
    extracto: extracto.slice(0, 220),
    contenido,
  };
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCors(
    new NextResponse(null, {
      status: 204,
    })
  );
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
        {
          status: 500,
        }
      );
    }

    let body: TransformarNoticiaBody;

    try {
      body = (await request.json()) as TransformarNoticiaBody;
    } catch {
      return jsonWithCors(
        {
          ok: false,
          error: "El body no es un JSON válido.",
        },
        {
          status: 400,
        }
      );
    }

    const title = getString(body.title);
    const summary = getString(body.summary);
    const bodyText = getString(body.bodyText);
    const sourceUrl = getString(body.sourceUrl);

    if (!title) {
      return jsonWithCors(
        {
          ok: false,
          error: "Falta el título de la noticia.",
        },
        {
          status: 400,
        }
      );
    }

    if (!summary && !bodyText) {
      return jsonWithCors(
        {
          ok: false,
          error: "La noticia no incluye resumen ni cuerpo.",
        },
        {
          status: 400,
        }
      );
    }

    const openai = new OpenAI({
      apiKey,
    });

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: [
        "Eres redactor de Full Fight News, un medio español especializado en deportes de combate.",
        "Transforma la fuente oficial en inglés en una noticia periodística original en español.",
        "No hagas una traducción literal.",
        "No inventes hechos, fechas, nombres, resultados, lugares ni declaraciones.",
        "Mantén todas las citas fieles al sentido original.",
        "Atribuye a UFC cuando la información proceda directamente de la organización.",
        "Evita lenguaje promocional, exageraciones y frases corporativas.",
        "Escribe en español de España, con estilo informativo, claro y profesional.",
        "El título debe tener entre 8 y 160 caracteres.",
        "El extracto debe tener entre 20 y 220 caracteres.",
        "El contenido debe estar dividido en párrafos y listo para revisión editorial.",
      ].join("\n"),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `TÍTULO ORIGINAL:\n${title}`,
                summary ? `RESUMEN ORIGINAL:\n${summary}` : "",
                bodyText ? `CUERPO ORIGINAL:\n${bodyText}` : "",
                sourceUrl ? `FUENTE OFICIAL:\n${sourceUrl}` : "",
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "noticia_transformada",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              titulo: {
                type: "string",
              },
              extracto: {
                type: "string",
              },
              contenido: {
                type: "string",
              },
            },
            required: ["titulo", "extracto", "contenido"],
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

    const transformed = validateTransformedNews(parsedOutput);

    return jsonWithCors({
      ok: true,
      data: transformed,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido transformando la noticia.";

    console.error("Error en transformar-noticia:", error);

    return jsonWithCors(
      {
        ok: false,
        error: message,
      },
      {
        status: 500,
      }
    );
  }
}