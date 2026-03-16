import Link from "next/link";
import {notFound} from "next/navigation";
import {client} from "../../../sanity/lib/client";
import {
  combatesPorLuchadorQuery,
  luchadorPorSlugQuery,
  noticiasPorLuchadorQuery,
} from "../../../sanity/lib/queries";

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
  organizacion?: string;
  categoriaPeso?: string;
};

type Combate = {
  _id: string;
  _createdAt?: string;
  metodo?: string;
  asalto?: number;
  tiempo?: string;
  tituloEnJuego?: boolean;
  cartelera?: string;
  orden?: number;
  estado?: string;
  evento?: string;
  eventoSlug?: string;
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

const subtleLinkStyle = {
  color: "#b9b9b9",
  textDecoration: "none",
};

const accentLinkStyle = {
  color: "#f5c542",
  textDecoration: "none",
};

export default async function LuchadorDetallePage({params}: PageProps) {
  const {slug} = await params;

  const luchador: Luchador | null = await client.fetch(luchadorPorSlugQuery, {slug});
  const combates: Combate[] = await client.fetch(combatesPorLuchadorQuery, {slug});
  const noticias: Noticia[] = await client.fetch(noticiasPorLuchadorQuery, {slug});

  if (!luchador) {
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
          Luchador
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
          {luchador.nombre}
        </h1>

        {luchador.apodo && (
          <p
            style={{
              color: "#f5c542",
              fontSize: "24px",
              marginBottom: "18px",
            }}
          >
            {luchador.apodo}
          </p>
        )}

        {luchador.descripcion && (
          <p
            style={{
              color: "#b9b9b9",
              fontSize: "20px",
              lineHeight: 1.85,
              marginBottom: "30px",
              maxWidth: "920px",
            }}
          >
            {luchador.descripcion}
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
          {luchador.nacionalidad && <span>Nacionalidad: {luchador.nacionalidad}</span>}
          {luchador.record && <span>Récord: {luchador.record}</span>}
          {luchador.disciplina && <span>Disciplina: {luchador.disciplina}</span>}
          {luchador.organizacion && <span>Organización: {luchador.organizacion}</span>}
          {luchador.categoriaPeso && <span>Categoría: {luchador.categoriaPeso}</span>}
          <span>Estado: {luchador.activo ? "Activo" : "Inactivo"}</span>
        </div>

        <section style={{marginBottom: "56px"}}>
          <h2
            style={{
              fontSize: "36px",
              marginBottom: "22px",
              letterSpacing: "-0.8px",
            }}
          >
            Combates relacionados
          </h2>

          {combates.length === 0 ? (
            <p style={{color: "#888"}}>Todavía no hay combates asociados a este luchador.</p>
          ) : (
            <div style={{display: "grid", gap: "18px"}}>
              {combates.map((combate) => (
                <article key={combate._id} style={cardStyle}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "18px",
                      flexWrap: "wrap",
                      marginBottom: "14px",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: "27px",
                        letterSpacing: "-0.6px",
                        margin: 0,
                      }}
                    >
                      {combate.luchadorRojoSlug ? (
                        <Link
                          href={`/luchadores/${combate.luchadorRojoSlug}`}
                          style={accentLinkStyle}
                        >
                          {combate.luchadorRojo}
                        </Link>
                      ) : (
                        combate.luchadorRojo
                      )}{" "}
                      vs{" "}
                      {combate.luchadorAzulSlug ? (
                        <Link
                          href={`/luchadores/${combate.luchadorAzulSlug}`}
                          style={accentLinkStyle}
                        >
                          {combate.luchadorAzul}
                        </Link>
                      ) : (
                        combate.luchadorAzul
                      )}
                    </h3>

                    <Link
                      href={`/resultados/${combate._id}`}
                      style={{
                        color: "#f5c542",
                        textDecoration: "none",
                        fontSize: "14px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Ver resultado
                    </Link>
                  </div>

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
                    {combate.evento && combate.eventoSlug ? (
                      <p>
                        Evento:{" "}
                        <Link href={`/eventos/${combate.eventoSlug}`} style={subtleLinkStyle}>
                          {combate.evento}
                        </Link>
                      </p>
                    ) : (
                      combate.evento && <p>Evento: {combate.evento}</p>
                    )}
                    {combate.categoriaPeso && <p>Categoría: {combate.categoriaPeso}</p>}
                    {combate.estado && <p>Estado: {combate.estado}</p>}
                    {combate.metodo && <p>Método: {combate.metodo}</p>}
                    {typeof combate.asalto === "number" && <p>Asalto: {combate.asalto}</p>}
                    {combate.tiempo && <p>Tiempo: {combate.tiempo}</p>}
                    {combate.cartelera && <p>Cartelera: {combate.cartelera}</p>}
                    {combate.tituloEnJuego && <p>Pelea con título en juego</p>}
                  </div>
                </article>
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
              Todavía no hay noticias relacionadas con este luchador.
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
                      {noticia.eventoRelacionado && (
                        <p>Evento relacionado: {noticia.eventoRelacionado}</p>
                      )}
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