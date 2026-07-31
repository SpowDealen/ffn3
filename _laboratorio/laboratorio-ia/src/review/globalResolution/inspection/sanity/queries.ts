export const SANITY_FIGHTER_BY_IDENTITY_QUERY = `*[
  _type == "luchador" &&
  (
    _id in [$expectedId, $expectedDraftId, $publishedExpectedId] ||
    slug.current == $identitySlug
  )
]{
  _id,
  _type,
  nombre,
  slug,
  disciplina,
  organizacion,
  activo,
  destacadoHome
}`;
export const SANITY_NEWS_DOCUMENT_QUERY = `*[
  _type == "noticia" &&
  _id in [$requestedId, $draftId, $publishedId]
]{
  _id,
  titulo,
  extracto,
  contenido,
  fechaPublicacion,
  fuenteUrl,
  fuenteId,
  "imagenPrincipalUrl": imagenPrincipal.asset->url,
  disciplina,
  organizacionRelacionada,
  eventoRelacionado,
  luchadoresRelacionados,
  destacada,
  fuente
}`;

export const SANITY_NEWS_FIGHTER_REFERENCE_QUERY = `*[
  _type == "noticia" &&
  _id in [$requestedId, $draftId, $publishedId]
]{
  _id,
  "fighterIds": luchadoresRelacionados[]._ref
}`;
