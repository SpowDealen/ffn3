import Link from "next/link";
import {client} from "../../sanity/lib/client";
import {noticiasQuery} from "../../sanity/lib/queries";

type Noticia = {
  _id: string;
  titulo: string;
  slug?: string;
  extracto?: string;
  fechaPublicacion?: string;
  destacada?: boolean;
  disciplina?: string;
  eventoRelacionado?: string;
  luchadoresRelacionados?: string[];
};

function formatearFecha(fecha?: string) {
  if (!fecha) return null;
  return new Date(fecha).toLocaleDateString("es-ES");
}

export default async function NoticiasPage() {
  const noticiasRaw: Noticia[] = await client.fetch(noticiasQuery);

  const noticias = noticiasRaw.filter(
    (noticia) => typeof noticia.slug === "string" && noticia.slug.trim().length > 0
  );

  return (
    <main style={{minHeight: "100vh", color: "white"}}>
      <style>{`
        .noticias-shell {
          width: 100%;
          max-width: 1440px;
          margin: 0 auto;
          padding: 40px 28px 60px;
          box-sizing: border-box;
        }

        .noticias-hero {
          background:
            linear-gradient(135deg, rgba(20,24,38,0.92) 0%, rgba(10,10,10,0.96) 55%, rgba(6,6,6,0.98) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 22px;
          padding: 34px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.22);
          margin-bottom: 34px;
        }

        .noticias-section-label {
          color: #8f8f8f;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.8px;
          margin: 0 0 10px 0;
        }

        .noticias-title {
          font-size: clamp(2.2rem, 5vw, 3.2rem);
          margin: 0 0 12px 0;
          letter-spacing: -1.2px;
          line-height: 1.05;
        }

        .noticias-intro {
          color: #a8a8a8;
          font-size: clamp(0.98rem, 1.4vw, 1.05rem);
          line-height: 1.8;
          max-width: 840px;
          margin: 0;
        }

        .noticias-hero-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 22px;
          margin-top: 26px;
          padding-top: 18px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }

        .noticias-stat-label {
          font-size: 12px;
          color: #7f7f7f;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 8px 0;
        }

        .noticias-stat-text {
          margin: 0;
          color: #d7d7d7;
          line-height: 1.6;
        }

        .noticias-empty {
          color: #888;
          margin: 0;
        }

        .noticias-list {
          display: grid;
          gap: 20px;
        }

        .noticias-link {
          text-decoration: none;
          color: inherit;
        }

        .noticias-card {
          background:
            linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          padding: 26px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
        }

        .noticias-link:hover .noticias-card {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.14);
          box-shadow: 0 14px 34px rgba(0,0,0,0.26);
        }

        .noticias-card--featured {
          background:
            linear-gradient(135deg, rgba(18,18,18,0.98) 0%, rgba(24,24,32,0.96) 100%);
        }

        .noticias-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }

        .noticias-badge {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 12px 0;
        }

        .noticias-badge--destacada {
          color: #f5c542;
        }

        .noticias-badge--principal {
          color: #9ca3af;
        }

        .noticias-card-title {
          font-size: clamp(1.45rem, 3.2vw, 2rem);
          margin: 0;
          line-height: 1.18;
          letter-spacing: -0.8px;
          max-width: 980px;
          word-break: break-word;
        }

        .noticias-extracto {
          color: #c8c8c8;
          margin: 14px 0 18px 0;
          line-height: 1.8;
          font-size: clamp(0.98rem, 1.5vw, 1.06rem);
          max-width: 980px;
        }

        .noticias-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          font-size: 14px;
          color: #8a8a8a;
          line-height: 1.5;
        }

        .noticias-meta span {
          word-break: break-word;
        }

        .noticias-relacionados {
          margin-top: 16px;
          color: #a9a9a9;
          line-height: 1.7;
        }

        .noticias-cta {
          margin: 18px 0 0 0;
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          opacity: 0.92;
        }

        @media (max-width: 900px) {
          .noticias-shell {
            padding: 28px 18px 44px;
          }

          .noticias-hero {
            padding: 24px;
            border-radius: 20px;
            margin-bottom: 24px;
          }

          .noticias-card {
            padding: 22px;
          }

          .noticias-hero-stats {
            grid-template-columns: 1fr;
            gap: 18px;
          }
        }

        @media (max-width: 640px) {
          .noticias-shell {
            padding: 22px 14px 36px;
          }

          .noticias-hero {
            padding: 18px;
            border-radius: 18px;
          }

          .noticias-card {
            padding: 18px;
            border-radius: 16px;
          }

          .noticias-card-header {
            gap: 14px;
            margin-bottom: 8px;
          }

          .noticias-extracto {
            margin: 12px 0 16px 0;
            line-height: 1.7;
          }

          .noticias-meta {
            display: grid;
            grid-template-columns: 1fr;
            gap: 8px;
          }

          .noticias-relacionados {
            margin-top: 14px;
          }

          .noticias-cta {
            margin-top: 16px;
          }
        }
      `}</style>

      <section className="noticias-shell">
        <section className="noticias-hero">
          <p className="noticias-section-label">Actualidad editorial</p>

          <h1 className="noticias-title">Noticias</h1>

          <p className="noticias-intro">
            Sigue la actualidad del mundo del combate con una presentación clara,
            seria y centrada en noticias, protagonistas y contexto competitivo.
          </p>

          <div className="noticias-hero-stats">
            <div>
              <p className="noticias-stat-label">Cobertura</p>
              <p className="noticias-stat-text">
                Noticias recientes, piezas destacadas y seguimiento de eventos y luchadores.
              </p>
            </div>

            <div>
              <p className="noticias-stat-label">Publicadas</p>
              <p className="noticias-stat-text">
                {noticias.length} noticias visibles con enlace activo.
              </p>
            </div>
          </div>
        </section>

        {noticias.length === 0 ? (
          <p className="noticias-empty">Todavía no hay noticias publicadas.</p>
        ) : (
          <section className="noticias-list">
            {noticias.map((noticia, index) => {
              const esPrincipal = noticia.destacada || index === 0;

              return (
                <Link
                  key={noticia._id}
                  href={`/noticias/${encodeURIComponent(noticia.slug!)}`}
                  className="noticias-link"
                >
                  <article
                    className={`noticias-card ${esPrincipal ? "noticias-card--featured" : ""}`}
                  >
                    <div className="noticias-card-header">
                      <div>
                        {esPrincipal && (
                          <p
                            className={`noticias-badge ${
                              noticia.destacada
                                ? "noticias-badge--destacada"
                                : "noticias-badge--principal"
                            }`}
                          >
                            {noticia.destacada ? "Destacada" : "Principal"}
                          </p>
                        )}

                        <h2 className="noticias-card-title">{noticia.titulo}</h2>
                      </div>
                    </div>

                    {noticia.extracto && (
                      <p className="noticias-extracto">{noticia.extracto}</p>
                    )}

                    <div className="noticias-meta">
                      {noticia.disciplina && <span>Disciplina: {noticia.disciplina}</span>}
                      {noticia.eventoRelacionado && (
                        <span>Evento: {noticia.eventoRelacionado}</span>
                      )}
                      {noticia.fechaPublicacion && (
                        <span>Fecha: {formatearFecha(noticia.fechaPublicacion)}</span>
                      )}
                    </div>

                    {noticia.luchadoresRelacionados &&
                      noticia.luchadoresRelacionados.length > 0 && (
                        <p className="noticias-relacionados">
                          Luchadores relacionados:{" "}
                          {noticia.luchadoresRelacionados.join(", ")}
                        </p>
                      )}

                    <p className="noticias-cta">Leer noticia →</p>
                  </article>
                </Link>
              );
            })}
          </section>
        )}
      </section>
    </main>
  );
}