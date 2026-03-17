import Link from "next/link";
import {client} from "../../sanity/lib/client";
import {disciplinasQuery} from "../../sanity/lib/queries";

type Disciplina = {
  _id: string;
  nombre: string;
  slug: string;
  descripcion?: string;
  activa?: boolean;
};

export default async function DisciplinasPage() {
  const disciplinas: Disciplina[] = await client.fetch(disciplinasQuery);

  return (
    <main style={{minHeight: "100vh", color: "white"}}>
      <style>{`
        .disciplinas-shell {
          width: 100%;
          max-width: 1440px;
          margin: 0 auto;
          padding: 40px 28px 60px;
          box-sizing: border-box;
        }

        .disciplinas-hero {
          background:
            linear-gradient(135deg, rgba(20,24,38,0.92) 0%, rgba(10,10,10,0.96) 55%, rgba(6,6,6,0.98) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 22px;
          padding: 34px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.22);
          margin-bottom: 34px;
        }

        .disciplinas-section-label {
          color: #8f8f8f;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.8px;
          margin: 0 0 10px 0;
        }

        .disciplinas-title {
          font-size: clamp(2.2rem, 5vw, 3.2rem);
          margin: 0 0 12px 0;
          letter-spacing: -1.2px;
          line-height: 1.05;
        }

        .disciplinas-intro {
          color: #a8a8a8;
          font-size: clamp(0.98rem, 1.4vw, 1.05rem);
          line-height: 1.8;
          max-width: 860px;
          margin: 0;
        }

        .disciplinas-hero-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 22px;
          margin-top: 26px;
          padding-top: 18px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }

        .disciplinas-stat-label {
          font-size: 12px;
          color: #7f7f7f;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 8px 0;
        }

        .disciplinas-stat-text {
          margin: 0;
          color: #d7d7d7;
          line-height: 1.6;
        }

        .disciplinas-empty {
          color: #888;
          margin: 0;
        }

        .disciplinas-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
        }

        .disciplinas-link {
          text-decoration: none;
          color: inherit;
          min-width: 0;
        }

        .disciplinas-card {
          height: 100%;
          display: flex;
          flex-direction: column;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          padding: 26px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
          box-sizing: border-box;
          min-width: 0;
        }

        .disciplinas-link:hover .disciplinas-card {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.14);
          box-shadow: 0 14px 34px rgba(0,0,0,0.26);
        }

        .disciplinas-card--principal {
          background:
            linear-gradient(135deg, rgba(18,18,18,0.98) 0%, rgba(24,24,32,0.96) 100%);
        }

        .disciplinas-badge {
          color: #9ca3af;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 12px 0;
        }

        .disciplinas-card-title {
          font-size: clamp(1.3rem, 2.8vw, 1.75rem);
          margin: 0 0 12px 0;
          letter-spacing: -0.7px;
          color: white;
          line-height: 1.15;
          word-break: break-word;
        }

        .disciplinas-descripcion {
          color: #ccc;
          margin: 0 0 16px 0;
          line-height: 1.8;
          font-size: clamp(0.98rem, 1.5vw, 1.06rem);
          word-break: break-word;
        }

        .disciplinas-estado {
          margin: 0;
          line-height: 1.5;
          font-weight: 600;
        }

        .disciplinas-estado--activa {
          color: #4ade80;
        }

        .disciplinas-estado--inactiva {
          color: #f87171;
        }

        .disciplinas-cta {
          margin: 18px 0 0 0;
          color: #fff;
          font-size: 14px;
          font-weight: 700;
          opacity: 0.92;
          margin-top: auto;
          padding-top: 18px;
        }

        @media (max-width: 1180px) {
          .disciplinas-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 900px) {
          .disciplinas-shell {
            padding: 28px 18px 44px;
          }

          .disciplinas-hero {
            padding: 24px;
            border-radius: 20px;
            margin-bottom: 24px;
          }

          .disciplinas-card {
            padding: 22px;
          }

          .disciplinas-hero-stats {
            grid-template-columns: 1fr;
            gap: 18px;
          }
        }

        @media (max-width: 640px) {
          .disciplinas-shell {
            padding: 22px 14px 36px;
          }

          .disciplinas-hero {
            padding: 18px;
            border-radius: 18px;
          }

          .disciplinas-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 16px;
          }

          .disciplinas-card {
            padding: 18px;
            border-radius: 16px;
          }

          .disciplinas-descripcion {
            line-height: 1.7;
          }

          .disciplinas-cta {
            padding-top: 16px;
          }
        }
      `}</style>

      <section className="disciplinas-shell">
        <section className="disciplinas-hero">
          <p className="disciplinas-section-label">Base editorial</p>

          <h1 className="disciplinas-title">Disciplinas</h1>

          <p className="disciplinas-intro">
            Explora las principales disciplinas de los deportes de combate desde una
            estructura clara, navegable y preparada para conectar noticias, luchadores,
            eventos y resultados.
          </p>

          <div className="disciplinas-hero-stats">
            <div>
              <p className="disciplinas-stat-label">Función</p>
              <p className="disciplinas-stat-text">
                Organizar el universo editorial de la web por bloques competitivos claros.
              </p>
            </div>

            <div>
              <p className="disciplinas-stat-label">Registradas</p>
              <p className="disciplinas-stat-text">
                {disciplinas.length} disciplinas visibles en la plataforma.
              </p>
            </div>
          </div>
        </section>

        {disciplinas.length === 0 ? (
          <p className="disciplinas-empty">Todavía no hay disciplinas publicadas.</p>
        ) : (
          <section className="disciplinas-grid">
            {disciplinas.map((disciplina, index) => (
              <Link
                key={disciplina._id}
                href={`/disciplinas/${disciplina.slug}`}
                className="disciplinas-link"
              >
                <article
                  className={`disciplinas-card ${
                    index === 0 ? "disciplinas-card--principal" : ""
                  }`}
                >
                  {index === 0 && <p className="disciplinas-badge">Principal</p>}

                  <h2 className="disciplinas-card-title">{disciplina.nombre}</h2>

                  {disciplina.descripcion && (
                    <p className="disciplinas-descripcion">{disciplina.descripcion}</p>
                  )}

                  <p
                    className={`disciplinas-estado ${
                      disciplina.activa
                        ? "disciplinas-estado--activa"
                        : "disciplinas-estado--inactiva"
                    }`}
                  >
                    {disciplina.activa ? "Activa" : "Inactiva"}
                  </p>

                  <p className="disciplinas-cta">Ver disciplina →</p>
                </article>
              </Link>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}