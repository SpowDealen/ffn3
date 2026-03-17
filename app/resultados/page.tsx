import Link from "next/link";
import { client } from "../../sanity/lib/client";
import { combatesQuery } from "../../sanity/lib/queries";

type SluggedEntity = {
  _id?: string;
  nombre?: string;
  slug?: string;
};

type Combate = {
  _id: string;
  _createdAt?: string;
  metodo?: string;
  asaltosProgramados?: number;
  asaltoFinal?: number;
  tiempoFinal?: string;
  tituloEnJuego?: boolean;
  cartelera?: string;
  orden?: number;
  estado?: string;
  evento?: string;
  eventoSlug?: string;
  luchadorRojo?: SluggedEntity | string;
  luchadorAzul?: SluggedEntity | string;
  ganador?: SluggedEntity | string;
  categoriaPeso?: string;
};

function getEntityName(value?: SluggedEntity | string | null) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.nombre || "";
}

export default async function ResultadosPage() {
  const combates: Combate[] = await client.fetch(combatesQuery);

  return (
    <main style={{ minHeight: "100vh", color: "white" }}>
      <style>{`
        .resultados-shell {
          width: 100%;
          max-width: 1440px;
          margin: 0 auto;
          padding: 40px 28px 60px;
          box-sizing: border-box;
        }

        .resultados-hero {
          background:
            linear-gradient(135deg, rgba(20,24,38,0.92) 0%, rgba(10,10,10,0.96) 55%, rgba(6,6,6,0.98) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 22px;
          padding: 34px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.22);
          margin-bottom: 34px;
        }

        .resultados-section-label {
          color: #8f8f8f;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.8px;
          margin: 0 0 10px 0;
        }

        .resultados-title {
          font-size: clamp(2.2rem, 5vw, 3.2rem);
          margin: 0 0 12px 0;
          letter-spacing: -1.2px;
          line-height: 1.05;
        }

        .resultados-intro {
          color: #a8a8a8;
          font-size: clamp(0.98rem, 1.4vw, 1.05rem);
          line-height: 1.8;
          max-width: 860px;
          margin: 0;
        }

        .resultados-hero-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 22px;
          margin-top: 26px;
          padding-top: 18px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }

        .resultados-stat-label {
          font-size: 12px;
          color: #7f7f7f;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 8px 0;
        }

        .resultados-stat-text {
          margin: 0;
          color: #d7d7d7;
          line-height: 1.6;
        }

        .resultados-empty {
          color: #888;
          margin: 0;
        }

        .resultados-list {
          display: grid;
          gap: 20px;
        }

        .resultados-link {
          text-decoration: none;
          color: inherit;
        }

        .resultados-card {
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

        .resultados-link:hover .resultados-card {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.14);
          box-shadow: 0 14px 34px rgba(0,0,0,0.26);
        }

        .resultados-card--principal {
          background:
            linear-gradient(135deg, rgba(18,18,18,0.98) 0%, rgba(24,24,32,0.96) 100%);
        }

        .resultados-badge {
          color: #9ca3af;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 12px 0;
        }

        .resultados-card-title {
          font-size: clamp(1.45rem, 3.2vw, 2rem);
          margin: 0 0 12px 0;
          letter-spacing: -0.8px;
          line-height: 1.15;
          word-break: break-word;
        }

        .resultados-ganador {
          color: #f5c542;
          margin: 0 0 14px 0;
          font-size: clamp(1rem, 1.8vw, 1.12rem);
          line-height: 1.5;
          word-break: break-word;
        }

        .resultados-datos {
          display: grid;
          gap: 8px;
          color: #bbb;
          font-size: 15px;
          line-height: 1.6;
          min-width: 0;
        }

        .resultados-datos p {
          margin: 0;
          word-break: break-word;
        }

        .resultados-cta {
          margin: 18px 0 0 0;
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          opacity: 0.92;
        }

        @media (max-width: 900px) {
          .resultados-shell {
            padding: 28px 18px 44px;
          }

          .resultados-hero {
            padding: 24px;
            border-radius: 20px;
            margin-bottom: 24px;
          }

          .resultados-card {
            padding: 22px;
          }

          .resultados-hero-stats {
            grid-template-columns: 1fr;
            gap: 18px;
          }
        }

        @media (max-width: 640px) {
          .resultados-shell {
            padding: 22px 14px 36px;
          }

          .resultados-hero {
            padding: 18px;
            border-radius: 18px;
          }

          .resultados-card {
            padding: 18px;
            border-radius: 16px;
          }

          .resultados-datos {
            gap: 7px;
            font-size: 14px;
          }

          .resultados-cta {
            margin-top: 16px;
          }
        }
      `}</style>

      <section className="resultados-shell">
        <section className="resultados-hero">
          <p className="resultados-section-label">Resultados editoriales</p>

          <h1 className="resultados-title">Resultados</h1>

          <p className="resultados-intro">
            Sigue ganadores, métodos, estados y contexto de los combates con una
            presentación clara, sólida y pensada para escalar como archivo competitivo.
          </p>

          <div className="resultados-hero-stats">
            <div>
              <p className="resultados-stat-label">Cobertura</p>
              <p className="resultados-stat-text">
                Resultados, desenlaces y detalles clave de cada combate publicado.
              </p>
            </div>

            <div>
              <p className="resultados-stat-label">Registrados</p>
              <p className="resultados-stat-text">
                {combates.length} combates visibles en resultados.
              </p>
            </div>
          </div>
        </section>

        {combates.length === 0 ? (
          <p className="resultados-empty">Todavía no hay combates publicados.</p>
        ) : (
          <section className="resultados-list">
            {combates.map((combate, index) => {
              const luchadorRojoNombre = getEntityName(combate.luchadorRojo) || "Luchador rojo";
              const luchadorAzulNombre = getEntityName(combate.luchadorAzul) || "Luchador azul";
              const ganadorNombre = getEntityName(combate.ganador);

              return (
                <Link
                  key={combate._id}
                  href={`/resultados/${combate._id}`}
                  className="resultados-link"
                >
                  <article
                    className={`resultados-card ${
                      index === 0 ? "resultados-card--principal" : ""
                    }`}
                  >
                    {index === 0 && <p className="resultados-badge">Principal</p>}

                    <h2 className="resultados-card-title">
                      {luchadorRojoNombre} vs {luchadorAzulNombre}
                    </h2>

                    {ganadorNombre && (
                      <p className="resultados-ganador">Ganador: {ganadorNombre}</p>
                    )}

                    <div className="resultados-datos">
                      {combate.evento && <p>Evento: {combate.evento}</p>}
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

                    <p className="resultados-cta">Ver resultado →</p>
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