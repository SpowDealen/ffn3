import type {
  BuildOutputResult,
  ContentFormState,
  OrganizacionSanityOutput,
  ValidationIssue,
} from "../types";
import { createSlugValue, hasValidSlugValue } from "../utils/slug";

type BuildOrganizacionOutputParams = {
  form: ContentFormState;
};

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getBoolean(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getReferenceArrayValues(value: unknown): Array<{
  _type: "reference";
  _ref: string;
}> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (
        item &&
        typeof item === "object" &&
        "_ref" in item &&
        typeof (item as { _ref?: unknown })._ref === "string"
      ) {
        const ref = ((item as { _ref?: string })._ref || "").trim();

        if (ref) {
          return {
            _type: "reference" as const,
            _ref: ref,
          };
        }
      }

      return null;
    })
    .filter((item): item is { _type: "reference"; _ref: string } => Boolean(item));
}

function getStringArrayFromTextarea(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasImageValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }

  return false;
}

function isValidUrl(value: string): boolean {
  return /^https?:\/\/.+/i.test(value);
}

function addIssue(
  issues: ValidationIssue[],
  field: string,
  message: string,
  severity: "error" | "warning" = "error"
): void {
  issues.push({ field, message, severity });
}

export function buildOrganizacionOutput({
  form,
}: BuildOrganizacionOutputParams): BuildOutputResult<OrganizacionSanityOutput> {
  const issues: ValidationIssue[] = [];

  const nombre = getString(form.nombre);
  const descripcionCorta = getString(form.descripcionCorta);
  const descripcion = getString(form.descripcion);
  const paisOrigen = getString(form.paisOrigen);
  const sede = getString(form.sede);
  const identidad = getString(form.identidad);
  const sitioWeb = getString(form.sitioWeb);
  const activa = getBoolean(form.activa, true);
  const anioFundacion = getNumber(form.anioFundacion);
  const logo = form.logo;
  const banner = form.banner;
  const disciplinas = getReferenceArrayValues(form.disciplinas);
  const datosCuriosos = getStringArrayFromTextarea(form.datosCuriosos);

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

  if (!hasImageValue(logo)) {
    addIssue(issues, "logo", "El logo es obligatorio.");
  }

  if (!descripcionCorta) {
    addIssue(issues, "descripcionCorta", "La descripción corta es obligatoria.");
  } else {
    if (descripcionCorta.length < 20) {
      addIssue(
        issues,
        "descripcionCorta",
        "La descripción corta debe tener al menos 20 caracteres."
      );
    }

    if (descripcionCorta.length > 180) {
      addIssue(
        issues,
        "descripcionCorta",
        "La descripción corta no puede superar 180 caracteres."
      );
    }
  }

  if (!descripcion) {
    addIssue(issues, "descripcion", "La descripción es obligatoria.");
  } else {
    if (descripcion.length < 60) {
      addIssue(
        issues,
        "descripcion",
        "La descripción debe tener al menos 60 caracteres."
      );
    }

    if (descripcion.length > 1600) {
      addIssue(
        issues,
        "descripcion",
        "La descripción no puede superar 1600 caracteres."
      );
    }
  }

  if (!paisOrigen) {
    addIssue(issues, "paisOrigen", "El país de origen es obligatorio.");
  } else {
    if (paisOrigen.length < 2) {
      addIssue(
        issues,
        "paisOrigen",
        "El país de origen debe tener al menos 2 caracteres."
      );
    }

    if (paisOrigen.length > 80) {
      addIssue(
        issues,
        "paisOrigen",
        "El país de origen no puede superar 80 caracteres."
      );
    }
  }

  if (sede && sede.length > 120) {
    addIssue(issues, "sede", "La sede no puede superar 120 caracteres.");
  }

  if (anioFundacion !== undefined) {
    const currentYear = new Date().getFullYear();

    if (!Number.isInteger(anioFundacion)) {
      addIssue(
        issues,
        "anioFundacion",
        "El año de fundación debe ser un número entero."
      );
    }

    if (anioFundacion < 1900) {
      addIssue(
        issues,
        "anioFundacion",
        "El año de fundación no puede ser inferior a 1900."
      );
    }

    if (anioFundacion > currentYear) {
      addIssue(
        issues,
        "anioFundacion",
        `El año de fundación no puede superar ${currentYear}.`
      );
    }
  }

  if (identidad) {
    if (identidad.length < 20) {
      addIssue(
        issues,
        "identidad",
        "La identidad debe tener al menos 20 caracteres."
      );
    }

    if (identidad.length > 800) {
      addIssue(
        issues,
        "identidad",
        "La identidad no puede superar 800 caracteres."
      );
    }
  }

  if (datosCuriosos.length > 8) {
    addIssue(
      issues,
      "datosCuriosos",
      "No puede haber más de 8 datos curiosos."
    );
  }

  for (const item of datosCuriosos) {
    if (item.length < 4) {
      addIssue(
        issues,
        "datosCuriosos",
        "Cada dato curioso debe tener al menos 4 caracteres."
      );
      break;
    }

    if (item.length > 220) {
      addIssue(
        issues,
        "datosCuriosos",
        "Cada dato curioso no puede superar 220 caracteres."
      );
      break;
    }
  }

  const uniqueDatosCuriosos = new Set(datosCuriosos.map((item) => item.toLowerCase()));
  if (uniqueDatosCuriosos.size !== datosCuriosos.length) {
    addIssue(
      issues,
      "datosCuriosos",
      "Los datos curiosos no deben repetirse."
    );
  }

  if (disciplinas.length === 0) {
    addIssue(
      issues,
      "disciplinas",
      "Debes indicar al menos una disciplina."
    );
  }

  const uniqueDisciplinaRefs = new Set(disciplinas.map((item) => item._ref));
  if (uniqueDisciplinaRefs.size !== disciplinas.length) {
    addIssue(
      issues,
      "disciplinas",
      "Las disciplinas no deben repetirse."
    );
  }

  if (sitioWeb && !isValidUrl(sitioWeb)) {
    addIssue(
      issues,
      "sitioWeb",
      "El sitio web debe empezar por http:// o https://"
    );
  }

  if (
    !sede &&
    anioFundacion === undefined &&
    !identidad &&
    datosCuriosos.length === 0 &&
    !sitioWeb
  ) {
    addIssue(
      issues,
      "descripcion",
      "La organización cumple lo mínimo, pero está demasiado pelada de contexto institucional.",
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

  const output: OrganizacionSanityOutput = {
    _type: "organizacion",
    nombre,
    slug,
    logo,
    descripcionCorta,
    descripcion,
    paisOrigen,
    disciplinas,
    activa,
  };

  if (hasImageValue(banner)) {
    output.banner = banner;
  }

  if (sede) {
    output.sede = sede;
  }

  if (anioFundacion !== undefined) {
    output.anioFundacion = anioFundacion;
  }

  if (identidad) {
    output.identidad = identidad;
  }

  if (datosCuriosos.length > 0) {
    output.datosCuriosos = datosCuriosos;
  }

  if (sitioWeb) {
    output.sitioWeb = sitioWeb;
  }

  return {
    ok: true,
    output,
    issues,
  };
}