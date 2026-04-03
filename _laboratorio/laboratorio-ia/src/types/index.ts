export type ContentTypeId =
  | "noticia"
  | "evento"
  | "luchador"
  | "combate"
  | "categoriaPeso"
  | "disciplina"
  | "organizacion";

export type SupportEntityId = "organizacion";

export type FieldKind =
  | "string"
  | "text"
  | "slug"
  | "boolean"
  | "number"
  | "datetime"
  | "image"
  | "portableText"
  | "reference"
  | "referenceArray";

export type ReferenceTarget =
  | "disciplina"
  | "organizacion"
  | "luchador"
  | "evento"
  | "categoriaPeso";

export type FieldOption = {
  label: string;
  value: string;
};

export type ValidationRule =
  | { type: "required"; value: true }
  | { type: "min"; value: number }
  | { type: "max"; value: number }
  | { type: "positive"; value: true }
  | { type: "integer"; value: true }
  | { type: "regex"; value: string; message?: string }
  | { type: "unique"; value: true };

export type ConditionalRule =
  | {
      type: "requiredWhen";
      dependsOn: string;
      equals: string | number | boolean;
      message: string;
    }
  | {
      type: "mustDifferFrom";
      dependsOn: string;
      message: string;
    }
  | {
      type: "mustBeOneOfFields";
      dependsOn: string[];
      message: string;
    };

export type HiddenWhenRule = {
  field: string;
  notEquals?: string | number | boolean;
  equals?: string | number | boolean;
};

export type SchemaFieldDefinition = {
  name: string;
  label: string;
  kind: FieldKind;
  description?: string;
  required: boolean;
  sanityType: string;
  rows?: number;
  hiddenWhen?: HiddenWhenRule;
  options?: FieldOption[];
  referenceTo?: ReferenceTarget;
  validations?: ValidationRule[];
  conditionalRules?: ConditionalRule[];
};

export type AuxiliaryInputDefinition = {
  name: string;
  label: string;
  kind: "string" | "text" | "boolean" | "reference";
  description?: string;
  rows?: number;
  placeholder?: string;
  referenceTo?: ReferenceTarget;
};

export type ContentTypeDefinition = {
  id: ContentTypeId;
  label: string;
  description: string;
  supportsImageGeneration: boolean;
  hasSlug: boolean;
  references: ReferenceTarget[];
  schemaFields: SchemaFieldDefinition[];
  auxiliaryInputs: AuxiliaryInputDefinition[];
};

export type SupportEntityDefinition = {
  id: SupportEntityId;
  label: string;
  description: string;
  referenceFields: Array<{
    name: string;
    label: string;
    targetTypes: ReferenceTarget[];
  }>;
};

export type ContentTypeOption = {
  value: ContentTypeId;
  label: string;
  description: string;
};

export type ReferenceValue = {
  _type: "reference";
  _ref: string;
};

export type SlugValue = {
  current: string;
};

export type PortableTextSpan = {
  _type: "span";
  _key?: string;
  text: string;
  marks?: string[];
};

export type PortableTextBlock = {
  _type: "block";
  _key?: string;
  style?: string;
  markDefs?: Array<Record<string, unknown>>;
  children?: PortableTextSpan[];
};

export type PortableTextValue = PortableTextBlock[];

export type PrimitiveFormValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export type FormValue =
  | PrimitiveFormValue
  | SlugValue
  | ReferenceValue
  | ReferenceValue[]
  | PortableTextValue
  | Record<string, unknown>;

export type ContentFormState = Record<string, FormValue>;

export type AuxiliaryFormValue =
  | string
  | boolean
  | ReferenceValue
  | null
  | undefined;

export type AuxiliaryFormState = Record<string, AuxiliaryFormValue>;

export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
  field: string;
  message: string;
  severity: ValidationSeverity;
};

export type BuildOutputResult<TOutput = Record<string, unknown>> = {
  ok: boolean;
  output: TOutput | null;
  issues: ValidationIssue[];
};

export type ReferenceFilterContext = {
  selectedDisciplineRef?: string;
  selectedOrganizationRef?: string;
  selectedEventRef?: string;
  selectedCategoriaPesoRef?: string;
};

export type BaseSanityOutput<TType extends ContentTypeId> = {
  _type: TType;
};

export type NoticiaSanityOutput = BaseSanityOutput<"noticia"> & {
  titulo: string;
  slug: SlugValue;
  imagenPrincipal?: unknown;
  extracto: string;
  contenido: PortableTextValue;
  fechaPublicacion: string;
  disciplina: ReferenceValue;
  organizacionRelacionada?: ReferenceValue;
  luchadoresRelacionados?: ReferenceValue[];
  eventoRelacionado?: ReferenceValue;
  destacada: boolean;
};

export type EventoSanityOutput = BaseSanityOutput<"evento"> & {
  nombre: string;
  slug: SlugValue;
  organizacion: ReferenceValue;
  disciplina: ReferenceValue;
  fecha: string;
  horaLocal?: string;
  ciudad?: string;
  pais?: string;
  recinto?: string;
  cartelPrincipal?: string;
  dondeVer?: string;
  descripcionCorta?: string;
  descripcion?: string;
  notas?: string;
  imagen: unknown;
  estado: "proximo" | "celebrado" | "cancelado";
};

export type LuchadorSanityOutput = BaseSanityOutput<"luchador"> & {
  nombre: string;
  slug: SlugValue;
  apodo?: string;
  imagen?: unknown;
  nacionalidad?: string;
  record?: string;
  disciplina: ReferenceValue;
  organizacion: ReferenceValue;
  categoriaPeso?: ReferenceValue;
  activo?: boolean;
  rankingDisciplina?: number;
  destacadoHome?: boolean;
  ordenDestacadoHome?: number;
  descripcion?: string;
};

export type CombateSanityOutput = BaseSanityOutput<"combate"> & {
  evento: ReferenceValue;
  luchadorRojo: ReferenceValue;
  luchadorAzul: ReferenceValue;
  ganador?: ReferenceValue;
  metodo?: string;
  asalto?: number;
  tiempo?: string;
  categoriaPeso: ReferenceValue;
  tituloEnJuego: boolean;
  cartelera: "preliminar" | "principal";
  orden?: number;
  estado: "programado" | "finalizado" | "cancelado";
  resumen?: string;
  desarrollo?: string;
  momentoClave?: string;
  consecuencia?: string;
};

export type CategoriaPesoSanityOutput = BaseSanityOutput<"categoriaPeso"> & {
  nombre: string;
  slug: SlugValue;
  disciplina: ReferenceValue;
  limitePeso: number;
  unidad: "lb" | "kg";
  descripcion?: string;
};

export type DisciplinaSanityOutput = BaseSanityOutput<"disciplina"> & {
  nombre: string;
  slug: SlugValue;
  descripcion: string;
  activa: boolean;
};

export type OrganizacionSanityOutput = BaseSanityOutput<"organizacion"> & {
  nombre: string;
  slug: SlugValue;
  logo: unknown;
  banner?: unknown;
  descripcionCorta: string;
  descripcion: string;
  paisOrigen: string;
  sede?: string;
  anioFundacion?: number;
  identidad?: string;
  datosCuriosos?: string[];
  disciplinas: ReferenceValue[];
  sitioWeb?: string;
  activa: boolean;
};

export type ContentOutputMap = {
  noticia: NoticiaSanityOutput;
  evento: EventoSanityOutput;
  luchador: LuchadorSanityOutput;
  combate: CombateSanityOutput;
  categoriaPeso: CategoriaPesoSanityOutput;
  disciplina: DisciplinaSanityOutput;
  organizacion: OrganizacionSanityOutput;
};

export type ContentOutput<T extends ContentTypeId> = ContentOutputMap[T];

export type BuilderInput<T extends ContentTypeId = ContentTypeId> = {
  contentType: T;
  form: ContentFormState;
  auxiliary?: AuxiliaryFormState;
};

export type BuilderResult<T extends ContentTypeId> =
  BuildOutputResult<ContentOutput<T>>;