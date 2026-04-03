import type {
  BuildOutputResult,
  ContentFormState,
  EventoSanityOutput,
  ValidationIssue,
} from "../types";
import { createRequiredReference } from "../utils/references";
import { createSlugValue, hasValidSlugValue } from "../utils/slug";

type BuildEventoOutputParams = {
  form: ContentFormState;
};

type ReferenceInput = string | { _ref?: string | null; _type?: string };

const EVENTO_ESTADOS = ["proximo", "celebrado", "cancelado"] as const;

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function isValidIsoDateTime(value: string): boolean {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function isEventoEstado(value: string): value is EventoSanityOutput["estado"] {
  return EVENTO_ESTADOS.includes(value as EventoSanityOutput["estado"]);
}

function isValidHoraLocal(value: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(value);
}

export function buildEventoOutput({
  form,
}: BuildEventoOutputParams): BuildOutputResult<EventoSanityOutput> {
  const issues: ValidationIssue[] = [];

  const nombre = getString(form.nombre);
  const horaLocal = getString(form.horaLocal);
  const ciudad = getString(form.ciudad);
  const pais = getString(form.pais);
  const recinto = getString(form.recinto);
  const cartelPrincipal = getString(form.cartelPrincipal);
  const dondeVer = getString(form.dondeVer);
  const descripcionCorta = getString(form.descripcionCorta);
  const descripcion = getString(form.descripcion);
  const notas = getString(form.notas);
  const fecha = getString(form.fecha);
  const estadoRaw = getString(form.estado);
  const imagen = form.imagen;

  const slug = hasValidSlugValue(form.slug)
    ? form.slug
    : createSlugValue(nombre, { maxLength: 96, fallback: "sin-slug" });

  if (!nombre) {
    addIssue(issues, "nombre", "El nombre es obligatorio.");
  } else {
    if (nombre.length < 3) {
      addIssue(issues, "nombre", "El nombre debe tener al menos 3 caracteres.");
    }

    if (nombre.length > 140) {
      addIssue(issues, "nombre", "El nombre no puede superar 140 caracteres.");
    }
  }

  let fechaDate: Date | null = null;

  if (!fecha) {
    addIssue(issues, "fecha", "La fecha es obligatoria.");
  } else if (!isValidIsoDateTime(fecha)) {
    addIssue(issues, "fecha", "La fecha debe ser un datetime válido.");
  } else {
    fechaDate = new Date(fecha);
  }

  if (horaLocal) {
    if (horaLocal.length > 60) {
      addIssue(
        issues,
        "horaLocal",
        "La hora local no puede superar 60 caracteres."
      );
    } else if (!isValidHoraLocal(horaLocal)) {
      addIssue(
        issues,
        "horaLocal",
        "La hora local debe tener formato 22:00."
      );
    }
  }

  if (ciudad && ciudad.length > 100) {
    addIssue(issues, "ciudad", "La ciudad no puede superar 100 caracteres.");
  }

  if (pais && pais.length > 100) {
    addIssue(issues, "pais", "El país no puede superar 100 caracteres.");
  }

  if (recinto && recinto.length > 140) {
    addIssue(issues, "recinto", "El recinto no puede superar 140 caracteres.");
  }

  if (cartelPrincipal && cartelPrincipal.length > 140) {
    addIssue(
      issues,
      "cartelPrincipal",
      "El cartel principal no puede superar 140 caracteres."
    );
  }

  if (dondeVer && dondeVer.length > 180) {
    addIssue(
      issues,
      "dondeVer",
      "El campo 'Dónde ver' no puede superar 180 caracteres."
    );
  }

  if (descripcionCorta) {
    if (descripcionCorta.length < 20) {
      addIssue(
        issues,
        "descripcionCorta",
        "La descripción corta debe tener al menos 20 caracteres."
      );
    }

    if (descripcionCorta.length > 280) {
      addIssue(
        issues,
        "descripcionCorta",
        "La descripción corta no puede superar 280 caracteres."
      );
    }
  }

  if (descripcion) {
    if (descripcion.length < 20) {
      addIssue(
        issues,
        "descripcion",
        "La descripción editorial debe tener al menos 20 caracteres."
      );
    }

    if (descripcion.length > 3000) {
      addIssue(
        issues,
        "descripcion",
        "La descripción editorial no puede superar 3000 caracteres."
      );
    }
  }

  if (notas && notas.length > 1200) {
    addIssue(
      issues,
      "notas",
      "Las notas adicionales no pueden superar 1200 caracteres."
    );
  }

  if (!hasImageValue(imagen)) {
    addIssue(issues, "imagen", "La imagen es obligatoria.");
  }

  let organizacion: EventoSanityOutput["organizacion"] | null = null;
  let disciplina: EventoSanityOutput["disciplina"] | null = null;

  try {
    organizacion = createRequiredReference(
      getReferenceInput(form.organizacion),
      "La organización"
    ) as EventoSanityOutput["organizacion"];
  } catch (error) {
    addIssue(
      issues,
      "organizacion",
      error instanceof Error ? error.message : "La organización es obligatoria."
    );
  }

  try {
    disciplina = createRequiredReference(
      getReferenceInput(form.disciplina),
      "La disciplina"
    ) as EventoSanityOutput["disciplina"];
  } catch (error) {
    addIssue(
      issues,
      "disciplina",
      error instanceof Error ? error.message : "La disciplina es obligatoria."
    );
  }

  if (!estadoRaw) {
    addIssue(issues, "estado", "El estado es obligatorio.");
  } else if (!isEventoEstado(estadoRaw)) {
    addIssue(
      issues,
      "estado",
      "El estado debe ser uno de estos valores: proximo, celebrado o cancelado."
    );
  }

  if (fechaDate && isEventoEstado(estadoRaw)) {
    const now = new Date();

    if (estadoRaw === "proximo" && fechaDate.getTime() < now.getTime()) {
      addIssue(
        issues,
        "estado",
        "El evento figura como próximo, pero su fecha ya está en el pasado.",
        "warning"
      );
    }

    if (estadoRaw === "celebrado" && fechaDate.getTime() > now.getTime()) {
      addIssue(
        issues,
        "estado",
        "El evento figura como celebrado, pero su fecha aún está en el futuro.",
        "warning"
      );
    }
  }

  if (
    !descripcion &&
    !descripcionCorta &&
    !cartelPrincipal &&
    !dondeVer
  ) {
    addIssue(
      issues,
      "descripcion",
      "El evento está demasiado pelado: conviene añadir descripción, descripción corta, cartel principal o dónde ver.",
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

  const output: EventoSanityOutput = {
    _type: "evento",
    nombre,
    slug,
    organizacion: organizacion as EventoSanityOutput["organizacion"],
    disciplina: disciplina as EventoSanityOutput["disciplina"],
    fecha,
    imagen,
    estado: estadoRaw as EventoSanityOutput["estado"],
  };

  if (horaLocal) {
    output.horaLocal = horaLocal;
  }

  if (ciudad) {
    output.ciudad = ciudad;
  }

  if (pais) {
    output.pais = pais;
  }

  if (recinto) {
    output.recinto = recinto;
  }

  if (cartelPrincipal) {
    output.cartelPrincipal = cartelPrincipal;
  }

  if (dondeVer) {
    output.dondeVer = dondeVer;
  }

  if (descripcionCorta) {
    output.descripcionCorta = descripcionCorta;
  }

  if (descripcion) {
    output.descripcion = descripcion;
  }

  if (notas) {
    output.notas = notas;
  }

  return {
    ok: true,
    output,
    issues,
  };
}