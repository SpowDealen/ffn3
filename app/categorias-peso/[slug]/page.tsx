import Link from "next/link";
import { notFound } from "next/navigation";
import { client } from "../../../sanity/lib/client";
import { categoriaPesoPorSlugQuery } from "../../../sanity/lib/queries";

type RouteParams = {
  slug: string;
};

type PageProps = {
  params: Promise<RouteParams>;
};

type LuchadorRelacionado = {
  _id?: string;
  nombre?: string;
  slug?: string;
  apodo?: string;
  record?: string;
  organizacion?: string;
  organizacionSlug?: string;
};

type CombateRelacionado = {
  _id?: string;
  id?: string;
  estado?: string;
  metodo?: string;
  asalto?: number;
  tiempo?: string;
  cartelera?: string;
  tituloEnJuego?: boolean;
  resumen?: string;
  evento?: string;
  eventoSlug?: string;
  luchadorRojo?: string;
  luchadorRojoSlug?: string;
  luchadorAzul?: string;
  luchadorAzulSlug?: string;
  ganador?: string;
  ganadorSlug?: string;
};

type CategoriaPeso = {
  _id?: string;
  nombre?: string;
  slug?: string;
  descripcion?: string;
  limitePeso?: number;
  unidad?: string;
  disciplina?: string;
  disciplinaSlug?: string;
  organizacion?: string;
  organizacionSlug?: string;
  luchadoresRelacionados?: LuchadorRelacionado[] | null;
  combatesRelacionados?: CombateRelacionado[] | null;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeText(value: unknown, fallback = ""): string {
  return isNonEmptyString(value) ? value.trim() : fallback;
}

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function getCombateId(combate: CombateRelacionado) {
  return safeText(combate._id) || safeText(combate.id);
}

function getResultadoLabel(combate: CombateRelacionado) {
  const estado = safeText(combate.estado).toLowerCase();

  if (estado === "cancelado" || estado === "cancelada") return "Cancelado";
  if (estado === "programado") return "Programado";
  if (isNonEmptyString(combate.ganador)) return `Ganador: ${combate.ganador}`;
  return "Resultado por confirmar";
}

function getMetodoLabel(combate: CombateRelacionado) {
  const metodo = safeText(combate.metodo);
  const asalto =
    typeof combate.asalto === "number" ? ` · Asalto ${combate.asalto}` : "";
  const tiempo = isNonEmptyString(combate.tiempo) ? ` · ${combate.tiempo}` : "";

  if (metodo) return `${metodo}${asalto}${tiempo}`;
  if (asalto || tiempo) return `${asalto}${tiempo}`.replace(/^ · /, "");
  return "Método por confirmar";
}

export default async function CategoriaPesoDetallePage({
  params,
}: PageProps) {
  const { slug } = await params;
  const safeSlug = safeText(slug);

  if (!safeSlug) notFound();

  const categoria = await client.fetch<CategoriaPeso | null>(
    categoriaPesoPorSlugQuery,
    { slug: safeSlug }
  );

  if (!categoria?._id || !isNonEmptyString(categoria?.nombre)) {
    notFound();
  }

  const nombre = safeText(categoria.nombre);
  const descripcion = safeText(categoria.descripcion);
  const disciplina = safeText(categoria.disciplina);
  const disciplinaSlug = safeText(categoria.disciplinaSlug);
  const organizacion = safeText(categoria.organizacion);
  const organizacionSlug = safeText(categoria.organizacionSlug);
  const unidad = safeText(categoria.unidad, "lb");

  const luchadoresRelacionados = safeArray(categoria.luchadoresRelacionados).filter(
    (luchador) => isNonEmptyString(luchador?.nombre)
  );

  const combatesRelacionados = safeArray(categoria.combatesRelacionados).filter(
    (combate) => {
      return (
        isNonEmptyString(combate?.luchadorRojo) ||
        isNonEmptyString(combate?.luchadorAzul) ||
        isNonEmptyString(combate?.evento) ||
        isNonEmptyString(combate?._id) ||
        isNonEmptyString(combate?.id)
      );
    }
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--ffn-bg)",
        color: "var(--ffn-text)",
        padding: "40px 20px",
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
            border: "1px solid var(--ffn-border)",
            background: "var(--ffn-surface)",
            borderRadius: "24px",
            padding: "28px",
            display: "grid",
            gap: "16px",
            boxShadow: "var(--ffn-shadow-soft)",
          }}
        >
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}
          >
            <span className="ffn-pill">Categoría de peso</span>

            {typeof categoria.limitePeso === "number" ? (
              <span className="ffn-pill-muted">
                {categoria.limitePeso} {unidad}
              </span>
            ) : null}

            {disciplina ? <span className="ffn-pill-muted">{disciplina}</span> : null}
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(2rem, 4vw, 3rem)",
                lineHeight: 1.05,
              }}
            >
              {nombre}
            </h1>

            {descripcion ? (
              <p
                style={{
                  margin: 0,
                  color: "var(--ffn-text-soft)",
                  lineHeight: 1.75,
                  maxWidth: "920px",
                }}
              >
                {descripcion}
              </p>
            ) : (
              <p
                style={{
                  margin: 0,
                  color: "var(--ffn-text-soft)",
                  lineHeight: 1.75,
                  maxWidth: "920px",
                }}
              >
                Ficha editorial de la categoría, con luchadores y combates relacionados dentro de
                su contexto competitivo.
              </p>
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            {disciplina && disciplinaSlug ? (
              <Link href={`/disciplinas/${disciplinaSlug}`} className="ffn-button-primary">
                Ver disciplina
              </Link>
            ) : null}

            {organizacion && organizacionSlug ? (
              <Link href={`/organizaciones/${organizacionSlug}`} className="ffn-button-secondary">
                Ver organización relacionada
              </Link>
            ) : null}
          </div>
        </section>

        <section
          style={{
            border: "1px solid var(--ffn-border)",
            background: "var(--ffn-surface)",
            borderRadius: "24px",
            padding: "24px",
            display: "grid",
            gap: "18px",
            boxShadow: "var(--ffn-shadow-soft)",
          }}
        >
          <div style={{ display: "grid", gap: "6px" }}>
            <span className="ffn-section-kicker">Protagonistas</span>
            <h2 style={{ margin: 0, fontSize: "1.5rem" }}>Luchadores relacionados</h2>
          </div>

          {luchadoresRelacionados.length ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "16px",
              }}
            >
              {luchadoresRelacionados.map((luchador, index) => {
                const luchadorSlug = safeText(luchador.slug);
                const luchadorNombre = safeText(luchador.nombre, "Luchador");
                const key = safeText(luchador._id) || `${luchadorNombre}-${index}`;

                const content = (
                  <>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      {isNonEmptyString(luchador.organizacion) ? (
                        <span className="ffn-pill-muted">{luchador.organizacion}</span>
                      ) : null}
                    </div>

                    <h3 style={{ margin: 0, fontSize: "1.05rem", lineHeight: 1.35 }}>
                      {luchadorNombre}
                      {isNonEmptyString(luchador.apodo) ? ` “${luchador.apodo}”` : ""}
                    </h3>

                    <p
                      style={{
                        margin: 0,
                        color: "var(--ffn-text-soft)",
                        lineHeight: 1.6,
                      }}
                    >
                      {safeText(luchador.record, "Récord por actualizar")}
                    </p>
                  </>
                );

                if (luchadorSlug) {
                  return (
                    <Link
                      key={key}
                      href={`/luchadores/${luchadorSlug}`}
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                        border: "1px solid var(--ffn-border)",
                        background: "rgba(255,255,255,0.025)",
                        borderRadius: "18px",
                        padding: "18px",
                        display: "grid",
                        gap: "10px",
                      }}
                    >
                      {content}
                    </Link>
                  );
                }

                return (
                  <article
                    key={key}
                    style={{
                      border: "1px solid var(--ffn-border)",
                      background: "rgba(255,255,255,0.025)",
                      borderRadius: "18px",
                      padding: "18px",
                      display: "grid",
                      gap: "10px",
                    }}
                  >
                    {content}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="ffn-empty-state">
              Todavía no hay luchadores relacionados cargados en esta categoría.
            </div>
          )}
        </section>

        <section
          style={{
            border: "1px solid var(--ffn-border)",
            background: "var(--ffn-surface)",
            borderRadius: "24px",
            padding: "24px",
            display: "grid",
            gap: "18px",
            boxShadow: "var(--ffn-shadow-soft)",
          }}
        >
          <div style={{ display: "grid", gap: "6px" }}>
            <span className="ffn-section-kicker">Competición</span>
            <h2 style={{ margin: 0, fontSize: "1.5rem" }}>Combates relacionados</h2>
          </div>

          {combatesRelacionados.length ? (
            <div style={{ display: "grid", gap: "16px" }}>
              {combatesRelacionados.map((combate, index) => {
                const combateId = getCombateId(combate);
                const key =
                  combateId ||
                  `${safeText(combate.luchadorRojo)}-${safeText(combate.luchadorAzul)}-${index}`;

                return (
                  <article
                    key={key}
                    style={{
                      border: "1px solid var(--ffn-border)",
                      background: "rgba(255,255,255,0.025)",
                      borderRadius: "18px",
                      padding: "18px",
                      display: "grid",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      {isNonEmptyString(combate.cartelera) ? (
                        <span className="ffn-pill-muted">{combate.cartelera}</span>
                      ) : null}
                      {combate.tituloEnJuego ? (
                        <span className="ffn-pill">Título en juego</span>
                      ) : null}
                      {isNonEmptyString(combate.estado) ? (
                        <span className="ffn-pill-muted">{combate.estado}</span>
                      ) : null}
                    </div>

                    <div style={{ display: "grid", gap: "8px" }}>
                      <h3 style={{ margin: 0, fontSize: "1.08rem", lineHeight: 1.35 }}>
                        {safeText(combate.luchadorRojo, "Luchador rojo por confirmar")} vs{" "}
                        {safeText(combate.luchadorAzul, "Luchador azul por confirmar")}
                      </h3>

                      <p
                        style={{
                          margin: 0,
                          color: "var(--ffn-text-soft)",
                          lineHeight: 1.6,
                        }}
                      >
                        {getResultadoLabel(combate)}
                      </p>

                      <p
                        style={{
                          margin: 0,
                          color: "var(--ffn-text-soft)",
                          lineHeight: 1.6,
                        }}
                      >
                        {getMetodoLabel(combate)}
                      </p>

                      {isNonEmptyString(combate.resumen) ? (
                        <p
                          style={{
                            margin: 0,
                            color: "var(--ffn-text-soft)",
                            lineHeight: 1.7,
                          }}
                        >
                          {combate.resumen}
                        </p>
                      ) : null}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "10px",
                        alignItems: "center",
                      }}
                    >
                      {combateId ? (
                        <Link href={`/resultados/${combateId}`} className="ffn-button-secondary">
                          Ver resultado
                        </Link>
                      ) : null}

                      {isNonEmptyString(combate.evento) && isNonEmptyString(combate.eventoSlug) ? (
                        <Link
                          href={`/eventos/${combate.eventoSlug}`}
                          className="ffn-inline-link"
                        >
                          {combate.evento}
                        </Link>
                      ) : null}

                      {isNonEmptyString(combate.luchadorRojo) &&
                      isNonEmptyString(combate.luchadorRojoSlug) ? (
                        <Link
                          href={`/luchadores/${combate.luchadorRojoSlug}`}
                          className="ffn-inline-link"
                        >
                          {combate.luchadorRojo}
                        </Link>
                      ) : null}

                      {isNonEmptyString(combate.luchadorAzul) &&
                      isNonEmptyString(combate.luchadorAzulSlug) ? (
                        <Link
                          href={`/luchadores/${combate.luchadorAzulSlug}`}
                          className="ffn-inline-link"
                        >
                          {combate.luchadorAzul}
                        </Link>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="ffn-empty-state">
              Todavía no hay combates relacionados cargados en esta categoría.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}