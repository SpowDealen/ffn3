import Link from "next/link";
import {notFound} from "next/navigation";
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

const cardStyle = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "18px",
  padding: "24px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};

const accentLinkStyle = {
  color: "#f5c542",
  textDecoration: "none",
};

function renderContenido(contenido: unknown) {
  if (!contenido) {
    return null;
  }

  if (typeof contenido === "string") {
    return contenido.split("\n").filter(Boolean).map((parrafo, index) => (
      <p
        key={index}
        style={{
          color: "#d2d2d2",
          fontSize: "18px",
          lineHeight: 1.9,
          marginBottom: "18px",
        }}
      >
        {parrafo}
      </p>
    ));
  }

  return (
    <pre
      style={{
        whiteSpace: "pre-wrap",
        color: "#d2d2d2",
        fontSize: "16px",
        lineHeight: 1.7,
        fontFamily: "inherit",
        margin: 0,
      }}
    >
      {JSON.stringify(contenido, null, 2)}
    </pre>
  );
}

export default async function NoticiaDetallePage({params}: PageProps) {
  const {slug} = await params;

  const noticia: Noticia | null = await client.fetch(noticiaPorSlugQuery, {slug});

  if (!noticia) {
    notFound();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        color: "white",
        padding: "56px 28px 80px",
      }}
    >
      <section
        style={{
          maxWidth: "920px",
          margin: "0 auto",
        }}
      >
        <p
          style={{
            color: "#8f8f8f",
            fontSize: "12px",
            textTransform: "uppercase",
            letterSpacing: "2px",
            marginBottom: "12px",
          }}
        >
          Noticia
        </p>

        <h1
          style={{
            fontSize: "56px",
            lineHeight: 1.04,
            marginBottom: "16px",
            letterSpacing: "-1.8px",
            maxWidth: "880px",
          }}
        >
          {noticia.titulo}
        </h1>

        {noticia.extracto && (
          <p
            style={{
              color: "#b9b9b9",
              fontSize: "22px",
              lineHeight: 1.75,
              marginBottom: "24px",
              maxWidth: "880px",
            }}
          >
            {noticia.extracto}
          </p>
        )}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            fontSize: "14px",
            color: "#888",
            marginBottom: "34px",
            paddingBottom: "22px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {noticia.fechaPublicacion && (
            <span>
              Publicada el {new Date(noticia.fechaPublicacion).toLocaleDateString("es-ES")}
            </span>
          )}
          {noticia.disciplina && <span>Disciplina: {noticia.disciplina}</span>}
          {noticia.destacada && <span>Destacada</span>}
        </div>

        {(noticia.eventoRelacionado ||
          (noticia.luchadoresRelacionadosData &&
            noticia.luchadoresRelacionadosData.length > 0)) && (
          <section
            style={{
              ...cardStyle,
              marginBottom: "34px",
            }}
          >
            <h2
              style={{
                fontSize: "28px",
                marginBottom: "18px",
                letterSpacing: "-0.6px",
              }}
            >
              Contexto relacionado
            </h2>

            <div
              style={{
                display: "grid",
                gap: "16px",
              }}
            >
              {noticia.eventoRelacionado && (
                <div>
                  <p
                    style={{
                      color: "#8f8f8f",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "1.6px",
                      marginBottom: "8px",
                    }}
                  >
                    Evento
                  </p>

                  {noticia.eventoRelacionadoSlug ? (
                    <Link
                      href={`/eventos/${noticia.eventoRelacionadoSlug}`}
                      style={{
                        color: "#f5c542",
                        textDecoration: "none",
                        fontSize: "20px",
                      }}
                    >
                      {noticia.eventoRelacionado}
                    </Link>
                  ) : (
                    <p
                      style={{
                        color: "#d2d2d2",
                        fontSize: "20px",
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
                    <p
                      style={{
                        color: "#8f8f8f",
                        fontSize: "12px",
                        textTransform: "uppercase",
                        letterSpacing: "1.6px",
                        marginBottom: "10px",
                      }}
                    >
                      Luchadores relacionados
                    </p>

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
            </div>
          </section>
        )}

        <article
          style={{
            ...cardStyle,
            padding: "30px",
          }}
        >
          {renderContenido(noticia.contenido)}
        </article>

        <section
          style={{
            marginTop: "34px",
            paddingTop: "22px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
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

          {noticia.luchadoresRelacionadosData &&
            noticia.luchadoresRelacionadosData.length > 0 &&
            noticia.luchadoresRelacionadosData
              .filter((luchador) => luchador.slug)
              .slice(0, 2)
              .map((luchador) => (
                <Link
                  key={`${luchador.nombre}-${luchador.slug}-footer`}
                  href={`/luchadores/${luchador.slug}`}
                  style={accentLinkStyle}
                >
                  Ver perfil de {luchador.nombre}
                </Link>
              ))}
        </section>
      </section>
    </main>
  );
}