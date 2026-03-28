import { NextResponse } from "next/server";
import { client } from "../../../sanity/lib/client";
import type { ReferenceTarget } from "../../../_laboratorio/laboratorio-ia/src/types";
import type { ReferenceEntityOption } from "../../../_laboratorio/laboratorio-ia/src/data/referenceEntities";

type ReferenceEntitiesResponse = {
  ok: true;
  data: Record<ReferenceTarget, ReferenceEntityOption[]>;
};

type DisciplinaDoc = {
  _id: string;
  nombre?: string;
  slug?: { current?: string };
};

type OrganizacionDoc = {
  _id: string;
  nombre?: string;
  slug?: { current?: string };
  disciplinas?: Array<{ _ref?: string } | null> | null;
};

type EventoDoc = {
  _id: string;
  nombre?: string;
  slug?: { current?: string };
  disciplina?: { _ref?: string } | null;
  organizacion?: { _ref?: string } | null;
};

type CategoriaPesoDoc = {
  _id: string;
  nombre?: string;
  slug?: { current?: string };
  disciplina?: { _ref?: string } | null;
};

type LuchadorDoc = {
  _id: string;
  nombre?: string;
  slug?: { current?: string };
  disciplina?: { _ref?: string } | null;
  organizacion?: { _ref?: string } | null;
  categoriaPeso?: { _ref?: string } | null;
  eventIds?: string[] | null;
};

function getAllowedOrigin(request: Request): string {
  const origin = request.headers.get("origin")?.trim();

  if (!origin) {
    return "*";
  }

  const allowedOrigins = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);

  return allowedOrigins.has(origin) ? origin : "*";
}

function withCors(response: NextResponse, request: Request): NextResponse {
  const allowedOrigin = getAllowedOrigin(request);

  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Vary", "Origin");

  return response;
}

function toArray(value: string | null): string[] {
  if (!value) return [];

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function compactStringArray(values: Array<string | null | undefined>): string[] {
  return values.filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0
  );
}

function labelFromDoc(
  preferred: string | undefined,
  fallbackId: string,
  typeLabel: string
): string {
  const value = preferred?.trim();
  return value && value.length > 0 ? value : `${typeLabel} ${fallbackId}`;
}

function matchesDiscipline(
  option: ReferenceEntityOption,
  selectedDisciplineIds: string[]
): boolean {
  if (selectedDisciplineIds.length === 0) return true;
  if (!option.disciplineIds || option.disciplineIds.length === 0) return true;

  return option.disciplineIds.some((id) => selectedDisciplineIds.includes(id));
}

function matchesOrganization(
  option: ReferenceEntityOption,
  selectedOrganizationIds: string[]
): boolean {
  if (selectedOrganizationIds.length === 0) return true;
  if (!option.organizationIds || option.organizationIds.length === 0) return true;

  return option.organizationIds.some((id) =>
    selectedOrganizationIds.includes(id)
  );
}

function matchesEvent(
  option: ReferenceEntityOption,
  selectedEventIds: string[]
): boolean {
  if (selectedEventIds.length === 0) return true;
  if (!option.eventIds || option.eventIds.length === 0) return true;

  return option.eventIds.some((id) => selectedEventIds.includes(id));
}

function matchesCategoriaPeso(
  option: ReferenceEntityOption,
  selectedCategoriaPesoIds: string[]
): boolean {
  if (selectedCategoriaPesoIds.length === 0) return true;
  if (!option.categoryPesoIds || option.categoryPesoIds.length === 0) return true;

  return option.categoryPesoIds.some((id) =>
    selectedCategoriaPesoIds.includes(id)
  );
}

function filterOptions(
  options: ReferenceEntityOption[],
  selectedDisciplineIds: string[],
  selectedOrganizationIds: string[],
  selectedEventIds: string[],
  selectedCategoriaPesoIds: string[]
): ReferenceEntityOption[] {
  return options.filter((option) => {
    return (
      matchesDiscipline(option, selectedDisciplineIds) &&
      matchesOrganization(option, selectedOrganizationIds) &&
      matchesEvent(option, selectedEventIds) &&
      matchesCategoriaPeso(option, selectedCategoriaPesoIds)
    );
  });
}

async function fetchReferenceEntities(): Promise<
  Record<ReferenceTarget, ReferenceEntityOption[]>
> {
  const [disciplinas, organizaciones, eventos, categoriasPeso, luchadores] =
    await Promise.all([
      client.fetch<DisciplinaDoc[]>(`
        *[_type == "disciplina"] | order(nombre asc) {
          _id,
          nombre,
          slug
        }
      `),
      client.fetch<OrganizacionDoc[]>(`
        *[_type == "organizacion"] | order(nombre asc) {
          _id,
          nombre,
          slug,
          disciplinas
        }
      `),
      client.fetch<EventoDoc[]>(`
        *[_type == "evento"] | order(fecha desc, nombre asc) {
          _id,
          nombre,
          slug,
          disciplina,
          organizacion
        }
      `),
      client.fetch<CategoriaPesoDoc[]>(`
        *[_type == "categoriaPeso"] | order(nombre asc) {
          _id,
          nombre,
          slug,
          disciplina
        }
      `),
      client.fetch<LuchadorDoc[]>(`
        *[_type == "luchador"] | order(nombre asc) {
          _id,
          nombre,
          slug,
          disciplina,
          organizacion,
          categoriaPeso,
          "eventIds": array::unique(
            *[
              _type == "combate" &&
              (
                luchadorRojo._ref == ^._id ||
                luchadorAzul._ref == ^._id
              ) &&
              defined(evento._ref)
            ].evento._ref
          )
        }
      `),
    ]);

  return {
    disciplina: disciplinas.map((doc) => ({
      label: labelFromDoc(doc.nombre, doc._id, "Disciplina"),
      value: doc._id,
      target: "disciplina",
    })),

    organizacion: organizaciones.map((doc) => ({
      label: labelFromDoc(doc.nombre, doc._id, "Organización"),
      value: doc._id,
      target: "organizacion",
      disciplineIds: compactStringArray(
        (doc.disciplinas ?? []).map((item) => item?._ref)
      ),
    })),

    evento: eventos.map((doc) => ({
      label: labelFromDoc(doc.nombre, doc._id, "Evento"),
      value: doc._id,
      target: "evento",
      disciplineIds: compactStringArray([doc.disciplina?._ref]),
      organizationIds: compactStringArray([doc.organizacion?._ref]),
    })),

    categoriaPeso: categoriasPeso.map((doc) => ({
      label: labelFromDoc(doc.nombre, doc._id, "Categoría"),
      value: doc._id,
      target: "categoriaPeso",
      disciplineIds: compactStringArray([doc.disciplina?._ref]),
    })),

    luchador: luchadores.map((doc) => ({
      label: labelFromDoc(doc.nombre, doc._id, "Luchador"),
      value: doc._id,
      target: "luchador",
      disciplineIds: compactStringArray([doc.disciplina?._ref]),
      organizationIds: compactStringArray([doc.organizacion?._ref]),
      categoryPesoIds: compactStringArray([doc.categoriaPeso?._ref]),
      eventIds: compactStringArray(doc.eventIds ?? []),
    })),
  };
}

export async function OPTIONS(request: Request) {
  return withCors(new NextResponse(null, { status: 204 }), request);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const selectedDisciplineIds = toArray(searchParams.get("disciplinas"));
    const selectedOrganizationIds = toArray(searchParams.get("organizaciones"));
    const selectedEventIds = toArray(searchParams.get("eventos"));
    const selectedCategoriaPesoIds = toArray(searchParams.get("categoriasPeso"));

    const referenceData = await fetchReferenceEntities();

    const data: Record<ReferenceTarget, ReferenceEntityOption[]> = {
      disciplina: filterOptions(
        referenceData.disciplina,
        selectedDisciplineIds,
        selectedOrganizationIds,
        selectedEventIds,
        selectedCategoriaPesoIds
      ),
      organizacion: filterOptions(
        referenceData.organizacion,
        selectedDisciplineIds,
        selectedOrganizationIds,
        selectedEventIds,
        selectedCategoriaPesoIds
      ),
      evento: filterOptions(
        referenceData.evento,
        selectedDisciplineIds,
        selectedOrganizationIds,
        selectedEventIds,
        selectedCategoriaPesoIds
      ),
      luchador: filterOptions(
        referenceData.luchador,
        selectedDisciplineIds,
        selectedOrganizationIds,
        selectedEventIds,
        selectedCategoriaPesoIds
      ),
      categoriaPeso: filterOptions(
        referenceData.categoriaPeso,
        selectedDisciplineIds,
        selectedOrganizationIds,
        selectedEventIds,
        selectedCategoriaPesoIds
      ),
    };

    const response: ReferenceEntitiesResponse = {
      ok: true,
      data,
    };

    return withCors(NextResponse.json(response), request);
  } catch (error) {
    console.error("Error cargando entidades de referencia desde Sanity:", error);

    return withCors(
      NextResponse.json(
        {
          ok: false,
          message: "No se pudieron cargar las entidades de referencia.",
        },
        { status: 500 }
      ),
      request
    );
  }
}