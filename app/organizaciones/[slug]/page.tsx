import Link from "next/link";
import Image from "next/image";
import imageUrlBuilder from "@sanity/image-url";
import { notFound } from "next/navigation";
import { client } from "../../../sanity/lib/client";
import { organizacionPorSlugQuery } from "../../../sanity/lib/queries";

const builder = imageUrlBuilder(client);

type RouteParams = {
  slug: string;
};

type PageProps = {
  params: Promise<RouteParams> | RouteParams;
};

type SanityImage = {
  asset?: {
    _ref?: string;
    _type?: string;
  };
};

type SimpleItem = {
  _id?: string;
  nombre?: string;
  slug?: string;
};

type EventoItem = {
  _id?: string;
  nombre?: string;
  slug?: string;
  fecha?: string;
  ciudad?: string;
  pais?: string;
  recinto?: string;
  imagen?: string | SanityImage;
  disciplina?: string;
  disciplinaSlug?: string;
};

type LuchadorItem = {
  _id?: string;
  nombre?: string;
  slug?: string;
  apodo?: string;
  imagen?: string | SanityImage;
  nacionalidad?: string;
  record?: string;
  activo?: boolean;
  disciplina?: string;
  disciplinaSlug?: string;
  categoriaPeso?: string;
  categoriaPesoSlug?: string;
};

type NoticiaItem = {
  _id?: string;
  titulo?: string;
  slug?: string;
  extracto?: string;
  fechaPublicacion?: string;
  disciplina?: string;
  disciplinaSlug?: string;
};

type CombateItem = {
  _id?: string;
  evento?: string;
  eventoSlug?: string;
  luchadorRojo?: string;
  luchadorRojoSlug?: string;
  luchadorAzul?: string;
  luchadorAzulSlug?: string;
  ganador?: string;
  categoriaPeso?: string;
  categoriaPesoSlug?: string;
  metodo?: string;
  asalto?: number;
  tiempo?: string;
  estado?: string;
};

type Organizacion = {
  _id?: string;
  nombre?: string;
  slug?: string;
  descripcionCorta?: string;
  descripcion?: string;
  paisOrigen?: string;
  sede?: string;
  anioFundacion?: number;
  identidad?: string;
  datosCuriosos?: string[];
  sitioWeb?: string;
  activa?: boolean;
  banner?: string | SanityImage;
  logo?: string | SanityImage;
  disciplinas?: SimpleItem[];
  eventos?: EventoItem[];
  luchadores?: LuchadorItem[];
  noticias?: NoticiaItem[];
  combates?: CombateItem[];
};

function getSafeText(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function getSafeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function getSafeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getSafeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function isSanityImage(value: unknown): value is SanityImage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as SanityImage;
  return Boolean(candidate.asset?._ref);
}

function buildImageUrl(
  image: string | SanityImage | undefined,
  options?: {
    width?: number;
    height?: number;
    fit?: "clip" | "crop" | "fill" | "fillmax" | "max" | "scale" | "min";
  }
) {
  if (!image) return null;

  if (typeof image === "string" && image.trim()) {
    return image;
  }

  if (isSanityImage(image)) {
    let chain = builder.image(image);

    if (options?.width) {
      chain = chain.width(options.width);
    }

    if (options?.height) {
      chain = chain.height(options.height);
    }

    if (options?.fit) {
      chain = chain.fit(options.fit);
    }

    return chain.url();
  }

  return null;
}

function formatFecha(fecha?: string) {
  if (!fecha) return "";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return fecha;

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

export default async function OrganizacionDetailPage({ params }: PageProps) {
  const resolvedParams = await Promise.resolve(params);
  const slug = getSafeText(resolvedParams?.slug).trim();

  if (!slug) {
    notFound();
  }

  const data = await client.fetch<Organizacion | null>(
    organizacionPorSlugQuery,
    { slug },
    { cache: "no-store" }
  );

  if (!data) {
    notFound();
  }

  const organizacion: Organizacion = {
    _id: getSafeText(data._id),
    nombre: getSafeText(data.nombre, "Organización"),
    slug: getSafeText(data.slug),
    descripcionCorta: getSafeText(data.descripcionCorta),
    descripcion: getSafeText(data.descripcion),
    paisOrigen: getSafeText(data.paisOrigen),
    sede: getSafeText(data.sede),
    anioFundacion: getSafeNumber(data.anioFundacion),
    identidad: getSafeText(data.identidad),
    datosCuriosos: getSafeArray<string>(data.datosCuriosos).filter(Boolean),
    sitioWeb: getSafeText(data.sitioWeb),
    activa: getSafeBoolean(data.activa, true),
    banner: data.banner,
    logo: data.logo,
    disciplinas: getSafeArray<SimpleItem>(data.disciplinas),
    eventos: getSafeArray<EventoItem>(data.eventos),
    luchadores: getSafeArray<LuchadorItem>(data.luchadores),
    noticias: getSafeArray<NoticiaItem>(data.noticias),
    combates: getSafeArray<CombateItem>(data.combates),
  };

  const bannerUrl = buildImageUrl(organizacion.banner, {
    width: 1600,
    height: 700,
    fit: "crop",
  });

  const logoUrl = buildImageUrl(organizacion.logo, {
    width: 280,
    height: 280,
    fit: "clip",
  });

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
          width: "100%",
          maxWidth: "1280px",
          margin: "0 auto",
          display: "grid",
          gap: "24px",
        }}
      >
        <Link
          href="/organizaciones"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            width: "fit-content",
            color: "var(--ffn-text-soft)",
            textDecoration: "none",
            fontSize: "0.95rem",
          }}
        >
          ← Volver a organizaciones
        </Link>

        <section
          style={{
            position: "relative",
            overflow: "hidden",
            border: "1px solid var(--ffn-border)",
            borderRadius: "28px",
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
            boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
          }}
        >
          {bannerUrl ? (
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "320px",
                borderBottom: "1px solid var(--ffn-border)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <Image
                src={bannerUrl}
                alt={organizacion.nombre || "Banner de organización"}
                fill
                sizes="100vw"
                style={{ objectFit: "cover" }}
                priority
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(to top, rgba(10,10,15,0.96), rgba(10,10,15,0.35) 45%, rgba(10,10,15,0.08))",
                }}
              />
            </div>
          ) : (
            <div
              style={{
                height: "120px",
                borderBottom: "1px solid var(--ffn-border)",
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
              }}
            />
          )}

          <div
            style={{
              padding: "28px",
              display: "grid",
              gap: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "20px",
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              {logoUrl ? (
                <div
                  style={{
                    position: "relative",
                    width: "110px",
                    height: "110px",
                    borderRadius: "22px",
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.05)",
                    flexShrink: 0,
                    boxShadow: "0 14px 30px rgba(0,0,0,0.22)",
                  }}
                >
                  <Image
                    src={logoUrl}
                    alt={organizacion.nombre || "Logo"}
                    fill
                    sizes="110px"
                    style={{ objectFit: "contain", padding: "10px" }}
                  />
                </div>
              ) : null}

              <div
                style={{
                  display: "grid",
                  gap: "12px",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                    alignItems: "center",
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
                    Organización
                  </span>

                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "6px 12px",
                      borderRadius: "999px",
                      fontSize: "0.82rem",
                      border: "1px solid var(--ffn-border)",
                      background: "rgba(255,255,255,0.04)",
                      color: organizacion.activa
                        ? "var(--ffn-text)"
                        : "var(--ffn-text-soft)",
                    }}
                  >
                    {organizacion.activa ? "Activa" : "Inactiva"}
                  </span>
                </div>

                <h1
                  style={{
                    margin: 0,
                    fontSize: "clamp(2.2rem, 4vw, 3.4rem)",
                    lineHeight: 1.02,
                  }}
                >
                  {organizacion.nombre}
                </h1>

                {organizacion.descripcionCorta ? (
                  <p
                    style={{
                      margin: 0,
                      color: "var(--ffn-text-soft)",
                      fontSize: "1.06rem",
                      lineHeight: 1.75,
                      maxWidth: "920px",
                    }}
                  >
                    {organizacion.descripcionCorta}
                  </p>
                ) : null}

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  {organizacion.paisOrigen ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "8px 12px",
                        borderRadius: "999px",
                        border: "1px solid var(--ffn-border)",
                        background: "rgba(255,255,255,0.04)",
                        fontSize: "0.9rem",
                      }}
                    >
                      País: {organizacion.paisOrigen}
                    </span>
                  ) : null}

                  {organizacion.sede ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "8px 12px",
                        borderRadius: "999px",
                        border: "1px solid var(--ffn-border)",
                        background: "rgba(255,255,255,0.04)",
                        fontSize: "0.9rem",
                      }}
                    >
                      Sede: {organizacion.sede}
                    </span>
                  ) : null}

                  {organizacion.anioFundacion ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "8px 12px",
                        borderRadius: "999px",
                        border: "1px solid var(--ffn-border)",
                        background: "rgba(255,255,255,0.04)",
                        fontSize: "0.9rem",
                      }}
                    >
                      Fundación: {organizacion.anioFundacion}
                    </span>
                  ) : null}

                  {organizacion.sitioWeb ? (
                    <a
                      href={organizacion.sitioWeb}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "8px 12px",
                        borderRadius: "999px",
                        border: "1px solid var(--ffn-border)",
                        background: "rgba(255,255,255,0.04)",
                        fontSize: "0.9rem",
                        color: "var(--ffn-text)",
                        textDecoration: "none",
                      }}
                    >
                      Sitio web ↗
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.3fr 0.9fr",
            gap: "24px",
          }}
        >
          <article
            style={{
              border: "1px solid var(--ffn-border)",
              borderRadius: "24px",
              background: "var(--ffn-surface)",
              padding: "24px",
              display: "grid",
              gap: "16px",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.35rem" }}>Perfil editorial</h2>

            {organizacion.descripcion ? (
              <p
                style={{
                  margin: 0,
                  color: "var(--ffn-text-soft)",
                  lineHeight: 1.8,
                }}
              >
                {organizacion.descripcion}
              </p>
            ) : (
              <p style={{ margin: 0, color: "var(--ffn-text-soft)" }}>
                Sin descripción ampliada por ahora.
              </p>
            )}

            {organizacion.identidad ? (
              <div
                style={{
                  display: "grid",
                  gap: "6px",
                  padding: "16px",
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
                    lineHeight: 1.8,
                  }}
                >
                  {organizacion.identidad}
                </p>
              </div>
            ) : null}
          </article>

          <aside
            style={{
              border: "1px solid var(--ffn-border)",
              borderRadius: "24px",
              background: "var(--ffn-surface)",
              padding: "24px",
              display: "grid",
              gap: "16px",
              alignContent: "start",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.35rem" }}>Disciplinas</h2>

            {organizacion.disciplinas && organizacion.disciplinas.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                {organizacion.disciplinas.map((disciplina, index) => {
                  const nombre = getSafeText(disciplina?.nombre, "Disciplina");
                  const disciplinaSlug = getSafeText(disciplina?.slug);

                  if (!disciplinaSlug) {
                    return (
                      <span
                        key={`${nombre}-${index}`}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "999px",
                          border: "1px solid var(--ffn-border)",
                          background: "rgba(255,255,255,0.04)",
                          fontSize: "0.9rem",
                        }}
                      >
                        {nombre}
                      </span>
                    );
                  }

                  return (
                    <Link
                      key={disciplina._id || `${nombre}-${index}`}
                      href={`/disciplinas/${disciplinaSlug}`}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "999px",
                        border: "1px solid var(--ffn-border)",
                        background: "rgba(255,255,255,0.04)",
                        fontSize: "0.9rem",
                        textDecoration: "none",
                        color: "var(--ffn-text)",
                      }}
                    >
                      {nombre}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p style={{ margin: 0, color: "var(--ffn-text-soft)" }}>
                Sin disciplinas vinculadas por ahora.
              </p>
            )}

            {organizacion.datosCuriosos && organizacion.datosCuriosos.length > 0 ? (
              <>
                <h3 style={{ margin: 0, fontSize: "1.05rem" }}>Datos curiosos</h3>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: "18px",
                    color: "var(--ffn-text-soft)",
                    lineHeight: 1.8,
                  }}
                >
                  {organizacion.datosCuriosos.map((dato, index) => (
                    <li key={`${dato}-${index}`}>{dato}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </aside>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "24px",
          }}
        >
          <article
            style={{
              border: "1px solid var(--ffn-border)",
              borderRadius: "24px",
              background: "var(--ffn-surface)",
              padding: "24px",
              display: "grid",
              gap: "16px",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.35rem" }}>Eventos relacionados</h2>

            {organizacion.eventos && organizacion.eventos.length > 0 ? (
              <div style={{ display: "grid", gap: "14px" }}>
                {organizacion.eventos.map((evento, index) => {
                  const nombre = getSafeText(evento?.nombre, "Evento");
                  const eventoSlug = getSafeText(evento?.slug);
                  const fecha = formatFecha(evento?.fecha);
                  const lugar = [evento?.ciudad, evento?.pais].filter(Boolean).join(", ");

                  return (
                    <div
                      key={evento._id || `${nombre}-${index}`}
                      style={{
                        border: "1px solid var(--ffn-border)",
                        borderRadius: "18px",
                        padding: "16px",
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      {eventoSlug ? (
                        <Link
                          href={`/eventos/${eventoSlug}`}
                          style={{
                            textDecoration: "none",
                            color: "var(--ffn-text)",
                            fontWeight: 700,
                            fontSize: "1rem",
                          }}
                        >
                          {nombre}
                        </Link>
                      ) : (
                        <strong>{nombre}</strong>
                      )}

                      {(fecha || lugar) && (
                        <p
                          style={{
                            margin: "8px 0 0",
                            color: "var(--ffn-text-soft)",
                            lineHeight: 1.6,
                          }}
                        >
                          {[fecha, lugar].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ margin: 0, color: "var(--ffn-text-soft)" }}>
                Sin eventos vinculados por ahora.
              </p>
            )}
          </article>

          <article
            style={{
              border: "1px solid var(--ffn-border)",
              borderRadius: "24px",
              background: "var(--ffn-surface)",
              padding: "24px",
              display: "grid",
              gap: "16px",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.35rem" }}>
              Luchadores relacionados
            </h2>

            {organizacion.luchadores && organizacion.luchadores.length > 0 ? (
              <div style={{ display: "grid", gap: "14px" }}>
                {organizacion.luchadores.map((luchador, index) => {
                  const nombre = getSafeText(luchador?.nombre, "Luchador");
                  const luchadorSlug = getSafeText(luchador?.slug);
                  const apodo = getSafeText(luchador?.apodo);
                  const record = getSafeText(luchador?.record);
                  const categoria = getSafeText(luchador?.categoriaPeso);

                  return (
                    <div
                      key={luchador._id || `${nombre}-${index}`}
                      style={{
                        border: "1px solid var(--ffn-border)",
                        borderRadius: "18px",
                        padding: "16px",
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      {luchadorSlug ? (
                        <Link
                          href={`/luchadores/${luchadorSlug}`}
                          style={{
                            textDecoration: "none",
                            color: "var(--ffn-text)",
                            fontWeight: 700,
                            fontSize: "1rem",
                          }}
                        >
                          {nombre}
                        </Link>
                      ) : (
                        <strong>{nombre}</strong>
                      )}

                      {(apodo || record || categoria) && (
                        <p
                          style={{
                            margin: "8px 0 0",
                            color: "var(--ffn-text-soft)",
                            lineHeight: 1.6,
                          }}
                        >
                          {[apodo, record, categoria].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ margin: 0, color: "var(--ffn-text-soft)" }}>
                Sin luchadores vinculados por ahora.
              </p>
            )}
          </article>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "24px",
          }}
        >
          <article
            style={{
              border: "1px solid var(--ffn-border)",
              borderRadius: "24px",
              background: "var(--ffn-surface)",
              padding: "24px",
              display: "grid",
              gap: "16px",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.35rem" }}>Noticias relacionadas</h2>

            {organizacion.noticias && organizacion.noticias.length > 0 ? (
              <div style={{ display: "grid", gap: "14px" }}>
                {organizacion.noticias.map((noticia, index) => {
                  const titulo = getSafeText(noticia?.titulo, "Noticia");
                  const noticiaSlug = getSafeText(noticia?.slug);
                  const fecha = formatFecha(noticia?.fechaPublicacion);
                  const extracto = getSafeText(noticia?.extracto);

                  return (
                    <div
                      key={noticia._id || `${titulo}-${index}`}
                      style={{
                        border: "1px solid var(--ffn-border)",
                        borderRadius: "18px",
                        padding: "16px",
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      {noticiaSlug ? (
                        <Link
                          href={`/noticias/${noticiaSlug}`}
                          style={{
                            textDecoration: "none",
                            color: "var(--ffn-text)",
                            fontWeight: 700,
                            fontSize: "1rem",
                          }}
                        >
                          {titulo}
                        </Link>
                      ) : (
                        <strong>{titulo}</strong>
                      )}

                      {(fecha || extracto) && (
                        <p
                          style={{
                            margin: "8px 0 0",
                            color: "var(--ffn-text-soft)",
                            lineHeight: 1.6,
                          }}
                        >
                          {[fecha, extracto].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ margin: 0, color: "var(--ffn-text-soft)" }}>
                Sin noticias vinculadas por ahora.
              </p>
            )}
          </article>

          <article
            style={{
              border: "1px solid var(--ffn-border)",
              borderRadius: "24px",
              background: "var(--ffn-surface)",
              padding: "24px",
              display: "grid",
              gap: "16px",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.35rem" }}>Combates recientes</h2>

            {organizacion.combates && organizacion.combates.length > 0 ? (
              <div style={{ display: "grid", gap: "14px" }}>
                {organizacion.combates.map((combate, index) => {
                  const rojo = getSafeText(combate?.luchadorRojo, "Luchador rojo");
                  const azul = getSafeText(combate?.luchadorAzul, "Luchador azul");
                  const evento = getSafeText(combate?.evento);
                  const metodo = getSafeText(combate?.metodo);
                  const categoria = getSafeText(combate?.categoriaPeso);

                  return (
                    <div
                      key={combate._id || `${rojo}-${azul}-${index}`}
                      style={{
                        border: "1px solid var(--ffn-border)",
                        borderRadius: "18px",
                        padding: "16px",
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontWeight: 700,
                          lineHeight: 1.5,
                        }}
                      >
                        {rojo} vs {azul}
                      </p>

                      {(evento || metodo || categoria) && (
                        <p
                          style={{
                            margin: "8px 0 0",
                            color: "var(--ffn-text-soft)",
                            lineHeight: 1.6,
                          }}
                        >
                          {[evento, categoria, metodo].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ margin: 0, color: "var(--ffn-text-soft)" }}>
                Sin combates vinculados por ahora.
              </p>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}