import Link from "next/link";
import { notFound } from "next/navigation";
import { client } from "../../../sanity/lib/client";
import {
  combatesPorEventoQuery,
  eventoPorSlugQuery,
  noticiasPorEventoQuery,
} from "../../../sanity/lib/queries";

type SluggedEntity = {
  _id?: string;
  nombre?: string;
  slug?: string;
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
  organizacion?:
    | string
    | {
        _id?: string;
        nombre?: string;
        slug?: string;
        logo?: unknown;
        sitioWeb?: string;
      };
  disciplina?: string;
};

type Combate = {
  _id: string;
  metodo?: string;
  asaltosProgramados?: number;
  asaltoFinal?: number;
  tiempoFinal?: string;
  tituloEnJuego?: boolean;
  cartelera?: string;
  orden?: number;
  estado?: string;
  luchadorRojo?: SluggedEntity | string;
  luchadorAzul?: SluggedEntity | string;
  ganador?: SluggedEntity | string;
  categoriaPeso?: string;
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

type Protagonista = {
  nombre: string;
  slug?: string;
};

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function getEntityName(value?: SluggedEntity | string | null): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.nombre || "";
}

function getEntitySlug(value?: SluggedEntity | string | null): string | undefined {
  if (!value || typeof value === "string") return undefined;
  return value.slug || undefined;
}

function formatDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-ES");
}

export default async function EventoDetallePage({ params }: PageProps) {
  const { slug } = await params;

  const evento: Evento | null = await client.fetch(eventoPorSlugQuery, { slug });
  const combates: Combate[] = await client.fetch(combatesPorEventoQuery, { slug });
  const noticias: Noticia[] = await client.fetch(noticiasPorEventoQuery, { slug });

  if (!evento) {
    notFound();
  }

  const organizacionNombre =
    typeof evento.organizacion === "string"
      ? evento.organizacion
      : evento.organizacion?.nombre || "";

  const protagonistasMap = new Map<string, Protagonista>();

  for (const combate of combates) {
    const luchadorRojoNombre = getEntityName(combate.luchadorRojo);
    const luchadorRojoSlug = getEntitySlug(combate.luchadorRojo);

    if (luchadorRojoNombre) {
      protagonistasMap.set(luchadorRojoNombre, {
        nombre: luchadorRojoNombre,
        slug: luchadorRojoSlug,
      });
    }

    const luchadorAzulNombre = getEntityName(combate.luchadorAzul);
    const luchadorAzulSlug = getEntitySlug(combate.luchadorAzul);

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
          color: white;
          padding: 56px 28px 80px;
          box-sizing: border-box;
        }

        .evento-detalle-container {
          max-width: 1100px;
          margin: 0 auto;
        }

        .evento-detalle-eyebrow {
          color: #8f8f8f;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin: 0 0 12px 0;
        }

        .evento-detalle-title {
          font-size: clamp(2.35rem, 6vw, 3.5rem);
          line-height: 1.04;
          margin: 0 0 16px 0;
          letter-spacing: -1.8px;
          max-width: 920px;
          word-break: break-word;
        }

        .evento-detalle-cartel {
          color: #f5c542;
          font-size: clamp(1.1rem, 2.6vw, 1.5rem);
          line-height: 1.45;
          margin: 0 0 18px 0;
          word-break: break-word;
        }

        .evento-detalle-descripcion {
          color: #b9b9b9;
          font-size: clamp(1.02rem, 2vw, 1.25rem);
          line-height: 1.85;
          margin: 0 0 30px 0;
          max-width: 920px;
        }

        .evento-detalle-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 42px;
          padding-bottom: 22px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        .evento-detalle-meta-pill {
          display: inline-flex;
          align-items: center;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          color: #888;
          font-size: 13px;
          line-height: 1.4;
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

        .evento-detalle-grid-protagonistas {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

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

        .evento-detalle-link:hover .evento-detalle-card {
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
          color: #f5c542;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 12px 0;
        }

        .evento-detalle-card-title {
          font-size: clamp(1.35rem, 2.4vw, 1.7rem);
          line-height: 1.2;
          margin: 0 0 12px 0;
          letter-spacing: -0.5px;
          word-break: break-word;
        }

        .evento-detalle-card-subtitle {
          color: #f5c542;
          margin: 0 0 14px 0;
          font-size: clamp(1rem, 1.8vw, 1.06rem);
          line-height: 1.5;
          word-break: break-word;
        }

        .evento-detalle-card-text {
          color: #b9b9b9;
          font-size: 15px;
          line-height: 1.7;
          margin: 0 0 18px 0;
          word-break: break-word;
        }

        .evento-detalle-card-data {
          display: grid;
          gap: 8px;
          color: #bbb;
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

        .evento-detalle-cta {
          margin: 18px 0 0 0;
          color: #f5c542;
          font-size: 14px;
          line-height: 1.4;
          margin-top: auto;
          padding-top: 18px;
        }

        @media (max-width: 1100px) {
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

          .evento-detalle-card {
            padding: 18px;
            border-radius: 16px;
          }

          .evento-detalle-card-text,
          .evento-detalle-card-data {
            font-size: 14px;
          }

          .evento-detalle-card-data--muted {
            font-size: 13px;
          }

          .evento-detalle-cta {
            padding-top: 16px;
          }
        }
      `}</style>

      <section className="evento-detalle-container">
        <p className="evento-detalle-eyebrow">Evento</p>

        <h1 className="evento-detalle-title">{evento.nombre}</h1>

        {evento.cartelPrincipal && (
          <p className="evento-detalle-cartel">{evento.cartelPrincipal}</p>
        )}

        {evento.descripcion && (
          <p className="evento-detalle-descripcion">{evento.descripcion}</p>
        )}

        <div className="evento-detalle-meta">
          {organizacionNombre && (
            <span className="evento-detalle-meta-pill">
              Organización: {organizacionNombre}
            </span>
          )}

          {evento.disciplina && (
            <span className="evento-detalle-meta-pill">
              Disciplina: {evento.disciplina}
            </span>
          )}

          {evento.estado && (
            <span className="evento-detalle-meta-pill">Estado: {evento.estado}</span>
          )}

          {evento.fecha && (
            <span className="evento-detalle-meta-pill">
              Fecha: {formatDate(evento.fecha)}
            </span>
          )}

          {evento.ciudad && evento.pais && (
            <span className="evento-detalle-meta-pill">
              Lugar: {evento.ciudad}, {evento.pais}
            </span>
          )}

          {evento.recinto && (
            <span className="evento-detalle-meta-pill">Recinto: {evento.recinto}</span>
          )}
        </div>

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
          <h2 className="evento-detalle-section-title">Combates del evento</h2>

          {combates.length === 0 ? (
            <p className="evento-detalle-empty">
              Todavía no hay combates asociados a este evento.
            </p>
          ) : (
            <div className="evento-detalle-grid-combates">
              {combates.map((combate) => {
                const luchadorRojoNombre = getEntityName(combate.luchadorRojo) || "Luchador rojo";
                const luchadorAzulNombre = getEntityName(combate.luchadorAzul) || "Luchador azul";
                const ganadorNombre = getEntityName(combate.ganador);

                return (
                  <Link
                    key={combate._id}
                    href={`/resultados/${combate._id}`}
                    className="evento-detalle-link"
                  >
                    <article className="evento-detalle-card">
                      <h3 className="evento-detalle-card-title">
                        {luchadorRojoNombre} vs {luchadorAzulNombre}
                      </h3>

                      {ganadorNombre && (
                        <p className="evento-detalle-card-subtitle">
                          Ganador: {ganadorNombre}
                        </p>
                      )}

                      <div className="evento-detalle-card-data">
                        {combate.categoriaPeso && <p>Categoría: {combate.categoriaPeso}</p>}
                        {combate.estado && <p>Estado: {combate.estado}</p>}
                        {combate.metodo && <p>Método: {combate.metodo}</p>}
                        {typeof combate.asaltoFinal === "number" && (
                          <p>Asalto final: {combate.asaltoFinal}</p>
                        )}
                        {combate.tiempoFinal && <p>Tiempo final: {combate.tiempoFinal}</p>}
                        {combate.cartelera && <p>Cartelera: {combate.cartelera}</p>}
                        {combate.tituloEnJuego && <p>Pelea con título en juego</p>}
                      </div>

                      <p className="evento-detalle-cta">Ver resultado</p>
                    </article>
                  </Link>
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