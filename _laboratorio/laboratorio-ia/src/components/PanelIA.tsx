import { useEffect, useMemo, useState } from "react";
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

const DEFAULT_CONTENT_TYPE: ContentTypeId = "noticia";

const API_BASE_URL = (
  import.meta.env.VITE_FFN3_API_BASE_URL?.trim() || "http://localhost:3000"
).replace(/\/$/, "");

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

function getReferenceValue(value: FormValue): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object" && "_ref" in value) {
    const candidate = value as { _ref?: unknown };
    return typeof candidate._ref === "string" ? candidate._ref.trim() : "";
  }

  return "";
}

function getReferenceArrayValues(value: FormValue): string[] {
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

function pickFirstReference(
  ...values: Array<FormValue | undefined>
): string | undefined {
  for (const value of values) {
    const ref = getReferenceValue(value);
    if (ref) {
      return ref;
    }
  }

  return undefined;
}

function getActiveFilterContext(form: ContentFormState): ReferenceFilterContext {
  const selectedDisciplineRef = pickFirstReference(form.disciplina);

  const selectedOrganizationRef = pickFirstReference(
    form.organizacion,
    form.organizacionRelacionada
  );

  const selectedEventRef = pickFirstReference(
    form.evento,
    form.eventoRelacionado
  );

  const selectedCategoriaPesoRef = pickFirstReference(form.categoriaPeso);

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

    const matchesEvent =
      !filters.selectedEventRef ||
      !option.eventIds ||
      option.eventIds.length === 0 ||
      option.eventIds.includes(filters.selectedEventRef);

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
  config: ReferenceFieldConfig,
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>
): FormValue {
  const filters = getActiveFilterContext(form);
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
      return "No hay luchadores para el filtro actual.";
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

  const [isLoadingReferences, setIsLoadingReferences] = useState(false);
  const [referenceLoadError, setReferenceLoadError] = useState("");

  const definition = useMemo(
    () => getContentTypeDefinition(contentType),
    [contentType]
  );

  const filterContext = useMemo<ReferenceFilterContext>(
    () => getActiveFilterContext(form),
    [form]
  );

  useEffect(() => {
    const nextState = getInitialFormState(contentType);
    setForm(nextState.form);
    setAuxiliary(nextState.auxiliary);
    setResult(null);
    setSaveDraftStatus({
      type: "idle",
      message: "",
    });
  }, [contentType]);

  useEffect(() => {
    let isCancelled = false;

    async function loadReferenceEntities(): Promise<void> {
      try {
        setIsLoadingReferences(true);
        setReferenceLoadError("");

        const response = await fetch(`${API_BASE_URL}/api/reference-entities`);
        const payload = (await response.json()) as ReferenceEntitiesApiResponse;

        if (!response.ok || !payload.ok) {
          throw new Error(
            "message" in payload && payload.message
              ? payload.message
              : "No se pudieron cargar las referencias."
          );
        }

        if (!isCancelled) {
          setReferenceData(payload.data);
          setForm((prev) => clearInvalidDependentReferences(prev, payload.data));
        }
      } catch (error) {
        if (!isCancelled) {
          setReferenceLoadError(
            error instanceof Error
              ? error.message
              : "Error desconocido cargando referencias."
          );
          setReferenceData(EMPTY_REFERENCE_DATA);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingReferences(false);
        }
      }
    }

    void loadReferenceEntities();

    return () => {
      isCancelled = true;
    };
  }, []);

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

    setForm((prev) => {
      const nextForm = {
        ...prev,
        [name]: nextValue,
      };

      return FIELDS_THAT_TRIGGER_CLEANUP.has(name)
        ? clearInvalidDependentReferences(nextForm, referenceData)
        : nextForm;
    });
  }

  function updateReferenceArrayField(
    field: SchemaFieldDefinition,
    refValue: string,
    checked: boolean
  ): void {
    setForm((prev) => {
      const currentValues = getReferenceArrayValues(prev[field.name]);

      const nextValues = checked
        ? Array.from(new Set([...currentValues, refValue]))
        : currentValues.filter((value) => value !== refValue);

      const nextForm = {
        ...prev,
        [field.name]: nextValues.map(toReferenceValue),
      };

      return clearInvalidDependentReferences(nextForm, referenceData);
    });
  }

  function updateAuxiliaryField(
    name: string,
    kind: "string" | "text" | "boolean",
    rawValue: string | boolean
  ): void {
    setAuxiliary((prev) => ({
      ...prev,
      [name]: kind === "boolean" ? Boolean(rawValue) : String(rawValue),
    }));
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
                style={styles.secondaryButton}
                disabled={isSavingDraft}
              >
                {isSavingDraft ? "Guardando..." : "Guardar borrador"}
              </button>
            </div>

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