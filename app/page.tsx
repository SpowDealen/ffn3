import Link from "next/link";
import {client} from "../sanity/lib/client";
import {
  noticiaDestacadaQuery,
  ultimasNoticiasQuery,
  proximoEventoQuery,
  luchadoresDestacadosQuery,
  disciplinasHomeQuery,
  categoriasPesoHomeQuery,
} from "../sanity/lib/queries";

type Noticia = {
  _id: string;
  titulo: string;
  slug: string;
  extracto?: string;
  fechaPublicacion?: string;
  disciplina?: string;
};

type Evento = {
  _id: string;
  nombre: string;
  slug: string;
  fecha?: string;
  ciudad?: string;
  pais?: string;
  recinto?: string;
  cartelPrincipal?: string;
  estado?: string;
  descripcion?: string;
  organizacion?: string;
  disciplina?: string;
};

type Luchador = {
  _id: string;
  nombre: string;
  slug: string;
  apodo?: string;
  nacionalidad?: string;
  record?: string;
  disciplina?: string;
  organizacion?: string;
  categoriaPeso?: string;
};

type Disciplina = {
  _id: string;
  nombre: string;
  slug: string;
  descripcion?: string;
};

type CategoriaPeso = {
  _id: string;
  nombre: string;
  slug: string;
  limitePeso?: number;
  unidad?: string;
  disciplina?: string;
};

function formatearFecha(fecha?: string) {
  if (!fecha) return null;

  return new Date(fecha).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatearUbicacion(ciudad?: string, pais?: string) {
  if (ciudad && pais) return `${ciudad}, ${pais}`;
  if (ciudad) return ciudad;
  if (pais) return pais;
  return null;
}

const cardBase = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "24px",
  boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
  overflow: "hidden" as const,
  minWidth: 0,
  position: "relative" as const,
};

const sectionTitleEyebrow = {
  color: "#8f8f8f",
  fontSize: "12px",
  textTransform: "uppercase" as const,
  letterSpacing: "1.8px",
  margin: "0 0 8px 0",
};

const sectionTitle = {
  fontSize: "clamp(26px, 3vw, 32px)",
  lineHeight: 1.08,
  letterSpacing: "-0.8px",
  margin: 0,
};

const actionLinkStyle = {
  color: "#f5c542",
  textDecoration: "none",
  fontSize: "15px",
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  minHeight: "24px",
};

const pillLinkStyle = {
  color: "#d7d7d7",
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "999px",
  padding: "10px 14px",
  fontSize: "14px",
  background: "rgba(255,255,255,0.02)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "40px",
  minWidth: 0,
} as const;

export default async function HomePage() {
  const [
    noticiaDestacada,
    ultimasNoticias,
    proximoEvento,
    luchadoresDestacados,
    disciplinasHome,
    categoriasPesoHome,
  ] = await Promise.all([
    client.fetch<Noticia | null>(noticiaDestacadaQuery),
    client.fetch<Noticia[]>(ultimasNoticiasQuery),
    client.fetch<Evento | null>(proximoEventoQuery),
    client.fetch<Luchador[]>(luchadoresDestacadosQuery),
    client.fetch<Disciplina[]>(disciplinasHomeQuery),
    client.fetch<CategoriaPeso[]>(categoriasPesoHomeQuery),
  ]);

  return (
    <main
      style={{
        minHeight: "100vh",
        color: "white",
        padding: "clamp(18px, 2.8vw, 34px) clamp(14px, 2.4vw, 28px) 88px",
      }}
    >
      <section
        style={{
          maxWidth: "1240px",
          margin: "0 auto",
          display: "grid",
          gap: "clamp(24px, 3vw, 40px)",
          minWidth: 0,
        }}
      >
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
            gap: "24px",
            alignItems: "stretch",
            minWidth: 0,
          }}
        >
          <article
            style={{
              ...cardBase,
              padding: "clamp(20px, 3vw, 34px)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "26px",
              minWidth: 0,
            }}
          >
            <div style={{minWidth: 0}}>
              <p
                style={{
                  color: "#8f8f8f",
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "2px",
                  margin: "0 0 18px 0",
                }}
              >
                Full Fight News
              </p>

              <h1
                style={{
                  fontSize: "clamp(34px, 6vw, 56px)",
                  lineHeight: 1.02,
                  letterSpacing: "-2px",
                  margin: "0 0 18px 0",
                  maxWidth: "760px",
                  textWrap: "balance",
                }}
              >
                Actualidad seria de deportes de combate
              </h1>

              <p
                style={{
                  color: "#b9b9b9",
                  fontSize: "clamp(16px, 2.1vw, 21px)",
                  lineHeight: 1.75,
                  margin: "0 0 26px 0",
                  maxWidth: "760px",
                }}
              >
                Noticias, eventos, luchadores, resultados, disciplinas y categorías
                de peso en una misma estructura editorial, clara y preparada para
                crecer.
              </p>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px",
                  alignItems: "center",
                }}
              >
                <Link
                  href="/noticias"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "14px 18px",
                    borderRadius: "999px",
                    background: "#f5c542",
                    color: "#111",
                    textDecoration: "none",
                    fontWeight: 700,
                    fontSize: "15px",
                    minHeight: "46px",
                  }}
                >
                  Ver noticias
                </Link>

                <Link
                  href="/eventos"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "14px 18px",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "white",
                    textDecoration: "none",
                    fontWeight: 600,
                    fontSize: "15px",
                    background: "rgba(255,255,255,0.02)",
                    minHeight: "46px",
                  }}
                >
                  Explorar eventos
                </Link>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                minWidth: 0,
              }}
            >
              {[
                {label: "Noticias", href: "/noticias"},
                {label: "Luchadores", href: "/luchadores"},
                {label: "Resultados", href: "/resultados"},
                {label: "Disciplinas", href: "/disciplinas"},
                {label: "Pesos", href: "/categorias-peso"},
              ].map((item) => (
                <Link key={item.label} href={item.href} style={pillLinkStyle}>
                  {item.label}
                </Link>
              ))}
            </div>
          </article>

          <aside
            style={{
              display: "grid",
              gap: "24px",
              minWidth: 0,
            }}
          >
            <section
              style={{
                ...cardBase,
                padding: "clamp(20px, 2.4vw, 26px)",
                minWidth: 0,
              }}
            >
              <p
                style={{
                  color: "#8f8f8f",
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "1.8px",
                  margin: "0 0 12px 0",
                }}
              >
                Próximo evento
              </p>

              {proximoEvento ? (
                <>
                  <h2
                    style={{
                      fontSize: "clamp(24px, 3vw, 30px)",
                      lineHeight: 1.08,
                      letterSpacing: "-1px",
                      margin: "0 0 14px 0",
                      textWrap: "balance",
                    }}
                  >
                    {proximoEvento.nombre}
                  </h2>

                  <div
                    style={{
                      display: "grid",
                      gap: "10px",
                      color: "#c8c8c8",
                      fontSize: "15px",
                      lineHeight: 1.6,
                      marginBottom: "18px",
                    }}
                  >
                    {formatearFecha(proximoEvento.fecha) && (
                      <span>Fecha: {formatearFecha(proximoEvento.fecha)}</span>
                    )}
                    {formatearUbicacion(proximoEvento.ciudad, proximoEvento.pais) && (
                      <span>
                        Lugar: {formatearUbicacion(proximoEvento.ciudad, proximoEvento.pais)}
                      </span>
                    )}
                    {proximoEvento.organizacion && (
                      <span>Organización: {proximoEvento.organizacion}</span>
                    )}
                    {proximoEvento.disciplina && (
                      <span>Disciplina: {proximoEvento.disciplina}</span>
                    )}
                  </div>

                  <Link href={`/eventos/${proximoEvento.slug}`} style={actionLinkStyle}>
                    Ver detalle del evento
                  </Link>
                </>
              ) : (
                <p
                  style={{
                    color: "#b7b7b7",
                    fontSize: "16px",
                    lineHeight: 1.7,
                    margin: 0,
                  }}
                >
                  Todavía no hay un próximo evento destacado cargado.
                </p>
              )}
            </section>

            <section
              style={{
                ...cardBase,
                padding: "clamp(20px, 2.4vw, 26px)",
                minWidth: 0,
              }}
            >
              <p
                style={{
                  color: "#8f8f8f",
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "1.8px",
                  margin: "0 0 12px 0",
                }}
              >
                Noticia destacada
              </p>

              {noticiaDestacada ? (
                <>
                  <h2
                    style={{
                      fontSize: "clamp(22px, 2.8vw, 26px)",
                      lineHeight: 1.18,
                      letterSpacing: "-0.7px",
                      margin: "0 0 12px 0",
                      textWrap: "balance",
                    }}
                  >
                    {noticiaDestacada.titulo}
                  </h2>

                  {noticiaDestacada.extracto && (
                    <p
                      style={{
                        color: "#bebebe",
                        fontSize: "15px",
                        lineHeight: 1.7,
                        margin: "0 0 16px 0",
                      }}
                    >
                      {noticiaDestacada.extracto}
                    </p>
                  )}

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "10px",
                      marginBottom: "16px",
                    }}
                  >
                    {noticiaDestacada.fechaPublicacion && (
                      <span
                        style={{
                          color: "#8d8d8d",
                          fontSize: "12px",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "999px",
                          padding: "8px 12px",
                        }}
                      >
                        {formatearFecha(noticiaDestacada.fechaPublicacion)}
                      </span>
                    )}
                    {noticiaDestacada.disciplina && (
                      <span
                        style={{
                          color: "#8d8d8d",
                          fontSize: "12px",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "999px",
                          padding: "8px 12px",
                        }}
                      >
                        {noticiaDestacada.disciplina}
                      </span>
                    )}
                  </div>

                  <Link href={`/noticias/${noticiaDestacada.slug}`} style={actionLinkStyle}>
                    Leer noticia
                  </Link>
                </>
              ) : (
                <p
                  style={{
                    color: "#b7b7b7",
                    fontSize: "16px",
                    lineHeight: 1.7,
                    margin: 0,
                  }}
                >
                  Cuando marques una noticia como destacada en el CMS, aparecerá aquí.
                </p>
              )}
            </section>
          </aside>
        </section>

        <section
          style={{
            display: "grid",
            gap: "18px",
            marginBottom: "12px",
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "end",
              gap: "16px",
              flexWrap: "wrap",
              minWidth: 0,
            }}
          >
            <div style={{minWidth: 0}}>
              <p style={sectionTitleEyebrow}>Actualidad</p>
              <h2
                style={{
                  fontSize: "clamp(28px, 4vw, 36px)",
                  lineHeight: 1.08,
                  letterSpacing: "-1px",
                  margin: 0,
                  textWrap: "balance",
                }}
              >
                Últimas noticias
              </h2>
            </div>

            <Link href="/noticias" style={actionLinkStyle}>
              Ver todas las noticias
            </Link>
          </div>

          {ultimasNoticias.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
                gap: "18px",
                alignItems: "stretch",
                minWidth: 0,
              }}
            >
              {ultimasNoticias.map((noticia) => (
                <Link
                  key={noticia._id}
                  href={`/noticias/${noticia.slug}`}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                    minWidth: 0,
                  }}
                >
                  <article
                    style={{
                      ...cardBase,
                      padding: "22px",
                      minHeight: "240px",
                      height: "100%",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                        marginBottom: "14px",
                      }}
                    >
                      {noticia.fechaPublicacion && (
                        <span
                          style={{
                            color: "#909090",
                            fontSize: "12px",
                          }}
                        >
                          {formatearFecha(noticia.fechaPublicacion)}
                        </span>
                      )}

                      {noticia.disciplina && (
                        <span
                          style={{
                            color: "#f5c542",
                            fontSize: "12px",
                          }}
                        >
                          {noticia.disciplina}
                        </span>
                      )}
                    </div>

                    <h3
                      style={{
                        fontSize: "clamp(20px, 2.8vw, 24px)",
                        lineHeight: 1.16,
                        letterSpacing: "-0.6px",
                        margin: "0 0 12px 0",
                        textWrap: "balance",
                      }}
                    >
                      {noticia.titulo}
                    </h3>

                    {noticia.extracto && (
                      <p
                        style={{
                          color: "#bdbdbd",
                          fontSize: "15px",
                          lineHeight: 1.7,
                          margin: 0,
                        }}
                      >
                        {noticia.extracto}
                      </p>
                    )}
                  </article>
                </Link>
              ))}
            </div>
          ) : (
            <div
              style={{
                ...cardBase,
                padding: "24px",
                color: "#b9b9b9",
                fontSize: "16px",
                lineHeight: 1.7,
              }}
            >
              Todavía no hay noticias cargadas para mostrar en portada.
            </div>
          )}
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
            gap: "24px",
            alignItems: "start",
            marginTop: "12px",
            minWidth: 0,
          }}
        >
          <section
            style={{
              ...cardBase,
              padding: "clamp(20px, 2.4vw, 26px)",
              display: "flex",
              flexDirection: "column",
              alignSelf: "start",
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "end",
                gap: "16px",
                flexWrap: "wrap",
                marginBottom: "18px",
                minWidth: 0,
              }}
            >
              <div style={{minWidth: 0}}>
                <p style={sectionTitleEyebrow}>Luchadores</p>
                <h2 style={sectionTitle}>Luchadores destacados</h2>
              </div>

              <Link href="/luchadores" style={actionLinkStyle}>
                Ver todos
              </Link>
            </div>

            <div
              style={{
                display: "grid",
                gap: "14px",
                alignContent: "start",
                minWidth: 0,
              }}
            >
              {luchadoresDestacados.length > 0 ? (
                luchadoresDestacados.map((luchador) => (
                  <Link
                    key={luchador._id}
                    href={`/luchadores/${luchador.slug}`}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      display: "block",
                      minWidth: 0,
                    }}
                  >
                    <article
                      style={{
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.02)",
                        borderRadius: "18px",
                        padding: "18px 18px 16px",
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "14px",
                          flexWrap: "wrap",
                          marginBottom: "8px",
                          minWidth: 0,
                        }}
                      >
                        <h3
                          style={{
                            fontSize: "clamp(20px, 2.6vw, 22px)",
                            lineHeight: 1.15,
                            letterSpacing: "-0.4px",
                            margin: 0,
                            minWidth: 0,
                            textWrap: "balance",
                          }}
                        >
                          {luchador.nombre}
                        </h3>

                        {luchador.record && (
                          <span
                            style={{
                              color: "#f5c542",
                              fontSize: "14px",
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                          >
                            {luchador.record}
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "10px",
                          color: "#b7b7b7",
                          fontSize: "14px",
                          lineHeight: 1.6,
                        }}
                      >
                        {luchador.apodo && <span>“{luchador.apodo}”</span>}
                        {luchador.disciplina && <span>{luchador.disciplina}</span>}
                        {luchador.categoriaPeso && <span>{luchador.categoriaPeso}</span>}
                        {luchador.organizacion && <span>{luchador.organizacion}</span>}
                      </div>
                    </article>
                  </Link>
                ))
              ) : (
                <p
                  style={{
                    color: "#b9b9b9",
                    fontSize: "16px",
                    lineHeight: 1.7,
                    margin: 0,
                  }}
                >
                  Todavía no hay luchadores suficientes para destacarlos en portada.
                </p>
              )}
            </div>
          </section>

          <section
            style={{
              display: "grid",
              gap: "24px",
              minWidth: 0,
              alignSelf: "start",
            }}
          >
            <section
              style={{
                ...cardBase,
                padding: "clamp(20px, 2.4vw, 26px)",
                minHeight: "220px",
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "end",
                  gap: "16px",
                  flexWrap: "wrap",
                  marginBottom: "18px",
                  minWidth: 0,
                }}
              >
                <div style={{minWidth: 0}}>
                  <p style={sectionTitleEyebrow}>Mapa editorial</p>
                  <h2 style={sectionTitle}>Disciplinas</h2>
                </div>

                <Link href="/disciplinas" style={actionLinkStyle}>
                  Ver todas
                </Link>
              </div>

              {disciplinasHome.length > 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "12px",
                    alignContent: "flex-start",
                  }}
                >
                  {disciplinasHome.map((disciplina) => (
                    <Link
                      key={disciplina._id}
                      href={`/disciplinas/${disciplina.slug}`}
                      style={{
                        textDecoration: "none",
                        color: "#dcdcdc",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "999px",
                        padding: "12px 16px",
                        fontSize: "14px",
                        background: "rgba(255,255,255,0.02)",
                        display: "inline-flex",
                        alignItems: "center",
                        minHeight: "44px",
                        minWidth: 0,
                        maxWidth: "100%",
                      }}
                    >
                      {disciplina.nombre}
                    </Link>
                  ))}
                </div>
              ) : (
                <p
                  style={{
                    color: "#b9b9b9",
                    fontSize: "16px",
                    lineHeight: 1.7,
                    margin: 0,
                  }}
                >
                  Aún no hay disciplinas visibles en portada.
                </p>
              )}
            </section>

            <section
              style={{
                ...cardBase,
                padding: "clamp(20px, 2.4vw, 26px)",
                minHeight: "220px",
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "end",
                  gap: "16px",
                  flexWrap: "wrap",
                  marginBottom: "18px",
                  minWidth: 0,
                }}
              >
                <div style={{minWidth: 0}}>
                  <p style={sectionTitleEyebrow}>Estructura</p>
                  <h2 style={sectionTitle}>Categorías de peso</h2>
                </div>

                <Link href="/categorias-peso" style={actionLinkStyle}>
                  Ver todas
                </Link>
              </div>

              {categoriasPesoHome.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gap: "12px",
                    alignContent: "start",
                    minWidth: 0,
                  }}
                >
                  {categoriasPesoHome.map((categoria) => (
                    <Link
                      key={categoria._id}
                      href={`/categorias-peso/${categoria.slug}`}
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                        display: "block",
                        minWidth: 0,
                      }}
                    >
                      <article
                        style={{
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.02)",
                          borderRadius: "18px",
                          padding: "16px 18px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "16px",
                          minWidth: 0,
                        }}
                      >
                        <div style={{minWidth: 0, flex: 1}}>
                          <h3
                            style={{
                              fontSize: "18px",
                              lineHeight: 1.2,
                              letterSpacing: "-0.3px",
                              margin: "0 0 6px 0",
                              color: "white",
                              textWrap: "balance",
                            }}
                          >
                            {categoria.nombre}
                          </h3>

                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "8px",
                              color: "#b8b8b8",
                              fontSize: "13px",
                              lineHeight: 1.5,
                            }}
                          >
                            {typeof categoria.limitePeso === "number" && (
                              <span>
                                Hasta {categoria.limitePeso}
                                {categoria.unidad ?? ""}
                              </span>
                            )}
                            {categoria.disciplina && <span>{categoria.disciplina}</span>}
                          </div>
                        </div>

                        <span
                          style={{
                            color: "#f5c542",
                            fontSize: "14px",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          Ver
                        </span>
                      </article>
                    </Link>
                  ))}
                </div>
              ) : (
                <p
                  style={{
                    color: "#b9b9b9",
                    fontSize: "16px",
                    lineHeight: 1.7,
                    margin: 0,
                  }}
                >
                  Cuando cargues más categorías de peso, esta zona ganará mucha fuerza.
                </p>
              )}
            </section>
          </section>
        </section>
      </section>
    </main>
  );
}