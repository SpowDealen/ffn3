import Link from "next/link";
import {client} from "../../sanity/lib/client";
import {categoriasPesoQuery} from "../../sanity/lib/queries";

type CategoriaPeso = {
  _id: string;
  nombre: string;
  slug: string;
  limitePeso?: number;
  unidad?: string;
  descripcion?: string;
  activa?: boolean;
  disciplina?: string;
};

export default async function CategoriasPesoPage() {
  const categorias: CategoriaPeso[] = await client.fetch(categoriasPesoQuery);

  return (
    <main style={{minHeight: "100vh", color: "white"}}>
      <style>{`
        .categorias-shell {
          width: 100%;
          max-width: 1440px;
          margin: 0 auto;
          padding: 40px 28px 60px;
          box-sizing: border-box;
        }

        .categorias-hero {
          background:
            linear-gradient(135deg, rgba(20,24,38,0.92) 0%, rgba(10,10,10,0.96) 55%, rgba(6,6,6,0.98) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 22px;
          padding: 34px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.22);
          margin-bottom: 34px;
        }

        .categorias-section-label {
          color: #8f8f8f;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.8px;
          margin: 0 0 10px 0;
        }

        .categorias-title {
          font-size: clamp(2.2rem, 5vw, 3.2rem);
          margin: 0 0 12px 0;
          letter-spacing: -1.2px;
          line-height: 1.05;
        }

        .categorias-intro {
          color: #a8a8a8;
          font-size: clamp(0.98rem, 1.4vw, 1.05rem);
          line-height: 1.8;
          max-width: 860px;
          margin: 0;
        }

        .categorias-hero-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 22px;
          margin-top: 26px;
          padding-top: 18px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }

        .categorias-stat-label {
          font-size: 12px;
          color: #7f7f7f;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 8px 0;
        }

        .categorias-stat-text {
          margin: 0;
          color: #d7d7d7;
          line-height: 1.6;
        }

        .categorias-empty {
          color: #888;
          margin: 0;
        }

        .categorias-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
        }

        .categorias-link {
          text-decoration: none;
          color: inherit;
          min-width: 0;
        }

        .categorias-card {
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

        .categorias-link:hover .categorias-card {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.14);
          box-shadow: 0 14px 34px rgba(0,0,0,0.26);
        }

        .categorias-card--principal {
          background:
            linear-gradient(135deg, rgba(18,18,18,0.98) 0%, rgba(24,24,32,0.96) 100%);
        }

        .categorias-badge {
          color: #9ca3af;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 12px 0;
        }

        .categorias-card-title {
          font-size: clamp(1.3rem, 2.8vw, 1.75rem);
          margin: 0 0 12px 0;
          letter-spacing: -0.7px;
          line-height: 1.15;
          word-break: break-word;
        }

        .categorias-datos {
          display: grid;
          gap: 8px;
          color: #bbb;
          font-size: 15px;
          line-height: 1.7;
          min-width: 0;
        }

        .categorias-datos p {
          margin: 0;
          word-break: break-word;
        }

        .categorias-descripcion {
          color: #c8c8c8;
        }

        .categorias-estado {
          font-weight: 600;
        }

        .categorias-estado--activa {
          color: #4ade80;
        }

        .categorias-estado--inactiva {
          color: #f87171;
        }

        .categorias-cta {
          margin: 18px 0 0 0;
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          opacity: 0.92;
          margin-top: auto;
          padding-top: 18px;
        }

        @media (max-width: 1180px) {
          .categorias-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 900px) {
          .categorias-shell {
            padding: 28px 18px 44px;
          }

          .categorias-hero {
            padding: 24px;
            border-radius: 20px;
            margin-bottom: 24px;
          }

          .categorias-card {
            padding: 22px;
          }

          .categorias-hero-stats {
            grid-template-columns: 1fr;
            gap: 18px;
          }
        }

        @media (max-width: 640px) {
          .categorias-shell {
            padding: 22px 14px 36px;
          }

          .categorias-hero {
            padding: 18px;
            border-radius: 18px;
          }

          .categorias-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 16px;
          }

          .categorias-card {
            padding: 18px;
            border-radius: 16px;
          }

          .categorias-datos {
            gap: 7px;
            font-size: 14px;
          }

          .categorias-cta {
            padding-top: 16px;
          }
        }
      `}</style>

      <section className="categorias-shell">
        <section className="categorias-hero">
          <p className="categorias-section-label">Divisiones editoriales</p>

          <h1 className="categorias-title">Categorías de peso</h1>

          <p className="categorias-intro">
            Explora divisiones por disciplina con una estructura clara para entender
            límites, contexto competitivo y organización del sistema de pesos.
          </p>

          <div className="categorias-hero-stats">
            <div>
              <p className="categorias-stat-label">Función</p>
              <p className="categorias-stat-text">
                Ordenar el mapa competitivo por divisiones y límites dentro de cada disciplina.
              </p>
            </div>

            <div>
              <p className="categorias-stat-label">Registradas</p>
              <p className="categorias-stat-text">
                {categorias.length} categorías visibles en la plataforma.
              </p>
            </div>
          </div>
        </section>

        {categorias.length === 0 ? (
          <p className="categorias-empty">Todavía no hay categorías publicadas.</p>
        ) : (
          <section className="categorias-grid">
            {categorias.map((categoria, index) => (
              <Link
                key={categoria._id}
                href={`/categorias-peso/${categoria.slug}`}
                className="categorias-link"
              >
                <article
                  className={`categorias-card ${
                    index === 0 ? "categorias-card--principal" : ""
                  }`}
                >
                  {index === 0 && <p className="categorias-badge">Principal</p>}

                  <h2 className="categorias-card-title">{categoria.nombre}</h2>

                  <div className="categorias-datos">
                    {categoria.disciplina && (
                      <p>Disciplina: {categoria.disciplina}</p>
                    )}

                    {typeof categoria.limitePeso === "number" && (
                      <p>
                        Límite: {categoria.limitePeso} {categoria.unidad}
                      </p>
                    )}

                    {categoria.descripcion && (
                      <p className="categorias-descripcion">{categoria.descripcion}</p>
                    )}

                    <p
                      className={`categorias-estado ${
                        categoria.activa
                          ? "categorias-estado--activa"
                          : "categorias-estado--inactiva"
                      }`}
                    >
                      {categoria.activa ? "Activa" : "Inactiva"}
                    </p>
                  </div>

                  <p className="categorias-cta">Ver categoría →</p>
                </article>
              </Link>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}