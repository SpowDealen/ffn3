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
  slug: string;
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
  slug: string;
  limitePeso?: number;
  unidad?: string;
  descripcion?: string;
};

type Luchador = {
  _id: string;
  nombre: string;
  slug: string;
  apodo?: string;
  nacionalidad?: string;
  record?: string;
  activo?: boolean;
  imagen?: ImagenSanity;
  categoriaPesoNombre?: string;
  categoriaPesoSlug?: string;
  organizacionNombre?: string;
  organizacionSlug?: string;
};

type Disciplina = {
  _id: string;
  nombre: string;
  slug: string;
  descripcion?: string;
  activa?: boolean;
  organizaciones?: Organizacion[];
  categoriasPeso?: CategoriaPeso[];
  luchadores?: Luchador[];
};

const builder = imageUrlBuilder(client);

function getImageUrl(source?: ImagenSanity) {
  if (!source?.asset?._ref) return null;

  try {
    return builder.image(source).width(500).height(500).fit("crop").url();
  } catch {
    return null;
  }
}

async function resolveParams(params: Promise<RouteParams> | RouteParams) {
  return params instanceof Promise ? await params : params;
}

export default async function DisciplinaDetallePage({ params }: PageProps) {
  const { slug } = await resolveParams(params);

  const disciplina = await client.fetch<Disciplina | null>(disciplinaPorSlugQuery, { slug });

  if (!disciplina) {
    notFound();
  }

  const organizaciones = Array.isArray(disciplina.organizaciones)
    ? disciplina.organizaciones
    : [];

  const categoriasPeso = Array.isArray(disciplina.categoriasPeso)
    ? disciplina.categoriasPeso
    : [];

  const luchadores = Array.isArray(disciplina.luchadores) ? disciplina.luchadores : [];

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
                maxWidth: "900px",
                fontSize: "1.05rem",
                lineHeight: 1.8,
                color: "var(--ffn-text-soft)",
              }}
            >
              {disciplina.descripcion ||
                `Explora la disciplina ${disciplina.nombre} con acceso directo a sus organizaciones, categorías de peso y luchadores relacionados.`}
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
          <div
            style={{
              gridColumn: "span 12",
            }}
          >
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

                  return (
                    <Link
                      key={organizacion._id}
                      href={`/organizaciones/${organizacion.slug}`}
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                        display: "grid",
                        gap: "14px",
                        padding: "20px",
                        borderRadius: "24px",
                        background: "var(--ffn-surface)",
                        border: "1px solid var(--ffn-border)",
                      }}
                    >
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
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState text="Todavía no hay organizaciones conectadas a esta disciplina." />
            )}
          </div>

          <div
            style={{
              gridColumn: "span 12",
            }}
          >
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
                {categoriasPeso.map((categoria) => (
                  <Link
                    key={categoria._id}
                    href={`/categorias-peso/${categoria.slug}`}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      display: "grid",
                      gap: "12px",
                      padding: "20px",
                      borderRadius: "24px",
                      background: "var(--ffn-surface)",
                      border: "1px solid var(--ffn-border)",
                    }}
                  >
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
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState text="Todavía no hay categorías de peso cargadas para esta disciplina." />
            )}
          </div>

          <div
            style={{
              gridColumn: "span 12",
            }}
          >
            <SectionTitle
              title="Luchadores"
              subtitle="Talento relacionado con esta disciplina dentro de la base editorial actual."
            />

            {luchadores.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: "18px",
                }}
              >
                {luchadores.map((luchador) => {
                  const imageUrl = getImageUrl(luchador.imagen);

                  return (
                    <Link
                      key={luchador._id}
                      href={`/luchadores/${luchador.slug}`}
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                        display: "grid",
                        gap: "14px",
                        padding: "20px",
                        borderRadius: "24px",
                        background: "var(--ffn-surface)",
                        border: "1px solid var(--ffn-border)",
                      }}
                    >
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

                      <div style={{ display: "grid", gap: "8px" }}>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "10px",
                          }}
                        >
                          <h3
                            style={{
                              margin: 0,
                              fontSize: "1.08rem",
                              lineHeight: 1.2,
                            }}
                          >
                            {luchador.nombre}
                          </h3>

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

                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "8px",
                            marginTop: "4px",
                          }}
                        >
                          {luchador.nacionalidad ? (
                            <MetaPill>{luchador.nacionalidad}</MetaPill>
                          ) : null}

                          {luchador.record ? <MetaPill>Récord: {luchador.record}</MetaPill> : null}

                          {luchador.categoriaPesoNombre && luchador.categoriaPesoSlug ? (
                            <MetaPillLink href={`/categorias-peso/${luchador.categoriaPesoSlug}`}>
                              {luchador.categoriaPesoNombre}
                            </MetaPillLink>
                          ) : null}

                          {luchador.organizacionNombre && luchador.organizacionSlug ? (
                            <MetaPillLink href={`/organizaciones/${luchador.organizacionSlug}`}>
                              {luchador.organizacionNombre}
                            </MetaPillLink>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState text="Todavía no hay luchadores cargados para esta disciplina." />
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

function MetaPillLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "8px 10px",
        borderRadius: "999px",
        fontSize: "0.78rem",
        fontWeight: 600,
        color: "var(--ffn-text)",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid var(--ffn-border)",
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}