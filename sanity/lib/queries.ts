import {groq} from 'next-sanity'

export const noticiasQuery = groq`
  *[_type == "noticia"] | order(fechaPublicacion desc) {
    _id,
    titulo,
    "slug": slug.current,
    extracto,
    fechaPublicacion,
    destacada,
    "disciplina": disciplina->nombre,
    "eventoRelacionado": eventoRelacionado->nombre,
    "eventoRelacionadoSlug": eventoRelacionado->slug.current,
    "luchadoresRelacionados": luchadoresRelacionados[]->nombre,
    "luchadoresRelacionadosData": luchadoresRelacionados[]->{
      nombre,
      "slug": slug.current
    }
  }
`

export const noticiaPorSlugQuery = groq`
  *[_type == "noticia" && slug.current == $slug][0] {
    _id,
    titulo,
    "slug": slug.current,
    extracto,
    contenido,
    fechaPublicacion,
    destacada,
    "disciplina": disciplina->nombre,
    "eventoRelacionado": eventoRelacionado->nombre,
    "eventoRelacionadoSlug": eventoRelacionado->slug.current,
    "luchadoresRelacionados": luchadoresRelacionados[]->nombre,
    "luchadoresRelacionadosData": luchadoresRelacionados[]->{
      nombre,
      "slug": slug.current
    }
  }
`

export const noticiaDestacadaQuery = groq`
  *[_type == "noticia" && destacada == true] | order(fechaPublicacion desc)[0] {
    _id,
    titulo,
    "slug": slug.current,
    extracto,
    fechaPublicacion,
    "disciplina": disciplina->nombre
  }
`

export const ultimasNoticiasQuery = groq`
  *[_type == "noticia"] | order(fechaPublicacion desc)[0...4] {
    _id,
    titulo,
    "slug": slug.current,
    extracto,
    fechaPublicacion,
    "disciplina": disciplina->nombre
  }
`

export const noticiasPorEventoQuery = groq`
  *[_type == "noticia" && eventoRelacionado->slug.current == $slug] | order(fechaPublicacion desc)[0...4] {
    _id,
    titulo,
    "slug": slug.current,
    extracto,
    fechaPublicacion,
    destacada,
    "disciplina": disciplina->nombre,
    "eventoRelacionado": eventoRelacionado->nombre,
    "eventoRelacionadoSlug": eventoRelacionado->slug.current,
    "luchadoresRelacionados": luchadoresRelacionados[]->nombre,
    "luchadoresRelacionadosData": luchadoresRelacionados[]->{
      nombre,
      "slug": slug.current
    }
  }
`

export const noticiasPorLuchadorQuery = groq`
  *[
    _type == "noticia" &&
    defined(luchadoresRelacionados) &&
    $slug in luchadoresRelacionados[]->slug.current
  ] | order(fechaPublicacion desc)[0...4] {
    _id,
    titulo,
    "slug": slug.current,
    extracto,
    fechaPublicacion,
    destacada,
    "disciplina": disciplina->nombre,
    "eventoRelacionado": eventoRelacionado->nombre,
    "eventoRelacionadoSlug": eventoRelacionado->slug.current,
    "luchadoresRelacionados": luchadoresRelacionados[]->nombre,
    "luchadoresRelacionadosData": luchadoresRelacionados[]->{
      nombre,
      "slug": slug.current
    }
  }
`

export const luchadoresQuery = groq`
  *[_type == "luchador"] | order(nombre asc) {
    _id,
    nombre,
    "slug": slug.current,
    apodo,
    nacionalidad,
    record,
    activo,
    "disciplina": disciplina->nombre,
    "organizacion": organizacion->nombre,
    "categoriaPeso": categoriaPeso->nombre
  }
`

export const luchadorPorSlugQuery = groq`
  *[_type == "luchador" && slug.current == $slug][0] {
    _id,
    nombre,
    "slug": slug.current,
    apodo,
    nacionalidad,
    record,
    activo,
    descripcion,
    "disciplina": disciplina->nombre,
    "organizacion": organizacion->nombre,
    "categoriaPeso": categoriaPeso->nombre
  }
`

export const luchadoresDestacadosQuery = groq`
  *[_type == "luchador"] | order(nombre asc)[0...4] {
    _id,
    nombre,
    "slug": slug.current,
    apodo,
    nacionalidad,
    record,
    "disciplina": disciplina->nombre,
    "organizacion": organizacion->nombre,
    "categoriaPeso": categoriaPeso->nombre
  }
`

export const eventosQuery = groq`
  *[_type == "evento"] | order(fecha desc) {
    _id,
    nombre,
    "slug": slug.current,
    fecha,
    ciudad,
    pais,
    recinto,
    cartelPrincipal,
    estado,
    descripcion,
    "organizacion": organizacion->nombre,
    "disciplina": disciplina->nombre
  }
`

export const proximoEventoQuery = groq`
  *[_type == "evento"] | order(fecha asc)[0] {
    _id,
    nombre,
    "slug": slug.current,
    fecha,
    ciudad,
    pais,
    recinto,
    cartelPrincipal,
    estado,
    descripcion,
    "organizacion": organizacion->nombre,
    "disciplina": disciplina->nombre
  }
`

export const eventoPorSlugQuery = groq`
  *[_type == "evento" && slug.current == $slug][0] {
    _id,
    nombre,
    "slug": slug.current,
    fecha,
    ciudad,
    pais,
    recinto,
    cartelPrincipal,
    estado,
    descripcion,
    "organizacion": organizacion->nombre,
    "disciplina": disciplina->nombre
  }
`

export const combatesPorEventoQuery = groq`
  *[_type == "combate" && evento->slug.current == $slug] | order(orden asc) {
    _id,
    _createdAt,
    metodo,
    asalto,
    tiempo,
    tituloEnJuego,
    cartelera,
    orden,
    estado,
    "evento": evento->nombre,
    "eventoSlug": evento->slug.current,
    "luchadorRojo": luchadorRojo->nombre,
    "luchadorRojoSlug": luchadorRojo->slug.current,
    "luchadorAzul": luchadorAzul->nombre,
    "luchadorAzulSlug": luchadorAzul->slug.current,
    "ganador": ganador->nombre,
    "categoriaPeso": categoriaPeso->nombre
  }
`

export const combatesPorLuchadorQuery = groq`
  *[
    _type == "combate" &&
    (
      luchadorRojo->slug.current == $slug ||
      luchadorAzul->slug.current == $slug
    )
  ] | order(orden asc) {
    _id,
    _createdAt,
    metodo,
    asalto,
    tiempo,
    tituloEnJuego,
    cartelera,
    orden,
    estado,
    "evento": evento->nombre,
    "eventoSlug": evento->slug.current,
    "luchadorRojo": luchadorRojo->nombre,
    "luchadorRojoSlug": luchadorRojo->slug.current,
    "luchadorAzul": luchadorAzul->nombre,
    "luchadorAzulSlug": luchadorAzul->slug.current,
    "ganador": ganador->nombre,
    "categoriaPeso": categoriaPeso->nombre
  }
`

export const combatesQuery = groq`
  *[_type == "combate"] | order(orden asc) {
    _id,
    _createdAt,
    metodo,
    asalto,
    tiempo,
    tituloEnJuego,
    cartelera,
    orden,
    estado,
    "evento": evento->nombre,
    "eventoSlug": evento->slug.current,
    "luchadorRojo": luchadorRojo->nombre,
    "luchadorRojoSlug": luchadorRojo->slug.current,
    "luchadorAzul": luchadorAzul->nombre,
    "luchadorAzulSlug": luchadorAzul->slug.current,
    "ganador": ganador->nombre,
    "categoriaPeso": categoriaPeso->nombre
  }
`

export const combatePorIdQuery = groq`
  *[_type == "combate" && _id == $id][0] {
    _id,
    _createdAt,
    metodo,
    asalto,
    tiempo,
    tituloEnJuego,
    cartelera,
    orden,
    estado,
    "evento": evento->nombre,
    "eventoSlug": evento->slug.current,
    "luchadorRojo": luchadorRojo->nombre,
    "luchadorRojoSlug": luchadorRojo->slug.current,
    "luchadorAzul": luchadorAzul->nombre,
    "luchadorAzulSlug": luchadorAzul->slug.current,
    "ganador": ganador->nombre,
    "categoriaPeso": categoriaPeso->nombre
  }
`

export const disciplinasQuery = groq`
  *[_type == "disciplina"] | order(nombre asc) {
    _id,
    nombre,
    "slug": slug.current,
    descripcion,
    activa
  }
`

export const disciplinaPorSlugQuery = groq`
  *[_type == "disciplina" && slug.current == $slug][0] {
    _id,
    nombre,
    "slug": slug.current,
    descripcion,
    activa
  }
`

export const noticiasPorDisciplinaQuery = groq`
  *[_type == "noticia" && disciplina->slug.current == $slug] | order(fechaPublicacion desc)[0...4] {
    _id,
    titulo,
    "slug": slug.current,
    extracto,
    fechaPublicacion,
    destacada
  }
`

export const luchadoresPorDisciplinaQuery = groq`
  *[_type == "luchador" && disciplina->slug.current == $slug] | order(nombre asc)[0...6] {
    _id,
    nombre,
    "slug": slug.current,
    apodo,
    nacionalidad,
    record,
    activo,
    "organizacion": organizacion->nombre,
    "categoriaPeso": categoriaPeso->nombre
  }
`

export const eventosPorDisciplinaQuery = groq`
  *[_type == "evento" && disciplina->slug.current == $slug] | order(fecha desc)[0...4] {
    _id,
    nombre,
    "slug": slug.current,
    fecha,
    ciudad,
    pais,
    cartelPrincipal,
    estado,
    "organizacion": organizacion->nombre
  }
`

export const disciplinasHomeQuery = groq`
  *[_type == "disciplina"] | order(nombre asc)[0...6] {
    _id,
    nombre,
    "slug": slug.current,
    descripcion
  }
`

export const categoriasPesoQuery = groq`
  *[_type == "categoriaPeso"] | order(limitePeso asc) {
    _id,
    nombre,
    "slug": slug.current,
    limitePeso,
    unidad,
    descripcion,
    activa,
    "disciplina": disciplina->nombre
  }
`

export const categoriasPesoHomeQuery = groq`
  *[_type == "categoriaPeso"] | order(limitePeso asc)[0...6] {
    _id,
    nombre,
    "slug": slug.current,
    limitePeso,
    unidad,
    "disciplina": disciplina->nombre
  }
`

export const categoriaPesoPorSlugQuery = groq`
  *[_type == "categoriaPeso" && slug.current == $slug][0] {
    _id,
    nombre,
    "slug": slug.current,
    limitePeso,
    unidad,
    descripcion,
    activa,
    "disciplina": disciplina->nombre
  }
`

export const luchadoresPorCategoriaQuery = groq`
  *[_type == "luchador" && categoriaPeso->slug.current == $slug] | order(nombre asc) {
    _id,
    nombre,
    "slug": slug.current,
    apodo,
    nacionalidad,
    record,
    activo,
    "disciplina": disciplina->nombre,
    "organizacion": organizacion->nombre
  }
`

export const combatesPorCategoriaQuery = groq`
  *[_type == "combate" && categoriaPeso->slug.current == $slug] | order(orden asc) {
    _id,
    _createdAt,
    metodo,
    asalto,
    tiempo,
    tituloEnJuego,
    cartelera,
    orden,
    estado,
    "evento": evento->nombre,
    "eventoSlug": evento->slug.current,
    "luchadorRojo": luchadorRojo->nombre,
    "luchadorRojoSlug": luchadorRojo->slug.current,
    "luchadorAzul": luchadorAzul->nombre,
    "luchadorAzulSlug": luchadorAzul->slug.current,
    "ganador": ganador->nombre
  }
`