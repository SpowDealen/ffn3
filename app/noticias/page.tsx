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

const containerStyle = {
  maxWidth: "1440px",
  margin: "0 auto",
  padding: "40px 28px 60px",
};

const heroCardStyle = {
  background:
    "linear-gradient(135deg, rgba(20,24,38,0.92) 0%, rgba(10,10,10,0.96) 55%, rgba(6,6,6,0.98) 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "22px",
  padding: "34px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
};

const cardStyle = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "18px",
  padding: "26px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};

const sectionLabelStyle = {
  color: "#8f8f8f",
  fontSize: "12px",
  textTransform: "uppercase" as const,
  letterSpacing: "1.8px",
  marginBottom: "10px",
};

const titleStyle = {
  fontSize: "46px",
  margin: "0 0 12px 0",
  letterSpacing: "-1.2px",
  lineHeight: 1.05,
};

const introStyle = {
  color: "#a8a8a8",
  fontSize: "17px",
  lineHeight: 1.8,
  maxWidth: "840px",
  margin: 0,
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
      <section style={containerStyle}>
        <section style={{...heroCardStyle, marginBottom: "34px"}}>
          <p style={sectionLabelStyle}>Actualidad editorial</p>

          <h1 style={titleStyle}>Noticias</h1>

          <p style={introStyle}>
            Sigue la actualidad del mundo del combate con una presentación clara,
            seria y centrada en noticias, protagonistas y contexto competitivo.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "22px",
              marginTop: "26px",
              paddingTop: "18px",
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div>
              <p
                style={{
                  fontSize: "12px",
                  color: "#7f7f7f",
                  textTransform: "uppercase",
                  letterSpacing: "1.6px",
                  marginBottom: "8px",
                }}
              >
                Cobertura
              </p>
              <p style={{margin: 0, color: "#d7d7d7", lineHeight: 1.6}}>
                Noticias recientes, piezas destacadas y seguimiento de eventos y luchadores.
              </p>
            </div>

            <div>
              <p
                style={{
                  fontSize: "12px",
                  color: "#7f7f7f",
                  textTransform: "uppercase",
                  letterSpacing: "1.6px",
                  marginBottom: "8px",
                }}
              >
                Publicadas
              </p>
              <p style={{margin: 0, color: "#d7d7d7", lineHeight: 1.6}}>
                {noticias.length} noticias visibles con enlace activo.
              </p>
            </div>
          </div>
        </section>

        {noticias.length === 0 ? (
          <p style={{color: "#888"}}>Todavía no hay noticias publicadas.</p>
        ) : (
          <section
            style={{
              display: "grid",
              gap: "20px",
            }}
          >
            {noticias.map((noticia, index) => (
              <Link
                key={noticia._id}
                href={`/noticias/${encodeURIComponent(noticia.slug!)}`}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <article
                  style={{
                    ...cardStyle,
                    background:
                      noticia.destacada || index === 0
                        ? "linear-gradient(135deg, rgba(18,18,18,0.98) 0%, rgba(24,24,32,0.96) 100%)"
                        : cardStyle.background,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "18px",
                      flexWrap: "wrap",
                      marginBottom: "10px",
                    }}
                  >
                    <div>
                      {(noticia.destacada || index === 0) && (
                        <p
                          style={{
                            color: noticia.destacada ? "#f5c542" : "#9ca3af",
                            fontSize: "12px",
                            textTransform: "uppercase",
                            letterSpacing: "1.6px",
                            marginBottom: "12px",
                          }}
                        >
                          {noticia.destacada ? "Destacada" : "Principal"}
                        </p>
                      )}

                      <h2
                        style={{
                          fontSize: "32px",
                          margin: 0,
                          lineHeight: 1.18,
                          letterSpacing: "-0.8px",
                          maxWidth: "980px",
                        }}
                      >
                        {noticia.titulo}
                      </h2>
                    </div>
                  </div>

                  {noticia.extracto && (
                    <p
                      style={{
                        color: "#c8c8c8",
                        margin: "14px 0 18px 0",
                        lineHeight: 1.8,
                        fontSize: "17px",
                        maxWidth: "980px",
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
                      color: "#8a8a8a",
                    }}
                  >
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
                      <p
                        style={{
                          marginTop: "16px",
                          color: "#a9a9a9",
                          lineHeight: 1.7,
                        }}
                      >
                        Luchadores relacionados:{" "}
                        {noticia.luchadoresRelacionados.join(", ")}
                      </p>
                    )}

                  <p
                    style={{
                      marginTop: "18px",
                      color: "#ffffff",
                      fontSize: "14px",
                      fontWeight: 700,
                      opacity: 0.92,
                    }}
                  >
                    Leer noticia →
                  </p>
                </article>
              </Link>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}