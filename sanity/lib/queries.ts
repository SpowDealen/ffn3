import {groq} from 'next-sanity'

/* =========================
   HOME
   ========================= */

export const noticiaDestacadaQuery = groq`
  *[_type == "noticia" && destacada == true] | order(coalesce(fechaPublicacion, _createdAt) desc)[0]{
    _id,
    titulo,
    "slug": slug.current,
    extracto,
    fechaPublicacion,
    destacada,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "eventoRelacionado": eventoRelacionado->nombre,
    "eventoRelacionadoSlug": eventoRelacionado->slug.current,
    "organizacionRelacionada": organizacionRelacionada->nombre,
    "organizacionRelacionadaSlug": organizacionRelacionada->slug.current,
    "luchadoresRelacionados": luchadoresRelacionados[]->{
      _id,
      nombre,
      "slug": slug.current
    }
  }
`

export const ultimasNoticiasQuery = groq`
  *[_type == "noticia"] | order(coalesce(fechaPublicacion, _createdAt) desc)[0...6]{
    _id,
    titulo,
    "slug": slug.current,
    extracto,
    fechaPublicacion,
    destacada,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "eventoRelacionado": eventoRelacionado->nombre,
    "eventoRelacionadoSlug": eventoRelacionado->slug.current,
    "organizacionRelacionada": organizacionRelacionada->nombre,
    "organizacionRelacionadaSlug": organizacionRelacionada->slug.current
  }
`

export const proximoEventoQuery = groq`
  *[_type == "evento" && defined(fecha) && fecha >= now()] | order(fecha asc)[0]{
    _id,
    nombre,
    "slug": slug.current,
    fecha,
    ciudad,
    pais,
    recinto,
    imagen,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "organizacion": organizacion->nombre,
    "organizacionSlug": organizacion->slug.current
  }
`

export const luchadoresDestacadosQuery = groq`
  *[_type == "luchador" && destacada == true] | order(_createdAt desc)[0...6]{
    _id,
    nombre,
    "slug": slug.current,
    apodo,
    nacionalidad,
    imagen,
    record,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "categoriaPeso": categoriaPeso->nombre,
    "categoriaPesoSlug": categoriaPeso->slug.current,
    "organizacion": organizacion->nombre,
    "organizacionSlug": organizacion->slug.current
  }
`

export const disciplinasHomeQuery = groq`
  *[_type == "disciplina"] | order(nombre asc)[0...6]{
    _id,
    nombre,
    descripcion,
    "slug": slug.current
  }
`

export const categoriasPesoHomeQuery = groq`
  *[_type == "categoriaPeso"] | order(limitePeso asc, nombre asc)[0...6]{
    _id,
    nombre,
    "slug": slug.current,
    limitePeso,
    unidad,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current
  }
`

/* =========================
   NOTICIAS
   ========================= */

export const noticiasQuery = groq`
  *[_type == "noticia"] | order(coalesce(fechaPublicacion, _createdAt) desc){
    _id,
    titulo,
    "slug": slug.current,
    extracto,
    contenido,
    fechaPublicacion,
    destacada,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "eventoRelacionado": eventoRelacionado->nombre,
    "eventoRelacionadoSlug": eventoRelacionado->slug.current,
    "organizacionRelacionada": organizacionRelacionada->nombre,
    "organizacionRelacionadaSlug": organizacionRelacionada->slug.current,
    "luchadoresRelacionadosData": luchadoresRelacionados[]->{
      _id,
      nombre,
      "slug": slug.current
    }
  }
`

export const noticiaPorSlugQuery = groq`
  *[_type == "noticia" && slug.current == $slug][0]{
    _id,
    titulo,
    "slug": slug.current,
    extracto,
    contenido,
    fechaPublicacion,
    destacada,
    "disciplina": disciplina->{
      _id,
      nombre,
      "slug": slug.current
    },
    "disciplinaSlug": disciplina->slug.current,
    "eventoRelacionado": eventoRelacionado->{
      _id,
      nombre,
      "slug": slug.current
    },
    "eventoRelacionadoSlug": eventoRelacionado->slug.current,
    "organizacionRelacionada": organizacionRelacionada->{
      _id,
      nombre,
      "slug": slug.current
    },
    "organizacionRelacionadaSlug": organizacionRelacionada->slug.current,
    "luchadoresRelacionadosData": luchadoresRelacionados[]->{
      _id,
      nombre,
      apodo,
      imagen,
      "slug": slug.current
    }
  }
`

export const noticiasPorDisciplinaQuery = groq`
  *[_type == "noticia" && disciplina->slug.current == $slug] | order(coalesce(fechaPublicacion, _createdAt) desc)[0...12]{
    _id,
    titulo,
    "slug": slug.current,
    extracto,
    fechaPublicacion,
    destacada,
    "eventoRelacionado": eventoRelacionado->nombre,
    "eventoRelacionadoSlug": eventoRelacionado->slug.current,
    "organizacionRelacionada": organizacionRelacionada->nombre,
    "organizacionRelacionadaSlug": organizacionRelacionada->slug.current
  }
`

export const noticiasPorEventoQuery = groq`
  *[_type == "noticia" && eventoRelacionado->slug.current == $slug] | order(coalesce(fechaPublicacion, _createdAt) desc)[0...12]{
    _id,
    titulo,
    "slug": slug.current,
    extracto,
    fechaPublicacion,
    destacada,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "organizacionRelacionada": organizacionRelacionada->nombre,
    "organizacionRelacionadaSlug": organizacionRelacionada->slug.current,
    "luchadoresRelacionados": luchadoresRelacionados[]->nombre
  }
`

export const noticiasPorLuchadorQuery = groq`
  *[
    _type == "noticia" &&
    references(*[_type == "luchador" && slug.current == $slug][0]._id)
  ] | order(coalesce(fechaPublicacion, _createdAt) desc)[0...12]{
    _id,
    titulo,
    "slug": slug.current,
    extracto,
    fechaPublicacion,
    destacada,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "eventoRelacionado": eventoRelacionado->nombre,
    "eventoRelacionadoSlug": eventoRelacionado->slug.current,
    "organizacionRelacionada": organizacionRelacionada->nombre,
    "organizacionRelacionadaSlug": organizacionRelacionada->slug.current,
    "luchadoresRelacionados": luchadoresRelacionados[]->nombre
  }
`

/* =========================
   EVENTOS
   ========================= */

export const eventosQuery = groq`
  *[_type == "evento"] | order(coalesce(fecha, _createdAt) desc){
    _id,
    nombre,
    "slug": slug.current,
    fecha,
    ciudad,
    pais,
    recinto,
    imagen,
    descripcion,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "organizacion": organizacion->nombre,
    "organizacionSlug": organizacion->slug.current
  }
`

export const eventoPorSlugQuery = groq`
  *[_type == "evento" && slug.current == $slug][0]{
    _id,
    nombre,
    "slug": slug.current,
    fecha,
    ciudad,
    pais,
    recinto,
    imagen,
    descripcion,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "organizacion": organizacion->{
      _id,
      nombre,
      "slug": slug.current,
      logo,
      sitioWeb
    },
    "combates": *[_type == "combate" && references(^._id)] | order(orden asc, _createdAt asc){
      _id,
      orden,
      estado,
      metodo,
      asaltosProgramados,
      asaltoFinal,
      tiempoFinal,
      cartelera,
      tituloEnJuego,
      "evento": evento->nombre,
      "eventoSlug": evento->slug.current,
      luchadorRojo->{
        _id,
        nombre,
        "slug": slug.current
      },
      luchadorAzul->{
        _id,
        nombre,
        "slug": slug.current
      },
      ganador->{
        _id,
        nombre,
        "slug": slug.current
      },
      "disciplina": disciplina->nombre,
      "disciplinaSlug": disciplina->slug.current,
      "categoriaPeso": categoriaPeso->nombre,
      "categoriaPesoSlug": categoriaPeso->slug.current
    },
    "noticiasRelacionadas": *[_type == "noticia" && references(^._id)] | order(coalesce(fechaPublicacion, _createdAt) desc)[0...6]{
      _id,
      titulo,
      "slug": slug.current,
      extracto,
      fechaPublicacion
    },
    "protagonistas": array::unique(
      *[_type == "combate" && references(^._id)].luchadorRojo[]->{
        _id,
        nombre,
        "slug": slug.current,
        imagen,
        apodo
      } +
      *[_type == "combate" && references(^._id)].luchadorAzul[]->{
        _id,
        nombre,
        "slug": slug.current,
        imagen,
        apodo
      }
    )
  }
`

export const eventosPorDisciplinaQuery = groq`
  *[_type == "evento" && disciplina->slug.current == $slug] | order(coalesce(fecha, _createdAt) desc){
    _id,
    nombre,
    "slug": slug.current,
    fecha,
    ciudad,
    pais,
    recinto,
    imagen,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "organizacion": organizacion->nombre,
    "organizacionSlug": organizacion->slug.current
  }
`

/* =========================
   LUCHADORES
   ========================= */

export const luchadoresQuery = groq`
  *[_type == "luchador"] | order(nombre asc){
    _id,
    nombre,
    "slug": slug.current,
    apodo,
    nacionalidad,
    imagen,
    record,
    biografia,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "categoriaPeso": categoriaPeso->nombre,
    "categoriaPesoSlug": categoriaPeso->slug.current,
    "organizacion": organizacion->nombre,
    "organizacionSlug": organizacion->slug.current
  }
`

export const luchadorPorSlugQuery = groq`
  *[_type == "luchador" && slug.current == $slug][0]{
    _id,
    nombre,
    "slug": slug.current,
    apodo,
    nacionalidad,
    imagen,
    record,
    biografia,
    fechaNacimiento,
    altura,
    alcance,
    stance,
    activo,
    descripcion,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "categoriaPeso": categoriaPeso->{
      _id,
      nombre,
      "slug": slug.current,
      limitePeso,
      unidad
    },
    "organizacion": organizacion->{
      _id,
      nombre,
      "slug": slug.current
    },
    "combates": *[_type == "combate" && (luchadorRojo._ref == ^._id || luchadorAzul._ref == ^._id)] | order(coalesce(evento->fecha, _createdAt) desc){
      _id,
      estado,
      metodo,
      asaltosProgramados,
      asaltoFinal,
      tiempoFinal,
      cartelera,
      tituloEnJuego,
      "evento": evento->nombre,
      "eventoSlug": evento->slug.current,
      "disciplina": disciplina->nombre,
      "disciplinaSlug": disciplina->slug.current,
      "categoriaPeso": categoriaPeso->nombre,
      "categoriaPesoSlug": categoriaPeso->slug.current,
      luchadorRojo->{
        _id,
        nombre,
        "slug": slug.current
      },
      luchadorAzul->{
        _id,
        nombre,
        "slug": slug.current
      },
      ganador->{
        _id,
        nombre,
        "slug": slug.current
      }
    },
    "noticiasRelacionadas": *[_type == "noticia" && references(^._id)] | order(coalesce(fechaPublicacion, _createdAt) desc)[0...6]{
      _id,
      titulo,
      "slug": slug.current,
      extracto,
      fechaPublicacion
    }
  }
`

export const luchadoresPorDisciplinaQuery = groq`
  *[_type == "luchador" && disciplina->slug.current == $slug] | order(nombre asc){
    _id,
    nombre,
    "slug": slug.current,
    apodo,
    nacionalidad,
    imagen,
    record,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "categoriaPeso": categoriaPeso->nombre,
    "categoriaPesoSlug": categoriaPeso->slug.current,
    "organizacion": organizacion->nombre,
    "organizacionSlug": organizacion->slug.current
  }
`

export const luchadoresPorCategoriaQuery = groq`
  *[_type == "luchador" && categoriaPeso->slug.current == $slug] | order(nombre asc){
    _id,
    nombre,
    "slug": slug.current,
    apodo,
    nacionalidad,
    imagen,
    record,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "categoriaPeso": categoriaPeso->nombre,
    "categoriaPesoSlug": categoriaPeso->slug.current,
    "organizacion": organizacion->nombre,
    "organizacionSlug": organizacion->slug.current
  }
`

/* =========================
   RESULTADOS / COMBATES
   ========================= */

export const resultadosQuery = groq`
  *[_type == "combate"] | order(coalesce(evento->fecha, _createdAt) desc){
    _id,
    orden,
    estado,
    metodo,
    asaltosProgramados,
    asaltoFinal,
    tiempoFinal,
    cartelera,
    tituloEnJuego,
    "evento": evento->nombre,
    "eventoSlug": evento->slug.current,
    "fechaEvento": evento->fecha,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "categoriaPeso": categoriaPeso->nombre,
    "categoriaPesoSlug": categoriaPeso->slug.current,
    "organizacion": organizacion->nombre,
    "organizacionSlug": organizacion->slug.current,
    luchadorRojo->{
      _id,
      nombre,
      "slug": slug.current
    },
    luchadorAzul->{
      _id,
      nombre,
      "slug": slug.current
    },
    ganador->{
      _id,
      nombre,
      "slug": slug.current
    }
  }
`

export const resultadoPorIdQuery = groq`
  *[_type == "combate" && _id == $id][0]{
    _id,
    _createdAt,
    orden,
    estado,
    metodo,
    detalles,
    asaltosProgramados,
    asaltoFinal,
    tiempoFinal,
    cartelera,
    tituloEnJuego,
    "evento": evento->{
      _id,
      nombre,
      "slug": slug.current,
      fecha,
      ciudad,
      pais
    },
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "categoriaPeso": categoriaPeso->{
      _id,
      nombre,
      "slug": slug.current,
      limitePeso,
      unidad
    },
    "organizacion": organizacion->{
      _id,
      nombre,
      "slug": slug.current
    },
    luchadorRojo->{
      _id,
      nombre,
      apodo,
      imagen,
      "slug": slug.current
    },
    luchadorAzul->{
      _id,
      nombre,
      apodo,
      imagen,
      "slug": slug.current
    },
    ganador->{
      _id,
      nombre,
      "slug": slug.current
    }
  }
`

export const combatePorIdQuery = resultadoPorIdQuery
export const combatesQuery = resultadosQuery

export const combatesPorCategoriaQuery = groq`
  *[_type == "combate" && categoriaPeso->slug.current == $slug] | order(coalesce(evento->fecha, _createdAt) desc){
    _id,
    orden,
    estado,
    metodo,
    asaltosProgramados,
    asaltoFinal,
    tiempoFinal,
    cartelera,
    tituloEnJuego,
    "evento": evento->nombre,
    "eventoSlug": evento->slug.current,
    "fechaEvento": evento->fecha,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "categoriaPeso": categoriaPeso->nombre,
    "categoriaPesoSlug": categoriaPeso->slug.current,
    "organizacion": organizacion->nombre,
    "organizacionSlug": organizacion->slug.current,
    luchadorRojo->{
      _id,
      nombre,
      "slug": slug.current
    },
    luchadorAzul->{
      _id,
      nombre,
      "slug": slug.current
    },
    ganador->{
      _id,
      nombre,
      "slug": slug.current
    }
  }
`

export const combatesPorLuchadorQuery = groq`
  *[
    _type == "combate" &&
    (
      luchadorRojo->slug.current == $slug ||
      luchadorAzul->slug.current == $slug
    )
  ] | order(coalesce(evento->fecha, _createdAt) desc){
    _id,
    orden,
    estado,
    metodo,
    asaltosProgramados,
    asaltoFinal,
    tiempoFinal,
    cartelera,
    tituloEnJuego,
    "evento": evento->nombre,
    "eventoSlug": evento->slug.current,
    "fechaEvento": evento->fecha,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "categoriaPeso": categoriaPeso->nombre,
    "categoriaPesoSlug": categoriaPeso->slug.current,
    "organizacion": organizacion->nombre,
    "organizacionSlug": organizacion->slug.current,
    luchadorRojo->{
      _id,
      nombre,
      "slug": slug.current
    },
    luchadorAzul->{
      _id,
      nombre,
      "slug": slug.current
    },
    ganador->{
      _id,
      nombre,
      "slug": slug.current
    }
  }
`

export const combatesPorEventoQuery = groq`
  *[_type == "combate" && evento->slug.current == $slug] | order(orden asc, _createdAt asc){
    _id,
    orden,
    estado,
    metodo,
    asaltosProgramados,
    asaltoFinal,
    tiempoFinal,
    cartelera,
    tituloEnJuego,
    "evento": evento->nombre,
    "eventoSlug": evento->slug.current,
    "fechaEvento": evento->fecha,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "categoriaPeso": categoriaPeso->nombre,
    "categoriaPesoSlug": categoriaPeso->slug.current,
    "organizacion": organizacion->nombre,
    "organizacionSlug": organizacion->slug.current,
    luchadorRojo->{
      _id,
      nombre,
      "slug": slug.current
    },
    luchadorAzul->{
      _id,
      nombre,
      "slug": slug.current
    },
    ganador->{
      _id,
      nombre,
      "slug": slug.current
    }
  }
`

/* =========================
   DISCIPLINAS
   ========================= */

export const disciplinasQuery = groq`
  *[_type == "disciplina"] | order(nombre asc){
    _id,
    nombre,
    descripcion,
    "slug": slug.current
  }
`

export const disciplinaPorSlugQuery = groq`
  *[_type == "disciplina" && slug.current == $slug][0]{
    _id,
    nombre,
    descripcion,
    "slug": slug.current,
    "eventos": *[_type == "evento" && disciplina._ref == ^._id] | order(coalesce(fecha, _createdAt) desc)[0...12]{
      _id,
      nombre,
      "slug": slug.current,
      fecha,
      ciudad,
      pais,
      "organizacion": organizacion->nombre,
      "organizacionSlug": organizacion->slug.current
    },
    "noticias": *[_type == "noticia" && disciplina._ref == ^._id] | order(coalesce(fechaPublicacion, _createdAt) desc)[0...12]{
      _id,
      titulo,
      "slug": slug.current,
      extracto,
      fechaPublicacion
    },
    "luchadores": *[_type == "luchador" && disciplina._ref == ^._id] | order(nombre asc)[0...24]{
      _id,
      nombre,
      "slug": slug.current,
      apodo,
      imagen,
      "categoriaPeso": categoriaPeso->nombre,
      "categoriaPesoSlug": categoriaPeso->slug.current
    }
  }
`

/* =========================
   CATEGORÍAS DE PESO
   ========================= */

export const categoriasPesoQuery = groq`
  *[_type == "categoriaPeso"] | order(limitePeso asc, nombre asc){
    _id,
    nombre,
    "slug": slug.current,
    limitePeso,
    unidad,
    descripcion,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current
  }
`

export const categoriaPesoPorSlugQuery = groq`
  *[_type == "categoriaPeso" && slug.current == $slug][0]{
    _id,
    nombre,
    "slug": slug.current,
    limitePeso,
    unidad,
    descripcion,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "luchadores": *[
      _type == "luchador" &&
      (
        categoriaPeso._ref == ^._id ||
        categoriaPeso == ^.nombre
      )
    ] | order(nombre asc){
      _id,
      nombre,
      apodo,
      imagen,
      "slug": slug.current,
      "disciplina": disciplina->nombre,
      "disciplinaSlug": disciplina->slug.current,
      "organizacion": organizacion->nombre,
      "organizacionSlug": organizacion->slug.current
    },
    "combates": *[
      _type == "combate" &&
      (
        categoriaPeso._ref == ^._id ||
        categoriaPeso == ^.nombre
      )
    ] | order(coalesce(evento->fecha, _createdAt) desc){
      _id,
      estado,
      metodo,
      "evento": evento->nombre,
      "eventoSlug": evento->slug.current,
      "fechaEvento": evento->fecha,
      luchadorRojo->{
        _id,
        nombre,
        "slug": slug.current
      },
      luchadorAzul->{
        _id,
        nombre,
        "slug": slug.current
      },
      ganador->{
        _id,
        nombre,
        "slug": slug.current
      }
    }
  }
`

/* =========================
   ORGANIZACIONES
   ========================= */

export const organizacionesQuery = groq`
  *[_type == "organizacion"] | order(nombre asc){
    _id,
    nombre,
    "slug": slug.current,
    descripcionCorta,
    descripcion,
    paisOrigen,
    sede,
    anioFundacion,
    identidad,
    datosCuriosos,
    logo,
    banner,
    sitioWeb,
    activa,
    "disciplinas": disciplinas[]->{
      _id,
      nombre,
      "slug": slug.current
    }
  }
`

export const organizacionPorSlugQuery = groq`
  *[_type == "organizacion" && slug.current == $slug][0]{
    _id,
    nombre,
    "slug": slug.current,
    descripcionCorta,
    descripcion,
    paisOrigen,
    sede,
    anioFundacion,
    identidad,
    datosCuriosos,
    logo,
    banner,
    sitioWeb,
    activa,
    "disciplinas": disciplinas[]->{
      _id,
      nombre,
      "slug": slug.current
    },
    "eventos": *[_type == "evento" && organizacion._ref == ^._id] | order(coalesce(fecha, _createdAt) desc)[0...12]{
      _id,
      nombre,
      "slug": slug.current,
      fecha,
      ciudad,
      pais,
      recinto,
      imagen,
      "disciplina": disciplina->nombre,
      "disciplinaSlug": disciplina->slug.current
    },
    "luchadores": *[_type == "luchador" && organizacion._ref == ^._id] | order(nombre asc)[0...24]{
      _id,
      nombre,
      apodo,
      imagen,
      "slug": slug.current,
      "disciplina": disciplina->nombre,
      "disciplinaSlug": disciplina->slug.current,
      "categoriaPeso": categoriaPeso->nombre,
      "categoriaPesoSlug": categoriaPeso->slug.current
    },
    "noticias": *[
      _type == "noticia" &&
      (
        organizacionRelacionada._ref == ^._id ||
        eventoRelacionado->organizacion._ref == ^._id
      )
    ] | order(coalesce(fechaPublicacion, _createdAt) desc)[0...12]{
      _id,
      titulo,
      "slug": slug.current,
      extracto,
      fechaPublicacion,
      "disciplina": disciplina->nombre,
      "disciplinaSlug": disciplina->slug.current
    },
    "combates": *[_type == "combate" && organizacion._ref == ^._id] | order(coalesce(evento->fecha, _createdAt) desc)[0...12]{
      _id,
      estado,
      metodo,
      cartelera,
      tituloEnJuego,
      "evento": evento->nombre,
      "eventoSlug": evento->slug.current,
      "categoriaPeso": categoriaPeso->nombre,
      "categoriaPesoSlug": categoriaPeso->slug.current,
      luchadorRojo->{
        _id,
        nombre,
        "slug": slug.current
      },
      luchadorAzul->{
        _id,
        nombre,
        "slug": slug.current
      },
      ganador->{
        _id,
        nombre,
        "slug": slug.current
      }
    }
  }
`