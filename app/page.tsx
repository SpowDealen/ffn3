import Link from "next/link";
import {client} from "../sanity/lib/client";
import {
  noticiaDestacadaQuery,
  ultimasNoticiasQuery,
  proximoEventoQuery,
  luchadoresDestacadosQuery,
  disciplinasHomeQuery,
  categoriasPesoHomeQuery,
} from "../sanity/lib/queries";

type Noticia = {
  _id: string;
  titulo: string;
  slug: string;
  extracto?: string;
  fechaPublicacion?: string;
  disciplina?: string;
};

type Evento = {
  _id: string;
  nombre: string;
  slug: string;
  fecha?: string;
  ciudad?: string;
  pais?: string;
  cartelPrincipal?: string;
  organizacion?: string;
  disciplina?: string;
};

type Luchador = {
  _id: string;
  nombre: string;
  slug: string;
  apodo?: string;
  nacionalidad?: string;
  record?: string;
  disciplina?: string;
  organizacion?: string;
  categoriaPeso?: string;
};

type Disciplina = {
  _id: string;
  nombre: string;
  slug: string;
  descripcion?: string;
};

type CategoriaPeso = {
  _id: string;
  nombre: string;
  slug: string;
  limitePeso?: number;
  unidad?: string;
  disciplina?: string;
};

const containerStyle = {
  maxWidth: "1440px",
  margin: "0 auto",
  padding: "0 28px",
};

const sectionStyle = {
  paddingBottom: "42px",
};

const sectionLabelStyle = {
  color: "#8f8f8f",
  fontSize: "12px",
  textTransform: "uppercase" as const,
  letterSpacing: "1.8px",
  marginBottom: "10px",
};

const sectionTitleStyle = {
  fontSize: "32px",
  margin: "0 0 18px 0",
  letterSpacing: "-0.8px",
  color: "white",
};

const sectionIntroStyle = {
  color: "#9f9f9f",
  fontSize: "16px",
  lineHeight: 1.7,
  margin: "0 0 24px 0",
  maxWidth: "760px",
};

const cardStyle = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "18px",
  padding: "24px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};

const subtleLinkStyle = {
  textDecoration: "none",
  color: "inherit",
};

function formatearFecha(fecha?: string) {
  if (!fecha) return null;
  return new Date(fecha).toLocaleDateString("es-ES");
}

export default async function HomePage() {
  const noticiaDestacada: Noticia | null = await client.fetch(noticiaDestacadaQuery);
  const ultimasNoticias: Noticia[] = await client.fetch(ultimasNoticiasQuery);
  const proximoEvento: Evento | null = await client.fetch(proximoEventoQuery);
  const luchadores: Luchador[] = await client.fetch(luchadoresDestacadosQuery);
  const disciplinas: Disciplina[] = await client.fetch(disciplinasHomeQuery);
  const categorias: CategoriaPeso[] = await client.fetch(categoriasPesoHomeQuery);

  return (
    <main style={{minHeight: "100vh", color: "white"}}>
      <section
        style={{
          ...containerStyle,
          paddingTop: "42px",
          paddingBottom: "34px",
        }}
      >
        <div
          style={{
            ...cardStyle,
            padding: "46px",
            background:
              "linear-gradient(135deg, rgba(20,24,38,0.98) 0%, rgba(10,10,10,0.96) 52%, rgba(6,6,6,0.99) 100%)",
            overflow: "hidden",
            position: "relative" as const,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-80px",
              right: "-80px",
              width: "220px",
              height: "220px",
              borderRadius: "999px",
              background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 72%)",
              pointerEvents: "none",
            }}
          />

          <p style={sectionLabelStyle}>Medio digital de deportes de combate</p>

          <h1
            style={{
              fontSize: "60px",
              lineHeight: 1.02,
              margin: "0 0 18px 0",
              maxWidth: "980px",
              letterSpacing: "-2px",
            }}
          >
            La portada seria para seguir noticias, eventos, resultados y protagonistas del combate.
          </h1>

          <p
            style={{
              color: "#b8b8b8",
              fontSize: "18px",
              lineHeight: 1.85,
              maxWidth: "860px",
              margin: 0,
            }}
          >
            Full Fight News reúne actualidad, carteleras, luchadores, disciplinas y categorías
            de peso en una estructura limpia, clara y preparada para crecer como plataforma
            editorial real.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              marginTop: "30px",
            }}
          >
            <Link
              href="/noticias"
              style={{
                textDecoration: "none",
                background: "#ffffff",
                color: "#111111",
                padding: "12px 18px",
                borderRadius: "999px",
                fontWeight: 800,
                fontSize: "14px",
              }}
            >
              Entrar en noticias
            </Link>

            <Link
              href="/eventos"
              style={{
                textDecoration: "none",
                color: "#e3e3e3",
                padding: "12px 18px",
                borderRadius: "999px",
                fontWeight: 700,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.03)",
                fontSize: "14px",
              }}
            >
              Ver próximos eventos
            </Link>

            <Link
              href="/luchadores"
              style={{
                textDecoration: "none",
                color: "#e3e3e3",
                padding: "12px 18px",
                borderRadius: "999px",
                fontWeight: 700,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.03)",
                fontSize: "14px",
              }}
            >
              Explorar luchadores
            </Link>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: "14px",
              marginTop: "34px",
            }}
          >
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.08)",
                paddingTop: "14px",
              }}
            >
              <p style={{fontSize: "12px", color: "#7e7e7e", textTransform: "uppercase", letterSpacing: "1.6px", marginBottom: "8px"}}>
                Cobertura
              </p>
              <p style={{fontSize: "16px", color: "#d7d7d7", lineHeight: 1.6, margin: 0}}>
                Noticias, eventos, resultados, perfiles y divisiones conectadas.
              </p>
            </div>

            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.08)",
                paddingTop: "14px",
              }}
            >
              <p style={{fontSize: "12px", color: "#7e7e7e", textTransform: "uppercase", letterSpacing: "1.6px", marginBottom: "8px"}}>
                Enfoque
              </p>
              <p style={{fontSize: "16px", color: "#d7d7d7", lineHeight: 1.6, margin: 0}}>
                Presentación limpia, tono serio y estructura preparada para escalar.
              </p>
            </div>

            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.08)",
                paddingTop: "14px",
              }}
            >
              <p style={{fontSize: "12px", color: "#7e7e7e", textTransform: "uppercase", letterSpacing: "1.6px", marginBottom: "8px"}}>
                Dirección
              </p>
              <p style={{fontSize: "16px", color: "#d7d7d7", lineHeight: 1.6, margin: 0}}>
                Base editorial sólida para crecer con automatización e IA más adelante.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section style={{...containerStyle, ...sectionStyle}}>
        <p style={sectionLabelStyle}>Portada principal</p>
        <h2 style={sectionTitleStyle}>Noticia destacada</h2>
        <p style={sectionIntroStyle}>
          La pieza principal del día marca el tono de la portada y concentra la atención editorial.
        </p>

        {noticiaDestacada ? (
          <Link href={`/noticias/${noticiaDestacada.slug}`} style={subtleLinkStyle}>
            <article
              style={{
                ...cardStyle,
                padding: "36px",
                background:
                  "linear-gradient(135deg, rgba(18,18,18,0.98) 0%, rgba(24,24,32,0.97) 100%)",
              }}
            >
              <p
                style={{
                  color: "#f5c542",
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "1.8px",
                  marginBottom: "12px",
                }}
              >
                Destacada
              </p>

              <h3
                style={{
                  fontSize: "40px",
                  lineHeight: 1.12,
                  margin: "0 0 14px 0",
                  letterSpacing: "-1px",
                  maxWidth: "960px",
                }}
              >
                {noticiaDestacada.titulo}
              </h3>

              {noticiaDestacada.extracto && (
                <p
                  style={{
                    color: "#c8c8c8",
                    lineHeight: 1.8,
                    marginBottom: "18px",
                    fontSize: "18px",
                    maxWidth: "900px",
                  }}
                >
                  {noticiaDestacada.extracto}
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px",
                  color: "#8e8e8e",
                  fontSize: "14px",
                }}
              >
                {noticiaDestacada.disciplina && (
                  <span>Disciplina: {noticiaDestacada.disciplina}</span>
                )}
                {noticiaDestacada.fechaPublicacion && (
                  <span>Fecha: {formatearFecha(noticiaDestacada.fechaPublicacion)}</span>
                )}
              </div>
            </article>
          </Link>
        ) : (
          <p style={{color: "#888"}}>Todavía no hay noticia destacada.</p>
        )}
      </section>

      <section
        style={{
          ...containerStyle,
          ...sectionStyle,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.9fr)",
          gap: "20px",
        }}
      >
        <div>
          <p style={sectionLabelStyle}>Actualidad</p>
          <h2 style={sectionTitleStyle}>Últimas noticias</h2>
          <p style={sectionIntroStyle}>
            Cobertura reciente para mantener la portada viva y con ritmo editorial constante.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "20px",
            }}
          >
            {ultimasNoticias.map((noticia) => (
              <Link
                key={noticia._id}
                href={`/noticias/${noticia.slug}`}
                style={subtleLinkStyle}
              >
                <article style={cardStyle}>
                  <h3
                    style={{
                      fontSize: "24px",
                      lineHeight: 1.25,
                      margin: "0 0 12px 0",
                      letterSpacing: "-0.5px",
                    }}
                  >
                    {noticia.titulo}
                  </h3>

                  {noticia.extracto && (
                    <p
                      style={{
                        color: "#bdbdbd",
                        lineHeight: 1.7,
                        marginBottom: "14px",
                      }}
                    >
                      {noticia.extracto}
                    </p>
                  )}

                  <div
                    style={{
                      color: "#888",
                      fontSize: "14px",
                      display: "grid",
                      gap: "6px",
                    }}
                  >
                    {noticia.disciplina && <span>Disciplina: {noticia.disciplina}</span>}
                    {noticia.fechaPublicacion && (
                      <span>{formatearFecha(noticia.fechaPublicacion)}</span>
                    )}
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <p style={sectionLabelStyle}>Calendario</p>
          <h2 style={sectionTitleStyle}>Próximo evento</h2>
          <p style={sectionIntroStyle}>
            El siguiente gran punto de atención del calendario competitivo.
          </p>

          {proximoEvento ? (
            <Link href={`/eventos/${proximoEvento.slug}`} style={subtleLinkStyle}>
              <article
                style={{
                  ...cardStyle,
                  minHeight: "100%",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.025) 100%)",
                }}
              >
                <h3
                  style={{
                    fontSize: "30px",
                    margin: "0 0 10px 0",
                    letterSpacing: "-0.8px",
                  }}
                >
                  {proximoEvento.nombre}
                </h3>

                {proximoEvento.cartelPrincipal && (
                  <p
                    style={{
                      color: "#f5c542",
                      marginBottom: "14px",
                      fontSize: "18px",
                      lineHeight: 1.5,
                    }}
                  >
                    {proximoEvento.cartelPrincipal}
                  </p>
                )}

                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                    color: "#a0a0a0",
                    fontSize: "15px",
                    lineHeight: 1.65,
                  }}
                >
                  {proximoEvento.organizacion && (
                    <p style={{margin: 0}}>Organización: {proximoEvento.organizacion}</p>
                  )}
                  {proximoEvento.disciplina && (
                    <p style={{margin: 0}}>Disciplina: {proximoEvento.disciplina}</p>
                  )}
                  {proximoEvento.fecha && (
                    <p style={{margin: 0}}>Fecha: {formatearFecha(proximoEvento.fecha)}</p>
                  )}
                  {proximoEvento.ciudad && proximoEvento.pais && (
                    <p style={{margin: 0}}>
                      Lugar: {proximoEvento.ciudad}, {proximoEvento.pais}
                    </p>
                  )}
                </div>
              </article>
            </Link>
          ) : (
            <p style={{color: "#888"}}>Todavía no hay eventos cargados.</p>
          )}
        </div>
      </section>

      <section style={{...containerStyle, ...sectionStyle}}>
        <p style={sectionLabelStyle}>Protagonistas</p>
        <h2 style={sectionTitleStyle}>Luchadores destacados</h2>
        <p style={sectionIntroStyle}>
          Referencias clave de distintas disciplinas y organizaciones dentro del panorama actual.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "20px",
          }}
        >
          {luchadores.map((luchador) => (
            <Link
              key={luchador._id}
              href={`/luchadores/${luchador.slug}`}
              style={subtleLinkStyle}
            >
              <article style={cardStyle}>
                <h3 style={{fontSize: "24px", margin: "0 0 8px 0", letterSpacing: "-0.4px"}}>
                  {luchador.nombre}
                </h3>

                {luchador.apodo && (
                  <p style={{color: "#f5c542", margin: "0 0 12px 0"}}>
                    “{luchador.apodo}”
                  </p>
                )}

                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                    color: "#bbb",
                    fontSize: "15px",
                    lineHeight: 1.6,
                  }}
                >
                  {luchador.nacionalidad && <p style={{margin: 0}}>Nacionalidad: {luchador.nacionalidad}</p>}
                  {luchador.disciplina && <p style={{margin: 0}}>Disciplina: {luchador.disciplina}</p>}
                  {luchador.organizacion && <p style={{margin: 0}}>Organización: {luchador.organizacion}</p>}
                  {luchador.categoriaPeso && <p style={{margin: 0}}>Categoría: {luchador.categoriaPeso}</p>}
                  {luchador.record && <p style={{margin: 0}}>Récord: {luchador.record}</p>}
                </div>
              </article>
            </Link>
          ))}
        </div>
      </section>

      <section
        style={{
          ...containerStyle,
          ...sectionStyle,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "20px",
        }}
      >
        <div>
          <p style={sectionLabelStyle}>Base del sistema</p>
          <h2 style={sectionTitleStyle}>Disciplinas</h2>
          <p style={sectionIntroStyle}>
            Las áreas principales desde las que se organiza el universo editorial de la web.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "20px",
            }}
          >
            {disciplinas.map((disciplina) => (
              <Link
                key={disciplina._id}
                href={`/disciplinas/${disciplina.slug}`}
                style={subtleLinkStyle}
              >
                <article style={cardStyle}>
                  <h3 style={{fontSize: "22px", margin: "0 0 10px 0"}}>
                    {disciplina.nombre}
                  </h3>

                  {disciplina.descripcion && (
                    <p style={{color: "#bcbcbc", lineHeight: 1.7, margin: 0}}>
                      {disciplina.descripcion}
                    </p>
                  )}
                </article>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <p style={sectionLabelStyle}>Divisiones</p>
          <h2 style={sectionTitleStyle}>Categorías de peso</h2>
          <p style={sectionIntroStyle}>
            Un acceso rápido a divisiones clave para navegar con más contexto competitivo.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "20px",
            }}
          >
            {categorias.map((categoria) => (
              <Link
                key={categoria._id}
                href={`/categorias-peso/${categoria.slug}`}
                style={subtleLinkStyle}
              >
                <article style={cardStyle}>
                  <h3 style={{fontSize: "22px", margin: "0 0 10px 0"}}>
                    {categoria.nombre}
                  </h3>

                  <div
                    style={{
                      display: "grid",
                      gap: "8px",
                      color: "#bbb",
                      fontSize: "15px",
                      lineHeight: 1.6,
                    }}
                  >
                    {categoria.disciplina && (
                      <p style={{margin: 0}}>Disciplina: {categoria.disciplina}</p>
                    )}
                    {typeof categoria.limitePeso === "number" && (
                      <p style={{margin: 0}}>
                        Límite: {categoria.limitePeso} {categoria.unidad}
                      </p>
                    )}
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}