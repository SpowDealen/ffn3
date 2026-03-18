import Link from "next/link";
import { client } from "../sanity/lib/client";
import {
  noticiaDestacadaQuery,
  ultimasNoticiasQuery,
  proximosEventosQuery,
  luchadoresDestacadosQuery,
  disciplinasHomeQuery,
  categoriasPesoHomeQuery,
} from "../sanity/lib/queries";

type RelacionBasica = {
  _id?: string;
  nombre?: string;
  slug?: string;
};

type Noticia = {
  _id: string;
  titulo: string;
  slug: string;
  extracto?: string;
  fechaPublicacion?: string;
  destacada?: boolean;
  disciplina?: string;
  disciplinaSlug?: string;
  eventoRelacionado?: string;
  eventoRelacionadoSlug?: string;
  organizacionRelacionada?: string;
  organizacionRelacionadaSlug?: string;
  luchadoresRelacionados?: RelacionBasica[];
};

type Evento = {
  _id: string;
  nombre: string;
  slug: string;
  fecha?: string;
  horaLocal?: string;
  ciudad?: string;
  pais?: string;
  recinto?: string;
  estado?: string;
  descripcionCorta?: string;
  organizacion?: string;
  organizacionSlug?: string;
  disciplina?: string;
  disciplinaSlug?: string;
};

type Luchador = {
  _id: string;
  nombre: string;
  slug: string;
  apodo?: string;
  record?: string;
  nacionalidad?: string;
  activo?: boolean;
  disciplina?: string;
  disciplinaSlug?: string;
  organizacion?: string;
  organizacionSlug?: string;
  categoriaPeso?: string;
  categoriaPesoSlug?: string;
};

type DisciplinaHome = {
  _id: string;
  nombre: string;
  slug: string;
  descripcion?: string;
};

type CategoriaPesoHome = {
  _id: string;
  nombre: string;
  slug: string;
  limitePeso?: number;
  unidad?: string;
  disciplina?: string;
  disciplinaSlug?: string;
};

function formatFecha(fecha?: string) {
  if (!fecha) return "Fecha por confirmar";

  const parsed = new Date(fecha);

  if (Number.isNaN(parsed.getTime())) return fecha;

  return parsed.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getUbicacion(evento: Evento) {
  const parts = [evento.ciudad, evento.pais].filter(Boolean);
  return parts.length ? parts.join(", ") : "Ubicación por confirmar";
}

export default async function HomePage() {
  const [
    noticiaDestacada,
    ultimasNoticias,
    proximosEventos,
    luchadoresDestacados,
    disciplinas,
    categoriasPeso,
  ] = await Promise.all([
    client.fetch<Noticia | null>(noticiaDestacadaQuery),
    client.fetch<Noticia[]>(ultimasNoticiasQuery),
    client.fetch<Evento[]>(proximosEventosQuery),
    client.fetch<Luchador[]>(luchadoresDestacadosQuery),
    client.fetch<DisciplinaHome[]>(disciplinasHomeQuery),
    client.fetch<CategoriaPesoHome[]>(categoriasPesoHomeQuery),
  ]);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px 20px 0",
        background: "var(--ffn-bg)",
        color: "var(--ffn-text)",
      }}
    >
      <div
        style={{
          maxWidth: "1440px",
          margin: "0 auto",
          display: "grid",
          gap: "28px",
        }}
      >
        {noticiaDestacada ? (
          <section
            style={{
              border: "1px solid var(--ffn-border)",
              background: "var(--ffn-surface)",
              borderRadius: "24px",
              padding: "28px",
              display: "grid",
              gap: "16px",
              boxShadow: "var(--ffn-shadow-soft)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                alignItems: "center",
              }}
            >
              <span className="ffn-pill">Noticia destacada</span>
              {noticiaDestacada.disciplina ? (
                <span className="ffn-pill-muted">{noticiaDestacada.disciplina}</span>
              ) : null}
              {noticiaDestacada.fechaPublicacion ? (
                <span className="ffn-pill-muted">
                  {formatFecha(noticiaDestacada.fechaPublicacion)}
                </span>
              ) : null}
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(2rem, 4vw, 3.4rem)",
                  lineHeight: 1.05,
                }}
              >
                {noticiaDestacada.titulo}
              </h1>

              {noticiaDestacada.extracto ? (
                <p
                  style={{
                    margin: 0,
                    color: "var(--ffn-text-soft)",
                    fontSize: "1.05rem",
                    lineHeight: 1.7,
                    maxWidth: "900px",
                  }}
                >
                  {noticiaDestacada.extracto}
                </p>
              ) : null}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              <Link href={`/noticias/${noticiaDestacada.slug}`} className="ffn-button-primary">
                Leer noticia
              </Link>

              {noticiaDestacada.eventoRelacionadoSlug ? (
                <Link
                  href={`/eventos/${noticiaDestacada.eventoRelacionadoSlug}`}
                  className="ffn-button-secondary"
                >
                  Ver evento relacionado
                </Link>
              ) : null}
            </div>
          </section>
        ) : null}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.5fr) minmax(320px, 0.9fr)",
            gap: "24px",
          }}
        >
          <div
            style={{
              border: "1px solid var(--ffn-border)",
              background: "var(--ffn-surface)",
              borderRadius: "24px",
              padding: "24px",
              display: "grid",
              gap: "18px",
              boxShadow: "var(--ffn-shadow-soft)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "grid", gap: "6px" }}>
                <span className="ffn-section-kicker">Cobertura</span>
                <h2 style={{ margin: 0, fontSize: "1.6rem" }}>Últimas noticias</h2>
              </div>

              <Link href="/noticias" className="ffn-inline-link">
                Ver todas
              </Link>
            </div>

            <div style={{ display: "grid", gap: "16px" }}>
              {ultimasNoticias.length ? (
                ultimasNoticias.map((noticia) => (
                  <Link
                    key={noticia._id}
                    href={`/noticias/${noticia.slug}`}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      border: "1px solid var(--ffn-border)",
                      background: "rgba(255,255,255,0.025)",
                      borderRadius: "18px",
                      padding: "18px",
                      display: "grid",
                      gap: "10px",
                      transition: "transform 0.18s ease, border-color 0.18s ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      {noticia.disciplina ? (
                        <span className="ffn-pill-muted">{noticia.disciplina}</span>
                      ) : null}
                      {noticia.fechaPublicacion ? (
                        <span className="ffn-pill-muted">
                          {formatFecha(noticia.fechaPublicacion)}
                        </span>
                      ) : null}
                    </div>

                    <h3 style={{ margin: 0, fontSize: "1.15rem", lineHeight: 1.35 }}>
                      {noticia.titulo}
                    </h3>

                    {noticia.extracto ? (
                      <p
                        style={{
                          margin: 0,
                          color: "var(--ffn-text-soft)",
                          lineHeight: 1.65,
                        }}
                      >
                        {noticia.extracto}
                      </p>
                    ) : null}
                  </Link>
                ))
              ) : (
                <div className="ffn-empty-state">Todavía no hay noticias publicadas.</div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: "24px", gridTemplateRows: "1fr 1fr" }}>
            <section
              style={{
                border: "1px solid var(--ffn-border)",
                background: "var(--ffn-surface)",
                borderRadius: "24px",
                padding: "24px",
                display: "grid",
                gap: "18px",
                boxShadow: "var(--ffn-shadow-soft)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "grid", gap: "6px" }}>
                  <span className="ffn-section-kicker">Calendario</span>
                  <h2 style={{ margin: 0, fontSize: "1.35rem" }}>Próximos eventos</h2>
                </div>

                <Link href="/eventos" className="ffn-inline-link">
                  Ver todos
                </Link>
              </div>

              <div style={{ display: "grid", gap: "12px" }}>
                {proximosEventos.length ? (
                  proximosEventos.map((evento) => (
                    <Link
                      key={evento._id}
                      href={`/eventos/${evento.slug}`}
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                        border: "1px solid var(--ffn-border)",
                        background: "rgba(255,255,255,0.025)",
                        borderRadius: "18px",
                        padding: "16px",
                        display: "grid",
                        gap: "8px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "8px",
                          alignItems: "center",
                        }}
                      >
                        {evento.organizacion ? (
                          <span className="ffn-pill">{evento.organizacion}</span>
                        ) : null}
                        {evento.fecha ? (
                          <span className="ffn-pill-muted">{formatFecha(evento.fecha)}</span>
                        ) : null}
                      </div>

                      <h3 style={{ margin: 0, fontSize: "1rem", lineHeight: 1.35 }}>
                        {evento.nombre}
                      </h3>

                      <p
                        style={{
                          margin: 0,
                          color: "var(--ffn-text-soft)",
                          fontSize: "0.96rem",
                          lineHeight: 1.55,
                        }}
                      >
                        {getUbicacion(evento)}
                        {evento.horaLocal ? ` · ${evento.horaLocal}` : ""}
                      </p>
                    </Link>
                  ))
                ) : (
                  <div className="ffn-empty-state">
                    No hay próximos eventos cargados por ahora.
                  </div>
                )}
              </div>
            </section>

            <section
              style={{
                border: "1px solid var(--ffn-border)",
                background: "var(--ffn-surface)",
                borderRadius: "24px",
                padding: "24px",
                display: "grid",
                gap: "18px",
                boxShadow: "var(--ffn-shadow-soft)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "grid", gap: "6px" }}>
                  <span className="ffn-section-kicker">Enfoque editorial</span>
                  <h2 style={{ margin: 0, fontSize: "1.35rem" }}>Luchadores destacados</h2>
                </div>

                <Link href="/luchadores" className="ffn-inline-link">
                  Ver todos
                </Link>
              </div>

              <div style={{ display: "grid", gap: "12px" }}>
                {luchadoresDestacados.length ? (
                  luchadoresDestacados.map((luchador) => (
                    <Link
                      key={luchador._id}
                      href={`/luchadores/${luchador.slug}`}
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                        border: "1px solid var(--ffn-border)",
                        background: "rgba(255,255,255,0.025)",
                        borderRadius: "18px",
                        padding: "16px",
                        display: "grid",
                        gap: "8px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "8px",
                          alignItems: "center",
                        }}
                      >
                        {luchador.organizacion ? (
                          <span className="ffn-pill">{luchador.organizacion}</span>
                        ) : null}
                        {luchador.categoriaPeso ? (
                          <span className="ffn-pill-muted">{luchador.categoriaPeso}</span>
                        ) : null}
                      </div>

                      <h3 style={{ margin: 0, fontSize: "1rem", lineHeight: 1.35 }}>
                        {luchador.nombre}
                        {luchador.apodo ? ` “${luchador.apodo}”` : ""}
                      </h3>

                      <p
                        style={{
                          margin: 0,
                          color: "var(--ffn-text-soft)",
                          fontSize: "0.96rem",
                          lineHeight: 1.55,
                        }}
                      >
                        {luchador.record || "Récord por actualizar"}
                        {luchador.nacionalidad ? ` · ${luchador.nacionalidad}` : ""}
                      </p>
                    </Link>
                  ))
                ) : (
                  <div className="ffn-empty-state">
                    Marca luchadores en Sanity con “Destacado en inicio” para que aparezcan aquí.
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: "24px",
          }}
        >
          <div
            style={{
              border: "1px solid var(--ffn-border)",
              background: "var(--ffn-surface)",
              borderRadius: "24px",
              padding: "24px",
              display: "grid",
              gap: "18px",
              boxShadow: "var(--ffn-shadow-soft)",
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
              <span className="ffn-section-kicker">Cobertura por deporte</span>
              <h2 style={{ margin: 0, fontSize: "1.45rem" }}>Disciplinas</h2>
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              {disciplinas.length ? (
                disciplinas.map((disciplina) => (
                  <Link
                    key={disciplina._id}
                    href={`/disciplinas/${disciplina.slug}`}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      border: "1px solid var(--ffn-border)",
                      background: "rgba(255,255,255,0.025)",
                      borderRadius: "18px",
                      padding: "16px",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: "1rem" }}>{disciplina.nombre}</h3>
                    {disciplina.descripcion ? (
                      <p
                        style={{
                          margin: 0,
                          color: "var(--ffn-text-soft)",
                          lineHeight: 1.6,
                        }}
                      >
                        {disciplina.descripcion}
                      </p>
                    ) : null}
                  </Link>
                ))
              ) : (
                <div className="ffn-empty-state">No hay disciplinas cargadas todavía.</div>
              )}
            </div>
          </div>

          <div
            style={{
              border: "1px solid var(--ffn-border)",
              background: "var(--ffn-surface)",
              borderRadius: "24px",
              padding: "24px",
              display: "grid",
              gap: "18px",
              boxShadow: "var(--ffn-shadow-soft)",
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
              <span className="ffn-section-kicker">Mapa competitivo</span>
              <h2 style={{ margin: 0, fontSize: "1.45rem" }}>Categorías de peso</h2>
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              {categoriasPeso.length ? (
                categoriasPeso.map((categoria) => (
                  <Link
                    key={categoria._id}
                    href={`/categorias-peso/${categoria.slug}`}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      border: "1px solid var(--ffn-border)",
                      background: "rgba(255,255,255,0.025)",
                      borderRadius: "18px",
                      padding: "16px",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      <h3 style={{ margin: 0, fontSize: "1rem" }}>{categoria.nombre}</h3>
                      {categoria.limitePeso ? (
                        <span className="ffn-pill-muted">
                          {categoria.limitePeso} {categoria.unidad || "lb"}
                        </span>
                      ) : null}
                    </div>

                    {categoria.disciplina ? (
                      <p
                        style={{
                          margin: 0,
                          color: "var(--ffn-text-soft)",
                          lineHeight: 1.6,
                        }}
                      >
                        {categoria.disciplina}
                      </p>
                    ) : null}
                  </Link>
                ))
              ) : (
                <div className="ffn-empty-state">
                  No hay categorías de peso cargadas todavía.
                </div>
              )}
            </div>
          </div>
        </section>

        <footer
          style={{
            marginTop: "8px",
            borderTop: "1px solid var(--ffn-border)",
            padding: "32px 0 40px",
          }}
        >
          <div
            style={{
              display: "grid",
              gap: "16px",
              maxWidth: "1440px",
              margin: "0 auto",
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
              <span className="ffn-section-kicker">Full Fight News</span>
              <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Contacto y presencia</h2>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "16px",
              }}
            >
              <div className="ffn-footer-card">
                <h3 style={{ margin: 0, fontSize: "1rem" }}>Redacción</h3>
                <p style={{ margin: 0, color: "var(--ffn-text-soft)", lineHeight: 1.65 }}>
                  Espacio reservado para correo editorial, contacto profesional y consultas de
                  prensa.
                </p>
              </div>

              <div className="ffn-footer-card">
                <h3 style={{ margin: 0, fontSize: "1rem" }}>Redes y comunidad</h3>
                <p style={{ margin: 0, color: "var(--ffn-text-soft)", lineHeight: 1.65 }}>
                  Espacio reservado para Instagram, futuras redes oficiales y vías de difusión del
                  proyecto.
                </p>
              </div>

              <div className="ffn-footer-card">
                <h3 style={{ margin: 0, fontSize: "1rem" }}>Colaboraciones</h3>
                <p style={{ margin: 0, color: "var(--ffn-text-soft)", lineHeight: 1.65 }}>
                  Espacio reservado para patrocinio, colaboraciones editoriales y oportunidades
                  comerciales.
                </p>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}