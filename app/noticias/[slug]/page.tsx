import Link from "next/link";
import { notFound } from "next/navigation";
import type { PortableTextComponents } from "@portabletext/react";
import { PortableText } from "@portabletext/react";
import { client } from "../../../sanity/lib/client";
import { noticiaPorSlugQuery } from "../../../sanity/lib/queries";

type RelacionBasica = {
  _id?: string;
  nombre?: string;
  titulo?: string;
  slug?: string | null;
};

type TextoOReferencia = string | RelacionBasica | null | undefined;

type LuchadorRelacionado = {
  nombre?: string;
  slug?: string | null;
};

type Noticia = {
  _id: string;
  titulo: string;
  slug: string;
  extracto?: string;
  contenido?: unknown;
  fechaPublicacion?: string;
  destacada?: boolean;
  disciplina?: TextoOReferencia;
  disciplinaSlug?: string | null;
  eventoRelacionado?: TextoOReferencia;
  eventoRelacionadoSlug?: string | null;
  organizacionRelacionada?: TextoOReferencia;
  organizacionRelacionadaSlug?: string | null;
  luchadoresRelacionados?: Array<string | RelacionBasica> | null;
  luchadoresRelacionadosData?: LuchadorRelacionado[] | null;
};

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function getDisplayText(value: TextoOReferencia) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.nombre ?? value.titulo ?? "";
}

function getSlug(value: TextoOReferencia) {
  if (!value || typeof value === "string") return undefined;
  return value.slug ?? undefined;
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-ES");
}

const portableTextComponents: PortableTextComponents = {
  block: {
    normal: ({ children }) => <p className="noticia-pt-p">{children}</p>,
    h2: ({ children }) => <h2 className="noticia-pt-h2">{children}</h2>,
    h3: ({ children }) => <h3 className="noticia-pt-h3">{children}</h3>,
    h4: ({ children }) => <h4 className="noticia-pt-h4">{children}</h4>,
    blockquote: ({ children }) => (
      <blockquote className="noticia-pt-blockquote">{children}</blockquote>
    ),
  },
  list: {
    bullet: ({ children }) => <ul className="noticia-pt-ul">{children}</ul>,
    number: ({ children }) => <ol className="noticia-pt-ol">{children}</ol>,
  },
  listItem: {
    bullet: ({ children }) => <li className="noticia-pt-li">{children}</li>,
    number: ({ children }) => <li className="noticia-pt-li">{children}</li>,
  },
  marks: {
    strong: ({ children }) => <strong className="noticia-pt-strong">{children}</strong>,
    em: ({ children }) => <em className="noticia-pt-em">{children}</em>,
    link: ({ children, value }) => {
      const href = typeof value?.href === "string" ? value.href : "#";
      const isExternal = href.startsWith("http");

      return (
        <a
          href={href}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noreferrer noopener" : undefined}
          className="noticia-pt-link"
        >
          {children}
        </a>
      );
    },
  },
};

function esArrayPortableText(contenido: unknown): contenido is unknown[] {
  return Array.isArray(contenido);
}

function renderContenido(contenido: unknown) {
  if (!contenido) {
    return (
      <p className="noticia-contenido-vacio">
        Esta noticia todavía no tiene contenido disponible.
      </p>
    );
  }

  if (typeof contenido === "string") {
    return contenido
      .split("\n")
      .filter((parrafo) => parrafo.trim().length > 0)
      .map((parrafo, index) => (
        <p key={index} className="noticia-pt-p">
          {parrafo}
        </p>
      ));
  }

  if (esArrayPortableText(contenido)) {
    return <PortableText value={contenido as any} components={portableTextComponents} />;
  }

  return (
    <p className="noticia-contenido-vacio">
      No se ha podido renderizar el contenido de esta noticia.
    </p>
  );
}

export default async function NoticiaDetallePage({ params }: PageProps) {
  const { slug } = await params;

  const noticia: Noticia | null = await client.fetch(noticiaPorSlugQuery, { slug });

  if (!noticia) {
    notFound();
  }

  const luchadoresRelacionadosBase = Array.isArray(noticia.luchadoresRelacionadosData)
    ? noticia.luchadoresRelacionadosData
    : [];

  const luchadoresRelacionados = luchadoresRelacionadosBase.filter(
    (luchador) => typeof luchador?.nombre === "string" && luchador.nombre.trim().length > 0
  );

  const luchadoresConSlug = luchadoresRelacionados.filter(
    (luchador) => typeof luchador.slug === "string" && luchador.slug.trim().length > 0
  );

  const disciplinaTexto = getDisplayText(noticia.disciplina);
  const disciplinaSlug = noticia.disciplinaSlug || getSlug(noticia.disciplina);

  const eventoRelacionadoTexto = getDisplayText(noticia.eventoRelacionado);
  const organizacionRelacionadaTexto = getDisplayText(noticia.organizacionRelacionada);

  const eventoSlug = noticia.eventoRelacionadoSlug || getSlug(noticia.eventoRelacionado);
  const organizacionSlug =
    noticia.organizacionRelacionadaSlug || getSlug(noticia.organizacionRelacionada);

  const hayContextoRelacionado =
    Boolean(disciplinaTexto) ||
    Boolean(eventoRelacionadoTexto) ||
    Boolean(organizacionRelacionadaTexto) ||
    luchadoresRelacionados.length > 0;

  return (
    <main className="noticia-shell">
      <style>{`
        .noticia-shell {
          min-height: 100vh;
          color: white;
          padding: 56px 28px 88px;
          box-sizing: border-box;
        }

        .noticia-container {
          max-width: 1120px;
          margin: 0 auto;
        }

        .noticia-hero {
          margin-bottom: 40px;
        }

        .noticia-eyebrow {
          color: #8f8f8f;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin: 0 0 14px 0;
        }

        .noticia-title {
          font-size: clamp(2.4rem, 6vw, 4rem);
          line-height: 1.02;
          margin: 0 0 18px 0;
          letter-spacing: -2px;
          max-width: 940px;
          word-break: break-word;
        }

        .noticia-extracto {
          color: #b9b9b9;
          font-size: clamp(1.15rem, 2.7vw, 1.5rem);
          line-height: 1.75;
          margin: 0 0 28px 0;
          max-width: 900px;
        }

        .noticia-meta-row {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          font-size: 13px;
          color: #8a8a8a;
          margin-bottom: 8px;
        }

        .noticia-meta-pill {
          display: inline-flex;
          align-items: center;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          line-height: 1.4;
        }

        .noticia-meta-link {
          color: inherit;
          text-decoration: none;
        }

        .noticia-grid {
          display: grid;
          grid-template-columns: minmax(0, 760px) minmax(280px, 320px);
          gap: 28px;
          align-items: start;
        }

        .noticia-article-card {
          background:
            linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 22px;
          padding: 34px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          min-width: 0;
        }

        .noticia-aside-wrap {
          position: sticky;
          top: 96px;
          display: grid;
          gap: 20px;
        }

        .noticia-aside-card {
          background:
            linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 22px;
          padding: 24px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.18);
          min-width: 0;
        }

        .noticia-section-label {
          color: #8f8f8f;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.6px;
          margin: 0 0 10px 0;
        }

        .noticia-section-title {
          font-size: clamp(1.45rem, 3vw, 1.75rem);
          margin: 0 0 18px 0;
          letter-spacing: -0.6px;
          line-height: 1.15;
        }

        .noticia-evento-link,
        .noticia-accent-link,
        .noticia-secondary-link {
          color: #f5c542;
          text-decoration: none;
        }

        .noticia-evento-link {
          font-size: clamp(1.05rem, 2.2vw, 1.375rem);
          line-height: 1.35;
        }

        .noticia-evento-texto {
          color: #d2d2d2;
          font-size: clamp(1.05rem, 2.2vw, 1.375rem);
          line-height: 1.35;
          margin: 0;
        }

        .noticia-secondary-link {
          font-size: 16px;
          line-height: 1.4;
        }

        .noticia-divider {
          border: none;
          border-top: 1px solid rgba(255,255,255,0.08);
          margin: 22px 0;
        }

        .noticia-footer-links {
          display: flex;
          flex-wrap: wrap;
          gap: 18px;
        }

        .noticia-evento-bloque {
          margin-bottom: 22px;
        }

        .noticia-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .noticia-chip-link,
        .noticia-chip-texto {
          padding: 10px 14px;
          border-radius: 999px;
          font-size: 14px;
          line-height: 1.35;
          word-break: break-word;
        }

        .noticia-chip-link {
          color: #f5c542;
          text-decoration: none;
          border: 1px solid rgba(245,197,66,0.28);
        }

        .noticia-chip-texto {
          color: #d2d2d2;
          border: 1px solid rgba(255,255,255,0.12);
        }

        .noticia-nav-links {
          display: grid;
          gap: 14px;
        }

        .noticia-contenido-vacio {
          color: #9d9d9d;
          font-size: 18px;
          line-height: 1.8;
          margin: 0;
        }

        .noticia-pt-p {
          color: #d2d2d2;
          font-size: clamp(1rem, 1.8vw, 1.1875rem);
          line-height: 1.95;
          margin: 0 0 22px 0;
        }

        .noticia-pt-h2 {
          color: white;
          font-size: clamp(1.8rem, 4vw, 2.375rem);
          line-height: 1.15;
          letter-spacing: -1px;
          margin: 46px 0 18px 0;
        }

        .noticia-pt-h3 {
          color: white;
          font-size: clamp(1.45rem, 3vw, 1.8125rem);
          line-height: 1.22;
          letter-spacing: -0.6px;
          margin: 36px 0 16px 0;
        }

        .noticia-pt-h4 {
          color: white;
          font-size: clamp(1.15rem, 2.2vw, 1.375rem);
          line-height: 1.3;
          letter-spacing: -0.3px;
          margin: 28px 0 14px 0;
        }

        .noticia-pt-blockquote {
          margin: 30px 0;
          padding: 22px 24px;
          border-left: 3px solid rgba(245,197,66,0.9);
          background: rgba(255,255,255,0.03);
          border-radius: 12px;
          color: #ececec;
          font-size: clamp(1.05rem, 2vw, 1.25rem);
          line-height: 1.85;
        }

        .noticia-pt-ul,
        .noticia-pt-ol {
          color: #d2d2d2;
          font-size: clamp(1rem, 1.8vw, 1.1875rem);
          line-height: 1.9;
          margin: 0 0 26px 0;
          padding-left: 26px;
        }

        .noticia-pt-li {
          margin-bottom: 10px;
        }

        .noticia-pt-strong {
          color: white;
          font-weight: 700;
        }

        .noticia-pt-em {
          color: #f1f1f1;
          font-style: italic;
        }

        .noticia-pt-link {
          color: #f5c542;
          text-decoration: none;
          border-bottom: 1px solid rgba(245,197,66,0.45);
        }

        @media (max-width: 1024px) {
          .noticia-grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .noticia-aside-wrap {
            position: static;
          }
        }

        @media (max-width: 900px) {
          .noticia-shell {
            padding: 36px 18px 56px;
          }

          .noticia-hero {
            margin-bottom: 28px;
          }

          .noticia-article-card {
            padding: 24px;
            border-radius: 20px;
          }

          .noticia-aside-card {
            padding: 22px;
            border-radius: 20px;
          }
        }

        @media (max-width: 640px) {
          .noticia-shell {
            padding: 24px 14px 40px;
          }

          .noticia-title {
            letter-spacing: -1.2px;
            margin-bottom: 14px;
          }

          .noticia-extracto {
            margin-bottom: 20px;
            line-height: 1.65;
          }

          .noticia-meta-row {
            gap: 10px;
          }

          .noticia-meta-pill {
            padding: 9px 12px;
            font-size: 12px;
          }

          .noticia-grid {
            gap: 18px;
          }

          .noticia-article-card,
          .noticia-aside-card {
            padding: 18px;
            border-radius: 18px;
          }

          .noticia-footer-links {
            gap: 14px;
          }

          .noticia-chips {
            gap: 8px;
          }

          .noticia-chip-link,
          .noticia-chip-texto {
            padding: 9px 12px;
            font-size: 13px;
          }

          .noticia-nav-links {
            gap: 12px;
          }

          .noticia-pt-p {
            line-height: 1.82;
            margin-bottom: 18px;
          }

          .noticia-pt-h2 {
            margin: 34px 0 14px 0;
          }

          .noticia-pt-h3 {
            margin: 28px 0 12px 0;
          }

          .noticia-pt-h4 {
            margin: 22px 0 10px 0;
          }

          .noticia-pt-blockquote {
            margin: 24px 0;
            padding: 16px 16px 16px 18px;
            line-height: 1.7;
          }

          .noticia-pt-ul,
          .noticia-pt-ol {
            padding-left: 20px;
            margin-bottom: 20px;
            line-height: 1.8;
          }
        }
      `}</style>

      <section className="noticia-container">
        <header className="noticia-hero">
          <p className="noticia-eyebrow">Noticia</p>

          <h1 className="noticia-title">{noticia.titulo}</h1>

          {noticia.extracto && <p className="noticia-extracto">{noticia.extracto}</p>}

          <div className="noticia-meta-row">
            {noticia.fechaPublicacion && (
              <span className="noticia-meta-pill">
                Publicada el {formatDate(noticia.fechaPublicacion)}
              </span>
            )}

            {disciplinaTexto && (
              <span className="noticia-meta-pill">
                Disciplina:{" "}
                {disciplinaSlug ? (
                  <Link href={`/disciplinas/${disciplinaSlug}`} className="noticia-meta-link">
                    {disciplinaTexto}
                  </Link>
                ) : (
                  disciplinaTexto
                )}
              </span>
            )}

            {noticia.destacada && <span className="noticia-meta-pill">Destacada</span>}
          </div>
        </header>

        <div className="noticia-grid">
          <article className="noticia-article-card">
            {renderContenido(noticia.contenido)}

            <hr className="noticia-divider" />

            <section className="noticia-footer-links">
              {disciplinaSlug && disciplinaTexto && (
                <Link href={`/disciplinas/${disciplinaSlug}`} className="noticia-accent-link">
                  Ir a {disciplinaTexto}
                </Link>
              )}

              {eventoSlug && eventoRelacionadoTexto && (
                <Link href={`/eventos/${eventoSlug}`} className="noticia-accent-link">
                  Ir al evento relacionado
                </Link>
              )}

              {organizacionSlug && organizacionRelacionadaTexto && (
                <Link
                  href={`/organizaciones/${organizacionSlug}`}
                  className="noticia-accent-link"
                >
                  Ver organización relacionada
                </Link>
              )}

              {luchadoresConSlug.slice(0, 3).map((luchador) => (
                <Link
                  key={`${luchador.nombre}-${luchador.slug}-footer`}
                  href={`/luchadores/${luchador.slug}`}
                  className="noticia-accent-link"
                >
                  Ver perfil de {luchador.nombre}
                </Link>
              ))}
            </section>
          </article>

          <aside className="noticia-aside-wrap">
            {hayContextoRelacionado && (
              <section className="noticia-aside-card">
                <h2 className="noticia-section-title">Contexto relacionado</h2>

                {disciplinaTexto && (
                  <div className="noticia-evento-bloque">
                    <p className="noticia-section-label">Disciplina</p>

                    {disciplinaSlug ? (
                      <Link href={`/disciplinas/${disciplinaSlug}`} className="noticia-evento-link">
                        {disciplinaTexto}
                      </Link>
                    ) : (
                      <p className="noticia-evento-texto">{disciplinaTexto}</p>
                    )}
                  </div>
                )}

                {eventoRelacionadoTexto && (
                  <div className="noticia-evento-bloque">
                    <p className="noticia-section-label">Evento</p>

                    {eventoSlug ? (
                      <Link href={`/eventos/${eventoSlug}`} className="noticia-evento-link">
                        {eventoRelacionadoTexto}
                      </Link>
                    ) : (
                      <p className="noticia-evento-texto">{eventoRelacionadoTexto}</p>
                    )}
                  </div>
                )}

                {organizacionRelacionadaTexto && (
                  <div
                    className={luchadoresRelacionados.length > 0 ? "noticia-evento-bloque" : undefined}
                  >
                    <p className="noticia-section-label">Organización</p>

                    {organizacionSlug ? (
                      <Link
                        href={`/organizaciones/${organizacionSlug}`}
                        className="noticia-evento-link"
                      >
                        {organizacionRelacionadaTexto}
                      </Link>
                    ) : (
                      <p className="noticia-evento-texto">{organizacionRelacionadaTexto}</p>
                    )}
                  </div>
                )}

                {luchadoresRelacionados.length > 0 && (
                  <div>
                    <p className="noticia-section-label">Luchadores relacionados</p>

                    <div className="noticia-chips">
                      {luchadoresRelacionados.map((luchador) =>
                        luchador.slug ? (
                          <Link
                            key={`${luchador.nombre}-${luchador.slug}`}
                            href={`/luchadores/${luchador.slug}`}
                            className="noticia-chip-link"
                          >
                            {luchador.nombre}
                          </Link>
                        ) : (
                          <span key={luchador.nombre} className="noticia-chip-texto">
                            {luchador.nombre}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}

            <section className="noticia-aside-card">
              <p className="noticia-section-label">Navegación</p>
              <h2 className="noticia-section-title">Sigue explorando</h2>

              <div className="noticia-nav-links">
                <Link href="/noticias" className="noticia-secondary-link">
                  Volver a noticias
                </Link>

                <Link href="/eventos" className="noticia-secondary-link">
                  Ver todos los eventos
                </Link>

                <Link href="/luchadores" className="noticia-secondary-link">
                  Explorar luchadores
                </Link>

                <Link href="/resultados" className="noticia-secondary-link">
                  Consultar resultados
                </Link>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}