import type {ReferenceEntityOption} from "../data/referenceEntities";
import {registerSchemaRequirementAdapter, type EntitySchemaRequirement} from "../review/schemaRequirements";

const fighterRequirements: EntitySchemaRequirement[] = [
  {id: "fighter.name", entityType: "fighter", field: "name", label: "Nombre", requirementType: "required_value", expectedType: "string", semanticRole: "editorial_identity", source: "sanity_schema", blocking: true, message: "El schema luchador exige un nombre entre 2 y 120 caracteres."},
  {id: "fighter.slug", entityType: "fighter", field: "slug", label: "Slug", requirementType: "required_format", expectedType: "string", semanticRole: "generated_identifier", source: "builder_validation", blocking: true, message: "El slug se genera de forma determinista desde el nombre."},
  {id: "fighter.discipline", entityType: "fighter", field: "disciplineId", label: "Disciplina", requirementType: "required_reference", expectedType: "reference", targetEntityType: "discipline", semanticRole: "sport_practised", source: "sanity_schema", blocking: true, message: "El schema luchador exige una disciplina demostrada."},
  {id: "fighter.organization", entityType: "fighter", field: "organizationIds", label: "Organización", requirementType: "required_relationship", expectedType: "references", targetEntityType: "organization", semanticRole: "stable_fighter_affiliation", source: "sanity_schema", blocking: true, message: "El schema exige organización, aunque su uso mezcla afiliación estable y clasificación editorial.", metadata: {cardinality: "exactly_one", schemaField: "organizacion", schemaType: "reference"}},
];

let references: ReferenceEntityOption[] = [];
export function getSchemaRequirementReferenceOptions(): readonly ReferenceEntityOption[] { return references; }
export function registerEditorialSchemaRequirements(referenceData: Partial<Record<string, ReferenceEntityOption[]>> = {}): () => void {
  references = Object.values(referenceData).flatMap((items) => items ?? []);
  const cleanup = registerSchemaRequirementAdapter({entityType: "fighter", requirements: fighterRequirements, inspect: () => fighterRequirements.map((item) => ({...item, metadata: item.metadata ? {...item.metadata} : undefined}))});
  return () => { references = []; cleanup(); };
}
