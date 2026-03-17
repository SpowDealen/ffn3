import Link from "next/link";
import {notFound} from "next/navigation";
import {client} from "../../../sanity/lib/client";
import {
  disciplinaPorSlugQuery,
  noticiasPorDisciplinaQuery,
  luchadoresPorDisciplinaQuery,
  eventosPorDisciplinaQuery,
} from "../../../sanity/lib/queries";

type Disciplina = {
  _id: string;
  nombre: string;
  slug: string;
  descripcion?: string;
  activa?: boolean;
};

type Noticia = {
  _id: string;
  titulo: string;
  slug: string;
  extracto?: string;
  fechaPublicacion?: string;
  destacada?: boolean;
};

type Luchador = {
  _id: string;
  nombre: string;
  slug: string;
  apodo?: string;
  nacionalidad?: string;
  record?: string;
  activo?: boolean;
  organizacion?: string;
  categoriaPeso?: string;
};

type Evento = {
  _id: string;
  nombre: string;
  slug: string;
  fecha?: string;
  ciudad?: string;
  pais?: string;
  cartelPrincipal?: string;
  estado?: string;
  organizacion?: string;
};

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function formatearFecha(fecha?: string) {
  if (!fecha) return null;
  return new Date(fecha).toLocaleDateString("es-ES");
}

export default async function DisciplinaDetallePage({params}: PageProps) {
  const {slug} = await params;

  if (!slug) {
    notFound();
  }

  const [disciplina, noticias, luchadores, eventos]: [
    Disciplina | null,
    Noticia[],
    Luchador[],
    Evento[],
  ] = await Promise.all([
    client.fetch(disciplinaPorSlugQuery, {slug}),
    client.fetch(noticiasPorDisciplinaQuery, {slug}),
    client.fetch(luchadoresPorDisciplinaQuery, {slug}),
    client.fetch(eventosPorDisciplinaQuery, {slug}),
  ]);

  if (!disciplina) {
    notFound();
  }

  return (
    <main className="disciplina-detalle-shell">
      <style>{`
        .disciplina-detalle-shell {
          min-height: 100vh;
          color: white;
        }

        .disciplina-detalle-container {
          width: 100%;
          max-width: 1240px;
          margin: 0 auto;
          padding: 40px 28px 60px;
          box-sizing: border-box;
        }

        .disciplina-detalle-back {
          display: inline-block;
          margin-bottom: 22px;
          color: #9ca3af;
          text-decoration: none;
          font-size: 14px;
          line-height: 1.4;
        }

        .disciplina-detalle-hero {
          background:
            linear-gradient(135deg, rgba(20,24,38,0.92) 0%, rgba(10,10,10,0.96) 55%, rgba(6,6,6,0.98) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 22px;
          padding: 34px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.22);
          margin-bottom: 30px;
        }

        .disciplina-detalle-section-label {
          color: #8f8f8f;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.8px;
          margin: 0 0 10px 0;
        }

        .disciplina-detalle-title {
          font-size: clamp(2.2rem, 5vw, 3.2rem);
          margin: 0 0 14px 0;
          letter-spacing: -1.2px;
          line-height: 1.05;
          word-break: break-word;
        }

        .disciplina-detalle-estado {
          margin: 0 0 18px 0;
          font-size: 15px;
          font-weight: 700;
          line-height: 1.5;
        }

        .disciplina-detalle-estado--activa {
          color: #4ade80;
        }

        .disciplina-detalle-estado--inactiva {
          color: #f87171;
        }

        .disciplina-detalle-descripcion {
          color: #d1d5db;
          line-height: 1.85;
          font-size: clamp(0.98rem, 1.5vw, 1.06rem);
          max-width: 900px;
          margin: 0;
        }

        .disciplina-detalle-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 22px;
          margin-top: 26px;
          padding-top: 18px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }

        .disciplina-detalle-stat-label {
          font-size: 12px;
          color: #7f7f7f;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 8px 0;
        }

        .disciplina-detalle-stat-text {
          margin: 0;
          color: #d7d7d7;
          line-height: 1.6;
        }

        .disciplina-detalle-stack {
          display: grid;
          gap: 24px;
        }

        .disciplina-detalle-two-cols {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 24px;
        }

        .disciplina-detalle-section-title {
          font-size: clamp(1.6rem, 3vw, 1.875rem);
          margin: 0 0 18px 0;
          letter-spacing: -0.8px;
          line-height: 1.15;
        }

        .disciplina-detalle-empty {
          color: #888;
          margin: 0;
          line-height: 1.7;
        }

        .disciplina-detalle-list {
          display: grid;
          gap: 16px;
        }

        .disciplina-detalle-link {
          text-decoration: none;
          color: inherit;
          min-width: 0;
        }

        .disciplina-detalle-card {
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

        .disciplina-detalle-link:hover .disciplina-detalle-card {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.14);
          box-shadow: 0 14px 34px rgba(0,0,0,0.26);
        }

        .disciplina-detalle-card-badge {
          color: #f5c542;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 10px 0;
        }

        .disciplina-detalle-card-title {
          font-size: clamp(1.25rem, 2.3vw, 1.5rem);
          margin: 0 0 12px 0;
          line-height: 1.2;
          letter-spacing: -0.5px;
          word-break: break-word;
        }

        .disciplina-detalle-card-subtitle {
          color: #f5c542;
          margin: 0 0 10px 0;
          line-height: 1.5;
          word-break: break-word;
        }

        .disciplina-detalle-card-text {
          color: #c8c8c8;
          line-height: 1.75;
          margin: 0 0 14px 0;
          word-break: break-word;
        }

        .disciplina-detalle-card-data {
          display: grid;
          gap: 6px;
          color: #bbb;
          font-size: 15px;
          line-height: 1.65;
          min-width: 0;
        }

        .disciplina-detalle-card-data p {
          margin: 0;
          word-break: break-word;
        }

        @media (max-width: 900px) {
          .disciplina-detalle-container {
            padding: 28px 18px 44px;
          }

          .disciplina-detalle-hero {
            padding: 24px;
            border-radius: 20px;
          }

          .disciplina-detalle-stats {
            grid-template-columns: 1fr;
            gap: 18px;
          }

          .disciplina-detalle-two-cols {
            grid-template-columns: 1fr;
          }

          .disciplina-detalle-card {
            padding: 22px;
          }
        }

        @media (max-width: 640px) {
          .disciplina-detalle-container {
            padding: 22px 14px 36px;
          }

          .disciplina-detalle-back {
            margin-bottom: 18px;
          }

          .disciplina-detalle-hero {
            padding: 18px;
            border-radius: 18px;
            margin-bottom: 22px;
          }

          .disciplina-detalle-stack {
            gap: 22px;
          }

          .disciplina-detalle-two-cols {
            gap: 22px;
          }

          .disciplina-detalle-list {
            gap: 14px;
          }

          .disciplina-detalle-card {
            padding: 18px;
            border-radius: 16px;
          }

          .disciplina-detalle-card-data {
            font-size: 14px;
          }

          .disciplina-detalle-card-text {
            line-height: 1.7;
          }
        }
      `}</style>

      <section className="disciplina-detalle-container">
        <Link href="/disciplinas" className="disciplina-detalle-back">
          ← Volver a disciplinas
        </Link>

        <section className="disciplina-detalle-hero">
          <p className="disciplina-detalle-section-label">Disciplina</p>

          <h1 className="disciplina-detalle-title">{disciplina.nombre}</h1>

          <p
            className={`disciplina-detalle-estado ${
              disciplina.activa
                ? "disciplina-detalle-estado--activa"
                : "disciplina-detalle-estado--inactiva"
            }`}
          >
            {disciplina.activa ? "Activa" : "Inactiva"}
          </p>

          <p className="disciplina-detalle-descripcion">
            {disciplina.descripcion || "Esta disciplina todavía no tiene descripción publicada."}
          </p>

          <div className="disciplina-detalle-stats">
            <div>
              <p className="disciplina-detalle-stat-label">Noticias</p>
              <p className="disciplina-detalle-stat-text">{noticias.length} relacionadas</p>
            </div>

            <div>
              <p className="disciplina-detalle-stat-label">Luchadores</p>
              <p className="disciplina-detalle-stat-text">{luchadores.length} relacionados</p>
            </div>

            <div>
              <p className="disciplina-detalle-stat-label">Eventos</p>
              <p className="disciplina-detalle-stat-text">{eventos.length} relacionados</p>
            </div>
          </div>
        </section>

        <section className="disciplina-detalle-stack">
          <section>
            <p className="disciplina-detalle-section-label">Actualidad relacionada</p>
            <h2 className="disciplina-detalle-section-title">Noticias</h2>

            {noticias.length === 0 ? (
              <p className="disciplina-detalle-empty">
                Todavía no hay noticias relacionadas con esta disciplina.
              </p>
            ) : (
              <div className="disciplina-detalle-list">
                {noticias.map((noticia) => (
                  <Link
                    key={noticia._id}
                    href={`/noticias/${noticia.slug}`}
                    className="disciplina-detalle-link"
                  >
                    <article className="disciplina-detalle-card">
                      {noticia.destacada && (
                        <p className="disciplina-detalle-card-badge">Destacada</p>
                      )}

                      <h3 className="disciplina-detalle-card-title">{noticia.titulo}</h3>

                      {noticia.extracto && (
                        <p className="disciplina-detalle-card-text">{noticia.extracto}</p>
                      )}

                      {noticia.fechaPublicacion && (
                        <p style={{color: "#8a8a8a", fontSize: "14px", margin: 0}}>
                          Fecha: {formatearFecha(noticia.fechaPublicacion)}
                        </p>
                      )}
                    </article>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="disciplina-detalle-two-cols">
            <div>
              <p className="disciplina-detalle-section-label">Protagonistas</p>
              <h2 className="disciplina-detalle-section-title">Luchadores</h2>

              {luchadores.length === 0 ? (
                <p className="disciplina-detalle-empty">
                  Todavía no hay luchadores relacionados con esta disciplina.
                </p>
              ) : (
                <div className="disciplina-detalle-list">
                  {luchadores.map((luchador) => (
                    <Link
                      key={luchador._id}
                      href={`/luchadores/${luchador.slug}`}
                      className="disciplina-detalle-link"
                    >
                      <article className="disciplina-detalle-card">
                        <h3 className="disciplina-detalle-card-title">{luchador.nombre}</h3>

                        {luchador.apodo && (
                          <p className="disciplina-detalle-card-subtitle">
                            “{luchador.apodo}”
                          </p>
                        )}

                        <div className="disciplina-detalle-card-data">
                          {luchador.nacionalidad && (
                            <p>Nacionalidad: {luchador.nacionalidad}</p>
                          )}
                          {luchador.organizacion && (
                            <p>Organización: {luchador.organizacion}</p>
                          )}
                          {luchador.categoriaPeso && (
                            <p>Categoría: {luchador.categoriaPeso}</p>
                          )}
                          {luchador.record && <p>Récord: {luchador.record}</p>}
                          <p>Estado: {luchador.activo ? "Activo" : "Inactivo"}</p>
                        </div>
                      </article>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="disciplina-detalle-section-label">Calendario relacionado</p>
              <h2 className="disciplina-detalle-section-title">Eventos</h2>

              {eventos.length === 0 ? (
                <p className="disciplina-detalle-empty">
                  Todavía no hay eventos relacionados con esta disciplina.
                </p>
              ) : (
                <div className="disciplina-detalle-list">
                  {eventos.map((evento) => (
                    <Link
                      key={evento._id}
                      href={`/eventos/${evento.slug}`}
                      className="disciplina-detalle-link"
                    >
                      <article className="disciplina-detalle-card">
                        <h3 className="disciplina-detalle-card-title">{evento.nombre}</h3>

                        {evento.cartelPrincipal && (
                          <p className="disciplina-detalle-card-subtitle">
                            {evento.cartelPrincipal}
                          </p>
                        )}

                        <div className="disciplina-detalle-card-data">
                          {evento.organizacion && <p>Organización: {evento.organizacion}</p>}
                          {evento.estado && <p>Estado: {evento.estado}</p>}
                          {evento.fecha && <p>Fecha: {formatearFecha(evento.fecha)}</p>}
                          {evento.ciudad && evento.pais && (
                            <p>
                              Lugar: {evento.ciudad}, {evento.pais}
                            </p>
                          )}
                        </div>
                      </article>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}