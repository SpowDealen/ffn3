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
  _id?: string;
  titulo?: string;
  slug?: string;
  extracto?: string;
  fechaPublicacion?: string;
  destacada?: boolean;
  disciplina?: string;
  disciplinaSlug?: string;
  eventoRelacionado?: string;
  eventoRelacionadoSlug?: string;
  organizacionRelacionada?: string;
  organizacionRelacionadaSlug?: string;
  luchadoresRelacionados?: RelacionBasica[] | null;
};

type Evento = {
  _id?: string;
  nombre?: string;
  slug?: string;
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
  _id?: string;
  nombre?: string;
  slug?: string;
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
  _id?: string;
  nombre?: string;
  slug?: string;
  descripcion?: string;
};

type CategoriaPesoHome = {
  _id?: string;
  nombre?: string;
  slug?: string;
  limitePeso?: number;
  unidad?: string;
  disciplina?: string;
  disciplinaSlug?: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function safeText(value: unknown, fallback = ""): string {
  return isNonEmptyString(value) ? value.trim() : fallback;
}

function formatFecha(fecha?: string) {
  if (!isNonEmptyString(fecha)) return "Fecha por confirmar";

  const parsed = new Date(fecha);

  if (Number.isNaN(parsed.getTime())) return fecha;

  return parsed.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getUbicacion(evento: Evento) {
  const parts = [safeText(evento.ciudad), safeText(evento.pais)].filter(Boolean);
  return parts.length ? parts.join(", ") : "Ubicación por confirmar";
}

export default async function HomePage() {
  const [
    noticiaDestacadaRaw,
    ultimasNoticiasRaw,
    proximosEventosRaw,
    luchadoresDestacadosRaw,
    disciplinasRaw,
    categoriasPesoRaw,
  ] = await Promise.all([
    client.fetch<Noticia | null>(noticiaDestacadaQuery),
    client.fetch<Noticia[] | null>(ultimasNoticiasQuery),
    client.fetch<Evento[] | null>(proximosEventosQuery),
    client.fetch<Luchador[] | null>(luchadoresDestacadosQuery),
    client.fetch<DisciplinaHome[] | null>(disciplinasHomeQuery),
    client.fetch<CategoriaPesoHome[] | null>(categoriasPesoHomeQuery),
  ]);

  const noticiaDestacada =
    noticiaDestacadaRaw &&
    isNonEmptyString(noticiaDestacadaRaw.titulo) &&
    isNonEmptyString(noticiaDestacadaRaw.slug)
      ? {
          ...noticiaDestacadaRaw,
          titulo: safeText(noticiaDestacadaRaw.titulo),
          slug: safeText(noticiaDestacadaRaw.slug),
          extracto: safeText(noticiaDestacadaRaw.extracto),
          disciplina: safeText(noticiaDestacadaRaw.disciplina),
          eventoRelacionado: safeText(noticiaDestacadaRaw.eventoRelacionado),
          eventoRelacionadoSlug: safeText(noticiaDestacadaRaw.eventoRelacionadoSlug),
          organizacionRelacionada: safeText(noticiaDestacadaRaw.organizacionRelacionada),
          organizacionRelacionadaSlug: safeText(noticiaDestacadaRaw.organizacionRelacionadaSlug),
          luchadoresRelacionados: safeArray(noticiaDestacadaRaw.luchadoresRelacionados),
        }
      : null;

  const ultimasNoticias = safeArray(ultimasNoticiasRaw).filter(
    (noticia): noticia is Noticia =>
      isNonEmptyString(noticia?._id) &&
      isNonEmptyString(noticia?.titulo) &&
      isNonEmptyString(noticia?.slug)
  );

  const proximosEventos = safeArray(proximosEventosRaw).filter(
    (evento): evento is Evento =>
      isNonEmptyString(evento?._id) &&
      isNonEmptyString(evento?.nombre) &&
      isNonEmptyString(evento?.slug)
  );

  const luchadoresDestacados = safeArray(luchadoresDestacadosRaw).filter(
    (luchador): luchador is Luchador =>
      isNonEmptyString(luchador?._id) &&
      isNonEmptyString(luchador?.nombre) &&
      isNonEmptyString(luchador?.slug)
  );

  const disciplinas = safeArray(disciplinasRaw).filter(
    (disciplina): disciplina is DisciplinaHome =>
      isNonEmptyString(disciplina?._id) &&
      isNonEmptyString(disciplina?.nombre) &&
      isNonEmptyString(disciplina?.slug)
  );

  const categoriasPeso = safeArray(categoriasPesoRaw).filter(
    (categoria): categoria is CategoriaPesoHome =>
      isNonEmptyString(categoria?._id) &&
      isNonEmptyString(categoria?.nombre) &&
      isNonEmptyString(categoria?.slug)
  );

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
              {isNonEmptyString(noticiaDestacada.disciplina) ? (
                <span className="ffn-pill-muted">{noticiaDestacada.disciplina}</span>
              ) : null}
              {isNonEmptyString(noticiaDestacada.fechaPublicacion) ? (
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
                {safeText(noticiaDestacada.titulo)}
              </h1>

              {isNonEmptyString(noticiaDestacada.extracto) ? (
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

              {isNonEmptyString(noticiaDestacada.eventoRelacionadoSlug) ? (
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
                      {isNonEmptyString(noticia.disciplina) ? (
                        <span className="ffn-pill-muted">{noticia.disciplina}</span>
                      ) : null}
                      {isNonEmptyString(noticia.fechaPublicacion) ? (
                        <span className="ffn-pill-muted">
                          {formatFecha(noticia.fechaPublicacion)}
                        </span>
                      ) : null}
                    </div>

                    <h3 style={{ margin: 0, fontSize: "1.15rem", lineHeight: 1.35 }}>
                      {safeText(noticia.titulo)}
                    </h3>

                    {isNonEmptyString(noticia.extracto) ? (
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
                        {isNonEmptyString(evento.organizacion) ? (
                          <span className="ffn-pill">{evento.organizacion}</span>
                        ) : null}
                        {isNonEmptyString(evento.fecha) ? (
                          <span className="ffn-pill-muted">{formatFecha(evento.fecha)}</span>
                        ) : null}
                      </div>

                      <h3 style={{ margin: 0, fontSize: "1rem", lineHeight: 1.35 }}>
                        {safeText(evento.nombre)}
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
                        {isNonEmptyString(evento.horaLocal) ? ` · ${evento.horaLocal}` : ""}
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
                        {isNonEmptyString(luchador.organizacion) ? (
                          <span className="ffn-pill">{luchador.organizacion}</span>
                        ) : null}
                        {isNonEmptyString(luchador.categoriaPeso) ? (
                          <span className="ffn-pill-muted">{luchador.categoriaPeso}</span>
                        ) : null}
                      </div>

                      <h3 style={{ margin: 0, fontSize: "1rem", lineHeight: 1.35 }}>
                        {safeText(luchador.nombre)}
                        {isNonEmptyString(luchador.apodo) ? ` “${luchador.apodo}”` : ""}
                      </h3>

                      <p
                        style={{
                          margin: 0,
                          color: "var(--ffn-text-soft)",
                          fontSize: "0.96rem",
                          lineHeight: 1.55,
                        }}
                      >
                        {safeText(luchador.record, "Récord por actualizar")}
                        {isNonEmptyString(luchador.nacionalidad)
                          ? ` · ${luchador.nacionalidad}`
                          : ""}
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
                    <h3 style={{ margin: 0, fontSize: "1rem" }}>{safeText(disciplina.nombre)}</h3>
                    {isNonEmptyString(disciplina.descripcion) ? (
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
                      <h3 style={{ margin: 0, fontSize: "1rem" }}>{safeText(categoria.nombre)}</h3>
                      {typeof categoria.limitePeso === "number" ? (
                        <span className="ffn-pill-muted">
                          {categoria.limitePeso} {safeText(categoria.unidad, "lb")}
                        </span>
                      ) : null}
                    </div>

                    {isNonEmptyString(categoria.disciplina) ? (
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