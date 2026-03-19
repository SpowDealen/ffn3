import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import {
  contentTypeOptions,
  getContentTypeDefinition,
} from "../config/contentTypes";
import { getFilteredReferenceEntityOptions } from "../data/referenceEntities";
import { buildContentOutput } from "../lib/buildContentOutput";
import { getInitialFormState } from "../lib/getInitialFormState";
import type {
  AuxiliaryFormState,
  ContentFormState,
  ContentTypeId,
  FieldKind,
  FormValue,
  SchemaFieldDefinition,
  ValidationIssue,
} from "../types";

type BuildResultState = {
  ok: boolean;
  output: Record<string, unknown> | null;
  issues: ValidationIssue[];
} | null;

const DEFAULT_CONTENT_TYPE: ContentTypeId = "noticia";

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
    return value;
  }

  if (value && typeof value === "object" && "_ref" in value) {
    const candidate = value as { _ref?: unknown };
    return typeof candidate._ref === "string" ? candidate._ref : "";
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

function getReferenceArrayText(value: FormValue): string {
  return getReferenceArrayValues(value).join("\n");
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

function getActiveFilterContext(form: ContentFormState): {
  selectedDisciplineRef?: string;
  selectedOrganizationRef?: string;
  selectedEventRef?: string;
  selectedCategoriaPesoRef?: string;
} {
  const selectedDisciplineRef = getReferenceValue(form.disciplina) || undefined;

  const selectedOrganizationRef =
    getReferenceValue(form.organizacion) ||
    getReferenceValue(form.organizacionRelacionada) ||
    undefined;

  const selectedEventRef =
    getReferenceValue(form.evento) ||
    getReferenceValue(form.eventoRelacionado) ||
    undefined;

  const selectedCategoriaPesoRef =
    getReferenceValue(form.categoriaPeso) || undefined;

  return {
    selectedDisciplineRef,
    selectedOrganizationRef,
    selectedEventRef,
    selectedCategoriaPesoRef,
  };
}

function clearInvalidDependentReferences(nextForm: ContentFormState): ContentFormState {
  const filters = getActiveFilterContext(nextForm);

  const fieldsToCheck = [
    { fieldName: "disciplina", target: "disciplina" as const, isArray: false },
    { fieldName: "organizacion", target: "organizacion" as const, isArray: false },
    {
      fieldName: "organizacionRelacionada",
      target: "organizacion" as const,
      isArray: false,
    },
    { fieldName: "evento", target: "evento" as const, isArray: false },
    {
      fieldName: "eventoRelacionado",
      target: "evento" as const,
      isArray: false,
    },
    {
      fieldName: "categoriaPeso",
      target: "categoriaPeso" as const,
      isArray: false,
    },
    { fieldName: "luchadorRojo", target: "luchador" as const, isArray: false },
    { fieldName: "luchadorAzul", target: "luchador" as const, isArray: false },
    { fieldName: "ganador", target: "luchador" as const, isArray: false },
    {
      fieldName: "luchadoresRelacionados",
      target: "luchador" as const,
      isArray: true,
    },
  ];

  const sanitized = { ...nextForm };

  for (const config of fieldsToCheck) {
    if (!(config.fieldName in sanitized)) {
      continue;
    }

    const allowedOptions = getFilteredReferenceEntityOptions({
      target: config.target,
      ...filters,
    });

    const allowedValues = new Set(allowedOptions.map((option) => option.value));

    if (config.isArray) {
      const currentValues = getReferenceArrayValues(sanitized[config.fieldName]);

      sanitized[config.fieldName] = currentValues
        .filter((value) => allowedValues.has(value))
        .map((value) => ({
          _type: "reference" as const,
          _ref: value,
        }));
    } else {
      const currentValue = getReferenceValue(sanitized[config.fieldName]);

      if (currentValue && !allowedValues.has(currentValue)) {
        sanitized[config.fieldName] = undefined;
      }
    }
  }

  return sanitized;
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

  const definition = useMemo(
    () => getContentTypeDefinition(contentType),
    [contentType]
  );

  const filterContext = getActiveFilterContext(form);

  useEffect(() => {
    const nextState = getInitialFormState(contentType);
    setForm(nextState.form);
    setAuxiliary(nextState.auxiliary);
    setResult(null);
  }, [contentType]);

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
            ? { _type: "reference", _ref: rawValue.trim() }
            : undefined;
        break;

      case "referenceArray":
        nextValue =
          typeof rawValue === "string"
            ? parseReferenceArrayInput(rawValue).map((ref) => ({
                _type: "reference" as const,
                _ref: ref,
              }))
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

      const fieldsThatTriggerCleanup = new Set([
        "disciplina",
        "organizacion",
        "organizacionRelacionada",
        "evento",
        "eventoRelacionado",
        "categoriaPeso",
      ]);

      if (fieldsThatTriggerCleanup.has(name)) {
        return clearInvalidDependentReferences(nextForm);
      }

      return nextForm;
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

      return {
        ...prev,
        [field.name]: nextValues.map((value) => ({
          _type: "reference" as const,
          _ref: value,
        })),
      };
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
  }

  function renderField(field: SchemaFieldDefinition): ReactElement {
    const value = form[field.name];
    const referenceOptions = getFilteredReferenceEntityOptions({
      target: field.referenceTo,
      ...filterContext,
    });

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
        if (field.referenceTo && referenceOptions.length > 0) {
          return (
            <select
              value={getReferenceValue(value)}
              onChange={(event) => updateFormField(field, event.target.value)}
              style={styles.input}
            >
              <option value="">
                {field.referenceTo === "disciplina"
                  ? "Selecciona una disciplina"
                  : "Selecciona una referencia"}
              </option>
              {referenceOptions.map((option) => (
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
            value={getReferenceValue(value)}
            onChange={(event) => updateFormField(field, event.target.value)}
            style={styles.input}
            placeholder="ID de referencia de Sanity"
          />
        );

      case "referenceArray":
        if (field.referenceTo && referenceOptions.length > 0) {
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

        return (
          <textarea
            value={getReferenceArrayText(value)}
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

            <button type="button" onClick={handleBuild} style={styles.button}>
              Generar output
            </button>
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