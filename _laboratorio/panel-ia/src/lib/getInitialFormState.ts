import { getContentTypeDefinition } from "../config/contentTypes";
import type {
  AuxiliaryFormState,
  AuxiliaryFormValue,
  ContentFormState,
  ContentTypeId,
  FieldKind,
  FormValue,
} from "../types";

type InitialFormStateResult = {
  form: ContentFormState;
  auxiliary: AuxiliaryFormState;
};

function getDefaultFormValue(kind: FieldKind): FormValue {
  switch (kind) {
    case "boolean":
      return false;

    case "number":
      return undefined;

    case "referenceArray":
      return [];

    case "portableText":
      return [];

    case "slug":
      return { current: "" };

    case "reference":
      return undefined;

    case "image":
      return undefined;

    case "datetime":
    case "string":
    case "text":
    default:
      return "";
  }
}

function getDefaultAuxiliaryValue(kind: FieldKind): AuxiliaryFormValue {
  switch (kind) {
    case "boolean":
      return false;

    case "datetime":
    case "string":
    case "text":
    default:
      return "";
  }
}

export function getInitialFormState(
  contentType: ContentTypeId
): InitialFormStateResult {
  const definition = getContentTypeDefinition(contentType);

  const form: ContentFormState = {};
  const auxiliary: AuxiliaryFormState = {};

  for (const field of definition.schemaFields) {
    form[field.name] = getDefaultFormValue(field.kind);
  }

  for (const input of definition.auxiliaryInputs) {
    auxiliary[input.name] = getDefaultAuxiliaryValue(input.kind);
  }

  return {
    form,
    auxiliary,
  };
}