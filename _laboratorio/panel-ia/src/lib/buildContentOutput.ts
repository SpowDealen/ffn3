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
  const sharedParams = {
    form,
    auxiliary,
  };

  switch (contentType) {
    case "noticia":
      return buildNoticiaOutput(sharedParams) as BuildOutputResult<ContentOutput<T>>;

    case "evento":
      return buildEventoOutput(sharedParams) as BuildOutputResult<ContentOutput<T>>;

    case "luchador":
      return buildLuchadorOutput(sharedParams) as BuildOutputResult<ContentOutput<T>>;

    case "combate":
      return buildCombateOutput(sharedParams) as BuildOutputResult<ContentOutput<T>>;

    case "categoriaPeso":
      return buildCategoriaPesoOutput(
        sharedParams
      ) as BuildOutputResult<ContentOutput<T>>;

    case "disciplina":
      return buildDisciplinaOutput(
        sharedParams
      ) as BuildOutputResult<ContentOutput<T>>;
  }

  const exhaustiveCheck: never = contentType;
  throw new Error(`Tipo de contenido no soportado: ${exhaustiveCheck}`);
}