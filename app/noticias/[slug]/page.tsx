import Link from "next/link";
import {notFound} from "next/navigation";
import type {CSSProperties} from "react";
import {PortableText} from "@portabletext/react";
import type {PortableTextComponents} from "@portabletext/react";
import {client} from "../../../sanity/lib/client";
import {noticiaPorSlugQuery} from "../../../sanity/lib/queries";

type LuchadorRelacionado = {
  nombre: string;
  slug?: string;
};

type Noticia = {
  _id: string;
  titulo: string;
  slug: string;
  extracto?: string;
  contenido?: unknown;
  fechaPublicacion?: string;
  destacada?: boolean;
  disciplina?: string;
  eventoRelacionado?: string;
  eventoRelacionadoSlug?: string;
  luchadoresRelacionados?: string[];
  luchadoresRelacionadosData?: LuchadorRelacionado[];
};

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const shellStyle: CSSProperties = {
  minHeight: "100vh",
  color: "white",
  padding: "56px 28px 88px",
};

const containerStyle: CSSProperties = {
  maxWidth: "1120px",
  margin: "0 auto",
};

const heroStyle: CSSProperties = {
  marginBottom: "40px",
};

const eyebrowStyle: CSSProperties = {
  color: "#8f8f8f",
  fontSize: "12px",
  textTransform: "uppercase",
  letterSpacing: "2px",
  marginBottom: "14px",
};

const titleStyle: CSSProperties = {
  fontSize: "64px",
  lineHeight: 1.02,
  margin: "0 0 18px 0",
  letterSpacing: "-2.2px",
  maxWidth: "940px",
};

const extractoStyle: CSSProperties = {
  color: "#b9b9b9",
  fontSize: "24px",
  lineHeight: 1.75,
  margin: "0 0 28px 0",
  maxWidth: "900px",
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  fontSize: "13px",
  color: "#8a8a8a",
  marginBottom: "8px",
};

const metaPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "10px 14px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 760px) minmax(280px, 320px)",
  gap: "28px",
  alignItems: "start",
};

const articleCardStyle: CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "22px",
  padding: "34px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};

const asideWrapStyle: CSSProperties = {
  position: "sticky",
  top: "96px",
  display: "grid",
  gap: "20px",
};

const asideCardStyle: CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "22px",
  padding: "24px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
};

const sectionLabelStyle: CSSProperties = {
  color: "#8f8f8f",
  fontSize: "12px",
  textTransform: "uppercase",
  letterSpacing: "1.6px",
  margin: "0 0 10px 0",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: "28px",
  margin: "0 0 18px 0",
  letterSpacing: "-0.6px",
};

const accentLinkStyle: CSSProperties = {
  color: "#f5c542",
  textDecoration: "none",
};

const secondaryLinkStyle: CSSProperties = {
  color: "#f5c542",
  textDecoration: "none",
  fontSize: "16px",
  lineHeight: 1.4,
};

const dividerStyle: CSSProperties = {
  border: "none",
  borderTop: "1px solid rgba(255,255,255,0.08)",
  margin: "22px 0",
};

const portableTextComponents: PortableTextComponents = {
  block: {
    normal: ({children}) => (
      <p
        style={{
          color: "#d2d2d2",
          fontSize: "19px",
          lineHeight: 1.95,
          margin: "0 0 22px 0",
        }}
      >
        {children}
      </p>
    ),
    h2: ({children}) => (
      <h2
        style={{
          color: "white",
          fontSize: "38px",
          lineHeight: 1.15,
          letterSpacing: "-1px",
          margin: "46px 0 18px 0",
        }}
      >
        {children}
      </h2>
    ),
    h3: ({children}) => (
      <h3
        style={{
          color: "white",
          fontSize: "29px",
          lineHeight: 1.22,
          letterSpacing: "-0.6px",
          margin: "36px 0 16px 0",
        }}
      >
        {children}
      </h3>
    ),
    h4: ({children}) => (
      <h4
        style={{
          color: "white",
          fontSize: "22px",
          lineHeight: 1.3,
          letterSpacing: "-0.3px",
          margin: "28px 0 14px 0",
        }}
      >
        {children}
      </h4>
    ),
    blockquote: ({children}) => (
      <blockquote
        style={{
          margin: "30px 0",
          padding: "22px 24px",
          borderLeft: "3px solid rgba(245,197,66,0.9)",
          background: "rgba(255,255,255,0.03)",
          borderRadius: "12px",
          color: "#ececec",
          fontSize: "20px",
          lineHeight: 1.85,
        }}
      >
        {children}
      </blockquote>
    ),
  },
  list: {
    bullet: ({children}) => (
      <ul
        style={{
          color: "#d2d2d2",
          fontSize: "19px",
          lineHeight: 1.9,
          margin: "0 0 26px 0",
          paddingLeft: "26px",
        }}
      >
        {children}
      </ul>
    ),
    number: ({children}) => (
      <ol
        style={{
          color: "#d2d2d2",
          fontSize: "19px",
          lineHeight: 1.9,
          margin: "0 0 26px 0",
          paddingLeft: "26px",
        }}
      >
        {children}
      </ol>
    ),
  },
  listItem: {
    bullet: ({children}) => <li style={{marginBottom: "10px"}}>{children}</li>,
    number: ({children}) => <li style={{marginBottom: "10px"}}>{children}</li>,
  },
  marks: {
    strong: ({children}) => (
      <strong
        style={{
          color: "white",
          fontWeight: 700,
        }}
      >
        {children}
      </strong>
    ),
    em: ({children}) => (
      <em
        style={{
          color: "#f1f1f1",
          fontStyle: "italic",
        }}
      >
        {children}
      </em>
    ),
    link: ({children, value}) => {
      const href = typeof value?.href === "string" ? value.href : "#";
      const isExternal = href.startsWith("http");

      return (
        <a
          href={href}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noreferrer noopener" : undefined}
          style={{
            color: "#f5c542",
            textDecoration: "none",
            borderBottom: "1px solid rgba(245,197,66,0.45)",
          }}
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
      <p
        style={{
          color: "#9d9d9d",
          fontSize: "18px",
          lineHeight: 1.8,
          margin: 0,
        }}
      >
        Esta noticia todavía no tiene contenido disponible.
      </p>
    );
  }

  if (typeof contenido === "string") {
    return contenido
      .split("\n")
      .filter((parrafo) => parrafo.trim().length > 0)
      .map((parrafo, index) => (
        <p
          key={index}
          style={{
            color: "#d2d2d2",
            fontSize: "19px",
            lineHeight: 1.95,
            margin: "0 0 22px 0",
          }}
        >
          {parrafo}
        </p>
      ));
  }

  if (esArrayPortableText(contenido)) {
    return <PortableText value={contenido as any} components={portableTextComponents} />;
  }

  return (
    <p
      style={{
        color: "#9d9d9d",
        fontSize: "18px",
        lineHeight: 1.8,
        margin: 0,
      }}
    >
      No se ha podido renderizar el contenido de esta noticia.
    </p>
  );
}

export default async function NoticiaDetallePage({params}: PageProps) {
  const {slug} = await params;

  const noticia: Noticia | null = await client.fetch(noticiaPorSlugQuery, {slug});

  if (!noticia) {
    notFound();
  }

  const luchadoresConSlug =
    noticia.luchadoresRelacionadosData?.filter((luchador) => Boolean(luchador.slug)) ?? [];

  return (
    <main style={shellStyle}>
      <section style={containerStyle}>
        <header style={heroStyle}>
          <p style={eyebrowStyle}>Noticia</p>

          <h1 style={titleStyle}>{noticia.titulo}</h1>

          {noticia.extracto && <p style={extractoStyle}>{noticia.extracto}</p>}

          <div style={metaRowStyle}>
            {noticia.fechaPublicacion && (
              <span style={metaPillStyle}>
                Publicada el {new Date(noticia.fechaPublicacion).toLocaleDateString("es-ES")}
              </span>
            )}

            {noticia.disciplina && (
              <span style={metaPillStyle}>Disciplina: {noticia.disciplina}</span>
            )}

            {noticia.destacada && <span style={metaPillStyle}>Destacada</span>}
          </div>
        </header>

        <div style={gridStyle}>
          <article style={articleCardStyle}>
            {renderContenido(noticia.contenido)}

            <hr style={dividerStyle} />

            <section
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "18px",
              }}
            >
              {noticia.eventoRelacionadoSlug && (
                <Link href={`/eventos/${noticia.eventoRelacionadoSlug}`} style={accentLinkStyle}>
                  Ir al evento relacionado
                </Link>
              )}

              {luchadoresConSlug.slice(0, 2).map((luchador) => (
                <Link
                  key={`${luchador.nombre}-${luchador.slug}-footer`}
                  href={`/luchadores/${luchador.slug}`}
                  style={accentLinkStyle}
                >
                  Ver perfil de {luchador.nombre}
                </Link>
              ))}
            </section>
          </article>

          <aside style={asideWrapStyle}>
            {(noticia.eventoRelacionado ||
              (noticia.luchadoresRelacionadosData &&
                noticia.luchadoresRelacionadosData.length > 0)) && (
              <section style={asideCardStyle}>
                <h2 style={sectionTitleStyle}>Contexto relacionado</h2>

                {noticia.eventoRelacionado && (
                  <div style={{marginBottom: noticia.luchadoresRelacionadosData?.length ? "22px" : 0}}>
                    <p style={sectionLabelStyle}>Evento</p>

                    {noticia.eventoRelacionadoSlug ? (
                      <Link
                        href={`/eventos/${noticia.eventoRelacionadoSlug}`}
                        style={{
                          color: "#f5c542",
                          textDecoration: "none",
                          fontSize: "22px",
                          lineHeight: 1.35,
                        }}
                      >
                        {noticia.eventoRelacionado}
                      </Link>
                    ) : (
                      <p
                        style={{
                          color: "#d2d2d2",
                          fontSize: "22px",
                          lineHeight: 1.35,
                          margin: 0,
                        }}
                      >
                        {noticia.eventoRelacionado}
                      </p>
                    )}
                  </div>
                )}

                {noticia.luchadoresRelacionadosData &&
                  noticia.luchadoresRelacionadosData.length > 0 && (
                    <div>
                      <p style={sectionLabelStyle}>Luchadores relacionados</p>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "10px",
                        }}
                      >
                        {noticia.luchadoresRelacionadosData.map((luchador) =>
                          luchador.slug ? (
                            <Link
                              key={`${luchador.nombre}-${luchador.slug}`}
                              href={`/luchadores/${luchador.slug}`}
                              style={{
                                color: "#f5c542",
                                textDecoration: "none",
                                border: "1px solid rgba(245,197,66,0.28)",
                                padding: "10px 14px",
                                borderRadius: "999px",
                                fontSize: "14px",
                              }}
                            >
                              {luchador.nombre}
                            </Link>
                          ) : (
                            <span
                              key={luchador.nombre}
                              style={{
                                color: "#d2d2d2",
                                border: "1px solid rgba(255,255,255,0.12)",
                                padding: "10px 14px",
                                borderRadius: "999px",
                                fontSize: "14px",
                              }}
                            >
                              {luchador.nombre}
                            </span>
                          ),
                        )}
                      </div>
                    </div>
                  )}
              </section>
            )}

            <section style={asideCardStyle}>
              <p style={sectionLabelStyle}>Navegación</p>
              <h2
                style={{
                  fontSize: "24px",
                  margin: "0 0 18px 0",
                  letterSpacing: "-0.4px",
                }}
              >
                Sigue explorando
              </h2>

              <div
                style={{
                  display: "grid",
                  gap: "14px",
                }}
              >
                <Link href="/noticias" style={secondaryLinkStyle}>
                  Volver a noticias
                </Link>

                <Link href="/eventos" style={secondaryLinkStyle}>
                  Ver todos los eventos
                </Link>

                <Link href="/luchadores" style={secondaryLinkStyle}>
                  Explorar luchadores
                </Link>

                <Link href="/resultados" style={secondaryLinkStyle}>
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