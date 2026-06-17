import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import {
  contentTypeOptions,
  getContentTypeDefinition,
} from "../config/contentTypes";
import { buildContentOutput } from "../lib/buildContentOutput";
import { getInitialFormState } from "../lib/getInitialFormState";
import { saveDraft } from "../lib/saveDraft";
import type {
  AuxiliaryFormState,
  ContentFormState,
  ContentTypeId,
  FieldKind,
  FormValue,
  ReferenceFilterContext,
  ReferenceTarget,
  SchemaFieldDefinition,
  ValidationIssue,
} from "../types";
import type { ReferenceEntityOption } from "../data/referenceEntities";

type BuildResultState = {
  ok: boolean;
  output: Record<string, unknown> | null;
  issues: ValidationIssue[];
} | null;

type ReferenceFieldConfig = {
  fieldName: string;
  target: ReferenceTarget;
  isArray: boolean;
};

type SaveDraftStatus =
  | {
      type: "idle";
      message: "";
    }
  | {
      type: "success";
      message: string;
    }
  | {
      type: "error";
      message: string;
    };

type ReferenceEntitiesApiResponse =
  | {
      ok: true;
      data: Record<ReferenceTarget, ReferenceEntityOption[]>;
    }
  | {
      ok: false;
      message?: string;
    };

type UfcOfficialNewsItem = {
  id: string;
  title: string;
  summary?: string;
  bodyText?: string;
  sourceUrl: string;
  canonicalUrl: string;
  publishedAt?: string;
  imageUrl?: string;
};

type UfcOfficialNewsApiResponse =
  | {
      ok: true;
      source: "ufc";
      fetchedAt: string;
      count: number;
      items: UfcOfficialNewsItem[];
    }
  | {
      ok: false;
      source?: "ufc";
      fetchedAt?: string;
      count?: number;
      items?: UfcOfficialNewsItem[];
      error?: string;
    };

type OfficialSourceStatus =
  | {
      type: "idle";
      message: "";
    }
  | {
      type: "success";
      message: string;
    }
  | {
      type: "error";
      message: string;
    };

type SuggestedNewsRelations = {
  luchadores: string[];
  evento: string;
  organizacion: string;
  disciplina: string;
};

type TransformNewsApiResponse =
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

type NewsRelationsResolution = {
  suggested: SuggestedNewsRelations;
  resolved: {
    luchadores: ReferenceEntityOption[];
    evento?: ReferenceEntityOption;
    organizacion?: ReferenceEntityOption;
    disciplina?: ReferenceEntityOption;
  };
  unresolved: {
    luchadores: string[];
    evento?: string;
    organizacion?: string;
    disciplina?: string;
  };
};

type UfcFightCardItem = {
  id: string;
  section: "principal" | "preliminar";
  sectionLabel: "Main Card" | "Prelims" | "Early Prelims";
  order: number;
  redFighter: string;
  blueFighter: string;
  weightClass: string;
  titleFight: boolean;
  status: "programado" | "finalizado" | "cancelado";
  winnerName?: string;
  method?: string;
  round?: number;
  time?: string;
};

type UfcOfficialEventItem = {
  id: string;
  name: string;
  headline?: string;
  mainEvent?: string;
  startDate?: string;
  endDate?: string;
  venue?: string;
  city?: string;
  region?: string;
  country?: string;
  locationText?: string;
  watchText?: string;
  description?: string;
  sourceUrl: string;
  canonicalUrl: string;
  imageUrl?: string;
  status: "proximo" | "celebrado" | "cancelado";
  fightCard?: UfcFightCardItem[];
};

type UfcResolutionFight = {
  sourceFightId: string;
  readyToCreate: boolean;
  blockingReasons: string[];
};

type UfcEventResolution =
  | {
      ok: true;
      event: {
        sourceName: string;
        found: boolean;
        sanityId?: string;
        sanityName?: string;
        matchStrategy?: string;
      };
      discipline: {
        found: boolean;
        sanityId?: string;
        sanityName?: string;
      };
      organization: {
        found: boolean;
        sanityId?: string;
        sanityName?: string;
      };
      counts: {
        fights: number;
        readyFights: number;
        existingFights: number;
        pendingFights: number;
        existingFighters: number;
        missingFighters: number;
        resolvedCategories: number;
        unresolvedCategories: number;
      };
      missingFighters: Array<{
        sourceName: string;
        normalizedName: string;
        found: false;
      }>;
      unresolvedCategories: Array<{
        sourceLabel: string;
        normalizedLabel: string;
        found: false;
      }>;
      fights: UfcResolutionFight[];
    }
  | {
      ok: false;
      error?: string;
    };

type UfcEventResolutionSuccess = Extract<
  UfcEventResolution,
  { ok: true }
>;

type UfcBatchPreparationItem = {
  eventId: string;
  eventName: string;
  status: "pendiente" | "procesando" | "completado" | "fallido";
  message: string;
};

type UfcBulkActionResponse =
  | {
      ok: true;
      summary: {
        candidates: number;
        created: number;
        skipped: number;
        failed: number;
      };
    }
  | {
      ok: false;
      error?: string;
      summary?: {
        candidates: number;
        created: number;
        skipped: number;
        failed: number;
      };
    };

type UfcOfficialEventsApiResponse =
  | {
      ok: true;
      source: "ufc";
      fetchedAt: string;
      count: number;
      items: UfcOfficialEventItem[];
    }
  | {
      ok: false;
      source?: "ufc";
      fetchedAt?: string;
      count?: number;
      items?: UfcOfficialEventItem[];
      error?: string;
    };

type UfcBatchEventAnalysis = {
  eventId: string;
  eventName: string;
  startDate?: string;
  eventFound: boolean;
  eventSanityId?: string;
  fights: number;
  readyFights: number;
  existingFights: number;
  pendingFights: number;
  existingFighters: number;
  missingFighters: number;
  unresolvedCategories: number;
  status:
    | "completo"
    | "evento_pendiente"
    | "requiere_revision"
    | "listo_para_preparar";
  error?: string;
};

type UfcBatchResolveApiResponse =
  | {
      ok: true;
      count: number;
      summary: {
        completed: number;
        eventPending: number;
        readyToPrepare: number;
        requiresReview: number;
        totalMissingFighters: number;
        totalPendingFights: number;
      };
      items: UfcBatchEventAnalysis[];
    }
  | {
      ok: false;
      error?: string;
    };

type TransformEventApiResponse =
  | {
      ok: true;
      data: {
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
    }
  | {
      ok: false;
      error?: string;
    };

const DEFAULT_CONTENT_TYPE: ContentTypeId = "noticia";

function getDefaultApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }

  return `${window.location.protocol}//${window.location.hostname}:3000`;
}

const API_BASE_URL = (
  import.meta.env.VITE_FFN3_API_BASE_URL?.trim() || getDefaultApiBaseUrl()
).replace(/\/+$/, "");

const AUTO_REFRESH_MS = 120_000;

const FIELDS_THAT_TRIGGER_CLEANUP = new Set([
  "disciplina",
  "organizacion",
  "organizacionRelacionada",
  "evento",
  "eventoRelacionado",
  "categoriaPeso",
  "luchadorRojo",
  "luchadorAzul",
  "ganador",
  "luchadoresRelacionados",
]);

const CASCADE_REFERENCE_GROUPS: ReferenceFieldConfig[][] = [
  [{ fieldName: "disciplina", target: "disciplina", isArray: false }],
  [
    { fieldName: "organizacion", target: "organizacion", isArray: false },
    {
      fieldName: "organizacionRelacionada",
      target: "organizacion",
      isArray: false,
    },
  ],
  [
    { fieldName: "evento", target: "evento", isArray: false },
    {
      fieldName: "eventoRelacionado",
      target: "evento",
      isArray: false,
    },
    {
      fieldName: "categoriaPeso",
      target: "categoriaPeso",
      isArray: false,
    },
  ],
  [
    { fieldName: "luchadorRojo", target: "luchador", isArray: false },
    { fieldName: "luchadorAzul", target: "luchador", isArray: false },
    { fieldName: "ganador", target: "luchador", isArray: false },
    {
      fieldName: "luchadoresRelacionados",
      target: "luchador",
      isArray: true,
    },
  ],
];

const EMPTY_REFERENCE_DATA: Record<ReferenceTarget, ReferenceEntityOption[]> = {
  disciplina: [],
  organizacion: [],
  evento: [],
  luchador: [],
  categoriaPeso: [],
};

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function toDateTimeLocalValue(value: string | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (part: number): string => String(part).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function createSourceExtract(item: UfcOfficialNewsItem): string {
  const sourceText = item.summary?.trim() || item.bodyText?.trim() || "";

  if (sourceText.length <= 220) {
    return sourceText;
  }

  return `${sourceText.slice(0, 217).trimEnd()}...`;
}

function findReferenceByLabel(
  options: ReferenceEntityOption[],
  expectedLabel: string
): ReferenceEntityOption | undefined {
  const normalizedExpectedLabel = expectedLabel.trim().toLocaleLowerCase("es");

  return options.find(
    (option) => option.label.trim().toLocaleLowerCase("es") === normalizedExpectedLabel
  );
}

function normalizeEntityLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/\bvs\.?\b/g, "vs")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findReferenceBySuggestedLabel(
  options: ReferenceEntityOption[],
  suggestedLabel: string
): ReferenceEntityOption | undefined {
  const normalizedSuggestion = normalizeEntityLabel(suggestedLabel);

  if (!normalizedSuggestion) {
    return undefined;
  }

  return options.find(
    (option) =>
      normalizeEntityLabel(option.label) === normalizedSuggestion
  );
}

function resolveSuggestedNewsRelations(params: {
  suggestions: SuggestedNewsRelations;
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>;
}): NewsRelationsResolution {
  const { suggestions, referenceData } = params;

  const disciplina = findReferenceBySuggestedLabel(
    referenceData.disciplina,
    suggestions.disciplina || "MMA"
  );
  const organizacion = findReferenceBySuggestedLabel(
    referenceData.organizacion,
    suggestions.organizacion || "UFC"
  );
  const evento = suggestions.evento
    ? findReferenceBySuggestedLabel(
        referenceData.evento,
        suggestions.evento
      )
    : undefined;

  const resolvedFighters: ReferenceEntityOption[] = [];
  const unresolvedFighters: string[] = [];
  const usedFighterIds = new Set<string>();

  for (const fighterName of suggestions.luchadores) {
    const fighter = findReferenceBySuggestedLabel(
      referenceData.luchador,
      fighterName
    );

    if (fighter && !usedFighterIds.has(fighter.value)) {
      usedFighterIds.add(fighter.value);
      resolvedFighters.push(fighter);
    } else if (!fighter) {
      unresolvedFighters.push(fighterName);
    }
  }

  return {
    suggested: suggestions,
    resolved: {
      luchadores: resolvedFighters,
      evento,
      organizacion,
      disciplina,
    },
    unresolved: {
      luchadores: unresolvedFighters,
      evento:
        suggestions.evento && !evento
          ? suggestions.evento
          : undefined,
      organizacion:
        suggestions.organizacion && !organizacion
          ? suggestions.organizacion
          : undefined,
      disciplina:
        suggestions.disciplina && !disciplina
          ? suggestions.disciplina
          : undefined,
    },
  };
}

function createEditorialInstructions(item: UfcOfficialNewsItem): string {
  return [
    "Reescribe la información en español con estilo periodístico propio de Full Fight News.",
    "No traduzcas de forma literal ni copies frases extensas de la fuente.",
    "Conserva todos los hechos, nombres, fechas y declaraciones relevantes sin inventar datos.",
    "Atribuye la información a UFC cuando corresponda.",
    `Fuente oficial: ${item.canonicalUrl || item.sourceUrl}`,
  ].join("\n");
}

function createEventEditorialInstructions(item: UfcOfficialEventItem): string {
  return [
    "Redacta una ficha de evento en español con estilo editorial propio de Full Fight News.",
    "Conserva nombre, fecha, recinto, ubicación, cartel principal y plataforma oficial.",
    "No inventes combates, horarios, ubicaciones ni datos que no aparezcan en la fuente.",
    "Usa español de España y evita lenguaje promocional.",
    `Fuente oficial: ${item.canonicalUrl || item.sourceUrl}`,
  ].join("\n");
}

function getTextAreaRows(kind: FieldKind, rows?: number): number {
  if (typeof rows === "number" && rows > 0) {
    return rows;
  }

  if (kind === "portableText") {
    return 10;
  }

  return 4;
}

function getStringValue(
  value: FormValue | string | boolean | null | undefined
): string {
  return typeof value === "string" ? value : "";
}

function getNumberValue(value: FormValue): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function getBooleanValue(
  value: FormValue | string | boolean | null | undefined
): boolean {
  return typeof value === "boolean" ? value : false;
}

function getReferenceValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object" && "_ref" in value) {
    const candidate = value as { _ref?: unknown };
    return typeof candidate._ref === "string" ? candidate._ref.trim() : "";
  }

  return "";
}

function getReferenceArrayValues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items = value as unknown[];

  return items
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      if (item && typeof item === "object" && "_ref" in item) {
        const candidate = item as { _ref?: unknown };
        return typeof candidate._ref === "string" ? candidate._ref.trim() : "";
      }

      return "";
    })
    .filter(Boolean);
}

function getPortableTextEditorValue(value: FormValue): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const items = value as unknown[];

    if (items.every((item) => typeof item === "string")) {
      return (items as string[]).join("\n\n");
    }

    return items
      .map((block) => {
        if (
          block &&
          typeof block === "object" &&
          "children" in block &&
          Array.isArray((block as { children?: unknown[] }).children)
        ) {
          return ((block as { children?: Array<{ text?: unknown }> }).children ?? [])
            .map((child) => (typeof child.text === "string" ? child.text : ""))
            .join("");
        }

        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }

  return "";
}

function shouldHideField(
  field: SchemaFieldDefinition,
  form: ContentFormState
): boolean {
  if (!field.hiddenWhen) {
    return false;
  }

  const currentValue = form[field.hiddenWhen.field];

  if ("equals" in field.hiddenWhen && field.hiddenWhen.equals !== undefined) {
    return currentValue === field.hiddenWhen.equals;
  }

  if ("notEquals" in field.hiddenWhen && field.hiddenWhen.notEquals !== undefined) {
    return currentValue !== field.hiddenWhen.notEquals;
  }

  return false;
}

function parseReferenceArrayInput(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getIssueCount(
  issues: ValidationIssue[],
  severity: "error" | "warning"
): number {
  return issues.filter((issue) => issue.severity === severity).length;
}

function toReferenceValue(ref: string): { _type: "reference"; _ref: string } {
  return {
    _type: "reference",
    _ref: ref,
  };
}

function pickFirstReference(...values: unknown[]): string | undefined {
  for (const value of values) {
    const ref = getReferenceValue(value);
    if (ref) {
      return ref;
    }
  }

  return undefined;
}

function getActiveFilterContext(
  form: ContentFormState,
  auxiliary?: AuxiliaryFormState
): ReferenceFilterContext {
  const selectedDisciplineRef = pickFirstReference(
    form.disciplina,
    auxiliary?.disciplina
  );

  const selectedOrganizationRef = pickFirstReference(
    form.organizacion,
    form.organizacionRelacionada,
    auxiliary?.organizacion,
    auxiliary?.organizacionRelacionada
  );

  const selectedEventRef = pickFirstReference(
    form.evento,
    form.eventoRelacionado,
    auxiliary?.evento,
    auxiliary?.eventoRelacionado
  );

  const selectedCategoriaPesoRef = pickFirstReference(
    form.categoriaPeso,
    auxiliary?.categoriaPeso
  );

  return {
    selectedDisciplineRef,
    selectedOrganizationRef,
    selectedEventRef,
    selectedCategoriaPesoRef,
  };
}

function getDisciplineOptions(
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>
): ReferenceEntityOption[] {
  return referenceData.disciplina ?? [];
}

function getCategoriaPesoOptions(params: {
  filters: ReferenceFilterContext;
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>;
}): ReferenceEntityOption[] {
  const { filters, referenceData } = params;
  const options = referenceData.categoriaPeso ?? [];

  return options.filter((option) => {
    return (
      !filters.selectedDisciplineRef ||
      !option.disciplineIds ||
      option.disciplineIds.length === 0 ||
      option.disciplineIds.includes(filters.selectedDisciplineRef)
    );
  });
}

function getEventoOptions(params: {
  filters: ReferenceFilterContext;
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>;
}): ReferenceEntityOption[] {
  const { filters, referenceData } = params;
  const options = referenceData.evento ?? [];

  return options.filter((option) => {
    const matchesDiscipline =
      !filters.selectedDisciplineRef ||
      !option.disciplineIds ||
      option.disciplineIds.length === 0 ||
      option.disciplineIds.includes(filters.selectedDisciplineRef);

    const matchesOrganization =
      !filters.selectedOrganizationRef ||
      !option.organizationIds ||
      option.organizationIds.length === 0 ||
      option.organizationIds.includes(filters.selectedOrganizationRef);

    return matchesDiscipline && matchesOrganization;
  });
}

function getLuchadorOptions(params: {
  filters: ReferenceFilterContext;
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>;
}): ReferenceEntityOption[] {
  const { filters, referenceData } = params;
  const options = referenceData.luchador ?? [];

  const hasFightersLinkedToSelectedEvent =
    Boolean(filters.selectedEventRef) &&
    options.some(
      (option) =>
        Array.isArray(option.eventIds) &&
        option.eventIds.includes(filters.selectedEventRef as string)
    );

  return options.filter((option) => {
    const matchesDiscipline =
      !filters.selectedDisciplineRef ||
      (Array.isArray(option.disciplineIds) &&
        option.disciplineIds.includes(filters.selectedDisciplineRef));

    const matchesOrganization =
      !filters.selectedOrganizationRef ||
      !option.organizationIds ||
      option.organizationIds.length === 0 ||
      option.organizationIds.includes(filters.selectedOrganizationRef);

    const matchesEvent =
      !filters.selectedEventRef ||
      !hasFightersLinkedToSelectedEvent ||
      (Array.isArray(option.eventIds) &&
        option.eventIds.includes(filters.selectedEventRef));

    const matchesCategoriaPeso =
      !filters.selectedCategoriaPesoRef ||
      !option.categoryPesoIds ||
      option.categoryPesoIds.length === 0 ||
      option.categoryPesoIds.includes(filters.selectedCategoriaPesoRef);

    return (
      matchesDiscipline &&
      matchesOrganization &&
      matchesEvent &&
      matchesCategoriaPeso
    );
  });
}

function getOrganizacionOptions(params: {
  filters: ReferenceFilterContext;
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>;
}): ReferenceEntityOption[] {
  const { filters, referenceData } = params;
  const options = referenceData.organizacion ?? [];

  if (!filters.selectedDisciplineRef) {
    return options;
  }

  const eventos = referenceData.evento ?? [];
  const luchadores = referenceData.luchador ?? [];

  return options.filter((organization) => {
    const hasDirectDiscipline =
      Array.isArray(organization.disciplineIds) &&
      organization.disciplineIds.includes(filters.selectedDisciplineRef!);

    const hasEventoInDiscipline = eventos.some((event) => {
      const eventHasDiscipline =
        !event.disciplineIds ||
        event.disciplineIds.length === 0 ||
        event.disciplineIds.includes(filters.selectedDisciplineRef!);

      const eventMatchesOrganization =
        Array.isArray(event.organizationIds) &&
        event.organizationIds.includes(organization.value);

      return eventHasDiscipline && eventMatchesOrganization;
    });

    const hasLuchadorInDiscipline = luchadores.some((fighter) => {
      const fighterHasDiscipline =
        !fighter.disciplineIds ||
        fighter.disciplineIds.length === 0 ||
        fighter.disciplineIds.includes(filters.selectedDisciplineRef!);

      const fighterMatchesOrganization =
        Array.isArray(fighter.organizationIds) &&
        fighter.organizationIds.includes(organization.value);

      return fighterHasDiscipline && fighterMatchesOrganization;
    });

    return hasDirectDiscipline || hasEventoInDiscipline || hasLuchadorInDiscipline;
  });
}

function getFilteredReferenceEntityOptionsFromApiData(params: {
  target: ReferenceTarget;
  filters: ReferenceFilterContext;
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>;
}): ReferenceEntityOption[] {
  const { target, filters, referenceData } = params;

  switch (target) {
    case "disciplina":
      return getDisciplineOptions(referenceData);
    case "organizacion":
      return getOrganizacionOptions({ filters, referenceData });
    case "evento":
      return getEventoOptions({ filters, referenceData });
    case "luchador":
      return getLuchadorOptions({ filters, referenceData });
    case "categoriaPeso":
      return getCategoriaPesoOptions({ filters, referenceData });
    default:
      return [];
  }
}

function getAllowedReferenceValueSet(
  target: ReferenceTarget,
  filters: ReferenceFilterContext,
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>
): Set<string> {
  return new Set(
    getFilteredReferenceEntityOptionsFromApiData({
      target,
      filters,
      referenceData,
    }).map((option) => option.value)
  );
}

function sanitizeReferenceFieldValue(
  value: FormValue,
  isArray: boolean,
  allowedValues: Set<string>
): FormValue {
  if (isArray) {
    return getReferenceArrayValues(value)
      .filter((item) => allowedValues.has(item))
      .map(toReferenceValue);
  }

  const singleValue = getReferenceValue(value);

  if (!singleValue) {
    return undefined;
  }

  return allowedValues.has(singleValue) ? toReferenceValue(singleValue) : undefined;
}

function sanitizeReferenceFieldByConfig(
  form: ContentFormState,
  auxiliary: AuxiliaryFormState,
  config: ReferenceFieldConfig,
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>
): FormValue {
  const filters = getActiveFilterContext(form, auxiliary);
  const allowedValues = getAllowedReferenceValueSet(
    config.target,
    filters,
    referenceData
  );

  return sanitizeReferenceFieldValue(
    form[config.fieldName],
    config.isArray,
    allowedValues
  );
}

function clearInvalidDependentReferences(
  nextForm: ContentFormState,
  auxiliary: AuxiliaryFormState,
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>
): ContentFormState {
  const sanitized: ContentFormState = { ...nextForm };

  for (const group of CASCADE_REFERENCE_GROUPS) {
    for (const config of group) {
      if (!(config.fieldName in sanitized)) {
        continue;
      }

      sanitized[config.fieldName] = sanitizeReferenceFieldByConfig(
        sanitized,
        auxiliary,
        config,
        referenceData
      );
    }
  }

  return sanitized;
}

function getReferencePlaceholder(target?: ReferenceTarget): string {
  switch (target) {
    case "disciplina":
      return "Selecciona una disciplina";
    case "organizacion":
      return "Selecciona una organización";
    case "evento":
      return "Selecciona un evento";
    case "luchador":
      return "Selecciona un luchador";
    case "categoriaPeso":
      return "Selecciona una categoría";
    default:
      return "Selecciona una referencia";
  }
}

function getReferenceEmptyStateMessage(
  target?: ReferenceTarget,
  filterContext?: ReferenceFilterContext
): string {
  if (!target) {
    return "Sin opciones disponibles.";
  }

  if (target === "disciplina") {
    return "No hay disciplinas cargadas desde Sanity.";
  }

  if (!filterContext?.selectedDisciplineRef) {
    return "Selecciona primero una disciplina.";
  }

  switch (target) {
    case "organizacion":
      return "No hay organizaciones para esa disciplina.";
    case "evento":
      return "No hay eventos para el filtro actual.";
    case "luchador":
      return filterContext?.selectedEventRef
        ? "No hay luchadores vinculados a ese evento."
        : "No hay luchadores para el filtro actual.";
    case "categoriaPeso":
      return "No hay categorías para esa disciplina.";
    default:
      return "Sin opciones disponibles.";
  }
}

export default function PanelIA(): ReactElement {
  const [contentType, setContentType] = useState<ContentTypeId>(
    DEFAULT_CONTENT_TYPE
  );

  const [form, setForm] = useState<ContentFormState>(
    () => getInitialFormState(DEFAULT_CONTENT_TYPE).form
  );
  const [auxiliary, setAuxiliary] = useState<AuxiliaryFormState>(
    () => getInitialFormState(DEFAULT_CONTENT_TYPE).auxiliary
  );
  const [result, setResult] = useState<BuildResultState>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [saveDraftStatus, setSaveDraftStatus] = useState<SaveDraftStatus>({
    type: "idle",
    message: "",
  });

  const [referenceData, setReferenceData] = useState<
    Record<ReferenceTarget, ReferenceEntityOption[]>
  >(EMPTY_REFERENCE_DATA);


  const [officialNewsItems, setOfficialNewsItems] = useState<UfcOfficialNewsItem[]>(
    []
  );
  const [selectedOfficialNewsId, setSelectedOfficialNewsId] = useState("");
  const [isLoadingOfficialNews, setIsLoadingOfficialNews] = useState(false);
  const [isTransformingOfficialNews, setIsTransformingOfficialNews] =
    useState(false);
  const [officialNewsFetchedAt, setOfficialNewsFetchedAt] = useState("");
  const [officialSourceStatus, setOfficialSourceStatus] =
    useState<OfficialSourceStatus>({
      type: "idle",
      message: "",
    });
  const [newsRelationsResolution, setNewsRelationsResolution] =
    useState<NewsRelationsResolution | null>(null);

  const [officialEventItems, setOfficialEventItems] = useState<
    UfcOfficialEventItem[]
  >([]);
  const [selectedOfficialEventId, setSelectedOfficialEventId] = useState("");
  const [isLoadingOfficialEvents, setIsLoadingOfficialEvents] = useState(false);
  const [isTransformingOfficialEvent, setIsTransformingOfficialEvent] =
    useState(false);
  const [officialEventsFetchedAt, setOfficialEventsFetchedAt] = useState("");
  const [officialEventSourceStatus, setOfficialEventSourceStatus] =
    useState<OfficialSourceStatus>({
      type: "idle",
      message: "",
    });

  const [ufcEventResolution, setUfcEventResolution] =
    useState<UfcEventResolution | null>(null);
  const [isResolvingUfcEvent, setIsResolvingUfcEvent] = useState(false);
  const [isCreatingUfcFighters, setIsCreatingUfcFighters] = useState(false);
  const [isCreatingUfcFights, setIsCreatingUfcFights] = useState(false);
  const [isPreparingFullUfcCard, setIsPreparingFullUfcCard] = useState(false);
  const [ufcAutomationStatus, setUfcAutomationStatus] =
    useState<OfficialSourceStatus>({
      type: "idle",
      message: "",
    });

  const [ufcBatchAnalysis, setUfcBatchAnalysis] = useState<
    UfcBatchResolveApiResponse | null
  >(null);
  const [isAnalyzingUfcBatch, setIsAnalyzingUfcBatch] = useState(false);
  const [ufcBatchStatus, setUfcBatchStatus] =
    useState<OfficialSourceStatus>({
      type: "idle",
      message: "",
    });
  const [isPreparingUfcBatch, setIsPreparingUfcBatch] = useState(false);
  const [ufcBatchPreparation, setUfcBatchPreparation] = useState<
    UfcBatchPreparationItem[]
  >([]);

  const [isLoadingReferences, setIsLoadingReferences] = useState(false);
  const [referenceLoadError, setReferenceLoadError] = useState("");

  const definition = useMemo(
    () => getContentTypeDefinition(contentType),
    [contentType]
  );


  const selectedOfficialNews = useMemo(
    () =>
      officialNewsItems.find((item) => item.id === selectedOfficialNewsId) ?? null,
    [officialNewsItems, selectedOfficialNewsId]
  );

  const selectedOfficialEvent = useMemo(
    () =>
      officialEventItems.find((item) => item.id === selectedOfficialEventId) ??
      null,
    [officialEventItems, selectedOfficialEventId]
  );

  const canCreateMissingUfcFighters =
    Boolean(
      selectedOfficialEvent &&
        ufcEventResolution?.ok &&
        ufcEventResolution.counts.missingFighters > 0
    ) &&
    !isCreatingUfcFighters &&
    !isResolvingUfcEvent &&
    !isPreparingFullUfcCard &&
    !isPreparingUfcBatch;

  const canCreateUfcFights =
    Boolean(
      selectedOfficialEvent &&
        ufcEventResolution?.ok &&
        ufcEventResolution.event.found &&
        ufcEventResolution.counts.pendingFights > 0
    ) &&
    !isCreatingUfcFights &&
    !isResolvingUfcEvent &&
    !isPreparingFullUfcCard &&
    !isPreparingUfcBatch;

  const filterContext = useMemo<ReferenceFilterContext>(
    () => getActiveFilterContext(form, auxiliary),
    [form, auxiliary]
  );

  const canSaveDraft = Boolean(result?.ok && result.output) && !isSavingDraft;

  const resetDerivedUiState = useCallback((): void => {
    setResult(null);
    setSaveDraftStatus({
      type: "idle",
      message: "",
    });
  }, []);

  const reloadReferenceEntities = useCallback(async (): Promise<void> => {
    try {
      setIsLoadingReferences(true);
      setReferenceLoadError("");

      const response = await fetch(`${API_BASE_URL}/api/reference-entities`, {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json()) as ReferenceEntitiesApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "No se pudieron cargar las referencias."
        );
      }

      setReferenceData(payload.data);
      setForm((prev) => clearInvalidDependentReferences(prev, auxiliary, payload.data));
    } catch (error) {
      setReferenceLoadError(
        error instanceof Error
          ? error.message
          : "Error desconocido cargando referencias."
      );
      setReferenceData(EMPTY_REFERENCE_DATA);
    } finally {
      setIsLoadingReferences(false);
    }
  }, [auxiliary]);


  const reloadOfficialUfcNews = useCallback(async (): Promise<void> => {
    try {
      setIsLoadingOfficialNews(true);
      setOfficialSourceStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/ufc/news?refresh=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload = (await response.json()) as UfcOfficialNewsApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron cargar las noticias oficiales de UFC."
        );
      }

      setOfficialNewsItems(payload.items);
      setOfficialNewsFetchedAt(payload.fetchedAt);
      setNewsRelationsResolution(null);
      setSelectedOfficialNewsId((currentId) =>
        payload.items.some((item) => item.id === currentId) ? currentId : ""
      );

      setOfficialSourceStatus({
        type: "success",
        message: `${payload.count} noticias oficiales de UFC cargadas.`,
      });
    } catch (error) {
      setOfficialNewsItems([]);
      setSelectedOfficialNewsId("");
      setOfficialNewsFetchedAt("");
      setOfficialSourceStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido cargando las noticias oficiales de UFC.",
      });
    } finally {
      setIsLoadingOfficialNews(false);
    }
  }, []);

  const reloadOfficialUfcEvents = useCallback(async (): Promise<void> => {
    try {
      setIsLoadingOfficialEvents(true);
      setOfficialEventSourceStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/ufc/events?refresh=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload = (await response.json()) as UfcOfficialEventsApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron cargar los eventos oficiales de UFC."
        );
      }

      setOfficialEventItems(payload.items);
      setOfficialEventsFetchedAt(payload.fetchedAt);
      setUfcBatchAnalysis(null);
      setUfcBatchPreparation([]);
      setUfcBatchStatus({
        type: "idle",
        message: "",
      });
      setSelectedOfficialEventId((currentId) =>
        payload.items.some((item) => item.id === currentId) ? currentId : ""
      );

      setOfficialEventSourceStatus({
        type: "success",
        message: `${payload.count} eventos oficiales de UFC cargados.`,
      });
    } catch (error) {
      setOfficialEventItems([]);
      setSelectedOfficialEventId("");
      setOfficialEventsFetchedAt("");
      setOfficialEventSourceStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido cargando los eventos oficiales de UFC.",
      });
    } finally {
      setIsLoadingOfficialEvents(false);
    }
  }, []);

  const analyzeUpcomingUfcEvents = useCallback(async (): Promise<void> => {
    const upcomingEvents = officialEventItems.filter(
      (item) => item.status === "proximo" && (item.fightCard?.length ?? 0) > 0
    );

    if (upcomingEvents.length === 0) {
      setUfcBatchStatus({
        type: "error",
        message:
          "No hay próximos eventos UFC con cartelera disponible para analizar.",
      });
      return;
    }

    try {
      setIsAnalyzingUfcBatch(true);
      setUfcBatchStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/ufc/events/batch-resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            events: upcomingEvents,
          }),
        }
      );

      const payload = (await response.json()) as UfcBatchResolveApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron analizar los próximos eventos UFC."
        );
      }

      setUfcBatchAnalysis(payload);
      setUfcBatchStatus({
        type: "success",
        message: `${payload.count} eventos analizados: ${payload.summary.completed} completos, ${payload.summary.readyToPrepare} listos para preparar, ${payload.summary.eventPending} con evento pendiente y ${payload.summary.requiresReview} para revisión.`,
      });
    } catch (error) {
      setUfcBatchAnalysis(null);
      setUfcBatchStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido analizando los próximos eventos UFC.",
      });
    } finally {
      setIsAnalyzingUfcBatch(false);
    }
  }, [officialEventItems]);

  const resolveSelectedUfcEvent = useCallback(
    async (eventOverride?: UfcOfficialEventItem): Promise<void> => {
      const targetEvent = eventOverride ?? selectedOfficialEvent;

      if (!targetEvent) {
        setUfcAutomationStatus({
          type: "error",
          message: "Selecciona primero un evento oficial de UFC.",
        });
        return;
      }

      try {
        setIsResolvingUfcEvent(true);
        setUfcAutomationStatus({
          type: "idle",
          message: "",
        });

        const response = await fetch(
          `${API_BASE_URL}/api/sources/ufc/events/resolve`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              event: targetEvent,
            }),
          }
        );

        const payload = (await response.json()) as UfcEventResolution;

        if (!response.ok || !payload.ok) {
          throw new Error(
            !payload.ok && payload.error
              ? payload.error
              : "No se pudo resolver la cartelera contra Sanity."
          );
        }

        setUfcEventResolution(payload);

        setUfcAutomationStatus({
          type: "success",
          message: payload.event.found
            ? `${payload.counts.readyFights} combates resueltos: ${payload.counts.existingFights} ya existen y ${payload.counts.pendingFights} quedan pendientes de crear.`
            : `Cartelera analizada. Falta crear o localizar el evento en Sanity.`,
        });
      } catch (error) {
        setUfcEventResolution(null);
        setUfcAutomationStatus({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Error desconocido resolviendo la cartelera.",
        });
      } finally {
        setIsResolvingUfcEvent(false);
      }
    },
    [selectedOfficialEvent]
  );

  const createMissingUfcFighters = useCallback(async (): Promise<void> => {
    if (!selectedOfficialEvent) {
      setUfcAutomationStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de UFC.",
      });
      return;
    }

    try {
      setIsCreatingUfcFighters(true);
      setUfcAutomationStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/ufc/events/create-fighters`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            confirm: true,
            event: selectedOfficialEvent,
          }),
        }
      );

      const payload = (await response.json()) as UfcBulkActionResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron crear los luchadores faltantes."
        );
      }

      setUfcAutomationStatus({
        type: "success",
        message: `${payload.summary.created} luchadores creados, ${payload.summary.skipped} omitidos y ${payload.summary.failed} fallidos.`,
      });

      await reloadReferenceEntities();
      await resolveSelectedUfcEvent(selectedOfficialEvent);

      setUfcAutomationStatus({
        type: "success",
        message: `${payload.summary.created} luchadores creados, ${payload.summary.skipped} omitidos y ${payload.summary.failed} fallidos.`,
      });
    } catch (error) {
      setUfcAutomationStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido creando luchadores.",
      });
    } finally {
      setIsCreatingUfcFighters(false);
    }
  }, [
    reloadReferenceEntities,
    resolveSelectedUfcEvent,
    selectedOfficialEvent,
  ]);

  const createUfcFights = useCallback(async (): Promise<void> => {
    if (!selectedOfficialEvent) {
      setUfcAutomationStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de UFC.",
      });
      return;
    }

    try {
      setIsCreatingUfcFights(true);
      setUfcAutomationStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/ufc/events/create-fights`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            confirm: true,
            event: selectedOfficialEvent,
          }),
        }
      );

      const payload = (await response.json()) as UfcBulkActionResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron crear los combates."
        );
      }

      setUfcAutomationStatus({
        type: "success",
        message: `${payload.summary.created} combates creados, ${payload.summary.skipped} omitidos y ${payload.summary.failed} fallidos.`,
      });

      await reloadReferenceEntities();
      await resolveSelectedUfcEvent(selectedOfficialEvent);

      setUfcAutomationStatus({
        type: "success",
        message: `${payload.summary.created} combates creados, ${payload.summary.skipped} ya existentes y ${payload.summary.failed} fallidos.`,
      });
    } catch (error) {
      setUfcAutomationStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido creando combates.",
      });
    } finally {
      setIsCreatingUfcFights(false);
    }
  }, [
    reloadReferenceEntities,
    resolveSelectedUfcEvent,
    selectedOfficialEvent,
  ]);

  const requestUfcEventResolution = useCallback(
    async (
      targetEvent: UfcOfficialEventItem
    ): Promise<UfcEventResolutionSuccess> => {
      const response = await fetch(
        `${API_BASE_URL}/api/sources/ufc/events/resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            event: targetEvent,
          }),
        }
      );

      const payload = (await response.json()) as UfcEventResolution;

      if (!response.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudo resolver la cartelera contra Sanity."
        );
      }

      if (!payload.ok) {
        throw new Error(
          payload.error ||
            "No se pudo resolver la cartelera contra Sanity."
        );
      }

      return payload;
    },
    []
  );

  const updateUfcBatchPreparationItem = useCallback(
    (
      eventId: string,
      changes: Partial<UfcBatchPreparationItem>
    ): void => {
      setUfcBatchPreparation((current) =>
        current.map((item) =>
          item.eventId === eventId ? { ...item, ...changes } : item
        )
      );
    },
    []
  );

  const prepareAllEligibleUfcEvents =
    useCallback(async (): Promise<void> => {
      if (!ufcBatchAnalysis?.ok) {
        setUfcBatchStatus({
          type: "error",
          message:
            "Analiza primero los próximos eventos UFC antes de preparar el lote.",
        });
        return;
      }

      const eligibleAnalysisItems = ufcBatchAnalysis.items.filter(
        (item) => item.status === "listo_para_preparar"
      );

      const eligibleEvents = eligibleAnalysisItems
        .map((analysisItem) => {
          const sourceEvent = officialEventItems.find(
            (event) => event.id === analysisItem.eventId
          );

          return sourceEvent
            ? {
                analysis: analysisItem,
                event: sourceEvent,
              }
            : null;
        })
        .filter(
          (
            item
          ): item is {
            analysis: UfcBatchEventAnalysis;
            event: UfcOfficialEventItem;
          } => item !== null
        );

      if (eligibleEvents.length === 0) {
        setUfcBatchStatus({
          type: "error",
          message:
            "No hay eventos aptos para preparar. Los completos, pendientes de crear o con categorías sin resolver se excluyen automáticamente.",
        });
        return;
      }

      const initialProgress: UfcBatchPreparationItem[] =
        eligibleEvents.map(({ event }) => ({
          eventId: event.id,
          eventName: event.name,
          status: "pendiente",
          message: "En espera.",
        }));

      setUfcBatchPreparation(initialProgress);
      setIsPreparingUfcBatch(true);

      let completed = 0;
      let failed = 0;
      let createdFighters = 0;
      let createdFights = 0;

      try {
        for (let index = 0; index < eligibleEvents.length; index += 1) {
          const { event } = eligibleEvents[index];

          updateUfcBatchPreparationItem(event.id, {
            status: "procesando",
            message: `Evento ${index + 1} de ${eligibleEvents.length}: analizando estado actual...`,
          });

          try {
            let resolution = await requestUfcEventResolution(event);

            if (!resolution.event.found) {
              throw new Error(
                "El evento dejó de estar disponible en Sanity."
              );
            }

            if (resolution.counts.unresolvedCategories > 0) {
              throw new Error(
                `Hay ${resolution.counts.unresolvedCategories} categorías sin resolver.`
              );
            }

            if (resolution.counts.missingFighters > 0) {
              updateUfcBatchPreparationItem(event.id, {
                message: `Creando ${resolution.counts.missingFighters} luchadores faltantes...`,
              });

              const fightersResponse = await fetch(
                `${API_BASE_URL}/api/sources/ufc/events/create-fighters`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                  },
                  body: JSON.stringify({
                    confirm: true,
                    event,
                  }),
                }
              );

              const fightersPayload =
                (await fightersResponse.json()) as UfcBulkActionResponse;

              if (!fightersResponse.ok || !fightersPayload.ok) {
                throw new Error(
                  !fightersPayload.ok && fightersPayload.error
                    ? fightersPayload.error
                    : "No se pudieron crear los luchadores faltantes."
                );
              }

              if (fightersPayload.summary.failed > 0) {
                throw new Error(
                  `${fightersPayload.summary.failed} luchadores fallaron durante la creación.`
                );
              }

              createdFighters += fightersPayload.summary.created;
              resolution = await requestUfcEventResolution(event);
            }

            if (resolution.counts.missingFighters > 0) {
              throw new Error(
                `Todavía quedan ${resolution.counts.missingFighters} luchadores sin resolver.`
              );
            }

            if (resolution.counts.pendingFights > 0) {
              updateUfcBatchPreparationItem(event.id, {
                message: `Creando ${resolution.counts.pendingFights} combates pendientes...`,
              });

              const fightsResponse = await fetch(
                `${API_BASE_URL}/api/sources/ufc/events/create-fights`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                  },
                  body: JSON.stringify({
                    confirm: true,
                    event,
                  }),
                }
              );

              const fightsPayload =
                (await fightsResponse.json()) as UfcBulkActionResponse;

              if (!fightsResponse.ok || !fightsPayload.ok) {
                throw new Error(
                  !fightsPayload.ok && fightsPayload.error
                    ? fightsPayload.error
                    : "No se pudieron crear los combates."
                );
              }

              if (fightsPayload.summary.failed > 0) {
                throw new Error(
                  `${fightsPayload.summary.failed} combates fallaron durante la creación.`
                );
              }

              createdFights += fightsPayload.summary.created;
              resolution = await requestUfcEventResolution(event);
            }

            if (
              resolution.counts.missingFighters > 0 ||
              resolution.counts.pendingFights > 0
            ) {
              throw new Error(
                `El evento conserva ${resolution.counts.missingFighters} luchadores y ${resolution.counts.pendingFights} combates pendientes.`
              );
            }

            completed += 1;
            updateUfcBatchPreparationItem(event.id, {
              status: "completado",
              message: `${resolution.counts.existingFighters} luchadores y ${resolution.counts.existingFights} combates relacionados.`,
            });
          } catch (error) {
            failed += 1;
            updateUfcBatchPreparationItem(event.id, {
              status: "fallido",
              message:
                error instanceof Error
                  ? error.message
                  : "Error desconocido preparando este evento.",
            });
          }
        }

        await reloadReferenceEntities();
        await analyzeUpcomingUfcEvents();

        setUfcBatchStatus({
          type: failed === 0 ? "success" : "error",
          message:
            failed === 0
              ? `Preparación masiva completada: ${completed} eventos, ${createdFighters} luchadores y ${createdFights} combates creados.`
              : `Preparación masiva terminada: ${completed} eventos completados y ${failed} fallidos. Se crearon ${createdFighters} luchadores y ${createdFights} combates.`,
        });
      } catch (error) {
        setUfcBatchStatus({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Error desconocido durante la preparación masiva.",
        });
      } finally {
        setIsPreparingUfcBatch(false);
      }
    }, [
      analyzeUpcomingUfcEvents,
      officialEventItems,
      reloadReferenceEntities,
      requestUfcEventResolution,
      ufcBatchAnalysis,
      updateUfcBatchPreparationItem,
    ]);

  const prepareFullUfcCard = useCallback(async (): Promise<void> => {
    if (!selectedOfficialEvent) {
      setUfcAutomationStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de UFC.",
      });
      return;
    }

    try {
      setIsPreparingFullUfcCard(true);
      setUfcAutomationStatus({
        type: "success",
        message: "Paso 1 de 4: analizando la cartelera oficial...",
      });

      let resolution = await requestUfcEventResolution(
        selectedOfficialEvent
      );

      setUfcEventResolution(resolution);

      if (!resolution.event.found) {
        setUfcAutomationStatus({
          type: "error",
          message:
            "El evento todavía no existe en Sanity. Transfórmalo, genera el output y guárdalo como borrador. Después vuelve a pulsar “Preparar cartelera completa”.",
        });
        return;
      }

      if (resolution.counts.unresolvedCategories > 0) {
        setUfcAutomationStatus({
          type: "error",
          message: `El flujo se ha detenido: hay ${resolution.counts.unresolvedCategories} categorías de peso sin resolver. Revísalas antes de crear luchadores o combates.`,
        });
        return;
      }

      if (resolution.counts.missingFighters > 0) {
        setUfcAutomationStatus({
          type: "success",
          message: `Paso 2 de 4: creando ${resolution.counts.missingFighters} luchadores faltantes...`,
        });

        const fightersResponse = await fetch(
          `${API_BASE_URL}/api/sources/ufc/events/create-fighters`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              confirm: true,
              event: selectedOfficialEvent,
            }),
          }
        );

        const fightersPayload =
          (await fightersResponse.json()) as UfcBulkActionResponse;

        if (!fightersResponse.ok || !fightersPayload.ok) {
          throw new Error(
            !fightersPayload.ok && fightersPayload.error
              ? fightersPayload.error
              : "No se pudieron crear los luchadores faltantes."
          );
        }

        if (fightersPayload.summary.failed > 0) {
          throw new Error(
            `Se crearon ${fightersPayload.summary.created} luchadores, pero ${fightersPayload.summary.failed} fallaron. Revisa el resultado antes de continuar.`
          );
        }

        await reloadReferenceEntities();

        setUfcAutomationStatus({
          type: "success",
          message:
            "Paso 3 de 4: actualizando relaciones después de crear luchadores...",
        });

        resolution = await requestUfcEventResolution(
          selectedOfficialEvent
        );

        setUfcEventResolution(resolution);
      }

      if (resolution.counts.missingFighters > 0) {
        setUfcAutomationStatus({
          type: "error",
          message: `El flujo se ha detenido: todavía quedan ${resolution.counts.missingFighters} luchadores sin resolver.`,
        });
        return;
      }

      if (resolution.counts.pendingFights > 0) {
        setUfcAutomationStatus({
          type: "success",
          message: `Paso 4 de 4: creando ${resolution.counts.pendingFights} combates pendientes...`,
        });

        const fightsResponse = await fetch(
          `${API_BASE_URL}/api/sources/ufc/events/create-fights`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              confirm: true,
              event: selectedOfficialEvent,
            }),
          }
        );

        const fightsPayload =
          (await fightsResponse.json()) as UfcBulkActionResponse;

        if (!fightsResponse.ok || !fightsPayload.ok) {
          throw new Error(
            !fightsPayload.ok && fightsPayload.error
              ? fightsPayload.error
              : "No se pudieron crear los combates."
          );
        }

        if (fightsPayload.summary.failed > 0) {
          throw new Error(
            `Se crearon ${fightsPayload.summary.created} combates, pero ${fightsPayload.summary.failed} fallaron. Revisa el resultado antes de continuar.`
          );
        }

        await reloadReferenceEntities();

        resolution = await requestUfcEventResolution(
          selectedOfficialEvent
        );

        setUfcEventResolution(resolution);
      }

      setUfcAutomationStatus({
        type: "success",
        message:
          resolution.counts.pendingFights === 0 &&
          resolution.counts.missingFighters === 0
            ? `Cartelera completa preparada: ${resolution.counts.existingFighters} luchadores relacionados, ${resolution.counts.existingFights} combates existentes y 0 pendientes.`
            : `Proceso completado con ${resolution.counts.pendingFights} combates y ${resolution.counts.missingFighters} luchadores todavía pendientes.`,
      });
    } catch (error) {
      setUfcAutomationStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido preparando la cartelera completa.",
      });
    } finally {
      setIsPreparingFullUfcCard(false);
    }
  }, [
    reloadReferenceEntities,
    requestUfcEventResolution,
    selectedOfficialEvent,
  ]);

  const applyOfficialEventToForm = useCallback((): void => {
    if (!selectedOfficialEvent) {
      setOfficialEventSourceStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de UFC.",
      });
      return;
    }

    if (contentType !== "evento") {
      setOfficialEventSourceStatus({
        type: "error",
        message:
          "Selecciona el tipo de contenido Evento antes de pasar la fuente al formulario.",
      });
      return;
    }

    const mmaOption = findReferenceByLabel(referenceData.disciplina, "MMA");
    const ufcOption = findReferenceByLabel(referenceData.organizacion, "UFC");
    const eventDate = toDateTimeLocalValue(selectedOfficialEvent.startDate);

    resetDerivedUiState();

    setForm((currentForm) => {
      const nextForm: ContentFormState = {
        ...currentForm,
        nombre: selectedOfficialEvent.name,
        ciudad: selectedOfficialEvent.city || "",
        pais: selectedOfficialEvent.country || "",
        recinto: selectedOfficialEvent.venue || "",
        cartelPrincipal: selectedOfficialEvent.mainEvent || "",
        dondeVer: selectedOfficialEvent.watchText || "",
        descripcionCorta: selectedOfficialEvent.description || "",
        descripcion: selectedOfficialEvent.description || "",
        estado: selectedOfficialEvent.status,
      };

      if (eventDate) {
        nextForm.fecha = eventDate;
      }

      if (selectedOfficialEvent.imageUrl) {
        nextForm.imagen = selectedOfficialEvent.imageUrl;
      }

      if (mmaOption) {
        nextForm.disciplina = toReferenceValue(mmaOption.value);
      }

      if (ufcOption) {
        nextForm.organizacion = toReferenceValue(ufcOption.value);
      }

      return clearInvalidDependentReferences(
        nextForm,
        auxiliary,
        referenceData
      );
    });

    setAuxiliary((currentAuxiliary) => ({
      ...currentAuxiliary,
      tipoEvento: selectedOfficialEvent.name.startsWith("UFC ")
        ? "Evento oficial UFC"
        : "Evento de deportes de combate",
      importanciaEditorial:
        selectedOfficialEvent.description ||
        "Evento oficial de UFC pendiente de revisión editorial.",
      combateEstelarTexto: selectedOfficialEvent.mainEvent || "",
      contextoCartelera: selectedOfficialEvent.description || "",
      clavesNarrativas: createEventEditorialInstructions(selectedOfficialEvent),
      publicoObjetivo: "Aficionados a los deportes de combate",
      tono: "informativo, directo y editorial",
    }));

    const missingRelations: string[] = [];

    if (!mmaOption) {
      missingRelations.push("MMA");
    }

    if (!ufcOption) {
      missingRelations.push("UFC");
    }

    setOfficialEventSourceStatus({
      type: "success",
      message:
        missingRelations.length === 0
          ? "Evento oficial cargado en el formulario con fecha, imagen, MMA y UFC."
          : `Evento cargado. Revisa manualmente estas referencias no encontradas en Sanity: ${missingRelations.join(
              ", "
            )}.`,
    });
  }, [
    auxiliary,
    contentType,
    referenceData,
    resetDerivedUiState,
    selectedOfficialEvent,
  ]);

  const transformOfficialEventToSpanish =
    useCallback(async (): Promise<void> => {
      if (!selectedOfficialEvent) {
        setOfficialEventSourceStatus({
          type: "error",
          message: "Selecciona primero un evento oficial de UFC.",
        });
        return;
      }

      if (contentType !== "evento") {
        setOfficialEventSourceStatus({
          type: "error",
          message:
            "Selecciona el tipo de contenido Evento antes de transformar la fuente.",
        });
        return;
      }

      try {
        setIsTransformingOfficialEvent(true);
        setOfficialEventSourceStatus({
          type: "idle",
          message: "",
        });

        const response = await fetch(`${API_BASE_URL}/api/transformar-evento`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(selectedOfficialEvent),
        });

        const payload = (await response.json()) as TransformEventApiResponse;

        if (!response.ok || !payload.ok) {
          throw new Error(
            !payload.ok && payload.error
              ? payload.error
              : "No se pudo transformar el evento al español."
          );
        }

        const mmaOption = findReferenceByLabel(referenceData.disciplina, "MMA");
        const ufcOption = findReferenceByLabel(
          referenceData.organizacion,
          "UFC"
        );
        const eventDate = toDateTimeLocalValue(selectedOfficialEvent.startDate);

        resetDerivedUiState();

        setForm((currentForm) => {
          const nextForm: ContentFormState = {
            ...currentForm,
            nombre: payload.data.nombre,
            horaLocal: payload.data.horaLocal,
            ciudad: payload.data.ciudad,
            pais: payload.data.pais,
            recinto: payload.data.recinto,
            cartelPrincipal: payload.data.cartelPrincipal,
            dondeVer: payload.data.dondeVer,
            descripcionCorta: payload.data.descripcionCorta,
            descripcion: payload.data.descripcion,
            notas: payload.data.notas,
            estado: selectedOfficialEvent.status,
          };

          if (eventDate) {
            nextForm.fecha = eventDate;
          }

          if (selectedOfficialEvent.imageUrl) {
            nextForm.imagen = selectedOfficialEvent.imageUrl;
          }

          if (mmaOption) {
            nextForm.disciplina = toReferenceValue(mmaOption.value);
          }

          if (ufcOption) {
            nextForm.organizacion = toReferenceValue(ufcOption.value);
          }

          return clearInvalidDependentReferences(
            nextForm,
            auxiliary,
            referenceData
          );
        });

        setAuxiliary((currentAuxiliary) => ({
          ...currentAuxiliary,
          tipoEvento: "Evento oficial UFC",
          importanciaEditorial: payload.data.descripcionCorta,
          combateEstelarTexto: payload.data.cartelPrincipal,
          contextoCartelera: payload.data.descripcion,
          clavesNarrativas: createEventEditorialInstructions(
            selectedOfficialEvent
          ),
          publicoObjetivo: "Aficionados a los deportes de combate",
          tono: "informativo, directo y editorial",
        }));

        const missingRelations: string[] = [];

        if (!mmaOption) {
          missingRelations.push("MMA");
        }

        if (!ufcOption) {
          missingRelations.push("UFC");
        }

        setOfficialEventSourceStatus({
          type: "success",
          message:
            missingRelations.length === 0
              ? "Evento transformado al español y cargado en el formulario con fecha, imagen, MMA y UFC."
              : `Evento transformado. Revisa manualmente estas referencias no encontradas en Sanity: ${missingRelations.join(
                  ", "
                )}.`,
        });
      } catch (error) {
        setOfficialEventSourceStatus({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Error desconocido transformando el evento al español.",
        });
      } finally {
        setIsTransformingOfficialEvent(false);
      }
    }, [
      auxiliary,
      contentType,
      referenceData,
      resetDerivedUiState,
      selectedOfficialEvent,
    ]);

  const transformOfficialNewsToSpanish = useCallback(async (): Promise<void> => {
    if (!selectedOfficialNews) {
      setOfficialSourceStatus({
        type: "error",
        message: "Selecciona primero una noticia oficial de UFC.",
      });
      return;
    }

    if (contentType !== "noticia") {
      setOfficialSourceStatus({
        type: "error",
        message:
          "Selecciona el tipo de contenido Noticia antes de transformar la fuente.",
      });
      return;
    }

    try {
      setIsTransformingOfficialNews(true);
      setOfficialSourceStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(`${API_BASE_URL}/api/transformar-noticia`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          title: selectedOfficialNews.title,
          summary: selectedOfficialNews.summary,
          bodyText: selectedOfficialNews.bodyText,
          sourceUrl:
            selectedOfficialNews.canonicalUrl || selectedOfficialNews.sourceUrl,
        }),
      });

      const payload = (await response.json()) as TransformNewsApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudo transformar la noticia al español."
        );
      }

      const mmaOption = findReferenceByLabel(referenceData.disciplina, "MMA");
      const ufcOption = findReferenceByLabel(referenceData.organizacion, "UFC");
      const publicationDate = toDateTimeLocalValue(
        selectedOfficialNews.publishedAt
      );
      const relationResolution = resolveSuggestedNewsRelations({
        suggestions: payload.data.relacionesSugeridas,
        referenceData,
      });

      setNewsRelationsResolution(relationResolution);
      resetDerivedUiState();

      setForm((currentForm) => {
        const nextForm: ContentFormState = {
          ...currentForm,
          titulo: payload.data.titulo,
          extracto: payload.data.extracto,
          contenido: payload.data.contenido,
          destacada: false,
        };

        if (publicationDate) {
          nextForm.fechaPublicacion = publicationDate;
        }

        if (selectedOfficialNews.imageUrl) {
          nextForm.imagenPrincipal = selectedOfficialNews.imageUrl;
        }

        if (relationResolution.resolved.disciplina) {
          nextForm.disciplina = toReferenceValue(
            relationResolution.resolved.disciplina.value
          );
        } else if (mmaOption) {
          nextForm.disciplina = toReferenceValue(mmaOption.value);
        }

        if (relationResolution.resolved.organizacion) {
          nextForm.organizacionRelacionada = toReferenceValue(
            relationResolution.resolved.organizacion.value
          );
        } else if (ufcOption) {
          nextForm.organizacionRelacionada = toReferenceValue(ufcOption.value);
        }

        if (relationResolution.resolved.evento) {
          nextForm.eventoRelacionado = toReferenceValue(
            relationResolution.resolved.evento.value
          );
        } else {
          nextForm.eventoRelacionado = undefined;
        }

        nextForm.luchadoresRelacionados =
          relationResolution.resolved.luchadores.map((fighter) =>
            toReferenceValue(fighter.value)
          );

        return clearInvalidDependentReferences(
          nextForm,
          auxiliary,
          referenceData
        );
      });

      setAuxiliary((currentAuxiliary) => ({
        ...currentAuxiliary,
        anguloEditorial:
          "Noticia reescrita en español desde una fuente oficial de UFC con enfoque propio de Full Fight News.",
        hechoPrincipal: payload.data.extracto,
        contextoPrevio:
          selectedOfficialNews.bodyText?.trim() ||
          selectedOfficialNews.summary?.trim() ||
          selectedOfficialNews.title,
        tono: "informativo, directo y periodístico",
        seoObjetivo: payload.data.titulo,
        instruccionesRedaccion: createEditorialInstructions(
          selectedOfficialNews
        ),
      }));

      const unresolvedCount =
        relationResolution.unresolved.luchadores.length +
        (relationResolution.unresolved.evento ? 1 : 0) +
        (relationResolution.unresolved.organizacion ? 1 : 0) +
        (relationResolution.unresolved.disciplina ? 1 : 0);

      const resolvedRelationCount =
        relationResolution.resolved.luchadores.length +
        (relationResolution.resolved.evento ? 1 : 0) +
        (relationResolution.resolved.organizacion ? 1 : 0) +
        (relationResolution.resolved.disciplina ? 1 : 0);

      setOfficialSourceStatus({
        type: "success",
        message:
          unresolvedCount === 0
            ? `Noticia transformada y relacionada automáticamente: ${resolvedRelationCount} referencias reales resueltas en Sanity.`
            : `Noticia transformada: ${resolvedRelationCount} referencias resueltas y ${unresolvedCount} sugerencias pendientes de revisión.`,
      });
    } catch (error) {
      setOfficialSourceStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido transformando la noticia al español.",
      });
    } finally {
      setIsTransformingOfficialNews(false);
    }
  }, [
    auxiliary,
    contentType,
    referenceData,
    resetDerivedUiState,
    selectedOfficialNews,
  ]);

  const applyOfficialNewsToForm = useCallback((): void => {
    if (!selectedOfficialNews) {
      setOfficialSourceStatus({
        type: "error",
        message: "Selecciona primero una noticia oficial de UFC.",
      });
      return;
    }

    if (contentType !== "noticia") {
      setOfficialSourceStatus({
        type: "error",
        message: "Selecciona el tipo de contenido Noticia antes de pasar la fuente al formulario.",
      });
      return;
    }

    const mmaOption = findReferenceByLabel(referenceData.disciplina, "MMA");
    const ufcOption = findReferenceByLabel(referenceData.organizacion, "UFC");
    const officialSummary =
      selectedOfficialNews.summary?.trim() ||
      createSourceExtract(selectedOfficialNews) ||
      selectedOfficialNews.title;
    const officialBody =
      selectedOfficialNews.bodyText?.trim() ||
      selectedOfficialNews.summary?.trim() ||
      selectedOfficialNews.title;
    const publicationDate = toDateTimeLocalValue(selectedOfficialNews.publishedAt);

    setNewsRelationsResolution(null);
    resetDerivedUiState();

    setForm((currentForm) => {
      const nextForm: ContentFormState = {
        ...currentForm,
        titulo: selectedOfficialNews.title,
        extracto: createSourceExtract(selectedOfficialNews),
        contenido: officialBody,
        destacada: false,
      };

      if (publicationDate) {
        nextForm.fechaPublicacion = publicationDate;
      }

      if (selectedOfficialNews.imageUrl) {
        nextForm.imagenPrincipal = selectedOfficialNews.imageUrl;
      }

      if (mmaOption) {
        nextForm.disciplina = toReferenceValue(mmaOption.value);
      }

      if (ufcOption) {
        nextForm.organizacionRelacionada = toReferenceValue(ufcOption.value);
      }

      return clearInvalidDependentReferences(nextForm, auxiliary, referenceData);
    });

    setAuxiliary((currentAuxiliary) => ({
      ...currentAuxiliary,
      anguloEditorial:
        "Reescritura informativa en español a partir de una fuente oficial de UFC, con enfoque propio de Full Fight News.",
      hechoPrincipal: officialSummary,
      contextoPrevio: officialBody,
      tono: "informativo, directo y periodístico",
      seoObjetivo: selectedOfficialNews.title,
      instruccionesRedaccion: createEditorialInstructions(selectedOfficialNews),
    }));

    const missingRelations: string[] = [];

    if (!mmaOption) {
      missingRelations.push("MMA");
    }

    if (!ufcOption) {
      missingRelations.push("UFC");
    }

    setOfficialSourceStatus({
      type: "success",
      message:
        missingRelations.length === 0
          ? "Noticia oficial cargada y mapeada: título, extracto, contenido, fecha, imagen, MMA, UFC y auxiliares editoriales."
          : `Noticia cargada. Revisa manualmente estas referencias no encontradas en Sanity: ${missingRelations.join(
              ", "
            )}.`,
    });
  }, [
    auxiliary,
    contentType,
    referenceData,
    resetDerivedUiState,
    selectedOfficialNews,
  ]);

  useEffect(() => {
    const nextState = getInitialFormState(contentType);
    setForm(nextState.form);
    setAuxiliary(nextState.auxiliary);
    setResult(null);
    setSaveDraftStatus({
      type: "idle",
      message: "",
    });

    if (contentType !== "noticia") {
      setSelectedOfficialNewsId("");
      setOfficialSourceStatus({
        type: "idle",
        message: "",
      });
    }

    if (contentType !== "evento") {
      setSelectedOfficialEventId("");
      setOfficialEventSourceStatus({
        type: "idle",
        message: "",
      });
      setUfcEventResolution(null);
      setUfcAutomationStatus({
        type: "idle",
        message: "",
      });
    }
  }, [contentType]);

  useEffect(() => {
    void reloadReferenceEntities();
  }, [reloadReferenceEntities]);

  useEffect(() => {
    function handleVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        void reloadReferenceEntities();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [reloadReferenceEntities]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void reloadReferenceEntities();
    }, AUTO_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [reloadReferenceEntities]);

  const visibleSchemaFields = useMemo(
    () => definition.schemaFields.filter((field) => !shouldHideField(field, form)),
    [definition.schemaFields, form]
  );

  function updateFormField(
    field: SchemaFieldDefinition,
    rawValue: string | boolean
  ): void {
    const { name, kind } = field;

    let nextValue: FormValue;

    switch (kind) {
      case "boolean":
        nextValue = typeof rawValue === "boolean" ? rawValue : false;
        break;
      case "number":
        nextValue =
          typeof rawValue === "string" && rawValue.trim() !== ""
            ? Number(rawValue)
            : undefined;
        break;
      case "slug":
        nextValue = {
          current: typeof rawValue === "string" ? rawValue : "",
        };
        break;
      case "reference":
        nextValue =
          typeof rawValue === "string" && rawValue.trim()
            ? toReferenceValue(rawValue.trim())
            : undefined;
        break;
      case "referenceArray":
        nextValue =
          typeof rawValue === "string"
            ? parseReferenceArrayInput(rawValue).map(toReferenceValue)
            : [];
        break;
      case "portableText":
        nextValue = typeof rawValue === "string" ? rawValue : "";
        break;
      case "image":
        nextValue = typeof rawValue === "string" ? rawValue.trim() : "";
        break;
      case "datetime":
      case "string":
      case "text":
      default:
        nextValue = typeof rawValue === "string" ? rawValue : "";
        break;
    }

    resetDerivedUiState();

    setForm((prev) => {
      const nextForm = {
        ...prev,
        [name]: nextValue,
      };

      return FIELDS_THAT_TRIGGER_CLEANUP.has(name)
        ? clearInvalidDependentReferences(nextForm, auxiliary, referenceData)
        : nextForm;
    });
  }

  function updateReferenceArrayField(
    field: SchemaFieldDefinition,
    refValue: string,
    checked: boolean
  ): void {
    resetDerivedUiState();

    setForm((prev) => {
      const currentValues = getReferenceArrayValues(prev[field.name]);

      const nextValues = checked
        ? Array.from(new Set([...currentValues, refValue]))
        : currentValues.filter((value) => value !== refValue);

      const nextForm = {
        ...prev,
        [field.name]: nextValues.map(toReferenceValue),
      };

      return clearInvalidDependentReferences(nextForm, auxiliary, referenceData);
    });
  }

  function updateAuxiliaryField(
    name: string,
    kind: "string" | "text" | "boolean" | "reference",
    rawValue: string | boolean
  ): void {
    resetDerivedUiState();

    setAuxiliary((prev) => {
      const nextValue =
        kind === "boolean"
          ? Boolean(rawValue)
          : kind === "reference"
          ? typeof rawValue === "string" && rawValue.trim()
            ? toReferenceValue(rawValue.trim())
            : undefined
          : String(rawValue);

      const nextAuxiliary = {
        ...prev,
        [name]: nextValue,
      };

      if (FIELDS_THAT_TRIGGER_CLEANUP.has(name)) {
        setForm((currentForm) =>
          clearInvalidDependentReferences(currentForm, nextAuxiliary, referenceData)
        );
      }

      return nextAuxiliary;
    });
  }

  function handleBuild(): void {
    const buildResult = buildContentOutput({
      contentType,
      form,
      auxiliary,
    });

    setResult({
      ok: buildResult.ok,
      output: buildResult.output as Record<string, unknown> | null,
      issues: buildResult.issues,
    });

    setSaveDraftStatus({
      type: "idle",
      message: "",
    });
  }

  async function handleSaveDraft(): Promise<void> {
    if (!result) {
      setSaveDraftStatus({
        type: "error",
        message: "Primero genera el output antes de guardar.",
      });
      return;
    }

    if (!result.ok || !result.output) {
      setSaveDraftStatus({
        type: "error",
        message: "No puedes guardar un output bloqueado o vacío.",
      });
      return;
    }

    try {
      setIsSavingDraft(true);
      setSaveDraftStatus({
        type: "idle",
        message: "",
      });

      const response = await saveDraft({
        contentType,
        document: result.output,
      });

      setSaveDraftStatus({
        type: "success",
        message:
          response.message ||
          `Borrador guardado correctamente${
            response.documentId ? ` (${response.documentId})` : ""
          }.`,
      });

      await reloadReferenceEntities();
    } catch (error) {
      setSaveDraftStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido al guardar el borrador.",
      });
    } finally {
      setIsSavingDraft(false);
    }
  }

  function renderReferenceSelect(
    field: SchemaFieldDefinition,
    referenceTarget: ReferenceTarget,
    value: FormValue
  ): ReactElement {
    const referenceOptions = getFilteredReferenceEntityOptionsFromApiData({
      target: referenceTarget,
      filters: filterContext,
      referenceData,
    });

    const currentValue = getReferenceValue(value);
    const disabled = isLoadingReferences || referenceOptions.length === 0;

    return (
      <>
        <select
          value={currentValue}
          onChange={(event) => updateFormField(field, event.target.value)}
          style={styles.input}
          disabled={disabled}
        >
          <option value="">
            {isLoadingReferences
              ? "Cargando referencias..."
              : getReferencePlaceholder(referenceTarget)}
          </option>
          {referenceOptions.map((option) => (
            <option key={`${field.name}-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {!isLoadingReferences && referenceOptions.length === 0 ? (
          <p style={styles.inlineEmptyState}>
            {getReferenceEmptyStateMessage(referenceTarget, filterContext)}
          </p>
        ) : null}
      </>
    );
  }

  function renderAuxiliaryReferenceSelect(input: {
    name: string;
    label: string;
    referenceTo?: ReferenceTarget;
  }): ReactElement {
    const referenceTarget = input.referenceTo;

    if (!referenceTarget) {
      return (
        <input
          type="text"
          value={getReferenceValue(auxiliary[input.name])}
          onChange={(event) =>
            updateAuxiliaryField(input.name, "reference", event.target.value)
          }
          style={styles.input}
          placeholder="ID de referencia de Sanity"
        />
      );
    }

    const referenceOptions = getFilteredReferenceEntityOptionsFromApiData({
      target: referenceTarget,
      filters: filterContext,
      referenceData,
    });

    const currentValue = getReferenceValue(auxiliary[input.name]);
    const disabled = isLoadingReferences || referenceOptions.length === 0;

    return (
      <>
        <select
          value={currentValue}
          onChange={(event) =>
            updateAuxiliaryField(input.name, "reference", event.target.value)
          }
          style={styles.input}
          disabled={disabled}
        >
          <option value="">
            {isLoadingReferences
              ? "Cargando referencias..."
              : getReferencePlaceholder(referenceTarget)}
          </option>
          {referenceOptions.map((option) => (
            <option key={`${input.name}-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {!isLoadingReferences && referenceOptions.length === 0 ? (
          <p style={styles.inlineEmptyState}>
            {getReferenceEmptyStateMessage(referenceTarget, filterContext)}
          </p>
        ) : null}
      </>
    );
  }

  function renderReferenceArray(
    field: SchemaFieldDefinition,
    referenceTarget: ReferenceTarget,
    value: FormValue
  ): ReactElement {
    const referenceOptions = getFilteredReferenceEntityOptionsFromApiData({
      target: referenceTarget,
      filters: filterContext,
      referenceData,
    });

    if (isLoadingReferences) {
      return (
        <div style={styles.referenceArrayGroup}>
          <p style={styles.inlineEmptyState}>Cargando referencias...</p>
        </div>
      );
    }

    if (referenceOptions.length === 0) {
      return (
        <div style={styles.referenceArrayGroup}>
          <p style={styles.inlineEmptyState}>
            {getReferenceEmptyStateMessage(referenceTarget, filterContext)}
          </p>
        </div>
      );
    }

    const selectedValues = getReferenceArrayValues(value);

    return (
      <div style={styles.referenceArrayGroup}>
        {referenceOptions.map((option) => {
          const checked = selectedValues.includes(option.value);

          return (
            <label
              key={`${field.name}-${option.value}`}
              style={styles.referenceCheckboxRow}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  updateReferenceArrayField(
                    field,
                    option.value,
                    event.target.checked
                  )
                }
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    );
  }

  function renderField(field: SchemaFieldDefinition): ReactElement {
    const value = form[field.name];
    const referenceTarget = field.referenceTo;

    switch (field.kind) {
      case "boolean":
        return (
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={getBooleanValue(value)}
              onChange={(event) => updateFormField(field, event.target.checked)}
            />
            <span>{field.label}</span>
          </label>
        );

      case "number":
        return (
          <input
            type="number"
            value={getNumberValue(value)}
            onChange={(event) => updateFormField(field, event.target.value)}
            style={styles.input}
          />
        );

      case "slug":
        return (
          <input
            type="text"
            value={
              value && typeof value === "object" && "current" in value
                ? ((value as { current?: unknown }).current as string) ?? ""
                : ""
            }
            onChange={(event) => updateFormField(field, event.target.value)}
            style={styles.input}
            placeholder="slug-manual-opcional"
          />
        );

      case "reference":
        if (referenceTarget) {
          return renderReferenceSelect(field, referenceTarget, value);
        }

        return (
          <input
            type="text"
            value={getReferenceValue(value)}
            onChange={(event) => updateFormField(field, event.target.value)}
            style={styles.input}
            placeholder="ID de referencia de Sanity"
          />
        );

      case "referenceArray":
        if (referenceTarget) {
          return renderReferenceArray(field, referenceTarget, value);
        }

        return (
          <textarea
            value={getReferenceArrayValues(value).join("\n")}
            onChange={(event) => updateFormField(field, event.target.value)}
            rows={getTextAreaRows(field.kind, field.rows)}
            style={styles.textarea}
            placeholder="Un _ref por línea"
          />
        );

      case "portableText":
        return (
          <textarea
            value={getPortableTextEditorValue(value)}
            onChange={(event) => updateFormField(field, event.target.value)}
            rows={getTextAreaRows(field.kind, field.rows)}
            style={styles.textarea}
            placeholder="Escribe el contenido principal..."
          />
        );

      case "text":
        return (
          <textarea
            value={getStringValue(value)}
            onChange={(event) => updateFormField(field, event.target.value)}
            rows={getTextAreaRows(field.kind, field.rows)}
            style={styles.textarea}
          />
        );

      case "image":
        return (
          <input
            type="text"
            value={getStringValue(value)}
            onChange={(event) => updateFormField(field, event.target.value)}
            style={styles.input}
            placeholder="Valor temporal o referencia de imagen"
          />
        );

      case "datetime":
        return (
          <input
            type="datetime-local"
            value={getStringValue(value)}
            onChange={(event) => updateFormField(field, event.target.value)}
            style={styles.input}
          />
        );

      case "string":
      default:
        if (field.options && field.options.length > 0) {
          return (
            <select
              value={getStringValue(value)}
              onChange={(event) => updateFormField(field, event.target.value)}
              style={styles.input}
            >
              <option value="">Selecciona una opción</option>
              {field.options.map((option) => (
                <option key={`${field.name}-${option.value}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          );
        }

        return (
          <input
            type="text"
            value={getStringValue(value)}
            onChange={(event) => updateFormField(field, event.target.value)}
            style={styles.input}
          />
        );
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <p style={styles.eyebrow}>FFN3 · Laboratorio IA</p>
            <h1 style={styles.title}>Panel editorial de borradores</h1>
            <p style={styles.description}>
              Genera una salida alineada con los schemas reales de Sanity antes de
              pensar en guardado.
            </p>
          </div>

          <div style={styles.headerActions}>
            <label style={styles.label}>
              Tipo de contenido
              <select
                value={contentType}
                onChange={(event) =>
                  setContentType(event.target.value as ContentTypeId)
                }
                style={styles.input}
              >
                {contentTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div style={styles.actionButtons}>
              <button type="button" onClick={handleBuild} style={styles.button}>
                Generar output
              </button>

              <button
                type="button"
                onClick={() => {
                  void handleSaveDraft();
                }}
                style={canSaveDraft ? styles.secondaryButton : styles.buttonDisabled}
                disabled={!canSaveDraft}
              >
                {isSavingDraft ? "Guardando..." : "Guardar borrador"}
              </button>
            </div>

            {isLoadingReferences ? (
              <div style={styles.feedbackNeutral}>
                Actualizando referencias desde Sanity...
              </div>
            ) : null}

            {referenceLoadError ? (
              <div style={styles.feedbackError}>{referenceLoadError}</div>
            ) : null}

            {saveDraftStatus.type !== "idle" ? (
              <div
                style={
                  saveDraftStatus.type === "success"
                    ? styles.feedbackSuccess
                    : styles.feedbackError
                }
              >
                {saveDraftStatus.message}
              </div>
            ) : null}
          </div>
        </header>

        <section style={styles.metaCard}>
          <strong>{definition.label}</strong>
          <p style={styles.metaText}>{definition.description}</p>
        </section>

        {contentType === "noticia" ? (
          <section style={styles.sourceCard}>
            <div style={styles.sourceHeader}>
              <div>
                <p style={styles.sourceEyebrow}>Fuente oficial conectada</p>
                <h2 style={styles.sectionTitle}>Bandeja de noticias UFC</h2>
                <p style={styles.metaText}>
                  Selecciona una noticia oficial, pásala al formulario y edítala
                  antes de generar el borrador de Full Fight News.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  void reloadOfficialUfcNews();
                }}
                style={
                  isLoadingOfficialNews
                    ? styles.buttonDisabled
                    : styles.secondaryButton
                }
                disabled={isLoadingOfficialNews}
              >
                {isLoadingOfficialNews
                  ? "Actualizando UFC..."
                  : officialNewsItems.length > 0
                  ? "Actualizar noticias UFC"
                  : "Cargar noticias UFC"}
              </button>
            </div>

            {officialSourceStatus.type !== "idle" ? (
              <div
                style={
                  officialSourceStatus.type === "success"
                    ? styles.feedbackSuccess
                    : styles.feedbackError
                }
              >
                {officialSourceStatus.message}
              </div>
            ) : null}

            {officialNewsFetchedAt ? (
              <p style={styles.sourceTimestamp}>
                Última consulta:{" "}
                {new Date(officialNewsFetchedAt).toLocaleString("es-ES")}
              </p>
            ) : null}

            {officialNewsItems.length > 0 ? (
              <div style={styles.sourceLayout}>
                <div style={styles.sourceList}>
                  {officialNewsItems.map((item) => {
                    const isSelected = item.id === selectedOfficialNewsId;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedOfficialNewsId(item.id);
                          setNewsRelationsResolution(null);
                          setOfficialSourceStatus({
                            type: "idle",
                            message: "",
                          });
                        }}
                        style={
                          isSelected
                            ? styles.sourceItemSelected
                            : styles.sourceItem
                        }
                      >
                        <span style={styles.sourceItemTitle}>{item.title}</span>

                        {item.summary ? (
                          <span style={styles.sourceItemSummary}>
                            {item.summary}
                          </span>
                        ) : null}

                        <span style={styles.sourceItemMeta}>
                          {item.publishedAt
                            ? new Date(item.publishedAt).toLocaleString("es-ES")
                            : "Fecha no disponible"}
                          {" · "}
                          {item.bodyText
                            ? "Contenido completo"
                            : "Sin cuerpo completo"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div style={styles.sourcePreview}>
                  {selectedOfficialNews ? (
                    <>
                      {selectedOfficialNews.imageUrl ? (
                        <img
                          src={selectedOfficialNews.imageUrl}
                          alt=""
                          style={styles.sourceImage}
                        />
                      ) : null}

                      <div style={styles.sourcePreviewContent}>
                        <p style={styles.sourceEyebrow}>Noticia seleccionada</p>
                        <h3 style={styles.sourcePreviewTitle}>
                          {selectedOfficialNews.title}
                        </h3>

                        {selectedOfficialNews.summary ? (
                          <p style={styles.sourcePreviewSummary}>
                            {selectedOfficialNews.summary}
                          </p>
                        ) : null}

                        <div style={styles.sourcePreviewActions}>
                          <button
                            type="button"
                            onClick={applyOfficialNewsToForm}
                            style={styles.button}
                            disabled={isTransformingOfficialNews}
                          >
                            Pasar al formulario
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              void transformOfficialNewsToSpanish();
                            }}
                            style={
                              isTransformingOfficialNews
                                ? styles.buttonDisabled
                                : styles.secondaryButton
                            }
                            disabled={isTransformingOfficialNews}
                          >
                            {isTransformingOfficialNews
                              ? "Transformando..."
                              : "Transformar a español"}
                          </button>

                          <a
                            href={selectedOfficialNews.canonicalUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={styles.sourceLink}
                          >
                            Abrir fuente oficial
                          </a>
                        </div>

                        {newsRelationsResolution ? (
                          <div style={styles.newsRelationsCard}>
                            <div style={styles.newsRelationsHeader}>
                              <div>
                                <p style={styles.sourceEyebrow}>
                                  Relaciones editoriales sugeridas
                                </p>
                                <strong>
                                  Coincidencias reales encontradas en Sanity
                                </strong>
                              </div>

                              <span
                                style={
                                  newsRelationsResolution.unresolved.luchadores
                                    .length > 0 ||
                                  newsRelationsResolution.unresolved.evento ||
                                  newsRelationsResolution.unresolved
                                    .organizacion ||
                                  newsRelationsResolution.unresolved.disciplina
                                    ? styles.batchStatusPending
                                    : styles.batchStatusOk
                                }
                              >
                                {newsRelationsResolution.unresolved.luchadores
                                  .length > 0 ||
                                newsRelationsResolution.unresolved.evento ||
                                newsRelationsResolution.unresolved
                                  .organizacion ||
                                newsRelationsResolution.unresolved.disciplina
                                  ? "Revisión parcial"
                                  : "Todo resuelto"}
                              </span>
                            </div>

                            <div style={styles.newsRelationsGrid}>
                              <div style={styles.newsRelationGroup}>
                                <span style={styles.automationStatLabel}>
                                  Disciplina
                                </span>
                                <strong>
                                  {newsRelationsResolution.resolved.disciplina
                                    ?.label ||
                                    newsRelationsResolution.unresolved
                                      .disciplina ||
                                    "Sin sugerencia"}
                                </strong>
                              </div>

                              <div style={styles.newsRelationGroup}>
                                <span style={styles.automationStatLabel}>
                                  Organización
                                </span>
                                <strong>
                                  {newsRelationsResolution.resolved.organizacion
                                    ?.label ||
                                    newsRelationsResolution.unresolved
                                      .organizacion ||
                                    "Sin sugerencia"}
                                </strong>
                              </div>

                              <div style={styles.newsRelationGroup}>
                                <span style={styles.automationStatLabel}>
                                  Evento
                                </span>
                                <strong>
                                  {newsRelationsResolution.resolved.evento
                                    ?.label ||
                                    newsRelationsResolution.unresolved.evento ||
                                    "Sin evento claro"}
                                </strong>
                              </div>
                            </div>

                            <div style={styles.newsRelationGroup}>
                              <span style={styles.automationStatLabel}>
                                Luchadores resueltos
                              </span>
                              <span style={styles.newsRelationTags}>
                                {newsRelationsResolution.resolved.luchadores
                                  .length > 0
                                  ? newsRelationsResolution.resolved.luchadores
                                      .map((fighter) => fighter.label)
                                      .join(" · ")
                                  : "Ninguno"}
                              </span>
                            </div>

                            {newsRelationsResolution.unresolved.luchadores
                              .length > 0 ? (
                              <div style={styles.newsRelationWarning}>
                                Sin coincidencia exacta en Sanity:{" "}
                                {newsRelationsResolution.unresolved.luchadores.join(
                                  " · "
                                )}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <p style={styles.sourceBodyPreview}>
                          {selectedOfficialNews.bodyText
                            ? `${selectedOfficialNews.bodyText.slice(0, 900)}${
                                selectedOfficialNews.bodyText.length > 900
                                  ? "..."
                                  : ""
                              }`
                            : "Esta noticia no contiene un cuerpo completo fiable. Se usará el resumen disponible y podrás completar el contenido manualmente."}
                        </p>
                      </div>
                    </>
                  ) : (
                    <p style={styles.emptyText}>
                      Selecciona una noticia de la bandeja para revisar sus datos.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p style={styles.emptyText}>
                Pulsa “Cargar noticias UFC” para consultar la fuente oficial.
              </p>
            )}
          </section>
        ) : null}

        {contentType === "evento" ? (
          <section style={styles.sourceCard}>
            <div style={styles.sourceHeader}>
              <div>
                <p style={styles.sourceEyebrow}>Fuente oficial conectada</p>
                <h2 style={styles.sectionTitle}>Bandeja de eventos UFC</h2>
                <p style={styles.metaText}>
                  Selecciona un evento oficial, revisa sus datos y transfórmalo
                  al español antes de generar el borrador.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  void reloadOfficialUfcEvents();
                }}
                style={
                  isLoadingOfficialEvents
                    ? styles.buttonDisabled
                    : styles.secondaryButton
                }
                disabled={isLoadingOfficialEvents}
              >
                {isLoadingOfficialEvents
                  ? "Actualizando eventos..."
                  : officialEventItems.length > 0
                  ? "Actualizar eventos UFC"
                  : "Cargar eventos UFC"}
              </button>
            </div>

            {officialEventSourceStatus.type !== "idle" ? (
              <div
                style={
                  officialEventSourceStatus.type === "success"
                    ? styles.feedbackSuccess
                    : styles.feedbackError
                }
              >
                {officialEventSourceStatus.message}
              </div>
            ) : null}

            {officialEventsFetchedAt ? (
              <p style={styles.sourceTimestamp}>
                Última consulta:{" "}
                {new Date(officialEventsFetchedAt).toLocaleString("es-ES")}
              </p>
            ) : null}

            {officialEventItems.length > 0 ? (
              <div style={styles.batchCard}>
                <div style={styles.batchHeader}>
                  <div>
                    <p style={styles.sourceEyebrow}>Análisis masivo</p>
                    <h3 style={styles.batchTitle}>
                      Próximos eventos UFC
                    </h3>
                    <p style={styles.metaText}>
                      Revisa de una sola vez qué eventos están completos,
                      cuáles pueden prepararse y cuáles requieren crear primero
                      su ficha en Sanity.
                    </p>
                  </div>

                  <div style={styles.batchHeaderActions}>
                    <button
                      type="button"
                      onClick={() => {
                        void analyzeUpcomingUfcEvents();
                      }}
                      style={
                        isAnalyzingUfcBatch || isPreparingUfcBatch
                          ? styles.buttonDisabled
                          : styles.secondaryButton
                      }
                      disabled={isAnalyzingUfcBatch || isPreparingUfcBatch}
                    >
                      {isAnalyzingUfcBatch
                        ? "Analizando próximos eventos..."
                        : "Analizar próximos eventos"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void prepareAllEligibleUfcEvents();
                      }}
                      style={
                        isPreparingUfcBatch ||
                        !ufcBatchAnalysis?.ok ||
                        ufcBatchAnalysis.summary.readyToPrepare === 0
                          ? styles.buttonDisabled
                          : styles.primaryButton
                      }
                      disabled={
                        isPreparingUfcBatch ||
                        isAnalyzingUfcBatch ||
                        !ufcBatchAnalysis?.ok ||
                        ufcBatchAnalysis.summary.readyToPrepare === 0
                      }
                    >
                      {isPreparingUfcBatch
                        ? "Preparando eventos aptos..."
                        : "Preparar todos los aptos"}
                    </button>
                  </div>
                </div>

                {ufcBatchStatus.type !== "idle" ? (
                  <div
                    style={
                      ufcBatchStatus.type === "success"
                        ? styles.feedbackSuccess
                        : styles.feedbackError
                    }
                  >
                    {ufcBatchStatus.message}
                  </div>
                ) : null}

                {ufcBatchPreparation.length > 0 ? (
                  <div style={styles.batchProgressList}>
                    {ufcBatchPreparation.map((item) => (
                      <div
                        key={item.eventId}
                        style={styles.batchProgressItem}
                      >
                        <div style={styles.batchProgressText}>
                          <strong>{item.eventName}</strong>
                          <span style={styles.batchItemMeta}>
                            {item.message}
                          </span>
                        </div>

                        <span
                          style={
                            item.status === "completado"
                              ? styles.batchStatusOk
                              : item.status === "fallido"
                              ? styles.batchStatusError
                              : styles.batchStatusPending
                          }
                        >
                          {item.status === "pendiente"
                            ? "Pendiente"
                            : item.status === "procesando"
                            ? "Procesando"
                            : item.status === "completado"
                            ? "Completado"
                            : "Fallido"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {ufcBatchAnalysis?.ok ? (
                  <>
                    <div style={styles.batchSummaryGrid}>
                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>
                          Completos
                        </span>
                        <strong>{ufcBatchAnalysis.summary.completed}</strong>
                      </div>
                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>
                          Listos para preparar
                        </span>
                        <strong>
                          {ufcBatchAnalysis.summary.readyToPrepare}
                        </strong>
                      </div>
                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>
                          Evento pendiente
                        </span>
                        <strong>
                          {ufcBatchAnalysis.summary.eventPending}
                        </strong>
                      </div>
                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>
                          Requieren revisión
                        </span>
                        <strong>
                          {ufcBatchAnalysis.summary.requiresReview}
                        </strong>
                      </div>
                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>
                          Luchadores faltantes
                        </span>
                        <strong>
                          {ufcBatchAnalysis.summary.totalMissingFighters}
                        </strong>
                      </div>
                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>
                          Combates pendientes
                        </span>
                        <strong>
                          {ufcBatchAnalysis.summary.totalPendingFights}
                        </strong>
                      </div>
                    </div>

                    <div style={styles.batchList}>
                      {ufcBatchAnalysis.items.map((item) => {
                        const sourceEvent = officialEventItems.find(
                          (event) => event.id === item.eventId
                        );

                        return (
                          <div key={item.eventId} style={styles.batchItem}>
                            <div style={styles.batchItemMain}>
                              <strong>{item.eventName}</strong>
                              <span style={styles.batchItemMeta}>
                                {item.eventFound
                                  ? "Evento encontrado"
                                  : "Evento pendiente"}
                                {" · "}
                                {item.existingFighters} luchadores existentes
                                {" · "}
                                {item.missingFighters} faltantes
                                {" · "}
                                {item.existingFights} combates existentes
                                {" · "}
                                {item.pendingFights} pendientes
                                {" · "}
                                {item.unresolvedCategories} categorías sin resolver
                              </span>
                              {item.error ? (
                                <span style={styles.batchError}>
                                  {item.error}
                                </span>
                              ) : null}
                            </div>

                            <div style={styles.batchItemActions}>
                              <span
                                style={
                                  item.status === "completo"
                                    ? styles.batchStatusOk
                                    : item.status === "requiere_revision"
                                    ? styles.batchStatusError
                                    : styles.batchStatusPending
                                }
                              >
                                {item.status === "completo"
                                  ? "Completo"
                                  : item.status === "evento_pendiente"
                                  ? "Crear evento"
                                  : item.status === "listo_para_preparar"
                                  ? "Listo para preparar"
                                  : "Revisar"}
                              </span>

                              {sourceEvent ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedOfficialEventId(sourceEvent.id);
                                    setUfcEventResolution(null);
                                    setUfcAutomationStatus({
                                      type: "idle",
                                      message: "",
                                    });
                                  }}
                                  style={
                                    isPreparingUfcBatch
                                      ? styles.buttonDisabled
                                      : styles.secondaryButton
                                  }
                                  disabled={isPreparingUfcBatch}
                                >
                                  Seleccionar
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            {officialEventItems.length > 0 ? (
              <div style={styles.sourceLayout}>
                <div style={styles.sourceList}>
                  {officialEventItems.map((item) => {
                    const isSelected = item.id === selectedOfficialEventId;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedOfficialEventId(item.id);
                          setOfficialEventSourceStatus({
                            type: "idle",
                            message: "",
                          });
                          setUfcEventResolution(null);
                          setUfcAutomationStatus({
                            type: "idle",
                            message: "",
                          });
                        }}
                        style={
                          isSelected
                            ? styles.sourceItemSelected
                            : styles.sourceItem
                        }
                      >
                        <span style={styles.sourceItemTitle}>{item.name}</span>

                        {item.mainEvent ? (
                          <span style={styles.sourceItemSummary}>
                            {item.mainEvent}
                          </span>
                        ) : null}

                        <span style={styles.sourceItemMeta}>
                          {item.startDate
                            ? new Date(item.startDate).toLocaleString("es-ES")
                            : "Fecha no disponible"}
                          {" · "}
                          {item.status}
                          {item.locationText ? ` · ${item.locationText}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div style={styles.sourcePreview}>
                  {selectedOfficialEvent ? (
                    <>
                      {selectedOfficialEvent.imageUrl ? (
                        <img
                          src={selectedOfficialEvent.imageUrl}
                          alt=""
                          style={styles.sourceImage}
                        />
                      ) : null}

                      <div style={styles.sourcePreviewContent}>
                        <p style={styles.sourceEyebrow}>Evento seleccionado</p>
                        <h3 style={styles.sourcePreviewTitle}>
                          {selectedOfficialEvent.name}
                        </h3>

                        <p style={styles.sourcePreviewSummary}>
                          {[
                            selectedOfficialEvent.mainEvent,
                            selectedOfficialEvent.locationText,
                            selectedOfficialEvent.watchText,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>

                        <div style={styles.sourcePreviewActions}>
                          <button
                            type="button"
                            onClick={applyOfficialEventToForm}
                            style={styles.button}
                            disabled={isTransformingOfficialEvent}
                          >
                            Pasar al formulario
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              void transformOfficialEventToSpanish();
                            }}
                            style={
                              isTransformingOfficialEvent
                                ? styles.buttonDisabled
                                : styles.secondaryButton
                            }
                            disabled={isTransformingOfficialEvent}
                          >
                            {isTransformingOfficialEvent
                              ? "Transformando..."
                              : "Transformar a español"}
                          </button>

                          <a
                            href={selectedOfficialEvent.canonicalUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={styles.sourceLink}
                          >
                            Abrir fuente oficial
                          </a>
                        </div>

                        <p style={styles.sourceBodyPreview}>
                          {selectedOfficialEvent.description ||
                            "La fuente oficial no incluye una descripción editorial completa. Podrás completarla manualmente."}
                        </p>

                        <div style={styles.automationCard}>
                          <div style={styles.automationHeader}>
                            <div>
                              <p style={styles.sourceEyebrow}>
                                Automatización de cartelera
                              </p>
                              <h4 style={styles.automationTitle}>
                                Resolver y crear relaciones en Sanity
                              </h4>
                            </div>

                            <div style={styles.automationTopActions}>
                              <button
                                type="button"
                                onClick={() => {
                                  void resolveSelectedUfcEvent();
                                }}
                                style={
                                  isResolvingUfcEvent ||
                                  isPreparingFullUfcCard
                                    ? styles.buttonDisabled
                                    : styles.secondaryButton
                                }
                                disabled={
                                  isResolvingUfcEvent ||
                                  isPreparingFullUfcCard
                                }
                              >
                                {isResolvingUfcEvent
                                  ? "Resolviendo..."
                                  : "Analizar cartelera"}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  void prepareFullUfcCard();
                                }}
                                style={
                                  isPreparingFullUfcCard
                                    ? styles.buttonDisabled
                                    : styles.button
                                }
                                disabled={
                                  isPreparingFullUfcCard ||
                                  isResolvingUfcEvent ||
                                  isCreatingUfcFighters ||
                                  isCreatingUfcFights
                                }
                              >
                                {isPreparingFullUfcCard
                                  ? "Preparando cartelera..."
                                  : "Preparar cartelera completa"}
                              </button>
                            </div>
                          </div>

                          {ufcAutomationStatus.type !== "idle" ? (
                            <div
                              style={
                                ufcAutomationStatus.type === "success"
                                  ? styles.feedbackSuccess
                                  : styles.feedbackError
                              }
                            >
                              {ufcAutomationStatus.message}
                            </div>
                          ) : null}

                          {ufcEventResolution?.ok ? (
                            <>
                              <div style={styles.automationStats}>
                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Evento
                                  </span>
                                  <strong>
                                    {ufcEventResolution.event.found
                                      ? "Encontrado"
                                      : "No encontrado"}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Combates
                                  </span>
                                  <strong>
                                    {ufcEventResolution.counts.fights}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Resueltos
                                  </span>
                                  <strong>
                                    {ufcEventResolution.counts.readyFights}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Ya existentes
                                  </span>
                                  <strong>
                                    {ufcEventResolution.counts.existingFights}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Pendientes de crear
                                  </span>
                                  <strong>
                                    {ufcEventResolution.counts.pendingFights}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Luchadores existentes
                                  </span>
                                  <strong>
                                    {
                                      ufcEventResolution.counts
                                        .existingFighters
                                    }
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Luchadores faltantes
                                  </span>
                                  <strong>
                                    {
                                      ufcEventResolution.counts
                                        .missingFighters
                                    }
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Categorías pendientes
                                  </span>
                                  <strong>
                                    {
                                      ufcEventResolution.counts
                                        .unresolvedCategories
                                    }
                                  </strong>
                                </div>
                              </div>

                              {ufcEventResolution.missingFighters.length > 0 ? (
                                <div style={styles.automationWarning}>
                                  <strong>Luchadores pendientes:</strong>{" "}
                                  {ufcEventResolution.missingFighters
                                    .map((fighter) => fighter.sourceName)
                                    .join(", ")}
                                </div>
                              ) : null}

                              {ufcEventResolution.unresolvedCategories.length >
                              0 ? (
                                <div style={styles.automationWarning}>
                                  <strong>Categorías sin resolver:</strong>{" "}
                                  {ufcEventResolution.unresolvedCategories
                                    .map((category) => category.sourceLabel)
                                    .join(", ")}
                                </div>
                              ) : null}

                              <div style={styles.automationActions}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void createMissingUfcFighters();
                                  }}
                                  style={
                                    canCreateMissingUfcFighters
                                      ? styles.secondaryButton
                                      : styles.buttonDisabled
                                  }
                                  disabled={!canCreateMissingUfcFighters}
                                >
                                  {isCreatingUfcFighters
                                    ? "Creando luchadores..."
                                    : `Crear luchadores faltantes (${ufcEventResolution.counts.missingFighters})`}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    void createUfcFights();
                                  }}
                                  style={
                                    canCreateUfcFights
                                      ? styles.button
                                      : styles.buttonDisabled
                                  }
                                  disabled={!canCreateUfcFights}
                                >
                                  {isCreatingUfcFights
                                    ? "Creando combates..."
                                    : `Crear combates (${ufcEventResolution.counts.pendingFights})`}
                                </button>
                              </div>
                            </>
                          ) : (
                            <p style={styles.inlineEmptyState}>
                              Analiza la cartelera para comprobar evento,
                              luchadores, categorías y combates disponibles.
                            </p>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <p style={styles.emptyText}>
                      Selecciona un evento para revisar sus datos oficiales.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p style={styles.emptyText}>
                Pulsa “Cargar eventos UFC” para consultar la fuente oficial.
              </p>
            )}
          </section>
        ) : null}

        <div style={styles.grid}>
          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>Campos reales de schema</h2>

            <div style={styles.formGrid}>
              {visibleSchemaFields.map((field) => (
                <div key={field.name} style={styles.fieldBlock}>
                  <label style={styles.label}>
                    <span>
                      {field.label}
                      {field.required ? " *" : ""}
                    </span>
                    {renderField(field)}
                  </label>

                  {field.description ? (
                    <p style={styles.helpText}>{field.description}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>Inputs auxiliares</h2>

            <div style={styles.formGrid}>
              {definition.auxiliaryInputs.map((input) => (
                <div key={input.name} style={styles.fieldBlock}>
                  {input.kind === "boolean" ? (
                    <label style={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        checked={getBooleanValue(auxiliary[input.name])}
                        onChange={(event) =>
                          updateAuxiliaryField(
                            input.name,
                            input.kind,
                            event.target.checked
                          )
                        }
                      />
                      <span>{input.label}</span>
                    </label>
                  ) : input.kind === "reference" ? (
                    <label style={styles.label}>
                      <span>{input.label}</span>
                      {renderAuxiliaryReferenceSelect(input)}
                    </label>
                  ) : (
                    <label style={styles.label}>
                      <span>{input.label}</span>
                      {input.kind === "text" ? (
                        <textarea
                          value={getStringValue(auxiliary[input.name])}
                          onChange={(event) =>
                            updateAuxiliaryField(
                              input.name,
                              input.kind,
                              event.target.value
                            )
                          }
                          rows={typeof input.rows === "number" ? input.rows : 4}
                          style={styles.textarea}
                        />
                      ) : (
                        <input
                          type="text"
                          value={getStringValue(auxiliary[input.name])}
                          onChange={(event) =>
                            updateAuxiliaryField(
                              input.name,
                              input.kind,
                              event.target.value
                            )
                          }
                          style={styles.input}
                        />
                      )}
                    </label>
                  )}

                  {input.description ? (
                    <p style={styles.helpText}>{input.description}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </div>

        <section style={styles.card}>
          <div style={styles.resultHeader}>
            <h2 style={styles.sectionTitle}>Resultado</h2>
            {result ? (
              <div style={styles.badges}>
                <span style={styles.badgeNeutral}>
                  {getIssueCount(result.issues, "error")} errores
                </span>
                <span style={styles.badgeNeutral}>
                  {getIssueCount(result.issues, "warning")} avisos
                </span>
                <span style={result.ok ? styles.badgeOk : styles.badgeError}>
                  {result.ok ? "Output válido" : "Output bloqueado"}
                </span>
              </div>
            ) : null}
          </div>

          {!result ? (
            <p style={styles.emptyText}>
              Aún no has generado ningún output. Rellena el formulario y pulsa
              “Generar output”.
            </p>
          ) : (
            <div style={styles.resultGrid}>
              <div style={styles.resultPanel}>
                <h3 style={styles.subTitle}>Issues</h3>
                {result.issues.length === 0 ? (
                  <p style={styles.emptyText}>Sin errores ni avisos.</p>
                ) : (
                  <ul style={styles.issueList}>
                    {result.issues.map((issue, index) => (
                      <li
                        key={`${issue.field}-${issue.message}-${index}`}
                        style={styles.issueItem}
                      >
                        <strong>
                          [{issue.severity.toUpperCase()}] {issue.field}
                        </strong>{" "}
                        — {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div style={styles.resultPanel}>
                <h3 style={styles.subTitle}>Preview JSON</h3>
                <pre style={styles.pre}>{prettyJson(result.output)}</pre>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0b0f14",
    color: "#f5f7fa",
    padding: "32px 20px",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  container: {
    maxWidth: 1320,
    margin: "0 auto",
    display: "grid",
    gap: 20,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    flexWrap: "wrap",
  },
  eyebrow: {
    margin: 0,
    fontSize: 12,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    opacity: 0.7,
  },
  title: {
    margin: "6px 0 10px",
    fontSize: 34,
    lineHeight: 1.1,
  },
  description: {
    margin: 0,
    maxWidth: 720,
    opacity: 0.82,
    lineHeight: 1.5,
  },
  headerActions: {
    minWidth: 280,
    display: "grid",
    gap: 12,
  },
  actionButtons: {
    display: "grid",
    gap: 10,
  },
  metaCard: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 16,
  },
  metaText: {
    margin: "8px 0 0",
    opacity: 0.8,
    lineHeight: 1.5,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1.2fr 0.8fr",
    gap: 20,
  },
  card: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 22,
    padding: 20,
    display: "grid",
    gap: 16,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 22,
  },
  subTitle: {
    margin: 0,
    fontSize: 16,
  },
  formGrid: {
    display: "grid",
    gap: 14,
  },
  fieldBlock: {
    display: "grid",
    gap: 8,
  },
  label: {
    display: "grid",
    gap: 8,
    fontSize: 14,
    fontWeight: 600,
  },
  helpText: {
    margin: 0,
    fontSize: 12,
    opacity: 0.7,
    lineHeight: 1.4,
  },
  inlineEmptyState: {
    margin: 0,
    fontSize: 12,
    opacity: 0.72,
    lineHeight: 1.4,
  },
  input: {
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.2)",
    color: "#f5f7fa",
    padding: "12px 14px",
    outline: "none",
    fontSize: 14,
  },
  textarea: {
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.2)",
    color: "#f5f7fa",
    padding: "12px 14px",
    outline: "none",
    fontSize: 14,
    resize: "vertical",
    fontFamily: "inherit",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    fontWeight: 600,
  },
  referenceArrayGroup: {
    display: "grid",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.16)",
  },
  referenceCheckboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    fontWeight: 500,
  },
  button: {
    border: 0,
    borderRadius: 14,
    padding: "12px 16px",
    background: "#f5f7fa",
    color: "#0b0f14",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 14,
    padding: "12px 16px",
    background: "rgba(255,255,255,0.08)",
    color: "#f5f7fa",
    fontWeight: 700,
    cursor: "pointer",
  },
  buttonDisabled: {
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: "12px 16px",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(245,247,250,0.45)",
    fontWeight: 700,
    cursor: "not-allowed",
    opacity: 0.7,
  },
  feedbackNeutral: {
    borderRadius: 14,
    padding: "12px 14px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#dbe4ee",
    fontSize: 13,
    lineHeight: 1.4,
  },
  feedbackSuccess: {
    borderRadius: 14,
    padding: "12px 14px",
    background: "rgba(16,185,129,0.16)",
    border: "1px solid rgba(16,185,129,0.3)",
    color: "#b7f7d8",
    fontSize: 13,
    lineHeight: 1.4,
  },
  feedbackError: {
    borderRadius: 14,
    padding: "12px 14px",
    background: "rgba(239,68,68,0.16)",
    border: "1px solid rgba(239,68,68,0.3)",
    color: "#fecaca",
    fontSize: 13,
    lineHeight: 1.4,
  },
  sourceCard: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 22,
    padding: 20,
    display: "grid",
    gap: 16,
  },
  sourceHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  sourceEyebrow: {
    margin: "0 0 6px",
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    opacity: 0.65,
  },
  sourceTimestamp: {
    margin: 0,
    fontSize: 12,
    opacity: 0.65,
  },
  sourceLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(280px, 0.85fr) minmax(340px, 1.15fr)",
    gap: 16,
    alignItems: "start",
  },
  sourceList: {
    display: "grid",
    gap: 10,
    maxHeight: 620,
    overflowY: "auto",
    paddingRight: 4,
  },
  sourceItem: {
    width: "100%",
    display: "grid",
    gap: 7,
    textAlign: "left",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.16)",
    color: "#f5f7fa",
    padding: 14,
    cursor: "pointer",
  },
  sourceItemSelected: {
    width: "100%",
    display: "grid",
    gap: 7,
    textAlign: "left",
    borderRadius: 14,
    border: "1px solid rgba(245,247,250,0.55)",
    background: "rgba(255,255,255,0.1)",
    color: "#f5f7fa",
    padding: 14,
    cursor: "pointer",
  },
  sourceItemTitle: {
    fontSize: 14,
    fontWeight: 750,
    lineHeight: 1.35,
  },
  sourceItemSummary: {
    fontSize: 12,
    opacity: 0.76,
    lineHeight: 1.45,
  },
  sourceItemMeta: {
    fontSize: 11,
    opacity: 0.58,
    lineHeight: 1.4,
  },
  sourcePreview: {
    minHeight: 260,
    display: "grid",
    gap: 14,
    borderRadius: 18,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.18)",
  },
  sourceImage: {
    display: "block",
    width: "100%",
    maxHeight: 290,
    objectFit: "cover",
  },
  sourcePreviewContent: {
    display: "grid",
    gap: 12,
    padding: 18,
  },
  sourcePreviewTitle: {
    margin: 0,
    fontSize: 22,
    lineHeight: 1.25,
  },
  sourcePreviewSummary: {
    margin: 0,
    opacity: 0.8,
    lineHeight: 1.5,
  },
  sourcePreviewActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  sourceLink: {
    color: "#f5f7fa",
    fontSize: 13,
    fontWeight: 700,
    textDecoration: "underline",
    textUnderlineOffset: 3,
  },
  newsRelationsCard: {
    display: "grid",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  newsRelationsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  },
  newsRelationsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
  },
  newsRelationGroup: {
    display: "grid",
    gap: 5,
    padding: 10,
    borderRadius: 12,
    background: "rgba(0,0,0,0.18)",
  },
  newsRelationTags: {
    fontSize: 13,
    lineHeight: 1.5,
    opacity: 0.88,
  },
  newsRelationWarning: {
    padding: 10,
    borderRadius: 12,
    background: "rgba(245,158,11,0.12)",
    border: "1px solid rgba(245,158,11,0.28)",
    fontSize: 12,
    lineHeight: 1.5,
  },
  sourceBodyPreview: {
    margin: 0,
    paddingTop: 4,
    whiteSpace: "pre-wrap",
    fontSize: 13,
    lineHeight: 1.6,
    opacity: 0.78,
  },
  batchCard: {
    display: "grid",
    gap: 14,
    marginBottom: 18,
    padding: 16,
    borderRadius: 18,
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  batchHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
    flexWrap: "wrap",
  },
  batchTitle: {
    margin: "4px 0 6px",
    fontSize: 18,
  },
  batchHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  batchProgressList: {
    display: "grid",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    background: "rgba(0,0,0,0.18)",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  batchProgressItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.025)",
    flexWrap: "wrap",
  },
  batchProgressText: {
    display: "grid",
    gap: 4,
    minWidth: 0,
    flex: "1 1 420px",
  },
  batchSummaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
  },
  batchList: {
    display: "grid",
    gap: 10,
  },
  batchItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    background: "rgba(0,0,0,0.2)",
    border: "1px solid rgba(255,255,255,0.07)",
    flexWrap: "wrap",
  },
  batchItemMain: {
    display: "grid",
    gap: 5,
    minWidth: 0,
    flex: "1 1 520px",
  },
  batchItemMeta: {
    fontSize: 12,
    opacity: 0.72,
    lineHeight: 1.5,
  },
  batchItemActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  batchStatusOk: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(34,197,94,0.14)",
    border: "1px solid rgba(34,197,94,0.3)",
    fontSize: 12,
    fontWeight: 700,
  },
  batchStatusPending: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(245,158,11,0.14)",
    border: "1px solid rgba(245,158,11,0.3)",
    fontSize: 12,
    fontWeight: 700,
  },
  batchStatusError: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(239,68,68,0.14)",
    border: "1px solid rgba(239,68,68,0.3)",
    fontSize: 12,
    fontWeight: 700,
  },
  batchError: {
    fontSize: 12,
    color: "#fca5a5",
    lineHeight: 1.4,
  },
  automationCard: {
    display: "grid",
    gap: 14,
    padding: 16,
    borderRadius: 18,
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  automationHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  automationTitle: {
    margin: "4px 0 0",
    fontSize: 17,
    lineHeight: 1.25,
  },
  automationTopActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  automationStats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
  },
  automationStat: {
    display: "grid",
    gap: 4,
    minHeight: 72,
    padding: 12,
    borderRadius: 14,
    background: "rgba(0,0,0,0.2)",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  automationStatLabel: {
    fontSize: 12,
    opacity: 0.68,
    lineHeight: 1.3,
  },
  automationWarning: {
    padding: 12,
    borderRadius: 12,
    background: "rgba(245,158,11,0.1)",
    border: "1px solid rgba(245,158,11,0.28)",
    fontSize: 13,
    lineHeight: 1.5,
  },
  automationActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  resultHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  badges: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  badgeNeutral: {
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    background: "rgba(255,255,255,0.08)",
  },
  badgeOk: {
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    background: "rgba(16,185,129,0.18)",
    color: "#b7f7d8",
  },
  badgeError: {
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    background: "rgba(239,68,68,0.18)",
    color: "#fecaca",
  },
  emptyText: {
    margin: 0,
    opacity: 0.75,
    lineHeight: 1.5,
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "0.8fr 1.2fr",
    gap: 16,
  },
  resultPanel: {
    display: "grid",
    gap: 12,
  },
  issueList: {
    margin: 0,
    paddingLeft: 18,
    display: "grid",
    gap: 8,
  },
  issueItem: {
    lineHeight: 1.45,
  },
  pre: {
    margin: 0,
    padding: 16,
    borderRadius: 16,
    background: "rgba(0,0,0,0.28)",
    border: "1px solid rgba(255,255,255,0.08)",
    overflowX: "auto",
    fontSize: 12,
    lineHeight: 1.5,
  },
};