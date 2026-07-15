function plural(
  count: number,
  singular: string,
  pluralValue: string,
): string {
  return count === 1 ? singular : pluralValue;
}

export function draftCreatedTitle(count: number): string {
  return count === 1
    ? "Borrador creado"
    : `${count} borradores creados`;
}

export function draftCreatedMessage(count: number): string {
  return `${plural(
    count,
    "El borrador está disponible",
    "Los borradores están disponibles",
  )} para supervisión en Sanity.`;
}

export function analysisCompletedTitle(count: number): string {
  return count === 1
    ? "Noticia analizada"
    : `${count} noticias analizadas`;
}

export function reviewRecommendedTitle(): string {
  return "IA recomienda revisión";
}

export function errorTitle(action: string): string {
  return `No se pudo ${action}`;
}
