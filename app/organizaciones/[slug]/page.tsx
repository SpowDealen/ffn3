import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";
import imageUrlBuilder from "@sanity/image-url";
import { notFound } from "next/navigation";
import { client } from "../../../sanity/lib/client";
import { organizacionPorSlugQuery } from "../../../sanity/lib/queries";

const builder = imageUrlBuilder(client);

type RouteParams = {
  slug: string;
};

type PageProps = {
  params: Promise<RouteParams>;
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
  luchadorRojo?: SimpleItem;
  luchadorAzul?: SimpleItem;
  ganador?: SimpleItem;
  categoriaPeso?: string;
  categoriaPesoSlug?: string;
  metodo?: string;
  asalto?: number;
  tiempo?: string;
  estado?: string;
};

type OrganizacionRaw = {
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

type Organizacion = {
  _id: string;
  nombre: string;
  slug: string;
  descripcionCorta: string;
  descripcion: string;
  paisOrigen: string;
  sede: string;
  anioFundacion?: number;
  identidad: string;
  datosCuriosos: string[];
  sitioWeb: string;
  activa: boolean;
  banner?: string | SanityImage;
  logo?: string | SanityImage;
  disciplinas: SimpleItem[];
  eventos: EventoItem[];
  luchadores: LuchadorItem[];
  noticias: NoticiaItem[];
  combates: CombateItem[];
};

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getSafeText(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function getSafeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
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
    return image.trim();
  }

  if (isSanityImage(image)) {
    let chain = builder.image(image);

    if (options?.width) chain = chain.width(options.width);
    if (options?.height) chain = chain.height(options.height);
    if (options?.fit) chain = chain.fit(options.fit);

    return chain.url();
  }

  return null;
}

function formatFecha(fecha?: string) {
  if (!hasText(fecha)) return "";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return fecha;

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

function formatEstado(value?: string) {
  const safeValue = getSafeText(value);
  if (!safeValue) return "";
  if (safeValue === "proximo") return "Próximo";
  if (safeValue === "celebrado") return "Celebrado";
  if (safeValue === "cancelado") return "Cancelado";
  if (safeValue === "programado") return "Programado";
  if (safeValue === "finalizado") return "Finalizado";
  return safeValue.charAt(0).toUpperCase() + safeValue.slice(1);
}

function getItemName(value?: SimpleItem | null, fallback = ""): string {
  return getSafeText(value?.nombre, fallback);
}

function getItemSlug(value?: SimpleItem | null): string {
  return getSafeText(value?.slug);
}

function getCompactLocation(ciudad?: string, pais?: string) {
  return [getSafeText(ciudad), getSafeText(pais)].filter(Boolean).join(", ");
}

function normalizeSimpleItem(item: unknown): SimpleItem | null {
  if (!item || typeof item !== "object") return null;

  const candidate = item as SimpleItem;
  const nombre = getSafeText(candidate.nombre);
  const slug = getSafeText(candidate.slug);
  const _id = getSafeText(candidate._id);

  if (!nombre && !_id && !slug) return null;

  return {
    _id,
    nombre,
    slug,
  };
}

function normalizeEventoItem(item: unknown): EventoItem | null {
  if (!item || typeof item !== "object") return null;

  const candidate = item as EventoItem;
  const _id = getSafeText(candidate._id);
  const nombre = getSafeText(candidate.nombre);
  const slug = getSafeText(candidate.slug);

  if (!_id && !nombre && !slug) return null;

  return {
    _id,
    nombre,
    slug,
    fecha: getSafeText(candidate.fecha),
    ciudad: getSafeText(candidate.ciudad),
    pais: getSafeText(candidate.pais),
    recinto: getSafeText(candidate.recinto),
    imagen: candidate.imagen,
    disciplina: getSafeText(candidate.disciplina),
    disciplinaSlug: getSafeText(candidate.disciplinaSlug),
  };
}

function normalizeLuchadorItem(item: unknown): LuchadorItem | null {
  if (!item || typeof item !== "object") return null;

  const candidate = item as LuchadorItem;
  const _id = getSafeText(candidate._id);
  const nombre = getSafeText(candidate.nombre);
  const slug = getSafeText(candidate.slug);

  if (!_id && !nombre && !slug) return null;

  return {
    _id,
    nombre,
    slug,
    apodo: getSafeText(candidate.apodo),
    imagen: candidate.imagen,
    nacionalidad: getSafeText(candidate.nacionalidad),
    record: getSafeText(candidate.record),
    activo: typeof candidate.activo === "boolean" ? candidate.activo : undefined,
    disciplina: getSafeText(candidate.disciplina),
    disciplinaSlug: getSafeText(candidate.disciplinaSlug),
    categoriaPeso: getSafeText(candidate.categoriaPeso),
    categoriaPesoSlug: getSafeText(candidate.categoriaPesoSlug),
  };
}

function normalizeNoticiaItem(item: unknown): NoticiaItem | null {
  if (!item || typeof item !== "object") return null;

  const candidate = item as NoticiaItem;
  const _id = getSafeText(candidate._id);
  const titulo = getSafeText(candidate.titulo);
  const slug = getSafeText(candidate.slug);

  if (!_id && !titulo && !slug) return null;

  return {
    _id,
    titulo,
    slug,
    extracto: getSafeText(candidate.extracto),
    fechaPublicacion: getSafeText(candidate.fechaPublicacion),
    disciplina: getSafeText(candidate.disciplina),
    disciplinaSlug: getSafeText(candidate.disciplinaSlug),
  };
}

function normalizeCombateItem(item: unknown): CombateItem | null {
  if (!item || typeof item !== "object") return null;

  const candidate = item as CombateItem;
  const _id = getSafeText(candidate._id);

  const rojo = normalizeSimpleItem(candidate.luchadorRojo);
  const azul = normalizeSimpleItem(candidate.luchadorAzul);
  const ganador = normalizeSimpleItem(candidate.ganador);

  const evento = getSafeText(candidate.evento);
  const metodo = getSafeText(candidate.metodo);

  if (!_id && !evento && !metodo && !rojo?.nombre && !azul?.nombre) return null;

  return {
    _id,
    evento,
    eventoSlug: getSafeText(candidate.eventoSlug),
    luchadorRojo: rojo || undefined,
    luchadorAzul: azul || undefined,
    ganador: ganador || undefined,
    categoriaPeso: getSafeText(candidate.categoriaPeso),
    categoriaPesoSlug: getSafeText(candidate.categoriaPesoSlug),
    metodo,
    asalto: getSafeNumber(candidate.asalto),
    tiempo: getSafeText(candidate.tiempo),
    estado: getSafeText(candidate.estado),
  };
}

const blockStyle: CSSProperties = {
  border: "1px solid var(--ffn-border)",
  borderRadius: "22px",
  background: "var(--ffn-surface)",
  padding: "20px",
  display: "grid",
  gap: "14px",
  alignContent: "start",
};

const itemCardStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "16px",
  padding: "14px 15px",
  background: "rgba(255,255,255,0.025)",
  display: "grid",
  gap: "8px",
};

export default async function OrganizacionDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  const slug = getSafeText(resolvedParams.slug).trim();

  if (!slug) {
    notFound();
  }

  const data = await client.fetch<OrganizacionRaw | null>(
    organizacionPorSlugQuery,
    { slug },
    { cache: "no-store" }
  );

  if (!data || !hasText(data.nombre)) {
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
    datosCuriosos: getSafeArray<string>(data.datosCuriosos).filter(hasText),
    sitioWeb: getSafeText(data.sitioWeb),
    activa: getSafeBoolean(data.activa, true),
    banner: data.banner,
    logo: data.logo,
    disciplinas: getSafeArray(data.disciplinas)
      .map(normalizeSimpleItem)
      .filter((item): item is SimpleItem => item !== null),
    eventos: getSafeArray(data.eventos)
      .map(normalizeEventoItem)
      .filter((item): item is EventoItem => item !== null),
    luchadores: getSafeArray(data.luchadores)
      .map(normalizeLuchadorItem)
      .filter((item): item is LuchadorItem => item !== null),
    noticias: getSafeArray(data.noticias)
      .map(normalizeNoticiaItem)
      .filter((item): item is NoticiaItem => item !== null),
    combates: getSafeArray(data.combates)
      .map(normalizeCombateItem)
      .filter((item): item is CombateItem => item !== null),
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
        padding: "34px 18px 56px",
        background: "var(--ffn-bg)",
        color: "var(--ffn-text)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1240px",
          margin: "0 auto",
          display: "grid",
          gap: "20px",
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
            fontSize: "0.94rem",
          }}
        >
          ← Volver a organizaciones
        </Link>

        <section
          style={{
            position: "relative",
            overflow: "hidden",
            border: "1px solid var(--ffn-border)",
            borderRadius: "26px",
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
                height: "280px",
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
                height: "100px",
                borderBottom: "1px solid var(--ffn-border)",
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
              }}
            />
          )}

          <div
            style={{
              padding: "24px",
              display: "grid",
              gap: "18px",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "18px",
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              {logoUrl ? (
                <div
                  style={{
                    position: "relative",
                    width: "96px",
                    height: "96px",
                    borderRadius: "20px",
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
                    sizes="96px"
                    style={{ objectFit: "contain", padding: "10px" }}
                  />
                </div>
              ) : null}

              <div
                style={{
                  display: "grid",
                  gap: "10px",
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
                      padding: "6px 11px",
                      borderRadius: "999px",
                      fontSize: "0.8rem",
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
                    fontSize: "clamp(2rem, 4vw, 3.2rem)",
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
                      fontSize: "1rem",
                      lineHeight: 1.7,
                      maxWidth: "900px",
                    }}
                  >
                    {organizacion.descripcionCorta}
                  </p>
                ) : null}

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "9px",
                  }}
                >
                  {organizacion.paisOrigen ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "7px 11px",
                        borderRadius: "999px",
                        border: "1px solid var(--ffn-border)",
                        background: "rgba(255,255,255,0.04)",
                        fontSize: "0.88rem",
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
                        padding: "7px 11px",
                        borderRadius: "999px",
                        border: "1px solid var(--ffn-border)",
                        background: "rgba(255,255,255,0.04)",
                        fontSize: "0.88rem",
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
                        padding: "7px 11px",
                        borderRadius: "999px",
                        border: "1px solid var(--ffn-border)",
                        background: "rgba(255,255,255,0.04)",
                        fontSize: "0.88rem",
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
                        padding: "7px 11px",
                        borderRadius: "999px",
                        border: "1px solid var(--ffn-border)",
                        background: "rgba(255,255,255,0.04)",
                        fontSize: "0.88rem",
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
            gridTemplateColumns: "1.22fr 0.88fr",
            gap: "20px",
          }}
        >
          <article style={blockStyle}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Perfil editorial</h2>

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
                  gap: "5px",
                  padding: "14px",
                  borderRadius: "16px",
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(255,255,255,0.025)",
                }}
              >
                <span
                  style={{
                    fontSize: "0.76rem",
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
                    lineHeight: 1.75,
                  }}
                >
                  {organizacion.identidad}
                </p>
              </div>
            ) : null}
          </article>

          <aside style={blockStyle}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Disciplinas</h2>

            {organizacion.disciplinas.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "9px",
                }}
              >
                {organizacion.disciplinas.map((disciplina, index) => {
                  const nombre = getSafeText(disciplina?.nombre, "Disciplina");
                  const disciplinaSlug = getSafeText(disciplina?.slug);

                  if (!disciplinaSlug) {
                    return (
                      <span
                        key={disciplina._id || `${nombre}-${index}`}
                        style={{
                          padding: "7px 11px",
                          borderRadius: "999px",
                          border: "1px solid var(--ffn-border)",
                          background: "rgba(255,255,255,0.04)",
                          fontSize: "0.88rem",
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
                        padding: "7px 11px",
                        borderRadius: "999px",
                        border: "1px solid var(--ffn-border)",
                        background: "rgba(255,255,255,0.04)",
                        fontSize: "0.88rem",
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

            {organizacion.datosCuriosos.length > 0 ? (
              <>
                <h3 style={{ margin: 0, fontSize: "1rem" }}>Datos curiosos</h3>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: "18px",
                    color: "var(--ffn-text-soft)",
                    lineHeight: 1.75,
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
            gap: "20px",
          }}
        >
          <article style={blockStyle}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Noticias relacionadas</h2>

            {organizacion.noticias.length > 0 ? (
              <div style={{ display: "grid", gap: "10px" }}>
                {organizacion.noticias.map((noticia, index) => {
                  const titulo = getSafeText(noticia?.titulo, "Noticia");
                  const noticiaSlug = getSafeText(noticia?.slug);
                  const fecha = formatFecha(noticia?.fechaPublicacion);
                  const extracto = getSafeText(noticia?.extracto);

                  return (
                    <div key={noticia._id || `${titulo}-${index}`} style={itemCardStyle}>
                      {noticiaSlug ? (
                        <Link
                          href={`/noticias/${noticiaSlug}`}
                          style={{
                            textDecoration: "none",
                            color: "var(--ffn-text)",
                            fontWeight: 700,
                            fontSize: "0.98rem",
                            lineHeight: 1.4,
                          }}
                        >
                          {titulo}
                        </Link>
                      ) : (
                        <strong style={{ fontSize: "0.98rem", lineHeight: 1.4 }}>
                          {titulo}
                        </strong>
                      )}

                      {(fecha || extracto) && (
                        <p
                          style={{
                            margin: 0,
                            color: "var(--ffn-text-soft)",
                            lineHeight: 1.55,
                            fontSize: "0.92rem",
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

          <article style={blockStyle}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Luchadores relacionados</h2>

            {organizacion.luchadores.length > 0 ? (
              <div style={{ display: "grid", gap: "10px" }}>
                {organizacion.luchadores.map((luchador, index) => {
                  const nombre = getSafeText(luchador?.nombre, "Luchador");
                  const luchadorSlug = getSafeText(luchador?.slug);
                  const apodo = getSafeText(luchador?.apodo);
                  const record = getSafeText(luchador?.record);
                  const categoria = getSafeText(luchador?.categoriaPeso);

                  return (
                    <div key={luchador._id || `${nombre}-${index}`} style={itemCardStyle}>
                      {luchadorSlug ? (
                        <Link
                          href={`/luchadores/${luchadorSlug}`}
                          style={{
                            textDecoration: "none",
                            color: "var(--ffn-text)",
                            fontWeight: 700,
                            fontSize: "0.98rem",
                            lineHeight: 1.4,
                          }}
                        >
                          {nombre}
                        </Link>
                      ) : (
                        <strong style={{ fontSize: "0.98rem", lineHeight: 1.4 }}>
                          {nombre}
                        </strong>
                      )}

                      {(apodo || record || categoria) && (
                        <p
                          style={{
                            margin: 0,
                            color: "var(--ffn-text-soft)",
                            lineHeight: 1.55,
                            fontSize: "0.92rem",
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
            gap: "20px",
          }}
        >
          <article style={blockStyle}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Eventos relacionados</h2>

            {organizacion.eventos.length > 0 ? (
              <div style={{ display: "grid", gap: "10px" }}>
                {organizacion.eventos.map((evento, index) => {
                  const nombre = getSafeText(evento?.nombre, "Evento");
                  const eventoSlug = getSafeText(evento?.slug);
                  const fecha = formatFecha(evento?.fecha);
                  const lugar = getCompactLocation(evento?.ciudad, evento?.pais);

                  return (
                    <div key={evento._id || `${nombre}-${index}`} style={itemCardStyle}>
                      {eventoSlug ? (
                        <Link
                          href={`/eventos/${eventoSlug}`}
                          style={{
                            textDecoration: "none",
                            color: "var(--ffn-text)",
                            fontWeight: 700,
                            fontSize: "0.98rem",
                            lineHeight: 1.4,
                          }}
                        >
                          {nombre}
                        </Link>
                      ) : (
                        <strong style={{ fontSize: "0.98rem", lineHeight: 1.4 }}>
                          {nombre}
                        </strong>
                      )}

                      {(fecha || lugar) && (
                        <p
                          style={{
                            margin: 0,
                            color: "var(--ffn-text-soft)",
                            lineHeight: 1.55,
                            fontSize: "0.92rem",
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

          <article style={blockStyle}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Combates recientes</h2>

            {organizacion.combates.length > 0 ? (
              <div style={{ display: "grid", gap: "10px" }}>
                {organizacion.combates.map((combate, index) => {
                  const rojoNombre = getItemName(combate?.luchadorRojo, "Luchador rojo");
                  const rojoSlug = getItemSlug(combate?.luchadorRojo);
                  const azulNombre = getItemName(combate?.luchadorAzul, "Luchador azul");
                  const azulSlug = getItemSlug(combate?.luchadorAzul);
                  const ganadorNombre = getItemName(combate?.ganador);
                  const ganadorSlug = getItemSlug(combate?.ganador);
                  const evento = getSafeText(combate?.evento);
                  const eventoSlug = getSafeText(combate?.eventoSlug);
                  const metodo = getSafeText(combate?.metodo);
                  const categoria = getSafeText(combate?.categoriaPeso);
                  const estado = formatEstado(combate?.estado);
                  const combateId = getSafeText(combate?._id);

                  return (
                    <div
                      key={combateId || `${rojoNombre}-${azulNombre}-${index}`}
                      style={itemCardStyle}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontWeight: 700,
                          lineHeight: 1.45,
                          fontSize: "0.98rem",
                        }}
                      >
                        {rojoSlug ? (
                          <Link
                            href={`/luchadores/${rojoSlug}`}
                            style={{
                              textDecoration: "none",
                              color: "var(--ffn-text)",
                            }}
                          >
                            {rojoNombre}
                          </Link>
                        ) : (
                          rojoNombre
                        )}{" "}
                        vs{" "}
                        {azulSlug ? (
                          <Link
                            href={`/luchadores/${azulSlug}`}
                            style={{
                              textDecoration: "none",
                              color: "var(--ffn-text)",
                            }}
                          >
                            {azulNombre}
                          </Link>
                        ) : (
                          azulNombre
                        )}
                      </p>

                      {(evento || metodo || categoria || estado) && (
                        <p
                          style={{
                            margin: 0,
                            color: "var(--ffn-text-soft)",
                            lineHeight: 1.55,
                            fontSize: "0.92rem",
                          }}
                        >
                          {eventoSlug ? (
                            <Link
                              href={`/eventos/${eventoSlug}`}
                              style={{
                                color: "var(--ffn-text-soft)",
                                textDecoration: "none",
                              }}
                            >
                              {evento || "Evento"}
                            </Link>
                          ) : (
                            evento
                          )}
                          {categoria ? ` · ${categoria}` : ""}
                          {metodo ? ` · ${metodo}` : ""}
                          {estado ? ` · ${estado}` : ""}
                        </p>
                      )}

                      {ganadorNombre && (
                        <p
                          style={{
                            margin: 0,
                            color: "var(--ffn-text-soft)",
                            lineHeight: 1.55,
                            fontSize: "0.92rem",
                          }}
                        >
                          Ganador:{" "}
                          {ganadorSlug ? (
                            <Link
                              href={`/luchadores/${ganadorSlug}`}
                              style={{
                                color: "var(--ffn-accent)",
                                textDecoration: "none",
                              }}
                            >
                              {ganadorNombre}
                            </Link>
                          ) : (
                            ganadorNombre
                          )}
                        </p>
                      )}

                      {combateId ? (
                        <Link
                          href={`/resultados/${combateId}`}
                          style={{
                            textDecoration: "none",
                            color: "var(--ffn-accent)",
                            fontSize: "0.92rem",
                            fontWeight: 600,
                          }}
                        >
                          Ver resultado completo
                        </Link>
                      ) : null}
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