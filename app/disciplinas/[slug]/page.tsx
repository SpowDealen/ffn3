import Link from "next/link";
import { notFound } from "next/navigation";
import imageUrlBuilder from "@sanity/image-url";
import { client } from "../../../sanity/lib/client";
import { disciplinaPorSlugQuery } from "../../../sanity/lib/queries";

type RouteParams = {
  slug: string;
};

type PageProps = {
  params: Promise<RouteParams> | RouteParams;
};

type ImagenSanity =
  | {
      asset?: {
        _ref?: string;
        _type?: string;
      };
    }
  | null
  | undefined;

type Organizacion = {
  _id: string;
  nombre: string;
  slug?: string | null;
  descripcionCorta?: string;
  paisOrigen?: string;
  sede?: string;
  anioFundacion?: number;
  activa?: boolean;
  logo?: ImagenSanity;
};

type CategoriaPeso = {
  _id: string;
  nombre: string;
  slug?: string | null;
  limitePeso?: number;
  unidad?: string;
  descripcion?: string;
};

type RankingLuchador = {
  _id: string;
  nombre: string;
  slug?: string | null;
  apodo?: string;
  nacionalidad?: string;
  record?: string;
  activo?: boolean;
  imagen?: ImagenSanity;
  rankingDisciplina?: number;
  categoriaPeso?: string;
  categoriaPesoSlug?: string | null;
  organizacion?: string;
  organizacionSlug?: string | null;
};

type Evento = {
  _id: string;
  nombre: string;
  slug?: string | null;
  fecha?: string;
  horaLocal?: string;
  ciudad?: string;
  pais?: string;
  recinto?: string;
  descripcionCorta?: string;
  estado?: string;
  organizacion?: string;
  organizacionSlug?: string | null;
};

type Disciplina = {
  _id: string;
  nombre: string;
  slug: string;
  descripcion?: string;
  activa?: boolean;
  organizaciones?: Organizacion[] | null;
  categoriasPeso?: CategoriaPeso[] | null;
  rankingTop?: RankingLuchador[] | null;
  totalLuchadores?: number;
  eventos?: Evento[] | null;
};

const builder = imageUrlBuilder(client);

function getImageUrl(source?: ImagenSanity) {
  if (!source?.asset?._ref) return null;

  try {
    return builder.image(source).width(600).height(600).fit("crop").url();
  } catch {
    return null;
  }
}

async function resolveParams(params: Promise<RouteParams> | RouteParams) {
  return params instanceof Promise ? await params : params;
}

function formatFecha(fecha?: string) {
  if (!fecha) return null;

  try {
    return new Date(fecha).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return fecha;
  }
}

function formatEstado(value?: string) {
  if (!value) return "";
  if (value === "proximo") return "Próximo";
  if (value === "celebrado") return "Celebrado";
  if (value === "cancelado") return "Cancelado";
  if (value === "programado") return "Programado";
  if (value === "finalizado") return "Finalizado";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default async function DisciplinaDetallePage({ params }: PageProps) {
  const { slug } = await resolveParams(params);

  const disciplina = await client.fetch<Disciplina | null>(disciplinaPorSlugQuery, { slug });

  if (!disciplina) {
    notFound();
  }

  const organizaciones = Array.isArray(disciplina.organizaciones)
    ? disciplina.organizaciones.filter(
        (item) => item && typeof item.nombre === "string" && item.nombre.trim().length > 0
      )
    : [];

  const categoriasPeso = Array.isArray(disciplina.categoriasPeso)
    ? disciplina.categoriasPeso.filter(
        (item) => item && typeof item.nombre === "string" && item.nombre.trim().length > 0
      )
    : [];

  const rankingTop = Array.isArray(disciplina.rankingTop)
    ? disciplina.rankingTop.filter(
        (item) => item && typeof item.nombre === "string" && item.nombre.trim().length > 0
      )
    : [];

  const eventos = Array.isArray(disciplina.eventos)
    ? disciplina.eventos.filter(
        (item) => item && typeof item.nombre === "string" && item.nombre.trim().length > 0
      )
    : [];

  const totalLuchadores =
    typeof disciplina.totalLuchadores === "number" ? disciplina.totalLuchadores : rankingTop.length;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--ffn-bg)",
        color: "var(--ffn-text)",
        padding: "40px 20px 80px",
      }}
    >
      <div
        style={{
          maxWidth: "1440px",
          margin: "0 auto",
          display: "grid",
          gap: "28px",
        }}
      >
        <section
          style={{
            padding: "32px",
            borderRadius: "28px",
            background: "var(--ffn-surface)",
            border: "1px solid var(--ffn-border)",
            display: "grid",
            gap: "18px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 12px",
                borderRadius: "999px",
                fontSize: "0.78rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                border: "1px solid var(--ffn-border-strong)",
                color: "var(--ffn-text-soft)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              Disciplina
            </span>

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 12px",
                borderRadius: "999px",
                fontSize: "0.78rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                border: "1px solid var(--ffn-border-strong)",
                color: disciplina.activa ? "var(--ffn-text)" : "var(--ffn-text-soft)",
                background: disciplina.activa
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(255,255,255,0.02)",
              }}
            >
              {disciplina.activa ? "Activa" : "Inactiva"}
            </span>

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 12px",
                borderRadius: "999px",
                fontSize: "0.78rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                border: "1px solid var(--ffn-border-strong)",
                color: "var(--ffn-text-soft)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              {totalLuchadores} luchadores registrados
            </span>

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 12px",
                borderRadius: "999px",
                fontSize: "0.78rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                border: "1px solid var(--ffn-border-strong)",
                color: "var(--ffn-text-soft)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              {organizaciones.length} organizaciones
            </span>

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 12px",
                borderRadius: "999px",
                fontSize: "0.78rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                border: "1px solid var(--ffn-border-strong)",
                color: "var(--ffn-text-soft)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              {categoriasPeso.length} categorías
            </span>
          </div>

          <div style={{ display: "grid", gap: "14px" }}>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(2.2rem, 5vw, 4rem)",
                lineHeight: 1,
                letterSpacing: "-0.04em",
              }}
            >
              {disciplina.nombre}
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: "960px",
                fontSize: "1.05rem",
                lineHeight: 1.8,
                color: "var(--ffn-text-soft)",
              }}
            >
              {disciplina.descripcion ||
                `Explora la disciplina ${disciplina.nombre} con acceso a su ecosistema de organizaciones, categorías de peso, ranking principal y eventos relacionados.`}
            </p>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
            gap: "24px",
          }}
        >
          <div style={{ gridColumn: "span 12" }}>
            <SectionTitle
              title={`Top 10 de ${disciplina.nombre}`}
              subtitle="Ranking principal de la disciplina. Este bloque no pretende listar a todo el roster, sino destacar a los nombres más fuertes de la base editorial."
            />

            {rankingTop.length > 0 ? (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: "18px",
                  }}
                >
                  {rankingTop.map((luchador, index) => {
                    const imageUrl = getImageUrl(luchador.imagen);
                    const posicion =
                      typeof luchador.rankingDisciplina === "number"
                        ? luchador.rankingDisciplina
                        : index + 1;

                    const hasSlug =
                      typeof luchador.slug === "string" && luchador.slug.trim().length > 0;

                    const cardStyles = {
                      textDecoration: "none",
                      color: "inherit",
                      display: "grid",
                      gap: "14px",
                      padding: "20px",
                      borderRadius: "24px",
                      background: "var(--ffn-surface)",
                      border: "1px solid var(--ffn-border)",
                    } as const;

                    const cardContent = (
                      <>
                        {imageUrl ? (
                          <div
                            style={{
                              width: "100%",
                              aspectRatio: "16 / 10",
                              borderRadius: "18px",
                              overflow: "hidden",
                              border: "1px solid var(--ffn-border)",
                              background: "rgba(255,255,255,0.03)",
                            }}
                          >
                            <img
                              src={imageUrl}
                              alt={luchador.nombre}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                display: "block",
                              }}
                            />
                          </div>
                        ) : null}

                        <div style={{ display: "grid", gap: "10px" }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "12px",
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: "42px",
                                height: "42px",
                                padding: "0 12px",
                                borderRadius: "999px",
                                fontSize: "0.92rem",
                                fontWeight: 800,
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid var(--ffn-border-strong)",
                                color: "var(--ffn-text)",
                              }}
                            >
                              #{posicion}
                            </span>

                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "6px 10px",
                                borderRadius: "999px",
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                                border: "1px solid var(--ffn-border-strong)",
                                color: luchador.activo
                                  ? "var(--ffn-text)"
                                  : "var(--ffn-text-soft)",
                                background: luchador.activo
                                  ? "rgba(255,255,255,0.06)"
                                  : "rgba(255,255,255,0.02)",
                              }}
                            >
                              {luchador.activo ? "Activo" : "Inactivo"}
                            </span>
                          </div>

                          <div style={{ display: "grid", gap: "8px" }}>
                            <h3
                              style={{
                                margin: 0,
                                fontSize: "1.12rem",
                                lineHeight: 1.2,
                              }}
                            >
                              {luchador.nombre}
                            </h3>

                            {luchador.apodo ? (
                              <p
                                style={{
                                  margin: 0,
                                  color: "var(--ffn-text-soft)",
                                  fontSize: "0.95rem",
                                  lineHeight: 1.5,
                                }}
                              >
                                “{luchador.apodo}”
                              </p>
                            ) : null}
                          </div>

                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "8px",
                            }}
                          >
                            {luchador.nacionalidad ? (
                              <MetaPill>{luchador.nacionalidad}</MetaPill>
                            ) : null}

                            {luchador.record ? (
                              <MetaPill>Récord: {luchador.record}</MetaPill>
                            ) : null}

                            {luchador.categoriaPeso ? (
                              <MetaPill>{luchador.categoriaPeso}</MetaPill>
                            ) : null}

                            {luchador.organizacion ? (
                              <MetaPill>{luchador.organizacion}</MetaPill>
                            ) : null}
                          </div>
                        </div>
                      </>
                    );

                    return hasSlug ? (
                      <Link key={luchador._id} href={`/luchadores/${luchador.slug}`} style={cardStyles}>
                        {cardContent}
                      </Link>
                    ) : (
                      <article key={luchador._id} style={cardStyles}>
                        {cardContent}
                      </article>
                    );
                  })}
                </div>

                <div
                  style={{
                    marginTop: "18px",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "12px",
                  }}
                >
                  <Link
                    href={`/luchadores?disciplina=${disciplina.slug}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "14px 18px",
                      borderRadius: "16px",
                      textDecoration: "none",
                      color: "var(--ffn-text)",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid var(--ffn-border-strong)",
                      fontWeight: 700,
                    }}
                  >
                    Ver todos los luchadores de {disciplina.nombre}
                  </Link>
                </div>
              </>
            ) : (
              <EmptyState text="Todavía no hay ranking configurado para esta disciplina. Añade valores en “ranking dentro de la disciplina” a los luchadores que deban entrar en el Top 10." />
            )}
          </div>

          <div style={{ gridColumn: "span 12" }}>
            <SectionTitle
              title="Organizaciones relacionadas"
              subtitle="Promotoras y entidades vinculadas directamente a esta disciplina."
            />

            {organizaciones.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "18px",
                }}
              >
                {organizaciones.map((organizacion) => {
                  const logoUrl = getImageUrl(organizacion.logo);
                  const hasSlug =
                    typeof organizacion.slug === "string" && organizacion.slug.trim().length > 0;

                  const cardStyles = {
                    textDecoration: "none",
                    color: "inherit",
                    display: "grid",
                    gap: "14px",
                    padding: "20px",
                    borderRadius: "24px",
                    background: "var(--ffn-surface)",
                    border: "1px solid var(--ffn-border)",
                  } as const;

                  const cardContent = (
                    <>
                      {logoUrl ? (
                        <div
                          style={{
                            width: "64px",
                            height: "64px",
                            borderRadius: "18px",
                            overflow: "hidden",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid var(--ffn-border)",
                          }}
                        >
                          <img
                            src={logoUrl}
                            alt={organizacion.nombre}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                            }}
                          />
                        </div>
                      ) : null}

                      <div style={{ display: "grid", gap: "8px" }}>
                        <h2
                          style={{
                            margin: 0,
                            fontSize: "1.15rem",
                            lineHeight: 1.2,
                          }}
                        >
                          {organizacion.nombre}
                        </h2>

                        <p
                          style={{
                            margin: 0,
                            color: "var(--ffn-text-soft)",
                            lineHeight: 1.65,
                            fontSize: "0.95rem",
                          }}
                        >
                          {organizacion.descripcionCorta ||
                            "Organización vinculada a esta disciplina dentro del ecosistema editorial de la web."}
                        </p>

                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "8px",
                            marginTop: "4px",
                          }}
                        >
                          {organizacion.paisOrigen ? (
                            <MetaPill>{organizacion.paisOrigen}</MetaPill>
                          ) : null}
                          {organizacion.sede ? <MetaPill>{organizacion.sede}</MetaPill> : null}
                          {organizacion.anioFundacion ? (
                            <MetaPill>Fundada en {organizacion.anioFundacion}</MetaPill>
                          ) : null}
                        </div>
                      </div>
                    </>
                  );

                  return hasSlug ? (
                    <Link
                      key={organizacion._id}
                      href={`/organizaciones/${organizacion.slug}`}
                      style={cardStyles}
                    >
                      {cardContent}
                    </Link>
                  ) : (
                    <article key={organizacion._id} style={cardStyles}>
                      {cardContent}
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState text="Todavía no hay organizaciones conectadas a esta disciplina." />
            )}
          </div>

          <div style={{ gridColumn: "span 12" }}>
            <SectionTitle
              title="Categorías de peso"
              subtitle="Divisiones vinculadas directamente a esta disciplina."
            />

            {categoriasPeso.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "18px",
                }}
              >
                {categoriasPeso.map((categoria) => {
                  const hasSlug =
                    typeof categoria.slug === "string" && categoria.slug.trim().length > 0;

                  const cardStyles = {
                    textDecoration: "none",
                    color: "inherit",
                    display: "grid",
                    gap: "12px",
                    padding: "20px",
                    borderRadius: "24px",
                    background: "var(--ffn-surface)",
                    border: "1px solid var(--ffn-border)",
                  } as const;

                  const cardContent = (
                    <div style={{ display: "grid", gap: "8px" }}>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: "1.08rem",
                          lineHeight: 1.2,
                        }}
                      >
                        {categoria.nombre}
                      </h3>

                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.95rem",
                          lineHeight: 1.6,
                          color: "var(--ffn-text-soft)",
                        }}
                      >
                        {typeof categoria.limitePeso === "number"
                          ? `Límite: ${categoria.limitePeso} ${categoria.unidad || ""}`.trim()
                          : "Categoría disponible dentro de esta disciplina."}
                      </p>

                      {categoria.descripcion ? (
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.92rem",
                            lineHeight: 1.65,
                            color: "var(--ffn-text-muted)",
                          }}
                        >
                          {categoria.descripcion}
                        </p>
                      ) : null}
                    </div>
                  );

                  return hasSlug ? (
                    <Link
                      key={categoria._id}
                      href={`/categorias-peso/${categoria.slug}`}
                      style={cardStyles}
                    >
                      {cardContent}
                    </Link>
                  ) : (
                    <article key={categoria._id} style={cardStyles}>
                      {cardContent}
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState text="Todavía no hay categorías de peso cargadas para esta disciplina." />
            )}
          </div>

          <div style={{ gridColumn: "span 12" }}>
            <SectionTitle
              title="Eventos relacionados"
              subtitle="Carteleras y eventos recientes o relevantes conectados con esta disciplina."
            />

            {eventos.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: "18px",
                }}
              >
                {eventos.map((evento) => {
                  const hasSlug =
                    typeof evento.slug === "string" && evento.slug.trim().length > 0;

                  const cardStyles = {
                    textDecoration: "none",
                    color: "inherit",
                    display: "grid",
                    gap: "12px",
                    padding: "20px",
                    borderRadius: "24px",
                    background: "var(--ffn-surface)",
                    border: "1px solid var(--ffn-border)",
                  } as const;

                  const cardContent = (
                    <>
                      <div style={{ display: "grid", gap: "8px" }}>
                        <h3
                          style={{
                            margin: 0,
                            fontSize: "1.08rem",
                            lineHeight: 1.2,
                          }}
                        >
                          {evento.nombre}
                        </h3>

                        {evento.descripcionCorta ? (
                          <p
                            style={{
                              margin: 0,
                              fontSize: "0.95rem",
                              lineHeight: 1.65,
                              color: "var(--ffn-text-soft)",
                            }}
                          >
                            {evento.descripcionCorta}
                          </p>
                        ) : null}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        {formatFecha(evento.fecha) ? (
                          <MetaPill>{formatFecha(evento.fecha) || ""}</MetaPill>
                        ) : null}
                        {evento.organizacion ? <MetaPill>{evento.organizacion}</MetaPill> : null}
                        {evento.ciudad ? <MetaPill>{evento.ciudad}</MetaPill> : null}
                        {evento.pais ? <MetaPill>{evento.pais}</MetaPill> : null}
                        {evento.estado ? <MetaPill>{formatEstado(evento.estado)}</MetaPill> : null}
                      </div>
                    </>
                  );

                  return hasSlug ? (
                    <Link key={evento._id} href={`/eventos/${evento.slug}`} style={cardStyles}>
                      {cardContent}
                    </Link>
                  ) : (
                    <article key={evento._id} style={cardStyles}>
                      {cardContent}
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState text="Todavía no hay eventos cargados para esta disciplina." />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: "8px",
        marginBottom: "16px",
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: "1.45rem",
          lineHeight: 1.1,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          margin: 0,
          color: "var(--ffn-text-soft)",
          lineHeight: 1.7,
          fontSize: "0.98rem",
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "20px",
        borderRadius: "22px",
        background: "var(--ffn-surface)",
        border: "1px solid var(--ffn-border)",
        color: "var(--ffn-text-soft)",
        lineHeight: 1.7,
      }}
    >
      {text}
    </div>
  );
}

function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "8px 10px",
        borderRadius: "999px",
        fontSize: "0.78rem",
        fontWeight: 600,
        color: "var(--ffn-text-soft)",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--ffn-border)",
      }}
    >
      {children}
    </span>
  );
}