import Link from "next/link";
import {notFound} from "next/navigation";
import {client} from "../../../sanity/lib/client";
import {
  disciplinaPorSlugQuery,
  noticiasPorDisciplinaQuery,
  luchadoresPorDisciplinaQuery,
  eventosPorDisciplinaQuery,
} from "../../../sanity/lib/queries";

type Disciplina = {
  _id: string;
  nombre: string;
  slug: string;
  descripcion?: string;
  activa?: boolean;
};

type Noticia = {
  _id: string;
  titulo: string;
  slug: string;
  extracto?: string;
  fechaPublicacion?: string;
  destacada?: boolean;
};

type Luchador = {
  _id: string;
  nombre: string;
  slug: string;
  apodo?: string;
  nacionalidad?: string;
  record?: string;
  activo?: boolean;
  organizacion?: string;
  categoriaPeso?: string;
};

type Evento = {
  _id: string;
  nombre: string;
  slug: string;
  fecha?: string;
  ciudad?: string;
  pais?: string;
  cartelPrincipal?: string;
  estado?: string;
  organizacion?: string;
};

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const containerStyle = {
  maxWidth: "1240px",
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

const panelStyle = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "18px",
  padding: "24px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};

const sectionLabelStyle = {
  color: "#8f8f8f",
  fontSize: "12px",
  textTransform: "uppercase" as const,
  letterSpacing: "1.8px",
  marginBottom: "10px",
};

function formatearFecha(fecha?: string) {
  if (!fecha) return null;
  return new Date(fecha).toLocaleDateString("es-ES");
}

export default async function DisciplinaDetallePage({params}: PageProps) {
  const {slug} = await params;

  if (!slug) {
    notFound();
  }

  const [disciplina, noticias, luchadores, eventos]: [
    Disciplina | null,
    Noticia[],
    Luchador[],
    Evento[]
  ] = await Promise.all([
    client.fetch(disciplinaPorSlugQuery, {slug}),
    client.fetch(noticiasPorDisciplinaQuery, {slug}),
    client.fetch(luchadoresPorDisciplinaQuery, {slug}),
    client.fetch(eventosPorDisciplinaQuery, {slug}),
  ]);

  if (!disciplina) {
    notFound();
  }

  return (
    <main style={{minHeight: "100vh", color: "white"}}>
      <section style={containerStyle}>
        <Link
          href="/disciplinas"
          style={{
            display: "inline-block",
            marginBottom: "22px",
            color: "#9ca3af",
            textDecoration: "none",
            fontSize: "14px",
          }}
        >
          ← Volver a disciplinas
        </Link>

        <section style={{...heroCardStyle, marginBottom: "30px"}}>
          <p style={sectionLabelStyle}>Disciplina</p>

          <h1
            style={{
              fontSize: "46px",
              margin: "0 0 14px 0",
              letterSpacing: "-1.2px",
              lineHeight: 1.05,
            }}
          >
            {disciplina.nombre}
          </h1>

          <p
            style={{
              color: disciplina.activa ? "#4ade80" : "#f87171",
              marginBottom: "18px",
              fontSize: "15px",
              fontWeight: 700,
            }}
          >
            {disciplina.activa ? "Activa" : "Inactiva"}
          </p>

          <p
            style={{
              color: "#d1d5db",
              lineHeight: 1.85,
              fontSize: "17px",
              maxWidth: "900px",
              margin: 0,
            }}
          >
            {disciplina.descripcion || "Esta disciplina todavía no tiene descripción publicada."}
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
              <p style={{fontSize: "12px", color: "#7f7f7f", textTransform: "uppercase", letterSpacing: "1.6px", marginBottom: "8px"}}>
                Noticias
              </p>
              <p style={{margin: 0, color: "#d7d7d7"}}>{noticias.length} relacionadas</p>
            </div>

            <div>
              <p style={{fontSize: "12px", color: "#7f7f7f", textTransform: "uppercase", letterSpacing: "1.6px", marginBottom: "8px"}}>
                Luchadores
              </p>
              <p style={{margin: 0, color: "#d7d7d7"}}>{luchadores.length} relacionados</p>
            </div>

            <div>
              <p style={{fontSize: "12px", color: "#7f7f7f", textTransform: "uppercase", letterSpacing: "1.6px", marginBottom: "8px"}}>
                Eventos
              </p>
              <p style={{margin: 0, color: "#d7d7d7"}}>{eventos.length} relacionados</p>
            </div>
          </div>
        </section>

        <section style={{display: "grid", gap: "24px"}}>
          <section>
            <p style={sectionLabelStyle}>Actualidad relacionada</p>
            <h2 style={{fontSize: "30px", margin: "0 0 18px 0", letterSpacing: "-0.8px"}}>
              Noticias
            </h2>

            {noticias.length === 0 ? (
              <p style={{color: "#888"}}>Todavía no hay noticias relacionadas con esta disciplina.</p>
            ) : (
              <div style={{display: "grid", gap: "16px"}}>
                {noticias.map((noticia) => (
                  <Link
                    key={noticia._id}
                    href={`/noticias/${noticia.slug}`}
                    style={{textDecoration: "none", color: "inherit"}}
                  >
                    <article style={panelStyle}>
                      {noticia.destacada && (
                        <p
                          style={{
                            color: "#f5c542",
                            fontSize: "12px",
                            textTransform: "uppercase",
                            letterSpacing: "1.6px",
                            marginBottom: "10px",
                          }}
                        >
                          Destacada
                        </p>
                      )}

                      <h3 style={{fontSize: "24px", margin: "0 0 12px 0", lineHeight: 1.2}}>
                        {noticia.titulo}
                      </h3>

                      {noticia.extracto && (
                        <p style={{color: "#c8c8c8", lineHeight: 1.75, margin: "0 0 14px 0"}}>
                          {noticia.extracto}
                        </p>
                      )}

                      {noticia.fechaPublicacion && (
                        <p style={{color: "#8a8a8a", fontSize: "14px", margin: 0}}>
                          Fecha: {formatearFecha(noticia.fechaPublicacion)}
                        </p>
                      )}
                    </article>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "24px",
            }}
          >
            <div>
              <p style={sectionLabelStyle}>Protagonistas</p>
              <h2 style={{fontSize: "30px", margin: "0 0 18px 0", letterSpacing: "-0.8px"}}>
                Luchadores
              </h2>

              {luchadores.length === 0 ? (
                <p style={{color: "#888"}}>Todavía no hay luchadores relacionados con esta disciplina.</p>
              ) : (
                <div style={{display: "grid", gap: "16px"}}>
                  {luchadores.map((luchador) => (
                    <Link
                      key={luchador._id}
                      href={`/luchadores/${luchador.slug}`}
                      style={{textDecoration: "none", color: "inherit"}}
                    >
                      <article style={panelStyle}>
                        <h3 style={{fontSize: "22px", margin: "0 0 8px 0"}}>
                          {luchador.nombre}
                        </h3>

                        {luchador.apodo && (
                          <p style={{color: "#f5c542", margin: "0 0 10px 0"}}>
                            “{luchador.apodo}”
                          </p>
                        )}

                        <div style={{display: "grid", gap: "6px", color: "#bbb", fontSize: "15px"}}>
                          {luchador.nacionalidad && <p style={{margin: 0}}>Nacionalidad: {luchador.nacionalidad}</p>}
                          {luchador.organizacion && <p style={{margin: 0}}>Organización: {luchador.organizacion}</p>}
                          {luchador.categoriaPeso && <p style={{margin: 0}}>Categoría: {luchador.categoriaPeso}</p>}
                          {luchador.record && <p style={{margin: 0}}>Récord: {luchador.record}</p>}
                          <p style={{margin: 0}}>Estado: {luchador.activo ? "Activo" : "Inactivo"}</p>
                        </div>
                      </article>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p style={sectionLabelStyle}>Calendario relacionado</p>
              <h2 style={{fontSize: "30px", margin: "0 0 18px 0", letterSpacing: "-0.8px"}}>
                Eventos
              </h2>

              {eventos.length === 0 ? (
                <p style={{color: "#888"}}>Todavía no hay eventos relacionados con esta disciplina.</p>
              ) : (
                <div style={{display: "grid", gap: "16px"}}>
                  {eventos.map((evento) => (
                    <Link
                      key={evento._id}
                      href={`/eventos/${evento.slug}`}
                      style={{textDecoration: "none", color: "inherit"}}
                    >
                      <article style={panelStyle}>
                        <h3 style={{fontSize: "22px", margin: "0 0 10px 0"}}>
                          {evento.nombre}
                        </h3>

                        {evento.cartelPrincipal && (
                          <p style={{color: "#f5c542", margin: "0 0 10px 0", lineHeight: 1.5}}>
                            {evento.cartelPrincipal}
                          </p>
                        )}

                        <div style={{display: "grid", gap: "6px", color: "#bbb", fontSize: "15px"}}>
                          {evento.organizacion && <p style={{margin: 0}}>Organización: {evento.organizacion}</p>}
                          {evento.estado && <p style={{margin: 0}}>Estado: {evento.estado}</p>}
                          {evento.fecha && <p style={{margin: 0}}>Fecha: {formatearFecha(evento.fecha)}</p>}
                          {evento.ciudad && evento.pais && (
                            <p style={{margin: 0}}>
                              Lugar: {evento.ciudad}, {evento.pais}
                            </p>
                          )}
                        </div>
                      </article>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}