import Link from "next/link";
import {notFound} from "next/navigation";
import {client} from "../../../sanity/lib/client";
import {
  combatesPorEventoQuery,
  eventoPorSlugQuery,
  noticiasPorEventoQuery,
} from "../../../sanity/lib/queries";

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

type Combate = {
  _id: string;
  metodo?: string;
  asalto?: number;
  tiempo?: string;
  tituloEnJuego?: boolean;
  cartelera?: string;
  orden?: number;
  estado?: string;
  luchadorRojo?: string;
  luchadorRojoSlug?: string;
  luchadorAzul?: string;
  luchadorAzulSlug?: string;
  ganador?: string;
  categoriaPeso?: string;
};

type Noticia = {
  _id: string;
  titulo: string;
  slug: string;
  extracto?: string;
  fechaPublicacion?: string;
  destacada?: boolean;
  disciplina?: string;
  eventoRelacionado?: string;
  luchadoresRelacionados?: string[];
};

type Protagonista = {
  nombre: string;
  slug?: string;
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
  transition: "transform 0.18s ease, border-color 0.18s ease",
};

export default async function EventoDetallePage({params}: PageProps) {
  const {slug} = await params;

  const evento: Evento | null = await client.fetch(eventoPorSlugQuery, {slug});
  const combates: Combate[] = await client.fetch(combatesPorEventoQuery, {slug});
  const noticias: Noticia[] = await client.fetch(noticiasPorEventoQuery, {slug});

  if (!evento) {
    notFound();
  }

  const protagonistasMap = new Map<string, Protagonista>();

  for (const combate of combates) {
    if (combate.luchadorRojo) {
      protagonistasMap.set(combate.luchadorRojo, {
        nombre: combate.luchadorRojo,
        slug: combate.luchadorRojoSlug,
      });
    }

    if (combate.luchadorAzul) {
      protagonistasMap.set(combate.luchadorAzul, {
        nombre: combate.luchadorAzul,
        slug: combate.luchadorAzulSlug,
      });
    }
  }

  const protagonistas = Array.from(protagonistasMap.values());

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
          maxWidth: "1100px",
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
          Evento
        </p>

        <h1
          style={{
            fontSize: "56px",
            lineHeight: 1.04,
            marginBottom: "16px",
            letterSpacing: "-1.8px",
            maxWidth: "920px",
          }}
        >
          {evento.nombre}
        </h1>

        {evento.cartelPrincipal && (
          <p
            style={{
              color: "#f5c542",
              fontSize: "24px",
              marginBottom: "18px",
            }}
          >
            {evento.cartelPrincipal}
          </p>
        )}

        {evento.descripcion && (
          <p
            style={{
              color: "#b9b9b9",
              fontSize: "20px",
              lineHeight: 1.85,
              marginBottom: "30px",
              maxWidth: "920px",
            }}
          >
            {evento.descripcion}
          </p>
        )}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            fontSize: "14px",
            color: "#888",
            marginBottom: "42px",
            paddingBottom: "22px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {evento.organizacion && <span>Organización: {evento.organizacion}</span>}
          {evento.disciplina && <span>Disciplina: {evento.disciplina}</span>}
          {evento.estado && <span>Estado: {evento.estado}</span>}
          {evento.fecha && (
            <span>
              Fecha: {new Date(evento.fecha).toLocaleDateString("es-ES")}
            </span>
          )}
          {evento.ciudad && evento.pais && (
            <span>
              Lugar: {evento.ciudad}, {evento.pais}
            </span>
          )}
          {evento.recinto && <span>Recinto: {evento.recinto}</span>}
        </div>

        <section style={{marginBottom: "56px"}}>
          <h2
            style={{
              fontSize: "36px",
              marginBottom: "22px",
              letterSpacing: "-0.8px",
            }}
          >
            Protagonistas del evento
          </h2>

          {protagonistas.length === 0 ? (
            <p style={{color: "#888"}}>Todavía no hay protagonistas asociados a este evento.</p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "18px",
              }}
            >
              {protagonistas.map((protagonista) => {
                const contenido = (
                  <article style={cardStyle}>
                    <p
                      style={{
                        color: "#8f8f8f",
                        fontSize: "12px",
                        textTransform: "uppercase",
                        letterSpacing: "1.6px",
                        marginBottom: "10px",
                      }}
                    >
                      Luchador
                    </p>

                    <h3
                      style={{
                        fontSize: "24px",
                        lineHeight: 1.2,
                        marginBottom: "12px",
                        letterSpacing: "-0.5px",
                      }}
                    >
                      {protagonista.nombre}
                    </h3>

                    <p
                      style={{
                        color: "#b9b9b9",
                        fontSize: "15px",
                        lineHeight: 1.7,
                        marginBottom: "18px",
                      }}
                    >
                      Presente en la cartelera de {evento.nombre}.
                    </p>

                    <p
                      style={{
                        color: "#f5c542",
                        fontSize: "14px",
                      }}
                    >
                      Ver perfil del luchador
                    </p>
                  </article>
                );

                if (!protagonista.slug) {
                  return (
                    <div key={protagonista.nombre}>
                      {contenido}
                    </div>
                  );
                }

                return (
                  <Link
                    key={protagonista.nombre}
                    href={`/luchadores/${protagonista.slug}`}
                    style={{textDecoration: "none", color: "inherit"}}
                  >
                    {contenido}
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section style={{marginBottom: "56px"}}>
          <h2
            style={{
              fontSize: "36px",
              marginBottom: "22px",
              letterSpacing: "-0.8px",
            }}
          >
            Combates del evento
          </h2>

          {combates.length === 0 ? (
            <p style={{color: "#888"}}>Todavía no hay combates asociados a este evento.</p>
          ) : (
            <div style={{display: "grid", gap: "18px"}}>
              {combates.map((combate) => (
                <Link
                  key={combate._id}
                  href={`/resultados/${combate._id}`}
                  style={{textDecoration: "none", color: "inherit"}}
                >
                  <article style={cardStyle}>
                    <h3
                      style={{
                        fontSize: "27px",
                        marginBottom: "10px",
                        letterSpacing: "-0.6px",
                      }}
                    >
                      {combate.luchadorRojo} vs {combate.luchadorAzul}
                    </h3>

                    {combate.ganador && (
                      <p
                        style={{
                          color: "#f5c542",
                          marginBottom: "10px",
                          fontSize: "17px",
                        }}
                      >
                        Ganador: {combate.ganador}
                      </p>
                    )}

                    <div
                      style={{
                        display: "grid",
                        gap: "8px",
                        color: "#bbb",
                        fontSize: "15px",
                      }}
                    >
                      {combate.categoriaPeso && <p>Categoría: {combate.categoriaPeso}</p>}
                      {combate.estado && <p>Estado: {combate.estado}</p>}
                      {combate.metodo && <p>Método: {combate.metodo}</p>}
                      {typeof combate.asalto === "number" && <p>Asalto: {combate.asalto}</p>}
                      {combate.tiempo && <p>Tiempo: {combate.tiempo}</p>}
                      {combate.cartelera && <p>Cartelera: {combate.cartelera}</p>}
                      {combate.tituloEnJuego && <p>Pelea con título en juego</p>}
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2
            style={{
              fontSize: "36px",
              marginBottom: "22px",
              letterSpacing: "-0.8px",
            }}
          >
            Noticias relacionadas
          </h2>

          {noticias.length === 0 ? (
            <p style={{color: "#888"}}>
              Todavía no hay noticias relacionadas con este evento.
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "18px",
              }}
            >
              {noticias.map((noticia) => (
                <Link
                  key={noticia._id}
                  href={`/noticias/${noticia.slug}`}
                  style={{textDecoration: "none", color: "inherit"}}
                >
                  <article style={cardStyle}>
                    {noticia.destacada && (
                      <p
                        style={{
                          color: "#f5c542",
                          fontSize: "12px",
                          textTransform: "uppercase",
                          letterSpacing: "1.6px",
                          marginBottom: "12px",
                        }}
                      >
                        Destacada
                      </p>
                    )}

                    <h3
                      style={{
                        fontSize: "24px",
                        lineHeight: 1.2,
                        marginBottom: "12px",
                        letterSpacing: "-0.5px",
                      }}
                    >
                      {noticia.titulo}
                    </h3>

                    {noticia.extracto && (
                      <p
                        style={{
                          color: "#b9b9b9",
                          fontSize: "15px",
                          lineHeight: 1.7,
                          marginBottom: "16px",
                        }}
                      >
                        {noticia.extracto}
                      </p>
                    )}

                    <div
                      style={{
                        display: "grid",
                        gap: "8px",
                        color: "#888",
                        fontSize: "14px",
                      }}
                    >
                      {noticia.fechaPublicacion && (
                        <p>
                          Publicada el{" "}
                          {new Date(noticia.fechaPublicacion).toLocaleDateString("es-ES")}
                        </p>
                      )}
                      {noticia.disciplina && <p>Disciplina: {noticia.disciplina}</p>}
                      {noticia.luchadoresRelacionados &&
                        noticia.luchadoresRelacionados.length > 0 && (
                          <p>
                            Luchadores: {noticia.luchadoresRelacionados.join(", ")}
                          </p>
                        )}
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}