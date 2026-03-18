import Link from "next/link";
import { notFound } from "next/navigation";
import { client } from "../../../sanity/lib/client";
import { luchadorPorSlugQuery } from "../../../sanity/lib/queries";

type CombateRelacionado = {
  _id?: string;
  metodo?: string;
  asalto?: number;
  tiempo?: string;
  estado?: string;
  evento?: string;
  eventoSlug?: string | null;
  luchadorRojo?: string;
  luchadorRojoSlug?: string | null;
  luchadorAzul?: string;
  luchadorAzulSlug?: string | null;
  ganador?: string;
  ganadorSlug?: string | null;
  categoriaPeso?: string;
  categoriaPesoSlug?: string | null;
} | null;

type NoticiaRelacionada = {
  _id?: string;
  titulo?: string;
  slug?: string | null;
  extracto?: string;
  fechaPublicacion?: string;
} | null;

type Luchador = {
  _id: string;
  nombre: string;
  slug: string;
  apodo?: string;
  nacionalidad?: string;
  record?: string;
  activo?: boolean;
  descripcion?: string;
  disciplina?: string;
  disciplinaSlug?: string | null;
  organizacion?: string;
  organizacionSlug?: string | null;
  categoriaPeso?: string;
  categoriaPesoSlug?: string | null;
  combatesRelacionados?: CombateRelacionado[] | null;
  noticiasRelacionadas?: NoticiaRelacionada[] | null;
};

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function formatDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-ES");
}

function hasText(value?: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export default async function LuchadorDetallePage({ params }: PageProps) {
  const { slug } = await params;

  const luchador: Luchador | null = await client.fetch(luchadorPorSlugQuery, { slug });

  if (!luchador) {
    notFound();
  }

  const combates = Array.isArray(luchador.combatesRelacionados)
    ? luchador.combatesRelacionados.filter(
        (combate): combate is NonNullable<CombateRelacionado> =>
          Boolean(combate && hasText(combate._id))
      )
    : [];

  const noticias = Array.isArray(luchador.noticiasRelacionadas)
    ? luchador.noticiasRelacionadas.filter(
        (noticia): noticia is NonNullable<NoticiaRelacionada> =>
          Boolean(noticia && hasText(noticia._id) && hasText(noticia.titulo))
      )
    : [];

  const descripcion = hasText(luchador.descripcion) ? luchador.descripcion : "";

  return (
    <main className="luchador-detalle-shell">
      <style>{`
        .luchador-detalle-shell {
          min-height: 100vh;
          color: white;
          padding: 56px 28px 80px;
          box-sizing: border-box;
        }

        .luchador-detalle-container {
          max-width: 1100px;
          margin: 0 auto;
        }

        .luchador-detalle-eyebrow {
          color: #8f8f8f;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin: 0 0 12px 0;
        }

        .luchador-detalle-title {
          font-size: clamp(2.35rem, 6vw, 3.5rem);
          line-height: 1.04;
          margin: 0 0 16px 0;
          letter-spacing: -1.8px;
          max-width: 920px;
          word-break: break-word;
        }

        .luchador-detalle-apodo {
          color: #f5c542;
          font-size: clamp(1.1rem, 2.6vw, 1.5rem);
          line-height: 1.45;
          margin: 0 0 18px 0;
          word-break: break-word;
        }

        .luchador-detalle-descripcion {
          color: #b9b9b9;
          font-size: clamp(1.02rem, 2vw, 1.25rem);
          line-height: 1.85;
          margin: 0 0 30px 0;
          max-width: 920px;
        }

        .luchador-detalle-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 42px;
          padding-bottom: 22px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        .luchador-detalle-meta-pill {
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

        .luchador-detalle-meta-link {
          color: inherit;
          text-decoration: none;
        }

        .luchador-detalle-section {
          margin-bottom: 56px;
        }

        .luchador-detalle-section:last-child {
          margin-bottom: 0;
        }

        .luchador-detalle-section-title {
          font-size: clamp(1.8rem, 3.8vw, 2.25rem);
          margin: 0 0 22px 0;
          letter-spacing: -0.8px;
          line-height: 1.12;
        }

        .luchador-detalle-empty {
          color: #888;
          margin: 0;
          line-height: 1.7;
        }

        .luchador-detalle-grid-combates {
          display: grid;
          gap: 18px;
        }

        .luchador-detalle-grid-noticias {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .luchador-detalle-link {
          text-decoration: none;
          color: inherit;
          min-width: 0;
        }

        .luchador-detalle-card {
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

        .luchador-detalle-link:hover .luchador-detalle-card {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.14);
          box-shadow: 0 14px 34px rgba(0,0,0,0.26);
        }

        .luchador-detalle-card-badge {
          color: #f5c542;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 12px 0;
        }

        .luchador-detalle-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }

        .luchador-detalle-card-title {
          font-size: clamp(1.35rem, 2.4vw, 1.7rem);
          line-height: 1.2;
          margin: 0;
          letter-spacing: -0.5px;
          word-break: break-word;
        }

        .luchador-detalle-card-title-link {
          color: #f5c542;
          text-decoration: none;
        }

        .luchador-detalle-card-inline-cta {
          color: #f5c542;
          text-decoration: none;
          font-size: 14px;
          line-height: 1.4;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .luchador-detalle-card-subtitle {
          color: #f5c542;
          margin: 0 0 10px 0;
          font-size: clamp(1rem, 1.8vw, 1.06rem);
          line-height: 1.5;
          word-break: break-word;
        }

        .luchador-detalle-card-text {
          color: #b9b9b9;
          font-size: 15px;
          line-height: 1.7;
          margin: 0 0 16px 0;
          word-break: break-word;
        }

        .luchador-detalle-card-data {
          display: grid;
          gap: 8px;
          color: #bbb;
          font-size: 15px;
          line-height: 1.65;
          min-width: 0;
        }

        .luchador-detalle-card-data p {
          margin: 0;
          word-break: break-word;
        }

        .luchador-detalle-card-data--muted {
          color: #888;
          font-size: 14px;
        }

        .luchador-detalle-subtle-link {
          color: #b9b9b9;
          text-decoration: none;
        }

        .luchador-detalle-cta {
          margin: 18px 0 0 0;
          color: #f5c542;
          font-size: 14px;
          line-height: 1.4;
          margin-top: auto;
          padding-top: 18px;
        }

        @media (max-width: 1100px) {
          .luchador-detalle-grid-noticias {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 900px) {
          .luchador-detalle-shell {
            padding: 36px 18px 56px;
          }

          .luchador-detalle-meta {
            margin-bottom: 30px;
          }

          .luchador-detalle-section {
            margin-bottom: 42px;
          }

          .luchador-detalle-card {
            padding: 22px;
          }
        }

        @media (max-width: 640px) {
          .luchador-detalle-shell {
            padding: 24px 14px 40px;
          }

          .luchador-detalle-meta {
            gap: 10px;
            margin-bottom: 24px;
            padding-bottom: 18px;
          }

          .luchador-detalle-meta-pill {
            padding: 9px 12px;
            font-size: 12px;
          }

          .luchador-detalle-section {
            margin-bottom: 34px;
          }

          .luchador-detalle-grid-combates,
          .luchador-detalle-grid-noticias {
            gap: 16px;
          }

          .luchador-detalle-grid-noticias {
            grid-template-columns: minmax(0, 1fr);
          }

          .luchador-detalle-card {
            padding: 18px;
            border-radius: 16px;
          }

          .luchador-detalle-card-header {
            gap: 12px;
            margin-bottom: 12px;
          }

          .luchador-detalle-card-inline-cta {
            white-space: normal;
          }

          .luchador-detalle-card-text,
          .luchador-detalle-card-data {
            font-size: 14px;
          }

          .luchador-detalle-card-data--muted {
            font-size: 13px;
          }

          .luchador-detalle-cta {
            padding-top: 16px;
          }
        }
      `}</style>

      <section className="luchador-detalle-container">
        <p className="luchador-detalle-eyebrow">Luchador</p>

        <h1 className="luchador-detalle-title">{luchador.nombre}</h1>

        {hasText(luchador.apodo) && <p className="luchador-detalle-apodo">{luchador.apodo}</p>}

        {descripcion && <p className="luchador-detalle-descripcion">{descripcion}</p>}

        <div className="luchador-detalle-meta">
          {hasText(luchador.nacionalidad) && (
            <span className="luchador-detalle-meta-pill">
              Nacionalidad: {luchador.nacionalidad}
            </span>
          )}

          {hasText(luchador.record) && (
            <span className="luchador-detalle-meta-pill">Récord: {luchador.record}</span>
          )}

          {hasText(luchador.disciplina) && (
            <span className="luchador-detalle-meta-pill">
              Disciplina:{" "}
              {hasText(luchador.disciplinaSlug) ? (
                <Link
                  href={`/disciplinas/${luchador.disciplinaSlug}`}
                  className="luchador-detalle-meta-link"
                >
                  {luchador.disciplina}
                </Link>
              ) : (
                luchador.disciplina
              )}
            </span>
          )}

          {hasText(luchador.organizacion) && (
            <span className="luchador-detalle-meta-pill">
              Organización:{" "}
              {hasText(luchador.organizacionSlug) ? (
                <Link
                  href={`/organizaciones/${luchador.organizacionSlug}`}
                  className="luchador-detalle-meta-link"
                >
                  {luchador.organizacion}
                </Link>
              ) : (
                luchador.organizacion
              )}
            </span>
          )}

          {hasText(luchador.categoriaPeso) && (
            <span className="luchador-detalle-meta-pill">
              Categoría:{" "}
              {hasText(luchador.categoriaPesoSlug) ? (
                <Link
                  href={`/categorias-peso/${luchador.categoriaPesoSlug}`}
                  className="luchador-detalle-meta-link"
                >
                  {luchador.categoriaPeso}
                </Link>
              ) : (
                luchador.categoriaPeso
              )}
            </span>
          )}

          <span className="luchador-detalle-meta-pill">
            Estado: {luchador.activo ? "Activo" : "Inactivo"}
          </span>
        </div>

        <section className="luchador-detalle-section">
          <h2 className="luchador-detalle-section-title">Combates relacionados</h2>

          {combates.length === 0 ? (
            <p className="luchador-detalle-empty">
              Todavía no hay combates asociados a este luchador.
            </p>
          ) : (
            <div className="luchador-detalle-grid-combates">
              {combates.map((combate) => {
                const luchadorRojoNombre = hasText(combate.luchadorRojo)
                  ? combate.luchadorRojo
                  : "Luchador rojo";
                const luchadorAzulNombre = hasText(combate.luchadorAzul)
                  ? combate.luchadorAzul
                  : "Luchador azul";
                const ganadorNombre = hasText(combate.ganador) ? combate.ganador : "";

                return (
                  <article key={combate._id} className="luchador-detalle-card">
                    <div className="luchador-detalle-card-header">
                      <h3 className="luchador-detalle-card-title">
                        {hasText(combate.luchadorRojoSlug) ? (
                          <Link
                            href={`/luchadores/${combate.luchadorRojoSlug}`}
                            className="luchador-detalle-card-title-link"
                          >
                            {luchadorRojoNombre}
                          </Link>
                        ) : (
                          luchadorRojoNombre
                        )}{" "}
                        vs{" "}
                        {hasText(combate.luchadorAzulSlug) ? (
                          <Link
                            href={`/luchadores/${combate.luchadorAzulSlug}`}
                            className="luchador-detalle-card-title-link"
                          >
                            {luchadorAzulNombre}
                          </Link>
                        ) : (
                          luchadorAzulNombre
                        )}
                      </h3>

                      <Link
                        href={`/resultados/${combate._id}`}
                        className="luchador-detalle-card-inline-cta"
                      >
                        Ver resultado
                      </Link>
                    </div>

                    {ganadorNombre && (
                      <p className="luchador-detalle-card-subtitle">
                        Ganador: {ganadorNombre}
                      </p>
                    )}

                    <div className="luchador-detalle-card-data">
                      {hasText(combate.evento) && hasText(combate.eventoSlug) ? (
                        <p>
                          Evento:{" "}
                          <Link
                            href={`/eventos/${combate.eventoSlug}`}
                            className="luchador-detalle-subtle-link"
                          >
                            {combate.evento}
                          </Link>
                        </p>
                      ) : hasText(combate.evento) ? (
                        <p>Evento: {combate.evento}</p>
                      ) : null}

                      {hasText(combate.categoriaPeso) && hasText(combate.categoriaPesoSlug) ? (
                        <p>
                          Categoría:{" "}
                          <Link
                            href={`/categorias-peso/${combate.categoriaPesoSlug}`}
                            className="luchador-detalle-subtle-link"
                          >
                            {combate.categoriaPeso}
                          </Link>
                        </p>
                      ) : hasText(combate.categoriaPeso) ? (
                        <p>Categoría: {combate.categoriaPeso}</p>
                      ) : null}

                      {hasText(combate.estado) && <p>Estado: {combate.estado}</p>}
                      {hasText(combate.metodo) && <p>Método: {combate.metodo}</p>}
                      {typeof combate.asalto === "number" && <p>Asalto final: {combate.asalto}</p>}
                      {hasText(combate.tiempo) && <p>Tiempo final: {combate.tiempo}</p>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="luchador-detalle-section">
          <h2 className="luchador-detalle-section-title">Noticias relacionadas</h2>

          {noticias.length === 0 ? (
            <p className="luchador-detalle-empty">
              Todavía no hay noticias relacionadas con este luchador.
            </p>
          ) : (
            <div className="luchador-detalle-grid-noticias">
              {noticias.map((noticia) => {
                const hasSlug = hasText(noticia.slug);

                const card = (
                  <article className="luchador-detalle-card">
                    <h3 className="luchador-detalle-card-title">{noticia.titulo}</h3>

                    {hasText(noticia.extracto) && (
                      <p className="luchador-detalle-card-text">{noticia.extracto}</p>
                    )}

                    <div className="luchador-detalle-card-data luchador-detalle-card-data--muted">
                      {hasText(noticia.fechaPublicacion) && (
                        <p>Publicada el {formatDate(noticia.fechaPublicacion)}</p>
                      )}
                    </div>

                    <p className="luchador-detalle-cta">Leer noticia</p>
                  </article>
                );

                return hasSlug ? (
                  <Link
                    key={noticia._id}
                    href={`/noticias/${noticia.slug}`}
                    className="luchador-detalle-link"
                  >
                    {card}
                  </Link>
                ) : (
                  <div key={noticia._id} className="luchador-detalle-link">
                    {card}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}