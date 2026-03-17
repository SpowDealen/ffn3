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

type RelacionBasica = {
  _id?: string;
  nombre?: string;
  titulo?: string;
  slug?: string;
};

type TextoOReferencia = string | RelacionBasica | null | undefined;

type Noticia = {
  _id: string;
  titulo: string;
  slug: string;
  extracto?: string;
  fechaPublicacion?: string;
  disciplina?: TextoOReferencia;
  disciplinaSlug?: string;
  eventoRelacionado?: TextoOReferencia;
  eventoRelacionadoSlug?: string;
};

type Evento = {
  _id: string;
  nombre: string;
  slug: string;
  fecha?: string;
  ciudad?: string;
  pais?: string;
  disciplina?: TextoOReferencia;
  disciplinaSlug?: string;
  organizacion?: TextoOReferencia;
  organizacionSlug?: string;
};

type Luchador = {
  _id: string;
  nombre: string;
  slug: string;
  apodo?: string;
  nacionalidad?: string;
  disciplina?: TextoOReferencia;
  disciplinaSlug?: string;
  categoriaPeso?: TextoOReferencia;
  categoriaPesoSlug?: string;
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
  disciplina?: TextoOReferencia;
  disciplinaSlug?: string;
};

function formatDate(value?: string) {
  if (!value) return "Fecha por confirmar";

  try {
    return new Date(value).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function getDisplayText(value: TextoOReferencia) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.nombre ?? value.titulo ?? "";
}

export default async function HomePage() {
  const [
    noticiaDestacada,
    ultimasNoticias,
    proximoEvento,
    luchadoresDestacados,
    disciplinas,
    categoriasPeso,
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
        padding: "40px 20px",
        background: "var(--ffn-bg)",
        color: "var(--ffn-text)",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "grid",
          gap: "24px",
        }}
      >
        <section
          style={{
            display: "grid",
            gap: "14px",
            padding: "28px",
            borderRadius: "28px",
            border: "1px solid var(--ffn-border)",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--ffn-accent)",
              fontWeight: 700,
            }}
          >
            Full Fight News
          </span>

          <h1
            style={{
              margin: 0,
              fontSize: "clamp(2.2rem, 5vw, 4.4rem)",
              lineHeight: 0.98,
              maxWidth: "900px",
            }}
          >
            Actualidad, eventos y protagonistas del mundo de los deportes de combate
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: "860px",
              color: "var(--ffn-text-soft)",
              lineHeight: 1.75,
              fontSize: "1.02rem",
            }}
          >
            Una base editorial conectada para seguir UFC, boxeo, MMA, bare-knuckle y
            más, enlazando noticias, resultados, eventos, luchadores, disciplinas y
            organizaciones.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              marginTop: "6px",
            }}
          >
            <Link
              href="/noticias"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "12px 16px",
                borderRadius: "14px",
                background: "var(--ffn-accent)",
                color: "#0a0a0f",
                fontWeight: 700,
                textDecoration: "none",
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
                padding: "12px 16px",
                borderRadius: "14px",
                border: "1px solid var(--ffn-border)",
                color: "var(--ffn-text)",
                textDecoration: "none",
              }}
            >
              Explorar eventos
            </Link>

            <Link
              href="/organizaciones"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "12px 16px",
                borderRadius: "14px",
                border: "1px solid var(--ffn-border)",
                color: "var(--ffn-text)",
                textDecoration: "none",
              }}
            >
              Ver organizaciones
            </Link>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gap: "24px",
            gridTemplateColumns: "1.2fr 0.8fr",
          }}
          className="ffn-home-top-grid"
        >
          <article
            style={{
              display: "grid",
              gap: "14px",
              padding: "24px",
              borderRadius: "24px",
              border: "1px solid var(--ffn-border)",
              background: "var(--ffn-surface)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <h2 style={{margin: 0, fontSize: "1.35rem"}}>Noticia destacada</h2>

              <Link
                href="/noticias"
                style={{
                  color: "var(--ffn-text-soft)",
                  textDecoration: "none",
                  fontSize: "0.95rem",
                }}
              >
                Ver todas
              </Link>
            </div>

            {noticiaDestacada ? (
              <Link
                href={`/noticias/${noticiaDestacada.slug}`}
                style={{
                  display: "grid",
                  gap: "10px",
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "clamp(1.4rem, 3vw, 2rem)",
                    lineHeight: 1.1,
                  }}
                >
                  {noticiaDestacada.titulo}
                </h3>

                {noticiaDestacada.extracto && (
                  <p
                    style={{
                      margin: 0,
                      color: "var(--ffn-text-soft)",
                      lineHeight: 1.7,
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
                    color: "var(--ffn-text-muted)",
                    fontSize: "0.92rem",
                  }}
                >
                  <span>{formatDate(noticiaDestacada.fechaPublicacion)}</span>
                  {getDisplayText(noticiaDestacada.disciplina) && (
                    <span>{getDisplayText(noticiaDestacada.disciplina)}</span>
                  )}
                  {getDisplayText(noticiaDestacada.eventoRelacionado) && (
                    <span>{getDisplayText(noticiaDestacada.eventoRelacionado)}</span>
                  )}
                </div>
              </Link>
            ) : (
              <p style={{margin: 0, color: "var(--ffn-text-soft)"}}>
                Aún no hay noticia destacada cargada.
              </p>
            )}
          </article>

          <article
            style={{
              display: "grid",
              gap: "14px",
              padding: "24px",
              borderRadius: "24px",
              border: "1px solid var(--ffn-border)",
              background: "var(--ffn-surface)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <h2 style={{margin: 0, fontSize: "1.35rem"}}>Próximo evento</h2>

              <Link
                href="/eventos"
                style={{
                  color: "var(--ffn-text-soft)",
                  textDecoration: "none",
                  fontSize: "0.95rem",
                }}
              >
                Calendario
              </Link>
            </div>

            {proximoEvento ? (
              <Link
                href={`/eventos/${proximoEvento.slug}`}
                style={{
                  display: "grid",
                  gap: "10px",
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "1.35rem",
                    lineHeight: 1.15,
                  }}
                >
                  {proximoEvento.nombre}
                </h3>

                <div
                  style={{
                    display: "grid",
                    gap: "6px",
                    color: "var(--ffn-text-soft)",
                    lineHeight: 1.6,
                  }}
                >
                  <span>{formatDate(proximoEvento.fecha)}</span>
                  <span>
                    {[proximoEvento.ciudad, proximoEvento.pais].filter(Boolean).join(", ") ||
                      "Ubicación por confirmar"}
                  </span>
                  <span>
                    {[
                      getDisplayText(proximoEvento.organizacion),
                      getDisplayText(proximoEvento.disciplina),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </Link>
            ) : (
              <p style={{margin: 0, color: "var(--ffn-text-soft)"}}>
                Aún no hay próximo evento cargado.
              </p>
            )}
          </article>
        </section>

        <section
          style={{
            display: "grid",
            gap: "24px",
            gridTemplateColumns: "1fr 1fr",
          }}
          className="ffn-home-mid-grid"
        >
          <article
            style={{
              display: "grid",
              gap: "14px",
              padding: "24px",
              borderRadius: "24px",
              border: "1px solid var(--ffn-border)",
              background: "var(--ffn-surface)",
              alignContent: "start",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <h2 style={{margin: 0, fontSize: "1.35rem"}}>Últimas noticias</h2>

              <Link
                href="/noticias"
                style={{
                  color: "var(--ffn-text-soft)",
                  textDecoration: "none",
                  fontSize: "0.95rem",
                }}
              >
                Ir a noticias
              </Link>
            </div>

            <div style={{display: "grid", gap: "12px"}}>
              {ultimasNoticias.length > 0 ? (
                ultimasNoticias.map((noticia) => (
                  <Link
                    key={noticia._id}
                    href={`/noticias/${noticia.slug}`}
                    style={{
                      display: "grid",
                      gap: "6px",
                      padding: "14px",
                      borderRadius: "18px",
                      border: "1px solid var(--ffn-border)",
                      background: "rgba(255,255,255,0.03)",
                      color: "inherit",
                      textDecoration: "none",
                    }}
                  >
                    <strong>{noticia.titulo}</strong>

                    {noticia.extracto && (
                      <span style={{color: "var(--ffn-text-soft)", lineHeight: 1.5}}>
                        {noticia.extracto}
                      </span>
                    )}

                    <span style={{color: "var(--ffn-text-muted)", fontSize: "0.9rem"}}>
                      {[formatDate(noticia.fechaPublicacion), getDisplayText(noticia.disciplina)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </Link>
                ))
              ) : (
                <p style={{margin: 0, color: "var(--ffn-text-soft)"}}>
                  Aún no hay noticias cargadas.
                </p>
              )}
            </div>
          </article>

          <article
            style={{
              display: "grid",
              gap: "14px",
              padding: "24px",
              borderRadius: "24px",
              border: "1px solid var(--ffn-border)",
              background: "var(--ffn-surface)",
              alignContent: "start",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <h2 style={{margin: 0, fontSize: "1.35rem"}}>Luchadores destacados</h2>

              <Link
                href="/luchadores"
                style={{
                  color: "var(--ffn-text-soft)",
                  textDecoration: "none",
                  fontSize: "0.95rem",
                }}
              >
                Ver roster
              </Link>
            </div>

            <div style={{display: "grid", gap: "12px"}}>
              {luchadoresDestacados.length > 0 ? (
                luchadoresDestacados.map((luchador) => (
                  <Link
                    key={luchador._id}
                    href={`/luchadores/${luchador.slug}`}
                    style={{
                      display: "grid",
                      gap: "6px",
                      padding: "14px",
                      borderRadius: "18px",
                      border: "1px solid var(--ffn-border)",
                      background: "rgba(255,255,255,0.03)",
                      color: "inherit",
                      textDecoration: "none",
                    }}
                  >
                    <strong>{luchador.nombre}</strong>

                    {luchador.apodo && (
                      <span style={{color: "var(--ffn-text-soft)"}}>
                        {luchador.apodo}
                      </span>
                    )}

                    <span style={{color: "var(--ffn-text-muted)", fontSize: "0.9rem"}}>
                      {[
                        getDisplayText(luchador.disciplina),
                        getDisplayText(luchador.categoriaPeso),
                        luchador.nacionalidad,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </Link>
                ))
              ) : (
                <p style={{margin: 0, color: "var(--ffn-text-soft)"}}>
                  Aún no hay luchadores destacados cargados.
                </p>
              )}
            </div>
          </article>
        </section>

        <section
          style={{
            display: "grid",
            gap: "24px",
            gridTemplateColumns: "1fr 1fr",
          }}
          className="ffn-home-bottom-grid"
        >
          <article
            style={{
              display: "grid",
              gap: "14px",
              padding: "24px",
              borderRadius: "24px",
              border: "1px solid var(--ffn-border)",
              background: "var(--ffn-surface)",
              alignContent: "start",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <h2 style={{margin: 0, fontSize: "1.35rem"}}>Disciplinas</h2>

              <Link
                href="/disciplinas"
                style={{
                  color: "var(--ffn-text-soft)",
                  textDecoration: "none",
                  fontSize: "0.95rem",
                }}
              >
                Ver todas
              </Link>
            </div>

            <div
              style={{
                display: "grid",
                gap: "12px",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              }}
            >
              {disciplinas.length > 0 ? (
                disciplinas.map((disciplina) => (
                  <Link
                    key={disciplina._id}
                    href={`/disciplinas/${disciplina.slug}`}
                    style={{
                      display: "grid",
                      gap: "6px",
                      padding: "14px",
                      borderRadius: "18px",
                      border: "1px solid var(--ffn-border)",
                      background: "rgba(255,255,255,0.03)",
                      color: "inherit",
                      textDecoration: "none",
                    }}
                  >
                    <strong>{disciplina.nombre}</strong>
                    {disciplina.descripcion && (
                      <span style={{color: "var(--ffn-text-soft)", lineHeight: 1.5}}>
                        {disciplina.descripcion}
                      </span>
                    )}
                  </Link>
                ))
              ) : (
                <p style={{margin: 0, color: "var(--ffn-text-soft)"}}>
                  Aún no hay disciplinas cargadas.
                </p>
              )}
            </div>
          </article>

          <article
            style={{
              display: "grid",
              gap: "14px",
              padding: "24px",
              borderRadius: "24px",
              border: "1px solid var(--ffn-border)",
              background: "var(--ffn-surface)",
              alignContent: "start",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <h2 style={{margin: 0, fontSize: "1.35rem"}}>Categorías de peso</h2>

              <Link
                href="/categorias-peso"
                style={{
                  color: "var(--ffn-text-soft)",
                  textDecoration: "none",
                  fontSize: "0.95rem",
                }}
              >
                Ver todas
              </Link>
            </div>

            <div style={{display: "grid", gap: "12px"}}>
              {categoriasPeso.length > 0 ? (
                categoriasPeso.map((categoria) => (
                  <Link
                    key={categoria._id}
                    href={`/categorias-peso/${categoria.slug}`}
                    style={{
                      display: "grid",
                      gap: "6px",
                      padding: "14px",
                      borderRadius: "18px",
                      border: "1px solid var(--ffn-border)",
                      background: "rgba(255,255,255,0.03)",
                      color: "inherit",
                      textDecoration: "none",
                    }}
                  >
                    <strong>{categoria.nombre}</strong>

                    <span style={{color: "var(--ffn-text-soft)"}}>
                      {[categoria.limitePeso, categoria.unidad].filter(Boolean).join(" ")}
                    </span>

                    {getDisplayText(categoria.disciplina) && (
                      <span style={{color: "var(--ffn-text-muted)", fontSize: "0.9rem"}}>
                        {getDisplayText(categoria.disciplina)}
                      </span>
                    )}
                  </Link>
                ))
              ) : (
                <p style={{margin: 0, color: "var(--ffn-text-soft)"}}>
                  Aún no hay categorías de peso cargadas.
                </p>
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}