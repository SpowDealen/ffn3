import Link from "next/link";
import {client} from "../../sanity/lib/client";
import {eventosQuery} from "../../sanity/lib/queries";

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

function formatearFecha(fecha?: string) {
  if (!fecha) return null;
  return new Date(fecha).toLocaleDateString("es-ES");
}

export default async function EventosPage() {
  const eventos: Evento[] = await client.fetch(eventosQuery);

  return (
    <main style={{minHeight: "100vh", color: "white"}}>
      <style>{`
        .eventos-shell {
          width: 100%;
          max-width: 1440px;
          margin: 0 auto;
          padding: 40px 28px 60px;
          box-sizing: border-box;
        }

        .eventos-hero {
          background:
            linear-gradient(135deg, rgba(20,24,38,0.92) 0%, rgba(10,10,10,0.96) 55%, rgba(6,6,6,0.98) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 22px;
          padding: 34px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.22);
          margin-bottom: 34px;
        }

        .eventos-section-label {
          color: #8f8f8f;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.8px;
          margin: 0 0 10px 0;
        }

        .eventos-title {
          font-size: clamp(2.2rem, 5vw, 3.2rem);
          margin: 0 0 12px 0;
          letter-spacing: -1.2px;
          line-height: 1.05;
        }

        .eventos-intro {
          color: #a8a8a8;
          font-size: clamp(0.98rem, 1.4vw, 1.05rem);
          line-height: 1.8;
          max-width: 860px;
          margin: 0;
        }

        .eventos-hero-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 22px;
          margin-top: 26px;
          padding-top: 18px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }

        .eventos-stat-label {
          font-size: 12px;
          color: #7f7f7f;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 8px 0;
        }

        .eventos-stat-text {
          margin: 0;
          color: #d7d7d7;
          line-height: 1.6;
        }

        .eventos-empty {
          color: #888;
          margin: 0;
        }

        .eventos-list {
          display: grid;
          gap: 20px;
        }

        .eventos-link {
          text-decoration: none;
          color: inherit;
        }

        .eventos-card {
          background:
            linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          padding: 26px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
        }

        .eventos-link:hover .eventos-card {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.14);
          box-shadow: 0 14px 34px rgba(0,0,0,0.26);
        }

        .eventos-card--principal {
          background:
            linear-gradient(135deg, rgba(18,18,18,0.98) 0%, rgba(24,24,32,0.96) 100%);
        }

        .eventos-badge {
          color: #9ca3af;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 12px 0;
        }

        .eventos-card-title {
          font-size: clamp(1.45rem, 3.2vw, 2rem);
          margin: 0 0 12px 0;
          letter-spacing: -0.8px;
          line-height: 1.15;
          word-break: break-word;
        }

        .eventos-cartel {
          color: #f5c542;
          margin: 0 0 14px 0;
          font-size: clamp(1rem, 1.8vw, 1.12rem);
          line-height: 1.5;
          word-break: break-word;
        }

        .eventos-descripcion {
          color: #ccc;
          margin: 0 0 18px 0;
          line-height: 1.8;
          font-size: clamp(0.98rem, 1.5vw, 1.06rem);
          max-width: 980px;
        }

        .eventos-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          font-size: 14px;
          color: #8a8a8a;
          line-height: 1.5;
        }

        .eventos-meta span {
          word-break: break-word;
        }

        .eventos-cta {
          margin: 18px 0 0 0;
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          opacity: 0.92;
        }

        @media (max-width: 900px) {
          .eventos-shell {
            padding: 28px 18px 44px;
          }

          .eventos-hero {
            padding: 24px;
            border-radius: 20px;
            margin-bottom: 24px;
          }

          .eventos-card {
            padding: 22px;
          }

          .eventos-hero-stats {
            grid-template-columns: 1fr;
            gap: 18px;
          }
        }

        @media (max-width: 640px) {
          .eventos-shell {
            padding: 22px 14px 36px;
          }

          .eventos-hero {
            padding: 18px;
            border-radius: 18px;
          }

          .eventos-card {
            padding: 18px;
            border-radius: 16px;
          }

          .eventos-descripcion {
            margin: 0 0 16px 0;
            line-height: 1.7;
          }

          .eventos-meta {
            display: grid;
            grid-template-columns: 1fr;
            gap: 8px;
          }

          .eventos-cta {
            margin-top: 16px;
          }
        }
      `}</style>

      <section className="eventos-shell">
        <section className="eventos-hero">
          <p className="eventos-section-label">Calendario editorial</p>

          <h1 className="eventos-title">Eventos</h1>

          <p className="eventos-intro">
            Consulta próximos eventos y archivo competitivo con una estructura clara,
            pensada para seguir carteleras, organizaciones, disciplinas y contexto de cada cita.
          </p>

          <div className="eventos-hero-stats">
            <div>
              <p className="eventos-stat-label">Cobertura</p>
              <p className="eventos-stat-text">
                Próximas citas, archivo histórico y seguimiento estructurado de eventos.
              </p>
            </div>

            <div>
              <p className="eventos-stat-label">Registrados</p>
              <p className="eventos-stat-text">
                {eventos.length} eventos visibles en el calendario.
              </p>
            </div>
          </div>
        </section>

        {eventos.length === 0 ? (
          <p className="eventos-empty">Todavía no hay eventos publicados.</p>
        ) : (
          <section className="eventos-list">
            {eventos.map((evento, index) => (
              <Link
                key={evento._id}
                href={`/eventos/${evento.slug}`}
                className="eventos-link"
              >
                <article
                  className={`eventos-card ${index === 0 ? "eventos-card--principal" : ""}`}
                >
                  {index === 0 && <p className="eventos-badge">Principal</p>}

                  <h2 className="eventos-card-title">{evento.nombre}</h2>

                  {evento.cartelPrincipal && (
                    <p className="eventos-cartel">{evento.cartelPrincipal}</p>
                  )}

                  {evento.descripcion && (
                    <p className="eventos-descripcion">{evento.descripcion}</p>
                  )}

                  <div className="eventos-meta">
                    {evento.organizacion && <span>Organización: {evento.organizacion}</span>}
                    {evento.disciplina && <span>Disciplina: {evento.disciplina}</span>}
                    {evento.estado && <span>Estado: {evento.estado}</span>}
                    {evento.fecha && <span>Fecha: {formatearFecha(evento.fecha)}</span>}
                    {evento.ciudad && evento.pais && (
                      <span>
                        Lugar: {evento.ciudad}, {evento.pais}
                      </span>
                    )}
                    {evento.recinto && <span>Recinto: {evento.recinto}</span>}
                  </div>

                  <p className="eventos-cta">Ver evento →</p>
                </article>
              </Link>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}