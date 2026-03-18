import {groq} from 'next-sanity'

/* =========================
   HOME
   ========================= */

export const noticiaDestacadaQuery = groq`
  *[_type == "noticia" && destacada == true]
    | order(coalesce(fechaPublicacion, _createdAt) desc)[0]{
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
    "luchadoresRelacionados": coalesce(luchadoresRelacionados[]->{
      _id,
      nombre,
      "slug": slug.current
    }, [])
  }
`

export const ultimasNoticiasQuery = groq`
  *[_type == "noticia"]
    | order(coalesce(fechaPublicacion, _createdAt) desc)[0...6]{
    _id,
    titulo,
    "slug": slug.current,
    extracto,
    fechaPublicacion,
    destacada,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "eventoRelacionado": eventoRelacionado->nombre,
    "eventoRelacionadoSlug": eventoRelacionado->slug.current
  }
`

export const proximosEventosQuery = groq`
  *[
    _type == "evento" &&
    defined(fecha) &&
    fecha >= string::split(now(), "T")[0]
  ]
    | order(fecha asc)[0...6]{
    _id,
    nombre,
    "slug": slug.current,
    fecha,
    horaLocal,
    ciudad,
    pais,
    recinto,
    estado,
    descripcionCorta,
    "organizacion": organizacion->nombre,
    "organizacionSlug": organizacion->slug.current,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "imagen": imagen
  }
`

/* Compatibilidad con archivos viejos que aún importen el singular */
export const proximoEventoQuery = proximosEventosQuery

export const luchadoresDestacadosQuery = groq`
  *[
    _type == "luchador" &&
    destacadoHome == true
  ]
    | order(ordenDestacadoHome asc, nombre asc)[0...6]{
    _id,
    nombre,
    "slug": slug.current,
    apodo,
    record,
    nacionalidad,
    activo,
    destacadoHome,
    ordenDestacadoHome,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "organizacion": organizacion->nombre,
    "organizacionSlug": organizacion->slug.current,
    "categoriaPeso": categoriaPeso->nombre,
    "categoriaPesoSlug": categoriaPeso->slug.current,
    "imagen": imagen
  }
`

export const disciplinasHomeQuery = groq`
  *[_type == "disciplina" && (!defined(activa) || activa == true)]
    | order(nombre asc){
    _id,
    nombre,
    "slug": slug.current,
    descripcion
  }
`

export const categoriasPesoHomeQuery = groq`
  *[_type == "categoriaPeso"]
    | order(nombre asc){
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
    "luchadoresRelacionados": coalesce(luchadoresRelacionados[]->nombre, []),
    "luchadoresRelacionadosData": coalesce(luchadoresRelacionados[]->{
      _id,
      nombre,
      "slug": slug.current
    }, [])
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
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "eventoRelacionado": eventoRelacionado->nombre,
    "eventoRelacionadoSlug": eventoRelacionado->slug.current,
    "organizacionRelacionada": organizacionRelacionada->nombre,
    "organizacionRelacionadaSlug": organizacionRelacionada->slug.current,
    "luchadoresRelacionados": coalesce(luchadoresRelacionados[]->nombre, []),
    "luchadoresRelacionadosData": coalesce(luchadoresRelacionados[]->{
      _id,
      nombre,
      "slug": slug.current
    }, [])
  }
`

/* =========================
   EVENTOS
   ========================= */

export const eventosQuery = groq`
  *[_type == "evento"] | order(fecha desc){
    _id,
    nombre,
    "slug": slug.current,
    fecha,
    horaLocal,
    ciudad,
    pais,
    recinto,
    estado,
    descripcionCorta,
    descripcion,
    dondeVer,
    notas,
    "organizacion": organizacion->nombre,
    "organizacionSlug": organizacion->slug.current,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    imagen
  }
`

export const eventoPorSlugQuery = groq`
  *[_type == "evento" && slug.current == $slug][0]{
    _id,
    nombre,
    "slug": slug.current,
    fecha,
    horaLocal,
    ciudad,
    pais,
    recinto,
    estado,
    descripcionCorta,
    descripcion,
    dondeVer,
    notas,
    "organizacion": organizacion->nombre,
    "organizacionSlug": organizacion->slug.current,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    imagen,
    "combates": coalesce(*[_type == "combate" && evento._ref == ^._id] | order(orden asc){
      _id,
      metodo,
      asalto,
      tiempo,
      estado,
      resumen,
      desarrollo,
      momentoClave,
      consecuencia,
      cartelera,
      tituloEnJuego,
      "luchadorRojo": luchadorRojo->nombre,
      "luchadorRojoSlug": luchadorRojo->slug.current,
      "luchadorAzul": luchadorAzul->nombre,
      "luchadorAzulSlug": luchadorAzul->slug.current,
      "ganador": ganador->nombre,
      "ganadorSlug": ganador->slug.current,
      "categoriaPeso": categoriaPeso->nombre,
      "categoriaPesoSlug": categoriaPeso->slug.current
    }, []),
    "noticiasRelacionadas": coalesce(*[_type == "noticia" && eventoRelacionado._ref == ^._id]
      | order(coalesce(fechaPublicacion, _createdAt) desc)[0...5]{
      _id,
      titulo,
      "slug": slug.current,
      extracto,
      fechaPublicacion
    }, [])
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
    record,
    nacionalidad,
    activo,
    rankingDisciplina,
    destacadoHome,
    ordenDestacadoHome,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "organizacion": organizacion->nombre,
    "organizacionSlug": organizacion->slug.current,
    "categoriaPeso": categoriaPeso->nombre,
    "categoriaPesoSlug": categoriaPeso->slug.current,
    imagen,
    descripcion
  }
`

export const luchadorPorSlugQuery = groq`
  *[_type == "luchador" && slug.current == $slug][0]{
    _id,
    nombre,
    "slug": slug.current,
    apodo,
    record,
    nacionalidad,
    activo,
    rankingDisciplina,
    destacadoHome,
    ordenDestacadoHome,
    "disciplina": disciplina->nombre,
    "disciplinaSlug": disciplina->slug.current,
    "organizacion": organizacion->nombre,
    "organizacionSlug": organizacion->slug.current,
    "categoriaPeso": categoriaPeso->nombre,
    "categoriaPesoSlug": categoriaPeso->slug.current,
    imagen,
    descripcion,
    "combatesRelacionados": coalesce(*[
      _type == "combate" &&
      (
        luchadorRojo._ref == ^._id ||
        luchadorAzul._ref == ^._id
      )
    ] | order(_createdAt desc)[0...8]{
      _id,
      metodo,
      asalto,
      tiempo,
      estado,
      "evento": evento->nombre,
      "eventoSlug": evento->slug.current,
      "luchadorRojo": luchadorRojo->nombre,
      "luchadorRojoSlug": luchadorRojo->slug.current,
      "luchadorAzul": luchadorAzul->nombre,
      "luchadorAzulSlug": luchadorAzul->slug.current,
      "ganador": ganador->nombre,
      "ganadorSlug": ganador->slug.current,
      "categoriaPeso": categoriaPeso->nombre,
      "categoriaPesoSlug": categoriaPeso->slug.current
    }, []),
    "noticiasRelacionadas": coalesce(*[
      _type == "noticia" &&
      references(^._id)
    ] | order(coalesce(fechaPublicacion, _createdAt) desc)[0...6]{
      _id,
      titulo,
      "slug": slug.current,
      extracto,
      fechaPublicacion
    }, [])
  }
`

/* =========================
   RESULTADOS / COMBATES
   ========================= */

export const combatesQuery = groq`
  *[_type == "combate"] | order(_createdAt desc){
    _id,
    _createdAt,
    metodo,
    asalto,
    tiempo,
    tituloEnJuego,
    cartelera,
    orden,
    estado,
    resumen,
    desarrollo,
    momentoClave,
    consecuencia,
    "evento": evento->nombre,
    "eventoSlug": evento->slug.current,
    "luchadorRojo": luchadorRojo->nombre,
    "luchadorRojoSlug": luchadorRojo->slug.current,
    "luchadorAzul": luchadorAzul->nombre,
    "luchadorAzulSlug": luchadorAzul->slug.current,
    "ganador": ganador->nombre,
    "ganadorSlug": ganador->slug.current,
    "categoriaPeso": categoriaPeso->nombre,
    "categoriaPesoSlug": categoriaPeso->slug.current
  }
`

export const combatePorIdQuery = groq`
  *[_type == "combate" && _id == $id][0]{
    _id,
    _createdAt,
    metodo,
    asalto,
    tiempo,
    tituloEnJuego,
    cartelera,
    orden,
    estado,
    resumen,
    desarrollo,
    momentoClave,
    consecuencia,
    "evento": evento->{
      _id,
      nombre,
      "slug": slug.current,
      fecha,
      horaLocal,
      ciudad,
      pais,
      recinto,
      descripcionCorta,
      descripcion,
      dondeVer,
      estado
    },
    "organizacion": evento->organizacion->{
      _id,
      nombre,
      "slug": slug.current
    },
    "disciplina": evento->disciplina->nombre,
    "disciplinaSlug": evento->disciplina->slug.current,
    "luchadorRojo": luchadorRojo->{
      _id,
      nombre,
      "slug": slug.current,
      apodo,
      imagen
    },
    "luchadorAzul": luchadorAzul->{
      _id,
      nombre,
      "slug": slug.current,
      apodo,
      imagen
    },
    "ganador": ganador->{
      _id,
      nombre,
      "slug": slug.current,
      apodo,
      imagen
    },
    "categoriaPeso": categoriaPeso->{
      _id,
      nombre,
      "slug": slug.current,
      limitePeso,
      unidad
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
    "slug": slug.current,
    descripcion,
    activa
  }
`

export const disciplinaPorSlugQuery = groq`
  *[_type == "disciplina" && slug.current == $slug][0]{
    _id,
    nombre,
    "slug": slug.current,
    descripcion,
    activa,
    "organizaciones": coalesce(*[
      _type == "organizacion" &&
      references(^._id)
    ] | order(nombre asc){
      _id,
      nombre,
      "slug": slug.current,
      descripcionCorta,
      paisOrigen,
      sede,
      anioFundacion,
      activa,
      logo
    }, []),
    "categoriasPeso": coalesce(*[
      _type == "categoriaPeso" &&
      disciplina._ref == ^._id
    ] | order(limitePeso asc){
      _id,
      nombre,
      "slug": slug.current,
      limitePeso,
      unidad,
      descripcion
    }, []),
    "rankingTop": coalesce(*[
      _type == "luchador" &&
      disciplina._ref == ^._id &&
      defined(rankingDisciplina)
    ] | order(rankingDisciplina asc)[0...10]{
      _id,
      nombre,
      "slug": slug.current,
      apodo,
      nacionalidad,
      record,
      activo,
      imagen,
      rankingDisciplina,
      "categoriaPeso": categoriaPeso->nombre,
      "categoriaPesoSlug": categoriaPeso->slug.current,
      "organizacion": organizacion->nombre,
      "organizacionSlug": organizacion->slug.current
    }, []),
    "totalLuchadores": count(*[
      _type == "luchador" &&
      disciplina._ref == ^._id
    ]),
    "eventos": coalesce(*[
      _type == "evento" &&
      disciplina._ref == ^._id
    ] | order(fecha desc)[0...6]{
      _id,
      nombre,
      "slug": slug.current,
      fecha,
      horaLocal,
      ciudad,
      pais,
      recinto,
      descripcionCorta,
      estado,
      "organizacion": organizacion->nombre,
      "organizacionSlug": organizacion->slug.current
    }, [])
  }
`

/* =========================
   CATEGORÍAS DE PESO
   ========================= */

export const categoriasPesoQuery = groq`
  *[_type == "categoriaPeso"] | order(nombre asc){
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
    "luchadoresRelacionados": coalesce(*[
      _type == "luchador" &&
      (
        categoriaPeso._ref == ^._id ||
        categoriaPeso == ^.nombre
      )
    ] | order(nombre asc){
      _id,
      nombre,
      "slug": slug.current,
      apodo,
      record,
      "organizacion": organizacion->nombre,
      "organizacionSlug": organizacion->slug.current
    }, []),
    "combatesRelacionados": coalesce(*[
      _type == "combate" &&
      defined(categoriaPeso) &&
      (
        categoriaPeso._ref == ^._id ||
        categoriaPeso == ^.nombre ||
        categoriaPeso->nombre == ^.nombre
      )
    ] | order(coalesce(evento->fecha, _createdAt) desc)[0...10]{
      _id,
      metodo,
      asalto,
      tiempo,
      estado,
      cartelera,
      tituloEnJuego,
      resumen,
      "evento": evento->nombre,
      "eventoSlug": evento->slug.current,
      "luchadorRojo": luchadorRojo->nombre,
      "luchadorRojoSlug": luchadorRojo->slug.current,
      "luchadorAzul": luchadorAzul->nombre,
      "luchadorAzulSlug": luchadorAzul->slug.current,
      "ganador": ganador->nombre,
      "ganadorSlug": ganador->slug.current
    }, [])
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
    sitioWeb,
    activa,
    logo,
    banner,
    "disciplinas": coalesce(disciplinas[]->{
      _id,
      nombre,
      "slug": slug.current
    }, [])
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
    sitioWeb,
    activa,
    logo,
    banner,
    "disciplinas": coalesce(disciplinas[]->{
      _id,
      nombre,
      "slug": slug.current
    }, []),
    "noticias": coalesce(*[
      _type == "noticia" &&
      organizacionRelacionada._ref == ^._id
    ] | order(coalesce(fechaPublicacion, _createdAt) desc)[0...5]{
      _id,
      titulo,
      "slug": slug.current,
      extracto,
      fechaPublicacion,
      "disciplina": disciplina->nombre,
      "disciplinaSlug": disciplina->slug.current
    }, []),
    "eventos": coalesce(*[
      _type == "evento" &&
      organizacion._ref == ^._id
    ] | order(fecha desc)[0...5]{
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
    }, []),
    "luchadores": coalesce(*[
      _type == "luchador" &&
      organizacion._ref == ^._id
    ] | order(nombre asc)[0...10]{
      _id,
      nombre,
      "slug": slug.current,
      apodo,
      imagen,
      nacionalidad,
      record,
      activo,
      "disciplina": disciplina->nombre,
      "disciplinaSlug": disciplina->slug.current,
      "categoriaPeso": categoriaPeso->nombre,
      "categoriaPesoSlug": categoriaPeso->slug.current
    }, []),
    "combates": coalesce(*[
      _type == "combate" &&
      evento->organizacion._ref == ^._id
    ] | order(_createdAt desc)[0...6]{
      _id,
      metodo,
      asalto,
      tiempo,
      estado,
      "evento": evento->nombre,
      "eventoSlug": evento->slug.current,
      "luchadorRojo": luchadorRojo->{
        _id,
        nombre,
        "slug": slug.current
      },
      "luchadorAzul": luchadorAzul->{
        _id,
        nombre,
        "slug": slug.current
      },
      "ganador": ganador->{
        _id,
        nombre,
        "slug": slug.current
      },
      "categoriaPeso": categoriaPeso->nombre,
      "categoriaPesoSlug": categoriaPeso->slug.current
    }, [])
  }
`