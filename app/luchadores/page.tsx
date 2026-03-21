import Link from "next/link";
import { client } from "../../sanity/lib/client";
import { luchadoresQuery } from "../../sanity/lib/queries";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: Promise<SearchParams>;
};

type Luchador = {
  _id: string;
  nombre: string;
  slug: string;
  apodo?: string;
  nacionalidad?: string;
  record?: string;
  activo?: boolean;
  rankingDisciplina?: number;
  disciplina?: string;
  disciplinaSlug?: string;
  organizacion?: string;
  organizacionSlug?: string;
  categoriaPeso?: string;
  categoriaPesoSlug?: string;
  categoriaPesoLimite?: number;
  categoriaPesoUnidad?: string;
};

type GrupoCategoria = {
  categoria: string;
  categoriaSlug?: string;
  categoriaPesoLimite?: number;
  categoriaPesoUnidad?: string;
  luchadores: Luchador[];
};

type GrupoDisciplina = {
  disciplina: string;
  disciplinaSlug?: string;
  luchadores: Luchador[];
  categorias: GrupoCategoria[];
};

async function resolveSearchParams(
  searchParams?: Promise<SearchParams>
): Promise<SearchParams> {
  if (!searchParams) return {};
  return await searchParams;
}

function normalizeParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function safeText(value?: string) {
  return value && value.trim().length > 0 ? value.trim() : "Sin categoría";
}

function buildGroupedData(luchadores: Luchador[]) {
  const disciplinasMap = new Map<string, GrupoDisciplina>();

  for (const luchador of luchadores) {
    const disciplinaKey = `${luchador.disciplinaSlug || "sin-disciplina"}::${safeText(
      luchador.disciplina
    )}`;

    if (!disciplinasMap.has(disciplinaKey)) {
      disciplinasMap.set(disciplinaKey, {
        disciplina: safeText(luchador.disciplina),
        disciplinaSlug: luchador.disciplinaSlug,
        luchadores: [],
        categorias: [],
      });
    }

    disciplinasMap.get(disciplinaKey)!.luchadores.push(luchador);
  }

  const disciplinas = Array.from(disciplinasMap.values()).map((disciplinaGrupo) => {
    const categoriasMap = new Map<string, GrupoCategoria>();

    for (const luchador of disciplinaGrupo.luchadores) {
      const categoriaKey = `${luchador.categoriaPesoSlug || "sin-categoria"}::${safeText(
        luchador.categoriaPeso
      )}`;

      if (!categoriasMap.has(categoriaKey)) {
        categoriasMap.set(categoriaKey, {
          categoria: safeText(luchador.categoriaPeso),
          categoriaSlug: luchador.categoriaPesoSlug,
          categoriaPesoLimite: luchador.categoriaPesoLimite,
          categoriaPesoUnidad: luchador.categoriaPesoUnidad,
          luchadores: [],
        });
      }

      categoriasMap.get(categoriaKey)!.luchadores.push(luchador);
    }

    const categorias = Array.from(categoriasMap.values()).sort((a, b) => {
      const aLimite =
        typeof a.categoriaPesoLimite === "number"
          ? a.categoriaPesoLimite
          : Number.MAX_SAFE_INTEGER;
      const bLimite =
        typeof b.categoriaPesoLimite === "number"
          ? b.categoriaPesoLimite
          : Number.MAX_SAFE_INTEGER;

      if (aLimite !== bLimite) return aLimite - bLimite;
      return a.categoria.localeCompare(b.categoria, "es");
    });

    return {
      ...disciplinaGrupo,
      categorias,
    };
  });

  return disciplinas.sort((a, b) => a.disciplina.localeCompare(b.disciplina, "es"));
}

export default async function LuchadoresPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await resolveSearchParams(searchParams);
  const disciplinaFiltro = normalizeParam(resolvedSearchParams.disciplina);

  const luchadores: Luchador[] = await client.fetch(luchadoresQuery);

  const filtrados = disciplinaFiltro
    ? luchadores.filter((luchador) => luchador.disciplinaSlug === disciplinaFiltro)
    : luchadores;

  const grupos = buildGroupedData(filtrados);
  const disciplinasDisponibles = buildGroupedData(luchadores);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--ffn-bg)",
        color: "var(--ffn-text)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1440px",
          margin: "0 auto",
          padding: "40px 24px 70px",
          boxSizing: "border-box",
          display: "grid",
          gap: "28px",
        }}
      >
        <section
          style={{
            background: "var(--ffn-surface)",
            border: "1px solid var(--ffn-border)",
            borderRadius: "28px",
            padding: "32px",
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
              Roster editorial
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
              {filtrados.length} luchadores visibles
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
              {grupos.length} disciplinas
            </span>
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(2.2rem, 5vw, 3.5rem)",
                lineHeight: 1,
                letterSpacing: "-0.04em",
              }}
            >
              Luchadores
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: "960px",
                color: "var(--ffn-text-soft)",
                lineHeight: 1.8,
                fontSize: "1.02rem",
              }}
            >
              Aquí sí vive el listado amplio. Los perfiles se organizan por disciplina y por
              categorías de peso para que cada capa de la web cumpla su función: la disciplina
              destaca el Top 10, y esta página recoge el roster completo de forma ordenada.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              marginTop: "4px",
            }}
          >
            <Link
              href="/luchadores"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 14px",
                borderRadius: "999px",
                textDecoration: "none",
                color: !disciplinaFiltro ? "var(--ffn-text)" : "var(--ffn-text-soft)",
                background: !disciplinaFiltro
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(255,255,255,0.03)",
                border: "1px solid var(--ffn-border)",
                fontWeight: 700,
                fontSize: "0.9rem",
              }}
            >
              Todas
            </Link>

            {disciplinasDisponibles.map((grupo) => (
              <Link
                key={grupo.disciplinaSlug || grupo.disciplina}
                href={
                  grupo.disciplinaSlug
                    ? `/luchadores?disciplina=${grupo.disciplinaSlug}`
                    : "/luchadores"
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px 14px",
                  borderRadius: "999px",
                  textDecoration: "none",
                  color:
                    disciplinaFiltro === grupo.disciplinaSlug
                      ? "var(--ffn-text)"
                      : "var(--ffn-text-soft)",
                  background:
                    disciplinaFiltro === grupo.disciplinaSlug
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(255,255,255,0.03)",
                  border: "1px solid var(--ffn-border)",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                }}
              >
                {grupo.disciplina}
              </Link>
            ))}
          </div>
        </section>

        {grupos.length === 0 ? (
          <section
            style={{
              padding: "24px",
              borderRadius: "24px",
              background: "var(--ffn-surface)",
              border: "1px solid var(--ffn-border)",
              color: "var(--ffn-text-soft)",
              lineHeight: 1.7,
            }}
          >
            Todavía no hay luchadores publicados en esta vista.
          </section>
        ) : (
          <section style={{ display: "grid", gap: "28px" }}>
            {grupos.map((grupo) => (
              <section
                key={grupo.disciplinaSlug || grupo.disciplina}
                style={{
                  display: "grid",
                  gap: "18px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "end",
                    justifyContent: "space-between",
                    gap: "14px",
                  }}
                >
                  <div style={{ display: "grid", gap: "8px" }}>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: "1.8rem",
                        lineHeight: 1.1,
                      }}
                    >
                      {grupo.disciplina}
                    </h2>
                    <p
                      style={{
                        margin: 0,
                        color: "var(--ffn-text-soft)",
                        fontSize: "0.98rem",
                        lineHeight: 1.7,
                      }}
                    >
                      {grupo.luchadores.length} luchadores registrados en esta disciplina.
                    </p>
                  </div>

                  {grupo.disciplinaSlug ? (
                    <Link
                      href={`/disciplinas/${grupo.disciplinaSlug}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "12px 16px",
                        borderRadius: "14px",
                        textDecoration: "none",
                        color: "var(--ffn-text)",
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid var(--ffn-border)",
                        fontWeight: 700,
                      }}
                    >
                      Ver disciplina
                    </Link>
                  ) : null}
                </div>

                <div style={{ display: "grid", gap: "20px" }}>
                  {grupo.categorias.map((categoria) => (
                    <section
                      key={`${grupo.disciplinaSlug || grupo.disciplina}-${
                        categoria.categoriaSlug || categoria.categoria
                      }`}
                      style={{
                        display: "grid",
                        gap: "14px",
                        padding: "22px",
                        borderRadius: "24px",
                        background: "var(--ffn-surface)",
                        border: "1px solid var(--ffn-border)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px",
                        }}
                      >
                        <div style={{ display: "grid", gap: "6px" }}>
                          <h3
                            style={{
                              margin: 0,
                              fontSize: "1.2rem",
                              lineHeight: 1.2,
                            }}
                          >
                            {categoria.categoria}
                          </h3>

                          <p
                            style={{
                              margin: 0,
                              color: "var(--ffn-text-soft)",
                              fontSize: "0.92rem",
                              lineHeight: 1.6,
                            }}
                          >
                            {categoria.luchadores.length} luchadores en esta división
                            {typeof categoria.categoriaPesoLimite === "number"
                              ? ` · límite ${categoria.categoriaPesoLimite} ${
                                  categoria.categoriaPesoUnidad || ""
                                }`.trim()
                              : ""}
                          </p>
                        </div>

                        {categoria.categoriaSlug ? (
                          <Link
                            href={`/categorias-peso/${categoria.categoriaSlug}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "10px 14px",
                              borderRadius: "12px",
                              textDecoration: "none",
                              color: "var(--ffn-text)",
                              background: "rgba(255,255,255,0.05)",
                              border: "1px solid var(--ffn-border)",
                              fontWeight: 700,
                              fontSize: "0.9rem",
                            }}
                          >
                            Ver categoría
                          </Link>
                        ) : null}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                          gap: "16px",
                        }}
                      >
                        {categoria.luchadores.map((luchador) => (
                          <Link
                            key={luchador._id}
                            href={`/luchadores/${luchador.slug}`}
                            style={{
                              textDecoration: "none",
                              color: "inherit",
                              display: "grid",
                              gap: "12px",
                              padding: "18px",
                              borderRadius: "18px",
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid var(--ffn-border)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "10px",
                              }}
                            >
                              <h4
                                style={{
                                  margin: 0,
                                  fontSize: "1.04rem",
                                  lineHeight: 1.2,
                                }}
                              >
                                {luchador.nombre}
                              </h4>

                              {typeof luchador.rankingDisciplina === "number" ? (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    padding: "6px 10px",
                                    borderRadius: "999px",
                                    fontSize: "0.76rem",
                                    fontWeight: 800,
                                    border: "1px solid var(--ffn-border-strong)",
                                    background: "rgba(255,255,255,0.07)",
                                    color: "var(--ffn-text)",
                                  }}
                                >
                                  #{luchador.rankingDisciplina}
                                </span>
                              ) : null}
                            </div>

                            {luchador.apodo ? (
                              <p
                                style={{
                                  margin: 0,
                                  color: "var(--ffn-text-soft)",
                                  fontSize: "0.94rem",
                                  lineHeight: 1.5,
                                }}
                              >
                                “{luchador.apodo}”
                              </p>
                            ) : null}

                            <div
                              style={{
                                display: "grid",
                                gap: "6px",
                                color: "var(--ffn-text-soft)",
                                fontSize: "0.92rem",
                                lineHeight: 1.6,
                              }}
                            >
                              {luchador.nacionalidad ? (
                                <p style={{ margin: 0 }}>Nacionalidad: {luchador.nacionalidad}</p>
                              ) : null}
                              {luchador.organizacion ? (
                                <p style={{ margin: 0 }}>Organización: {luchador.organizacion}</p>
                              ) : null}
                              {luchador.record ? (
                                <p style={{ margin: 0 }}>Récord: {luchador.record}</p>
                              ) : null}
                              <p style={{ margin: 0 }}>
                                Estado: {luchador.activo ? "Activo" : "Inactivo"}
                              </p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}