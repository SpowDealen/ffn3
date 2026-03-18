import Link from "next/link";
import { notFound } from "next/navigation";
import { client } from "../../../sanity/lib/client";
import { eventoPorSlugQuery } from "../../../sanity/lib/queries";

type SluggedEntity = {
  _id?: string;
  nombre?: string;
  slug?: string;
  apodo?: string;
  imagen?: unknown;
};

type EventoOrganizacion = {
  _id?: string;
  nombre?: string;
  slug?: string;
  logo?: unknown;
  sitioWeb?: string;
};

type EventoDisciplina = {
  _id?: string;
  nombre?: string;
  slug?: string;
};

type Combate = {
  _id: string;
  metodo?: string;
  asalto?: number;
  tiempo?: string;
  tituloEnJuego?: boolean;
  cartelera?: string;
  orden?: number;
  estado?: string;
  resumen?: string;
  desarrollo?: string;
  momentoClave?: string;
  consecuencia?: string;
  luchadorRojo?: SluggedEntity | string;
  luchadorRojoSlug?: string;
  luchadorAzul?: SluggedEntity | string;
  luchadorAzulSlug?: string;
  ganador?: SluggedEntity | string;
  ganadorSlug?: string;
  categoriaPeso?: string;
  categoriaPesoSlug?: string;
};

type Noticia = {
  _id: string;
  titulo: string;
  slug: string;
  extracto?: string;
  fechaPublicacion?: string;
  destacada?: boolean;
  disciplina?: string;
  eventoRelacionado?: string;
  luchadoresRelacionados?: string[];
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
  cartelPrincipal?: string;
  estado?: string;
  descripcionCorta?: string;
  descripcion?: string;
  dondeVer?: string;
  notas?: string;
  organizacion?: EventoOrganizacion | string;
  organizacionSlug?: string;
  disciplina?: EventoDisciplina | string;
  disciplinaSlug?: string;
  combates?: Combate[];
  noticiasRelacionadas?: Noticia[];
};

type Protagonista = {
  nombre: string;
  slug?: string;
};

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function getEntityName(
  value?: SluggedEntity | EventoOrganizacion | EventoDisciplina | string | null
): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.nombre || "";
}

function getEntitySlug(
  value?: SluggedEntity | EventoOrganizacion | EventoDisciplina | string | null
): string | undefined {
  if (!value || typeof value === "string") return undefined;
  return value.slug || undefined;
}

function formatDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatEstado(value?: string): string {
  if (!value) return "";
  if (value === "proximo") return "Próximo";
  if (value === "celebrado") return "Celebrado";
  if (value === "cancelado") return "Cancelado";
  if (value === "programado") return "Programado";
  if (value === "finalizado") return "Finalizado";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatCartelera(value?: string): string {
  if (!value) return "";
  if (value === "principal") return "Cartelera principal";
  if (value === "preliminar") return "Cartelera preliminar";
  return value;
}

export default async function EventoDetallePage({ params }: PageProps) {
  const { slug } = await params;

  const evento: Evento | null = await client.fetch(eventoPorSlugQuery, { slug });

  if (!evento) {
    notFound();
  }

  const combates = Array.isArray(evento.combates) ? evento.combates : [];
  const noticias = Array.isArray(evento.noticiasRelacionadas)
    ? evento.noticiasRelacionadas
    : [];

  const organizacionNombre = getEntityName(evento.organizacion);
  const organizacionSlug =
    getEntitySlug(evento.organizacion) || evento.organizacionSlug;

  const disciplinaNombre = getEntityName(evento.disciplina);
  const disciplinaSlug =
    getEntitySlug(evento.disciplina) || evento.disciplinaSlug;

  const protagonistasMap = new Map<string, Protagonista>();

  for (const combate of combates) {
    const luchadorRojoNombre = getEntityName(combate.luchadorRojo);
    const luchadorRojoSlug =
      getEntitySlug(combate.luchadorRojo) || combate.luchadorRojoSlug;

    if (luchadorRojoNombre) {
      protagonistasMap.set(luchadorRojoNombre, {
        nombre: luchadorRojoNombre,
        slug: luchadorRojoSlug,
      });
    }

    const luchadorAzulNombre = getEntityName(combate.luchadorAzul);
    const luchadorAzulSlug =
      getEntitySlug(combate.luchadorAzul) || combate.luchadorAzulSlug;

    if (luchadorAzulNombre) {
      protagonistasMap.set(luchadorAzulNombre, {
        nombre: luchadorAzulNombre,
        slug: luchadorAzulSlug,
      });
    }
  }

  const protagonistas = Array.from(protagonistasMap.values());

  return (
    <main className="evento-detalle-shell">
      <style>{`
        .evento-detalle-shell {
          min-height: 100vh;
          color: var(--ffn-text, white);
          padding: 56px 28px 80px;
          box-sizing: border-box;
        }

        .evento-detalle-container {
          max-width: 1180px;
          margin: 0 auto;
        }

        .evento-detalle-hero {
          margin-bottom: 34px;
        }

        .evento-detalle-eyebrow {
          color: var(--ffn-text-muted, #8f8f8f);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin: 0 0 12px 0;
        }

        .evento-detalle-title {
          font-size: clamp(2.35rem, 6vw, 3.7rem);
          line-height: 1.02;
          margin: 0 0 16px 0;
          letter-spacing: -2px;
          max-width: 980px;
          word-break: break-word;
        }

        .evento-detalle-cartel {
          color: var(--ffn-accent, #f5c542);
          font-size: clamp(1.08rem, 2.6vw, 1.45rem);
          line-height: 1.45;
          margin: 0 0 14px 0;
          word-break: break-word;
        }

        .evento-detalle-lead {
          color: var(--ffn-text-soft, #b9b9b9);
          font-size: clamp(1rem, 2vw, 1.18rem);
          line-height: 1.8;
          margin: 0;
          max-width: 940px;
        }

        .evento-detalle-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 42px;
          padding-bottom: 24px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        .evento-detalle-meta-pill {
          display: inline-flex;
          align-items: center;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          color: #c9c9c9;
          font-size: 13px;
          line-height: 1.4;
        }

        .evento-detalle-meta-pill a {
          color: inherit;
          text-decoration: none;
        }

        .evento-detalle-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.95fr);
          gap: 22px;
          align-items: start;
          margin-bottom: 56px;
        }

        .evento-detalle-panel {
          background:
            linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.02) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 12px 30px rgba(0,0,0,0.18);
          min-width: 0;
          box-sizing: border-box;
        }

        .evento-detalle-panel-title {
          margin: 0 0 14px 0;
          font-size: 1.05rem;
          line-height: 1.2;
          letter-spacing: -0.3px;
        }

        .evento-detalle-panel-text {
          margin: 0;
          color: var(--ffn-text-soft, #b9b9b9);
          line-height: 1.82;
          font-size: 15px;
          white-space: pre-line;
        }

        .evento-detalle-info-list {
          display: grid;
          gap: 12px;
          margin: 0;
        }

        .evento-detalle-info-item {
          margin: 0;
          color: var(--ffn-text-soft, #b9b9b9);
          line-height: 1.65;
          font-size: 15px;
          word-break: break-word;
        }

        .evento-detalle-info-item strong {
          color: white;
          font-weight: 600;
        }

        .evento-detalle-section {
          margin-bottom: 56px;
        }

        .evento-detalle-section:last-child {
          margin-bottom: 0;
        }

        .evento-detalle-section-title {
          font-size: clamp(1.8rem, 3.8vw, 2.25rem);
          margin: 0 0 22px 0;
          letter-spacing: -0.8px;
          line-height: 1.12;
        }

        .evento-detalle-empty {
          color: #888;
          margin: 0;
          line-height: 1.7;
        }

        .evento-detalle-grid-protagonistas,
        .evento-detalle-grid-noticias {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .evento-detalle-grid-combates {
          display: grid;
          gap: 18px;
        }

        .evento-detalle-link {
          text-decoration: none;
          color: inherit;
          min-width: 0;
          display: block;
        }

        .evento-detalle-card {
          height: 100%;
          display: flex;
          flex-direction: column;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          padding: 24px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
          box-sizing: border-box;
          min-width: 0;
        }

        .evento-detalle-link:hover .evento-detalle-card,
        .evento-detalle-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.14);
          box-shadow: 0 14px 34px rgba(0,0,0,0.26);
        }

        .evento-detalle-card-label {
          color: #8f8f8f;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 10px 0;
        }

        .evento-detalle-card-badge {
          color: var(--ffn-accent, #f5c542);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 12px 0;
        }

        .evento-detalle-card-title {
          font-size: clamp(1.35rem, 2.4vw, 1.72rem);
          line-height: 1.2;
          margin: 0 0 12px 0;
          letter-spacing: -0.5px;
          word-break: break-word;
        }

        .evento-detalle-card-subtitle {
          color: var(--ffn-accent, #f5c542);
          margin: 0 0 14px 0;
          font-size: clamp(1rem, 1.8vw, 1.05rem);
          line-height: 1.5;
          word-break: break-word;
        }

        .evento-detalle-card-text {
          color: var(--ffn-text-soft, #b9b9b9);
          font-size: 15px;
          line-height: 1.75;
          margin: 0 0 18px 0;
          word-break: break-word;
          white-space: pre-line;
        }

        .evento-detalle-card-data {
          display: grid;
          gap: 8px;
          color: #c3c3c3;
          font-size: 15px;
          line-height: 1.65;
          min-width: 0;
        }

        .evento-detalle-card-data p {
          margin: 0;
          word-break: break-word;
        }

        .evento-detalle-card-data--muted {
          color: #888;
          font-size: 14px;
        }

        .evento-detalle-fighter-links {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 18px;
        }

        .evento-detalle-fighter-link,
        .evento-detalle-result-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 40px;
          padding: 0 14px;
          border-radius: 999px;
          text-decoration: none;
          font-size: 13px;
          line-height: 1;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }

        .evento-detalle-fighter-link {
          color: white;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
        }

        .evento-detalle-result-link {
          color: var(--ffn-accent, #f5c542);
          border: 1px solid rgba(245,197,66,0.22);
          background: rgba(245,197,66,0.06);
        }

        .evento-detalle-fighter-link:hover,
        .evento-detalle-result-link:hover {
          transform: translateY(-1px);
        }

        .evento-detalle-cta {
          color: var(--ffn-accent, #f5c542);
          font-size: 14px;
          line-height: 1.4;
          margin: auto 0 0 0;
          padding-top: 18px;
        }

        @media (max-width: 1100px) {
          .evento-detalle-layout {
            grid-template-columns: minmax(0, 1fr);
          }

          .evento-detalle-grid-protagonistas,
          .evento-detalle-grid-noticias {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 900px) {
          .evento-detalle-shell {
            padding: 36px 18px 56px;
          }

          .evento-detalle-meta {
            margin-bottom: 30px;
          }

          .evento-detalle-section {
            margin-bottom: 42px;
          }

          .evento-detalle-panel,
          .evento-detalle-card {
            padding: 22px;
          }
        }

        @media (max-width: 640px) {
          .evento-detalle-shell {
            padding: 24px 14px 40px;
          }

          .evento-detalle-meta {
            gap: 10px;
            margin-bottom: 24px;
            padding-bottom: 18px;
          }

          .evento-detalle-meta-pill {
            padding: 9px 12px;
            font-size: 12px;
          }

          .evento-detalle-section {
            margin-bottom: 34px;
          }

          .evento-detalle-grid-protagonistas,
          .evento-detalle-grid-noticias {
            grid-template-columns: minmax(0, 1fr);
            gap: 16px;
          }

          .evento-detalle-grid-combates {
            gap: 16px;
          }

          .evento-detalle-panel,
          .evento-detalle-card {
            padding: 18px;
            border-radius: 16px;
          }

          .evento-detalle-card-text,
          .evento-detalle-card-data,
          .evento-detalle-panel-text,
          .evento-detalle-info-item {
            font-size: 14px;
          }

          .evento-detalle-card-data--muted {
            font-size: 13px;
          }

          .evento-detalle-fighter-links {
            flex-direction: column;
          }

          .evento-detalle-fighter-link,
          .evento-detalle-result-link {
            width: 100%;
          }

          .evento-detalle-cta {
            padding-top: 16px;
          }
        }
      `}</style>

      <section className="evento-detalle-container">
        <header className="evento-detalle-hero">
          <p className="evento-detalle-eyebrow">Evento</p>

          <h1 className="evento-detalle-title">{evento.nombre}</h1>

          {evento.cartelPrincipal && (
            <p className="evento-detalle-cartel">{evento.cartelPrincipal}</p>
          )}

          {(evento.descripcionCorta || evento.descripcion) && (
            <p className="evento-detalle-lead">
              {evento.descripcionCorta || evento.descripcion}
            </p>
          )}
        </header>

        <div className="evento-detalle-meta">
          {organizacionNombre && (
            <span className="evento-detalle-meta-pill">
              Organización:{" "}
              {organizacionSlug ? (
                <Link href={`/organizaciones/${organizacionSlug}`}>
                  {organizacionNombre}
                </Link>
              ) : (
                organizacionNombre
              )}
            </span>
          )}

          {disciplinaNombre && (
            <span className="evento-detalle-meta-pill">
              Disciplina:{" "}
              {disciplinaSlug ? (
                <Link href={`/disciplinas/${disciplinaSlug}`}>
                  {disciplinaNombre}
                </Link>
              ) : (
                disciplinaNombre
              )}
            </span>
          )}

          {evento.estado && (
            <span className="evento-detalle-meta-pill">
              Estado: {formatEstado(evento.estado)}
            </span>
          )}

          {evento.fecha && (
            <span className="evento-detalle-meta-pill">
              Fecha: {formatDate(evento.fecha)}
            </span>
          )}

          {evento.horaLocal && (
            <span className="evento-detalle-meta-pill">
              Hora: {evento.horaLocal}
            </span>
          )}

          {(evento.ciudad || evento.pais) && (
            <span className="evento-detalle-meta-pill">
              Lugar: {[evento.ciudad, evento.pais].filter(Boolean).join(", ")}
            </span>
          )}

          {evento.recinto && (
            <span className="evento-detalle-meta-pill">
              Recinto: {evento.recinto}
            </span>
          )}

          {evento.dondeVer && (
            <span className="evento-detalle-meta-pill">
              Dónde verlo: {evento.dondeVer}
            </span>
          )}
        </div>

        <section className="evento-detalle-layout">
          <article className="evento-detalle-panel">
            <h2 className="evento-detalle-panel-title">Sobre el evento</h2>
            <p className="evento-detalle-panel-text">
              {evento.descripcion ||
                "Este evento todavía no tiene una descripción editorial desarrollada."}
            </p>
          </article>

          <aside className="evento-detalle-panel">
            <h2 className="evento-detalle-panel-title">Ficha rápida</h2>

            <div className="evento-detalle-info-list">
              {evento.fecha && (
                <p className="evento-detalle-info-item">
                  <strong>Fecha:</strong> {formatDate(evento.fecha)}
                </p>
              )}

              {evento.horaLocal && (
                <p className="evento-detalle-info-item">
                  <strong>Hora:</strong> {evento.horaLocal}
                </p>
              )}

              {(evento.ciudad || evento.pais) && (
                <p className="evento-detalle-info-item">
                  <strong>Ubicación:</strong>{" "}
                  {[evento.ciudad, evento.pais].filter(Boolean).join(", ")}
                </p>
              )}

              {evento.recinto && (
                <p className="evento-detalle-info-item">
                  <strong>Recinto:</strong> {evento.recinto}
                </p>
              )}

              {evento.cartelPrincipal && (
                <p className="evento-detalle-info-item">
                  <strong>Pelea principal:</strong> {evento.cartelPrincipal}
                </p>
              )}

              {evento.dondeVer && (
                <p className="evento-detalle-info-item">
                  <strong>Dónde verlo:</strong> {evento.dondeVer}
                </p>
              )}

              {evento.estado && (
                <p className="evento-detalle-info-item">
                  <strong>Estado:</strong> {formatEstado(evento.estado)}
                </p>
              )}

              {evento.notas && (
                <p className="evento-detalle-info-item">
                  <strong>Notas:</strong> {evento.notas}
                </p>
              )}
            </div>
          </aside>
        </section>

        <section className="evento-detalle-section">
          <h2 className="evento-detalle-section-title">Protagonistas del evento</h2>

          {protagonistas.length === 0 ? (
            <p className="evento-detalle-empty">
              Todavía no hay protagonistas asociados a este evento.
            </p>
          ) : (
            <div className="evento-detalle-grid-protagonistas">
              {protagonistas.map((protagonista) => {
                const contenido = (
                  <article className="evento-detalle-card">
                    <p className="evento-detalle-card-label">Luchador</p>

                    <h3 className="evento-detalle-card-title">{protagonista.nombre}</h3>

                    <p className="evento-detalle-card-text">
                      Presente en la cartelera de {evento.nombre}.
                    </p>

                    <p className="evento-detalle-cta">Ver perfil del luchador</p>
                  </article>
                );

                if (!protagonista.slug) {
                  return <div key={protagonista.nombre}>{contenido}</div>;
                }

                return (
                  <Link
                    key={protagonista.nombre}
                    href={`/luchadores/${protagonista.slug}`}
                    className="evento-detalle-link"
                  >
                    {contenido}
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="evento-detalle-section">
          <h2 className="evento-detalle-section-title">Cartelera completa</h2>

          {combates.length === 0 ? (
            <p className="evento-detalle-empty">
              Todavía no hay combates asociados a este evento.
            </p>
          ) : (
            <div className="evento-detalle-grid-combates">
              {combates.map((combate) => {
                const luchadorRojoNombre =
                  getEntityName(combate.luchadorRojo) || "Luchador rojo";
                const luchadorRojoSlug =
                  getEntitySlug(combate.luchadorRojo) || combate.luchadorRojoSlug;

                const luchadorAzulNombre =
                  getEntityName(combate.luchadorAzul) || "Luchador azul";
                const luchadorAzulSlug =
                  getEntitySlug(combate.luchadorAzul) || combate.luchadorAzulSlug;

                const ganadorNombre = getEntityName(combate.ganador);
                const ganadorSlug =
                  getEntitySlug(combate.ganador) || combate.ganadorSlug;

                return (
                  <article key={combate._id} className="evento-detalle-card">
                    <p className="evento-detalle-card-label">
                      {formatCartelera(combate.cartelera)}
                      {typeof combate.orden === "number" ? ` · Orden ${combate.orden}` : ""}
                    </p>

                    <h3 className="evento-detalle-card-title">
                      {luchadorRojoNombre} vs {luchadorAzulNombre}
                    </h3>

                    {ganadorNombre && (
                      <p className="evento-detalle-card-subtitle">
                        Ganador: {ganadorNombre}
                      </p>
                    )}

                    {combate.resumen && (
                      <p className="evento-detalle-card-text">{combate.resumen}</p>
                    )}

                    <div className="evento-detalle-card-data">
                      {combate.categoriaPeso && <p>Categoría: {combate.categoriaPeso}</p>}
                      {combate.estado && <p>Estado: {formatEstado(combate.estado)}</p>}
                      {combate.metodo && <p>Método: {combate.metodo}</p>}
                      {typeof combate.asalto === "number" && (
                        <p>Asalto final: {combate.asalto}</p>
                      )}
                      {combate.tiempo && <p>Tiempo final: {combate.tiempo}</p>}
                      {combate.tituloEnJuego && <p>Título en juego</p>}
                      {combate.momentoClave && <p>Momento clave: {combate.momentoClave}</p>}
                      {combate.consecuencia && <p>Consecuencia: {combate.consecuencia}</p>}
                    </div>

                    <div className="evento-detalle-fighter-links">
                      {luchadorRojoSlug && (
                        <Link
                          href={`/luchadores/${luchadorRojoSlug}`}
                          className="evento-detalle-fighter-link"
                        >
                          Ver {luchadorRojoNombre}
                        </Link>
                      )}

                      {luchadorAzulSlug && (
                        <Link
                          href={`/luchadores/${luchadorAzulSlug}`}
                          className="evento-detalle-fighter-link"
                        >
                          Ver {luchadorAzulNombre}
                        </Link>
                      )}

                      {ganadorSlug && ganadorSlug !== luchadorRojoSlug && ganadorSlug !== luchadorAzulSlug && (
                        <Link
                          href={`/luchadores/${ganadorSlug}`}
                          className="evento-detalle-fighter-link"
                        >
                          Ver ganador
                        </Link>
                      )}

                      <Link
                        href={`/resultados/${combate._id}`}
                        className="evento-detalle-result-link"
                      >
                        Ver resultado completo
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="evento-detalle-section">
          <h2 className="evento-detalle-section-title">Noticias relacionadas</h2>

          {noticias.length === 0 ? (
            <p className="evento-detalle-empty">
              Todavía no hay noticias relacionadas con este evento.
            </p>
          ) : (
            <div className="evento-detalle-grid-noticias">
              {noticias.map((noticia) => (
                <Link
                  key={noticia._id}
                  href={`/noticias/${noticia.slug}`}
                  className="evento-detalle-link"
                >
                  <article className="evento-detalle-card">
                    {noticia.destacada && (
                      <p className="evento-detalle-card-badge">Destacada</p>
                    )}

                    <h3 className="evento-detalle-card-title">{noticia.titulo}</h3>

                    {noticia.extracto && (
                      <p className="evento-detalle-card-text">{noticia.extracto}</p>
                    )}

                    <div className="evento-detalle-card-data evento-detalle-card-data--muted">
                      {noticia.fechaPublicacion && (
                        <p>Publicada el {formatDate(noticia.fechaPublicacion)}</p>
                      )}
                      {noticia.disciplina && <p>Disciplina: {noticia.disciplina}</p>}
                      {noticia.luchadoresRelacionados &&
                        noticia.luchadoresRelacionados.length > 0 && (
                          <p>
                            Luchadores: {noticia.luchadoresRelacionados.join(", ")}
                          </p>
                        )}
                    </div>

                    <p className="evento-detalle-cta">Leer noticia</p>
                  </article>
                </Link>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}