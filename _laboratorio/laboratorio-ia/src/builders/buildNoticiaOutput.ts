import type {
  BuildOutputResult,
  ContentFormState,
  NoticiaSanityOutput,
  PortableTextValue,
  ReferenceValue,
  ValidationIssue,
} from "../types";
import { createSlugValue, hasValidSlugValue } from "../utils/slug";

type BuildNoticiaOutputParams = {
  form: ContentFormState;
};

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function getReferenceValue(value: unknown): ReferenceValue | undefined {
  if (
    value &&
    typeof value === "object" &&
    "_ref" in value &&
    typeof (value as { _ref?: unknown })._ref === "string"
  ) {
    const ref = ((value as { _ref?: string })._ref || "").trim();

    if (ref) {
      return {
        _type: "reference",
        _ref: ref,
      };
    }
  }

  return undefined;
}

function getReferenceArrayValues(value: unknown): ReferenceValue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => getReferenceValue(item))
    .filter((item): item is ReferenceValue => Boolean(item));
}

function createPortableTextFromString(value: string): PortableTextValue {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  return paragraphs.map((paragraph, index) => ({
    _type: "block",
    _key: `block-${index + 1}`,
    style: "normal",
    markDefs: [],
    children: [
      {
        _type: "span",
        _key: `span-${index + 1}`,
        text: paragraph,
        marks: [],
      },
    ],
  }));
}

function getPortableTextValue(value: unknown): PortableTextValue {
  if (typeof value === "string") {
    return createPortableTextFromString(value.trim());
  }

  if (Array.isArray(value)) {
    return value as PortableTextValue;
  }

  return [];
}

function getPortableTextPlainText(value: PortableTextValue): string {
  return value
    .map((block) => {
      if (!block || !Array.isArray(block.children)) {
        return "";
      }

      return block.children
        .map((child) => (typeof child?.text === "string" ? child.text : ""))
        .join("");
    })
    .join("\n\n")
    .trim();
}

function addIssue(
  issues: ValidationIssue[],
  field: string,
  message: string,
  severity: "error" | "warning" = "error"
): void {
  issues.push({ field, message, severity });
}

export function buildNoticiaOutput({
  form,
}: BuildNoticiaOutputParams): BuildOutputResult<NoticiaSanityOutput> {
  const issues: ValidationIssue[] = [];

  const titulo = getString(form.titulo);
  const extracto = getString(form.extracto);
  const contenido = getPortableTextValue(form.contenido);
  const contenidoTextoPlano = getPortableTextPlainText(contenido);
  const fechaPublicacion = getString(form.fechaPublicacion);
  const disciplina = getReferenceValue(form.disciplina);
  const organizacionRelacionada = getReferenceValue(form.organizacionRelacionada);
  const luchadoresRelacionados = getReferenceArrayValues(form.luchadoresRelacionados);
  const eventoRelacionado = getReferenceValue(form.eventoRelacionado);
  const destacada = getBoolean(form.destacada, false);
  const imagenPrincipal = form.imagenPrincipal;

  const slug = hasValidSlugValue(form.slug)
    ? form.slug
    : createSlugValue(titulo, { maxLength: 96, fallback: "sin-slug" });

  if (!titulo) {
    addIssue(issues, "titulo", "El título es obligatorio.");
  } else {
    if (titulo.length < 8) {
      addIssue(issues, "titulo", "El título debe tener al menos 8 caracteres.");
    }

    if (titulo.length > 160) {
      addIssue(issues, "titulo", "El título no puede superar 160 caracteres.");
    }
  }

  if (!extracto) {
    addIssue(issues, "extracto", "El extracto es obligatorio.");
  } else if (extracto.length < 20) {
    addIssue(issues, "extracto", "El extracto debe tener al menos 20 caracteres.");
  }

  if (!contenidoTextoPlano) {
    addIssue(issues, "contenido", "El contenido es obligatorio.");
  }

  if (!fechaPublicacion) {
    addIssue(issues, "fechaPublicacion", "La fecha de publicación es obligatoria.");
  }

  if (!disciplina) {
    addIssue(issues, "disciplina", "La disciplina es obligatoria.");
  }

  const uniqueFighterRefs = new Set(luchadoresRelacionados.map((item) => item._ref));
  if (uniqueFighterRefs.size !== luchadoresRelacionados.length) {
    addIssue(
      issues,
      "luchadoresRelacionados",
      "Los luchadores relacionados no deben repetirse."
    );
  }

  if (!slug.current.trim()) {
    addIssue(issues, "slug", "No se pudo generar un slug válido.");
  }

  if (issues.some((issue) => issue.severity === "error")) {
    return {
      ok: false,
      output: null,
      issues,
    };
  }

  const output: NoticiaSanityOutput = {
    _type: "noticia",
    titulo,
    slug,
    extracto,
    contenido,
    fechaPublicacion,
    disciplina: disciplina!,
    destacada,
  };

  if (imagenPrincipal) {
    output.imagenPrincipal = imagenPrincipal;
  }

  if (organizacionRelacionada) {
    output.organizacionRelacionada = organizacionRelacionada;
  }

  if (luchadoresRelacionados.length > 0) {
    output.luchadoresRelacionados = luchadoresRelacionados;
  }

  if (eventoRelacionado) {
    output.eventoRelacionado = eventoRelacionado;
  }

  return {
    ok: true,
    output,
    issues,
  };
}