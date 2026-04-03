import type {
  BuildOutputResult,
  CategoriaPesoSanityOutput,
  ContentFormState,
  ValidationIssue,
} from "../types";
import { createRequiredReference } from "../utils/references";
import { createSlugValue, hasValidSlugValue } from "../utils/slug";

type BuildCategoriaPesoOutputParams = {
  form: ContentFormState;
};

type ReferenceInput = string | { _ref?: string | null; _type?: string };

const UNIDADES_VALIDAS = ["lb", "kg"] as const;

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getReferenceInput(value: unknown): ReferenceInput | null {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    const candidate = value as { _ref?: unknown; _type?: unknown };

    if (
      typeof candidate._ref === "string" ||
      typeof candidate._ref === "undefined" ||
      candidate._ref === null
    ) {
      return {
        _ref:
          typeof candidate._ref === "string" || candidate._ref === null
            ? candidate._ref
            : undefined,
        _type: typeof candidate._type === "string" ? candidate._type : undefined,
      };
    }
  }

  return null;
}

function addIssue(
  issues: ValidationIssue[],
  field: string,
  message: string,
  severity: "error" | "warning" = "error"
): void {
  issues.push({ field, message, severity });
}

function isUnidadValida(
  value: string
): value is CategoriaPesoSanityOutput["unidad"] {
  return UNIDADES_VALIDAS.includes(value as CategoriaPesoSanityOutput["unidad"]);
}

export function buildCategoriaPesoOutput({
  form,
}: BuildCategoriaPesoOutputParams): BuildOutputResult<CategoriaPesoSanityOutput> {
  const issues: ValidationIssue[] = [];

  const nombre = getString(form.nombre);
  const unidadRaw = getString(form.unidad);
  const descripcion = getString(form.descripcion);
  const limitePeso = getNumber(form.limitePeso);

  const slug = hasValidSlugValue(form.slug)
    ? form.slug
    : createSlugValue(nombre, { maxLength: 96, fallback: "sin-slug" });

  if (!nombre) {
    addIssue(issues, "nombre", "El nombre es obligatorio.");
  } else {
    if (nombre.length < 2) {
      addIssue(issues, "nombre", "El nombre debe tener al menos 2 caracteres.");
    }

    if (nombre.length > 120) {
      addIssue(issues, "nombre", "El nombre no puede superar 120 caracteres.");
    }
  }

  let disciplina: CategoriaPesoSanityOutput["disciplina"] | null = null;

  try {
    disciplina = createRequiredReference(
      getReferenceInput(form.disciplina),
      "La disciplina"
    ) as CategoriaPesoSanityOutput["disciplina"];
  } catch (error) {
    addIssue(
      issues,
      "disciplina",
      error instanceof Error ? error.message : "La disciplina es obligatoria."
    );
  }

  if (limitePeso === undefined) {
    addIssue(issues, "limitePeso", "El límite de peso es obligatorio.");
  } else {
    if (limitePeso <= 0) {
      addIssue(
        issues,
        "limitePeso",
        "El límite de peso debe ser un número positivo."
      );
    }

    if (!Number.isInteger(limitePeso)) {
      addIssue(
        issues,
        "limitePeso",
        "El límite de peso debería ser un número entero para mantener consistencia editorial.",
        "warning"
      );
    }
  }

  if (!unidadRaw) {
    addIssue(issues, "unidad", "La unidad es obligatoria.");
  } else if (!isUnidadValida(unidadRaw)) {
    addIssue(issues, "unidad", "La unidad debe ser lb o kg.");
  }

  if (descripcion) {
    if (descripcion.length < 10) {
      addIssue(
        issues,
        "descripcion",
        "La descripción debe tener al menos 10 caracteres."
      );
    }

    if (descripcion.length > 500) {
      addIssue(
        issues,
        "descripcion",
        "La descripción no puede superar 500 caracteres."
      );
    }

    if (descripcion.length >= 10 && descripcion.length < 30) {
      addIssue(
        issues,
        "descripcion",
        "La descripción cumple el mínimo, pero sigue siendo pobre editorialmente.",
        "warning"
      );
    }
  } else {
    addIssue(
      issues,
      "descripcion",
      "La categoría cumple lo estructural, pero estaría bien añadir una breve descripción editorial.",
      "warning"
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

  const output: CategoriaPesoSanityOutput = {
    _type: "categoriaPeso",
    nombre,
    slug,
    disciplina: disciplina as CategoriaPesoSanityOutput["disciplina"],
    limitePeso: limitePeso as number,
    unidad: unidadRaw as CategoriaPesoSanityOutput["unidad"],
  };

  if (descripcion) {
    output.descripcion = descripcion;
  }

  return {
    ok: true,
    output,
    issues,
  };
}