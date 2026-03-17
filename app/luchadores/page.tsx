import Link from "next/link";
import {client} from "../../sanity/lib/client";
import {luchadoresQuery} from "../../sanity/lib/queries";

type Luchador = {
  _id: string;
  nombre: string;
  slug: string;
  apodo?: string;
  nacionalidad?: string;
  record?: string;
  activo?: boolean;
  disciplina?: string;
  organizacion?: string;
  categoriaPeso?: string;
};

export default async function LuchadoresPage() {
  const luchadores: Luchador[] = await client.fetch(luchadoresQuery);

  return (
    <main style={{minHeight: "100vh", color: "white"}}>
      <style>{`
        .luchadores-shell {
          width: 100%;
          max-width: 1440px;
          margin: 0 auto;
          padding: 40px 28px 60px;
          box-sizing: border-box;
        }

        .luchadores-hero {
          background:
            linear-gradient(135deg, rgba(20,24,38,0.92) 0%, rgba(10,10,10,0.96) 55%, rgba(6,6,6,0.98) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 22px;
          padding: 34px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.22);
          margin-bottom: 34px;
        }

        .luchadores-section-label {
          color: #8f8f8f;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.8px;
          margin: 0 0 10px 0;
        }

        .luchadores-title {
          font-size: clamp(2.2rem, 5vw, 3.2rem);
          margin: 0 0 12px 0;
          letter-spacing: -1.2px;
          line-height: 1.05;
        }

        .luchadores-intro {
          color: #a8a8a8;
          font-size: clamp(0.98rem, 1.4vw, 1.05rem);
          line-height: 1.8;
          max-width: 860px;
          margin: 0;
        }

        .luchadores-hero-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 22px;
          margin-top: 26px;
          padding-top: 18px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }

        .luchadores-stat-label {
          font-size: 12px;
          color: #7f7f7f;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 8px 0;
        }

        .luchadores-stat-text {
          margin: 0;
          color: #d7d7d7;
          line-height: 1.6;
        }

        .luchadores-empty {
          color: #888;
          margin: 0;
        }

        .luchadores-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
        }

        .luchadores-link {
          text-decoration: none;
          color: inherit;
          min-width: 0;
        }

        .luchadores-card {
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

        .luchadores-link:hover .luchadores-card {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.14);
          box-shadow: 0 14px 34px rgba(0,0,0,0.26);
        }

        .luchadores-card--principal {
          background:
            linear-gradient(135deg, rgba(18,18,18,0.98) 0%, rgba(24,24,32,0.96) 100%);
        }

        .luchadores-badge {
          color: #9ca3af;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 12px 0;
        }

        .luchadores-card-title {
          font-size: clamp(1.3rem, 2.8vw, 1.75rem);
          margin: 0 0 8px 0;
          letter-spacing: -0.6px;
          line-height: 1.15;
          word-break: break-word;
        }

        .luchadores-apodo {
          color: #f5c542;
          margin: 0 0 14px 0;
          line-height: 1.5;
          word-break: break-word;
        }

        .luchadores-datos {
          display: grid;
          gap: 8px;
          color: #bbb;
          font-size: 15px;
          line-height: 1.6;
          min-width: 0;
        }

        .luchadores-datos p {
          margin: 0;
          word-break: break-word;
        }

        .luchadores-cta {
          margin: 18px 0 0 0;
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          opacity: 0.92;
          margin-top: auto;
          padding-top: 18px;
        }

        @media (max-width: 1180px) {
          .luchadores-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 900px) {
          .luchadores-shell {
            padding: 28px 18px 44px;
          }

          .luchadores-hero {
            padding: 24px;
            border-radius: 20px;
            margin-bottom: 24px;
          }

          .luchadores-card {
            padding: 22px;
          }

          .luchadores-hero-stats {
            grid-template-columns: 1fr;
            gap: 18px;
          }
        }

        @media (max-width: 640px) {
          .luchadores-shell {
            padding: 22px 14px 36px;
          }

          .luchadores-hero {
            padding: 18px;
            border-radius: 18px;
          }

          .luchadores-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 16px;
          }

          .luchadores-card {
            padding: 18px;
            border-radius: 16px;
          }

          .luchadores-datos {
            gap: 7px;
            font-size: 14px;
          }

          .luchadores-cta {
            padding-top: 16px;
          }
        }
      `}</style>

      <section className="luchadores-shell">
        <section className="luchadores-hero">
          <p className="luchadores-section-label">Roster editorial</p>

          <h1 className="luchadores-title">Luchadores</h1>

          <p className="luchadores-intro">
            Explora perfiles de luchadores con una estructura clara para seguir
            nacionalidad, disciplina, organización, categoría y estado competitivo.
          </p>

          <div className="luchadores-hero-stats">
            <div>
              <p className="luchadores-stat-label">Cobertura</p>
              <p className="luchadores-stat-text">
                Perfiles conectados con eventos, combates, noticias y categorías.
              </p>
            </div>

            <div>
              <p className="luchadores-stat-label">Registrados</p>
              <p className="luchadores-stat-text">
                {luchadores.length} luchadores visibles en el roster.
              </p>
            </div>
          </div>
        </section>

        {luchadores.length === 0 ? (
          <p className="luchadores-empty">Todavía no hay luchadores publicados.</p>
        ) : (
          <section className="luchadores-grid">
            {luchadores.map((luchador, index) => (
              <Link
                key={luchador._id}
                href={`/luchadores/${luchador.slug}`}
                className="luchadores-link"
              >
                <article
                  className={`luchadores-card ${
                    index === 0 ? "luchadores-card--principal" : ""
                  }`}
                >
                  {index === 0 && <p className="luchadores-badge">Principal</p>}

                  <h2 className="luchadores-card-title">{luchador.nombre}</h2>

                  {luchador.apodo && (
                    <p className="luchadores-apodo">“{luchador.apodo}”</p>
                  )}

                  <div className="luchadores-datos">
                    {luchador.nacionalidad && (
                      <p>Nacionalidad: {luchador.nacionalidad}</p>
                    )}
                    {luchador.disciplina && (
                      <p>Disciplina: {luchador.disciplina}</p>
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

                  <p className="luchadores-cta">Ver perfil →</p>
                </article>
              </Link>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}