import Link from "next/link";
import Image from "next/image";
import imageUrlBuilder from "@sanity/image-url";
import {client} from "../../sanity/lib/client";
import {organizacionesQuery} from "../../sanity/lib/queries";

const builder = imageUrlBuilder(client);

function urlFor(source: any) {
  return builder.image(source);
}

type SanityImage = {
  asset?: {
    _ref?: string;
    _type?: string;
  };
};

type Organizacion = {
  _id: string;
  nombre: string;
  slug: string;
  descripcionCorta?: string;
  descripcion?: string;
  paisOrigen?: string;
  sede?: string;
  anioFundacion?: number;
  identidad?: string;
  sitioWeb?: string;
  activa?: boolean;
  datosCuriosos?: string[];
  logo?: SanityImage;
  banner?: SanityImage;
  disciplinas?: {
    _id: string;
    nombre: string;
    slug: string;
  }[];
};

function hasImage(image?: SanityImage) {
  return Boolean(image?.asset?._ref);
}

export default async function OrganizacionesPage() {
  const organizaciones = await client.fetch<Organizacion[]>(organizacionesQuery);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px 20px",
        background: "var(--ffn-bg)",
        color: "var(--ffn-text)",
      }}
    >
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          display: "grid",
          gap: "24px",
        }}
      >
        <section
          style={{
            display: "grid",
            gap: "14px",
            padding: "28px",
            border: "1px solid var(--ffn-border)",
            borderRadius: "24px",
            background: "var(--ffn-surface)",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--ffn-accent)",
              fontWeight: 700,
            }}
          >
            Organizaciones
          </span>

          <h1
            style={{
              margin: 0,
              fontSize: "clamp(2rem, 4vw, 3.4rem)",
              lineHeight: 1.03,
            }}
          >
            Promociones, ligas y marcas que mueven el combate
          </h1>

          <p
            style={{
              margin: 0,
              color: "var(--ffn-text-soft)",
              maxWidth: "920px",
              lineHeight: 1.7,
              fontSize: "1rem",
            }}
          >
            Esta sección reúne a las organizaciones más relevantes del universo
            de Full Fight News. La idea no es solo listarlas, sino explicar qué
            representa cada una, de dónde viene, en qué disciplinas compite y
            qué identidad propia tiene dentro del negocio de los deportes de
            combate.
          </p>
        </section>

        {organizaciones.length === 0 ? (
          <section
            style={{
              padding: "24px",
              border: "1px solid var(--ffn-border)",
              borderRadius: "24px",
              background: "var(--ffn-surface)",
            }}
          >
            <p style={{margin: 0, color: "var(--ffn-text-soft)"}}>
              Aún no hay organizaciones cargadas en Sanity.
            </p>
          </section>
        ) : (
          <section
            style={{
              display: "grid",
              gap: "18px",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            }}
          >
            {organizaciones.map((organizacion) => {
              const resumen =
                organizacion.descripcionCorta ||
                organizacion.descripcion ||
                "Sin descripción editorial por ahora.";

              const logoUrl = hasImage(organizacion.logo)
                ? urlFor(organizacion.logo).width(220).height(220).fit("clip").url()
                : null;

              const bannerUrl = hasImage(organizacion.banner)
                ? urlFor(organizacion.banner).width(1200).height(500).fit("crop").url()
                : null;

              return (
                <article
                  key={organizacion._id}
                  style={{
                    display: "grid",
                    gap: "16px",
                    padding: "22px",
                    border: "1px solid var(--ffn-border)",
                    borderRadius: "24px",
                    background: "var(--ffn-surface)",
                    boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
                    overflow: "hidden",
                  }}
                >
                  {bannerUrl && (
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        aspectRatio: "16 / 7",
                        borderRadius: "18px",
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <Image
                        src={bannerUrl}
                        alt={`Banner de ${organizacion.nombre}`}
                        fill
                        sizes="(max-width: 768px) 100vw, 50vw"
                        style={{
                          objectFit: "cover",
                        }}
                      />
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "16px",
                    }}
                  >
                    {logoUrl && (
                      <div
                        style={{
                          position: "relative",
                          width: "72px",
                          height: "72px",
                          flexShrink: 0,
                          borderRadius: "18px",
                          overflow: "hidden",
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.04)",
                        }}
                      >
                        <Image
                          src={logoUrl}
                          alt={`Logo de ${organizacion.nombre}`}
                          fill
                          sizes="72px"
                          style={{
                            objectFit: "contain",
                            padding: "8px",
                          }}
                        />
                      </div>
                    )}

                    <div style={{display: "grid", gap: "10px", minWidth: 0, flex: 1}}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: "12px",
                        }}
                      >
                        <h2
                          style={{
                            margin: 0,
                            fontSize: "1.3rem",
                            lineHeight: 1.15,
                          }}
                        >
                          {organizacion.nombre}
                        </h2>

                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "6px 10px",
                            borderRadius: "999px",
                            border: "1px solid var(--ffn-border)",
                            fontSize: "0.75rem",
                            color: organizacion.activa
                              ? "var(--ffn-text)"
                              : "var(--ffn-text-soft)",
                            background: "rgba(255,255,255,0.03)",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          {organizacion.activa ? "Activa" : "Inactiva"}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        {organizacion.paisOrigen && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "7px 11px",
                              borderRadius: "999px",
                              border: "1px solid var(--ffn-border)",
                              background: "rgba(255,255,255,0.03)",
                              color: "var(--ffn-text-soft)",
                              fontSize: "0.82rem",
                            }}
                          >
                            {organizacion.paisOrigen}
                          </span>
                        )}

                        {organizacion.anioFundacion && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "7px 11px",
                              borderRadius: "999px",
                              border: "1px solid var(--ffn-border)",
                              background: "rgba(255,255,255,0.03)",
                              color: "var(--ffn-text-soft)",
                              fontSize: "0.82rem",
                            }}
                          >
                            Fundada en {organizacion.anioFundacion}
                          </span>
                        )}

                        {organizacion.sede && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "7px 11px",
                              borderRadius: "999px",
                              border: "1px solid var(--ffn-border)",
                              background: "rgba(255,255,255,0.03)",
                              color: "var(--ffn-text-soft)",
                              fontSize: "0.82rem",
                            }}
                          >
                            Sede: {organizacion.sede}
                          </span>
                        )}
                      </div>

                      <p
                        style={{
                          margin: 0,
                          color: resumen
                            ? "var(--ffn-text-soft)"
                            : "var(--ffn-text-muted)",
                          lineHeight: 1.65,
                        }}
                      >
                        {resumen}
                      </p>
                    </div>
                  </div>

                  {organizacion.disciplinas && organizacion.disciplinas.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                      }}
                    >
                      {organizacion.disciplinas.map((disciplina) => (
                        <Link
                          key={disciplina._id}
                          href={`/disciplinas/${disciplina.slug}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "8px 12px",
                            borderRadius: "999px",
                            border: "1px solid var(--ffn-border)",
                            background: "rgba(255,255,255,0.03)",
                            color: "var(--ffn-text-soft)",
                            textDecoration: "none",
                            fontSize: "0.85rem",
                          }}
                        >
                          {disciplina.nombre}
                        </Link>
                      ))}
                    </div>
                  )}

                  {organizacion.identidad && (
                    <div
                      style={{
                        display: "grid",
                        gap: "6px",
                        padding: "14px",
                        borderRadius: "18px",
                        border: "1px solid rgba(255,255,255,0.06)",
                        background: "rgba(255,255,255,0.025)",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.78rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.12em",
                          color: "var(--ffn-text-muted)",
                          fontWeight: 700,
                        }}
                      >
                        Identidad
                      </span>

                      <p
                        style={{
                          margin: 0,
                          color: "var(--ffn-text-soft)",
                          lineHeight: 1.6,
                          fontSize: "0.95rem",
                        }}
                      >
                        {organizacion.identidad}
                      </p>
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "10px",
                      marginTop: "2px",
                    }}
                  >
                    <Link
                      href={`/organizaciones/${organizacion.slug}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "10px 14px",
                        borderRadius: "12px",
                        background: "var(--ffn-accent)",
                        color: "#0a0a0f",
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      Ver ficha
                    </Link>

                    {organizacion.sitioWeb && (
                      <a
                        href={organizacion.sitioWeb}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "10px 14px",
                          borderRadius: "12px",
                          border: "1px solid var(--ffn-border)",
                          color: "var(--ffn-text)",
                          textDecoration: "none",
                        }}
                      >
                        Web oficial
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}