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
    const trimmedValue = value.trim();
    return trimmedValue ? trimmedValue : null;
  }

  if (value && typeof value === "object") {
    const candidate = value as { _ref?: unknown; _type?: unknown };

    if (typeof candidate._ref === "string") {
      const trimmedRef = candidate._ref.trim();

      if (!trimmedRef) {
        return null;
      }

      return {
        _ref: trimmedRef,
        _type: typeof candidate._type === "string" ? candidate._type : undefined,
      };
    }

    if (candidate._ref === null || typeof candidate._ref === "undefined") {
      return null;
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

function addPesoEditorialWarnings(
  issues: ValidationIssue[],
  limitePeso: number,
  unidad: CategoriaPesoSanityOutput["unidad"]
): void {
  if (unidad === "lb") {
    if (limitePeso < 90 || limitePeso > 350) {
      addIssue(
        issues,
        "limitePeso",
        "El límite de peso en lb parece fuera de un rango habitual para categorías de combate. Revísalo.",
        "warning"
      );
    }

    return;
  }

  if (unidad === "kg") {
    if (limitePeso < 40 || limitePeso > 160) {
      addIssue(
        issues,
        "limitePeso",
        "El límite de peso en kg parece fuera de un rango habitual para categorías de combate. Revísalo.",
        "warning"
      );
    }
  }
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

  if (
    limitePeso !== undefined &&
    limitePeso > 0 &&
    isUnidadValida(unidadRaw)
  ) {
    addPesoEditorialWarnings(issues, limitePeso, unidadRaw);
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