import {
  buildCategoriaPesoOutput,
  buildCombateOutput,
  buildDisciplinaOutput,
  buildEventoOutput,
  buildLuchadorOutput,
  buildNoticiaOutput,
} from "../builders";
import type {
  AuxiliaryFormState,
  BuildOutputResult,
  ContentFormState,
  ContentOutput,
  ContentTypeId,
} from "../types";

type BuildContentOutputParams<T extends ContentTypeId = ContentTypeId> = {
  contentType: T;
  form: ContentFormState;
  auxiliary?: AuxiliaryFormState;
};

export function buildContentOutput<T extends ContentTypeId>({
  contentType,
  form,
  auxiliary,
}: BuildContentOutputParams<T>): BuildOutputResult<ContentOutput<T>> {
  switch (contentType) {
    case "noticia":
      return buildNoticiaOutput({
        form,
        auxiliary,
      }) as BuildOutputResult<ContentOutput<T>>;

    case "evento":
      return buildEventoOutput({
        form,
        auxiliary,
      }) as BuildOutputResult<ContentOutput<T>>;

    case "luchador":
      return buildLuchadorOutput({
        form,
        auxiliary,
      }) as BuildOutputResult<ContentOutput<T>>;

    case "combate":
      return buildCombateOutput({
        form,
        auxiliary,
      }) as BuildOutputResult<ContentOutput<T>>;

    case "categoriaPeso":
      return buildCategoriaPesoOutput({
        form,
        auxiliary,
      }) as BuildOutputResult<ContentOutput<T>>;

    case "disciplina":
      return buildDisciplinaOutput({
        form,
        auxiliary,
      }) as BuildOutputResult<ContentOutput<T>>;
  }

  const exhaustiveCheck: never = contentType;
  throw new Error(`Tipo de contenido no soportado: ${exhaustiveCheck}`);
}