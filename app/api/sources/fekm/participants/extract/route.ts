import { NextResponse } from "next/server";
import { extractText } from "unpdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DisciplineKey = "kickboxing" | "muay_thai";
type Gender = "masculino" | "femenino" | "mixto" | "otro";
type AgeGroup =
  | "infantil"
  | "cadete"
  | "juvenil"
  | "junior"
  | "senior"
  | "veterano"
  | "otro";
type Confidence = "alta" | "media" | "baja";

type ExtractRequest = {
  title?: string;
  pdfUrl?: string;
};

type Participant = {
  id: string;
  athleteId?: string;
  eventCode?: string;
  name: string;
  federationCode?: string;
  rank?: number;
  discipline: DisciplineKey;
  disciplineLabel: "Kickboxing" | "Muay Thai";
  categoryLabel: string;
  weightLabel?: string;
  limitKg?: number;
  gender: Gender;
  ageGroup: AgeGroup;
  confidence: Confidence;
  reviewRequired?: boolean;
  warnings?: string[];
  sourceDocumentTitle: string;
  sourcePdfUrl: string;
};

type CategoryContext = {
  label: string;
  start: number;
  end: number;
  gender: Gender;
  ageGroup: AgeGroup;
  weightLabel?: string;
  limitKg?: number;
};

const FEKM_RESULTS_URL = "https://fekm.es/resultados/";

const FEDERATION_ALIASES: Record<string, string> = {
  AND: "ANDALUCIA",
  ANDALUCIA: "ANDALUCIA",
  ARAGON: "ARAGON",
  ASTURIAS: "ASTURIAS",
  BALEARES: "BALEARES",
  CANARIAS: "CANARIAS",
  CANTABRIA: "CANTABRIA",
  CASTILLALEON: "CyL",
  CYL: "CyL",
  CEUTA: "CEUTA",
  CLMANCHA: "CLMANCHA",
  CATALUNA: "CATALUÑA",
  CATALUÑA: "CATALUÑA",
  EXTREMADURA: "EXTREMADURA",
  GALICIA: "GALICIA",
  LARIOJA: "LA RIOJA",
  MADRID: "MADRID",
  MELILLA: "MELILLA",
  MURCIA: "MURCIA",
  NAVARRA: "NAVARRA",
  VALENCIA: "VALENCIA",
  EUSKADI: "EUSKADI",
};

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u0340/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForComparison(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/Ñ/g, "N")
    .replace(/[^A-Z0-9]+/g, "");
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferDiscipline(title: string): {
  key: DisciplineKey;
  label: "Kickboxing" | "Muay Thai";
} {
  const normalized = normalizeForComparison(title);
  if (normalized.includes("MUAYTHAI") || normalized.includes("MUAYTHAI")) {
    return { key: "muay_thai", label: "Muay Thai" };
  }
  return { key: "kickboxing", label: "Kickboxing" };
}

function inferGender(category: string): Gender {
  const normalized = normalizeForComparison(category);
  if (normalized.includes("FEM")) return "femenino";
  if (normalized.includes("MASC")) return "masculino";
  if (normalized.includes("MIXT")) return "mixto";
  return "otro";
}

function inferAgeGroup(category: string): AgeGroup {
  const normalized = normalizeForComparison(category);
  if (normalized.includes("INFANTIL")) return "infantil";
  if (normalized.includes("CADETE")) return "cadete";
  if (normalized.includes("JUVENIL")) return "juvenil";
  if (normalized.includes("JUNIOR")) return "junior";
  if (normalized.includes("SENIOR")) return "senior";
  if (normalized.includes("VETERAN")) return "veterano";
  return "otro";
}

function parseWeight(category: string): {
  weightLabel?: string;
  limitKg?: number;
} {
  const match = category.match(/([+-]?\s*\d{1,3}(?:[.,]\d+)?)\s*kg\b/i);
  if (!match) return {};

  const raw = match[1].replace(/\s+/g, "");
  const numeric = Number.parseFloat(raw.replace(",", ".").replace("+", "").replace("-", ""));
  if (!Number.isFinite(numeric)) return {};

  const prefix = raw.startsWith("+") ? "+" : "-";
  const printable = Number.isInteger(numeric)
    ? String(numeric)
    : String(numeric).replace(".", ",");

  return {
    weightLabel: `${prefix}${printable} kg`,
    limitKg: numeric,
  };
}

function findCategories(text: string): CategoryContext[] {
  const categoryPattern =
    /\b((?:INFANTIL|CADETE|JUVENIL|JUNIOR|SENIOR|VETERAN(?:O|A|OS|AS)?|ELITE|ÉLITE|COMPETITIVA)(?:\s+\d{1,2}(?:\s*-\s*\d{1,2})?)?\s+(?:MASC(?:ULINO)?|FEM(?:ENINO)?|MIXTO)\.?\s*[+-]?\s*\d{1,3}(?:[.,]\d+)?\s*kg)\b/giu;

  const matches = Array.from(text.matchAll(categoryPattern));
  const categories: CategoryContext[] = [];

  matches.forEach((match, index) => {
    if (match.index == null) return;

    const label = normalizeWhitespace(match[0]);
    const weight = parseWeight(label);

    categories.push({
      label,
      start: match.index,
      end: matches[index + 1]?.index ?? text.length,
      gender: inferGender(label),
      ageGroup: inferAgeGroup(label),
      ...weight,
    });
  });

  return categories;
}

function normalizeFederation(raw: string): string | undefined {
  const key = normalizeForComparison(raw);
  if (!key) return undefined;
  return FEDERATION_ALIASES[key] ?? raw.trim();
}

function cleanName(raw: string): string {
  return normalizeWhitespace(raw)
    .replace(/^[\d\sͰ•·\-–—]+/u, "")
    .replace(/\s+(?:W\.?O\.?|NO\s+COMPARECI[ÓO].*)$/iu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlausibleName(value: string): boolean {
  const name = cleanName(value);
  if (!name) return false;

  const normalized = normalizeForComparison(name);
  if (
    normalized.includes("COMBATE") ||
    normalized.includes("RING") ||
    normalized.includes("FINAL") ||
    normalized.includes("ASALTO") ||
    normalized.includes("CAMPEONATO") ||
    normalized.includes("ESPANA") ||
    normalized.includes("MUAYTHAI") ||
    normalized.includes("KICKBOXING") ||
    normalized.includes("NO COMPARECIO") ||
    normalized.includes("PESAJE")
  ) {
    return false;
  }

  const words = name.split(/\s+/);
  if (words.length < 1 || words.length > 8) return false;
  if (name.length < 4 || name.length > 80) return false;

  return /^[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ'’.-]*(?:\s+[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ'’.-]*){0,7}$/u.test(
    name.toUpperCase(),
  );
}

function detectRank(segment: string, name: string, federationRaw: string): number | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedFed = federationRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const beforePattern = new RegExp(
    `(?:^|\\s)([1-4])\\s+${escapedName}\\s*\\(${escapedFed}\\)`,
    "iu",
  );
  const afterPattern = new RegExp(
    `${escapedName}\\s*\\(${escapedFed}\\)\\s+([1-4])(?:\\s|$)`,
    "iu",
  );

  const before = segment.match(beforePattern);
  if (before) return Number(before[1]);

  const after = segment.match(afterPattern);
  if (after) return Number(after[1]);

  return undefined;
}

function extractParticipantsFromCategory(
  fullText: string,
  category: CategoryContext,
  documentTitle: string,
  pdfUrl: string,
  discipline: ReturnType<typeof inferDiscipline>,
): Participant[] {
  // Cada página representa una categoría concreta. Para la fase de
  // participantes nos interesa identificar deportistas reales y su categoría,
  // no interpretar el puesto, porque el orden visual del cuadro se pierde al
  // extraer el texto del PDF.
  const segmentStart = Math.max(0, category.start - 260);
  const segmentEnd = Math.min(fullText.length, category.end);
  const segment = fullText.slice(segmentStart, segmentEnd);

  const personPattern =
    /(?:^|[\sͰ])([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ'’.-]*(?:\s+[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ'’.-]*){0,7})\s*\(([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,20})\)/gu;

  const found = new Map<string, Participant>();

  for (const match of segment.matchAll(personPattern)) {
    const name = cleanName(match[1]);
    const rawFederation = match[2];

    if (!isPlausibleName(name)) continue;
    if (/^(?:MINUTO|MINUTOS|FINAL|RING|COMBATE|CAMPEONATO)\b/u.test(name)) {
      continue;
    }

    const key = normalizeForComparison(name);
    if (found.has(key)) continue;

    found.set(key, {
      id: `fekm-participant-${slugify(name)}-${slugify(category.label)}`,
      name,
      federationCode: normalizeFederation(rawFederation),
      discipline: discipline.key,
      disciplineLabel: discipline.label,
      categoryLabel: category.label,
      weightLabel: category.weightLabel,
      limitKg: category.limitKg,
      gender: category.gender,
      ageGroup: category.ageGroup,
      confidence: "alta",
      sourceDocumentTitle: documentTitle,
      sourcePdfUrl: pdfUrl,
    });
  }

  return Array.from(found.values());
}


const EVENT_ROW_PATTERN =
  /^(?:([A-Z]{3})\s+)?(\d{5,8})\s*([MF])\s*(.+?)\s*(0[1-4]B?\s+(?:PF|LC|KL|K-1L|CF))\s+(\d{3})\s+(CH|YC|OC|J)\s+([MF])\s+([+-]\s*\d{1,3}(?:[.,]\d+)?\s*[Kk][Gg]|HS)$/u;

const AGE_CODE_MAP: Record<string, AgeGroup> = {
  CH: "infantil",
  YC: "cadete",
  OC: "cadete",
  J: "junior",
};

const EVENT_LABEL_MAP: Record<string, string> = {
  "01 PF": "Point Fighting",
  "02 LC": "Light Contact",
  "03 KL": "Kick Light",
  "03B K-1L": "K-1 Light",
  "04 CF": "Creative Forms",
};

function normalizeEntryLine(value: string): string {
  return value
    .replace(/\u0340/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function genderFromCode(value: string): Gender {
  return value === "F" ? "femenino" : value === "M" ? "masculino" : "otro";
}

function normalizeEventCode(value: string): string {
  return normalizeWhitespace(value).toUpperCase();
}

function categoryLabelFromEntry(
  eventCode: string,
  ageCode: string,
  gender: Gender,
  weightLabel?: string,
): string {
  const modality = EVENT_LABEL_MAP[eventCode] ?? eventCode;
  const ageGroup = AGE_CODE_MAP[ageCode] ?? "otro";
  const parts = [modality];
  if (ageGroup !== "otro") parts.push(ageGroup);
  if (gender !== "otro") parts.push(gender);
  if (weightLabel) parts.push(weightLabel);
  return parts.join(" · ");
}

function extractEntryParticipantsFromPage(
  pageText: string,
  documentTitle: string,
  pdfUrl: string,
  discipline: ReturnType<typeof inferDiscipline>,
): Participant[] {
  const lines = String(pageText ?? "")
    .split(/\r?\n/)
    .map(normalizeEntryLine)
    .filter(Boolean);

  if (!lines.some((line) => line.includes("ENTRIES BY NATIONAL FEDERATION"))) {
    return [];
  }

  const participants: Participant[] = [];
  let currentFederation: string | undefined;

  for (const line of lines) {
    const match = line.match(EVENT_ROW_PATTERN);
    if (!match) continue;

    const [
      ,
      federationMatch,
      athleteId,
      sex,
      nameMatch,
      eventCodeMatch,
      _eventId,
      ageCode,
      categorySex,
      weightMatch,
    ] = match;

    const federationRaw = federationMatch?.trim();
    if (federationRaw) currentFederation = federationRaw;

    const name = cleanName(nameMatch);
    const eventCode = normalizeEventCode(eventCodeMatch);
    const gender = genderFromCode(categorySex || sex);
    const weightRaw = normalizeWhitespace(weightMatch).replace(/\s+/g, " ");
    const weight = weightRaw.toUpperCase() === "HS" ? {} : parseWeight(weightRaw);

    if (!isPlausibleName(name)) continue;

    const categoryLabel = categoryLabelFromEntry(
      eventCode,
      ageCode,
      gender,
      weight.weightLabel ?? (weightRaw.toUpperCase() === "HS" ? "HS" : undefined),
    );

    participants.push({
      id: `fekm-athlete-${athleteId}`,
      athleteId,
      eventCode,
      name,
      federationCode: normalizeFederation(currentFederation ?? ""),
      discipline: discipline.key,
      disciplineLabel: discipline.label,
      categoryLabel,
      weightLabel: weight.weightLabel,
      limitKg: weight.limitKg,
      gender,
      ageGroup: AGE_CODE_MAP[ageCode] ?? "otro",
      confidence: "alta",
      sourceDocumentTitle: documentTitle,
      sourcePdfUrl: pdfUrl,
    });
  }

  return participants;
}

function deduplicateEntryParticipants(participants: Participant[]): Participant[] {
  const unique = new Map<string, Participant>();

  for (const participant of participants) {
    const key = participant.athleteId
      ? `id:${participant.athleteId}`
      : `name:${normalizeForComparison(participant.name)}`;
    const current = unique.get(key);

    if (!current) {
      unique.set(key, participant);
      continue;
    }

    const sameCategory =
      normalizeForComparison(current.categoryLabel) ===
      normalizeForComparison(participant.categoryLabel);

    if (!sameCategory) {
      current.confidence = "media";
      current.reviewRequired = true;
      current.warnings = Array.from(
        new Set([
          ...(current.warnings ?? []),
          "deportista_inscrito_en_varias_modalidades_o_categorias",
        ]),
      );
    }
  }

  return Array.from(unique.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "es"),
  );
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function nameSimilarity(a: string, b: string): number {
  const left = normalizeForComparison(a);
  const right = normalizeForComparison(b);
  const longest = Math.max(left.length, right.length);
  if (longest === 0) return 1;
  return 1 - levenshteinDistance(left, right) / longest;
}

function isObviousFragment(shorter: string, longer: string): boolean {
  const shortTokens = normalizeWhitespace(shorter).split(/\s+/);
  const longTokens = normalizeWhitespace(longer).split(/\s+/);

  if (shortTokens.length >= longTokens.length) return false;
  if (shortTokens.length === 0) return false;

  const shortJoined = normalizeForComparison(shorter);
  const longJoined = normalizeForComparison(longer);

  return (
    longJoined.startsWith(shortJoined) ||
    longJoined.endsWith(shortJoined) ||
    longJoined.includes(shortJoined)
  );
}


function tokenOverlapScore(a: string, b: string): number {
  const left = new Set(
    normalizeWhitespace(a)
      .split(/\s+/)
      .map((token) => normalizeForComparison(token))
      .filter(Boolean),
  );
  const right = new Set(
    normalizeWhitespace(b)
      .split(/\s+/)
      .map((token) => normalizeForComparison(token))
      .filter(Boolean),
  );

  if (left.size === 0 || right.size === 0) return 0;

  let common = 0;
  for (const token of left) {
    if (right.has(token)) common += 1;
  }

  return common / Math.min(left.size, right.size);
}

function sameLikelyPersonByTokens(a: string, b: string): boolean {
  const left = normalizeWhitespace(a).split(/\s+/);
  const right = normalizeWhitespace(b).split(/\s+/);

  if (left.length < 2 || right.length < 2) return false;

  const firstLeft = normalizeForComparison(left[0]);
  const firstRight = normalizeForComparison(right[0]);
  const lastLeft = normalizeForComparison(left[left.length - 1]);
  const lastRight = normalizeForComparison(right[right.length - 1]);

  const firstMatches =
    firstLeft === firstRight ||
    nameSimilarity(left[0], right[0]) >= 0.8;
  const lastMatches =
    lastLeft === lastRight ||
    nameSimilarity(left[left.length - 1], right[right.length - 1]) >= 0.8;

  return firstMatches && lastMatches && tokenOverlapScore(a, b) >= 0.6;
}

function hasSuspiciousShortToken(name: string): boolean {
  const tokens = normalizeWhitespace(name).split(/\s+/);
  const allowedShort = new Set(["DE", "DEL", "LA", "LAS", "LOS", "EL", "AL"]);
  return tokens.some((token, index) => {
    if (allowedShort.has(token)) return false;
    if (index === 0 && token.length <= 2) return true;
    return token.length === 1;
  });
}

function refineParticipantCandidates(participants: Participant[]): Participant[] {
  const grouped = new Map<string, Participant[]>();

  for (const participant of participants) {
    const key = [
      normalizeForComparison(participant.categoryLabel),
      normalizeForComparison(participant.federationCode ?? ""),
    ].join("|");

    const group = grouped.get(key) ?? [];
    group.push(participant);
    grouped.set(key, group);
  }

  const refined: Participant[] = [];

  for (const group of grouped.values()) {
    const removed = new Set<number>();

    for (let i = 0; i < group.length; i += 1) {
      if (removed.has(i)) continue;

      if (hasSuspiciousShortToken(group[i].name)) {
        removed.add(i);
        continue;
      }

      for (let j = 0; j < group.length; j += 1) {
        if (i === j || removed.has(j)) continue;

        const a = group[i];
        const b = group[j];

        if (isObviousFragment(a.name, b.name)) {
          removed.add(i);
          break;
        }

        const similarity = nameSimilarity(a.name, b.name);
        if (
          similarity >= 0.88 ||
          sameLikelyPersonByTokens(a.name, b.name)
        ) {
          const preferred =
            b.name.length > a.name.length
              ? j
              : a.name.length > b.name.length
                ? i
                : normalizeForComparison(a.name).localeCompare(
                      normalizeForComparison(b.name),
                    ) <= 0
                  ? i
                  : j;

          const discarded = preferred === i ? j : i;
          removed.add(discarded);

          const kept = group[preferred];
          kept.confidence = "media";
          kept.reviewRequired = true;
          kept.warnings = Array.from(
            new Set([
              ...(kept.warnings ?? []),
              "posible_variante_ocr_del_nombre",
            ]),
          );

          if (discarded === i) break;
        }
      }
    }

    group.forEach((participant, index) => {
      if (removed.has(index)) return;

      const tokenCount = normalizeWhitespace(participant.name).split(/\s+/).length;
      if (tokenCount === 1) {
        participant.confidence = "media";
        participant.reviewRequired = true;
        participant.warnings = Array.from(
          new Set([
            ...(participant.warnings ?? []),
            "nombre_de_una_sola_palabra_revisar",
          ]),
        );
      }

      refined.push(participant);
    });
  }

  return refined;
}

function deduplicateParticipants(participants: Participant[]): Participant[] {
  const unique = new Map<string, Participant>();

  for (const participant of participants) {
    const key = [
      normalizeForComparison(participant.name),
      normalizeForComparison(participant.categoryLabel),
      participant.discipline,
    ].join("|");

    const current = unique.get(key);
    if (!current) {
      unique.set(key, participant);
      continue;
    }

    if (current.rank == null && participant.rank != null) {
      unique.set(key, participant);
    }
  }

  return refineParticipantCandidates(Array.from(unique.values())).sort((a, b) => {
    const categoryCompare = a.categoryLabel.localeCompare(b.categoryLabel, "es");
    if (categoryCompare !== 0) return categoryCompare;

    return a.name.localeCompare(b.name, "es");
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExtractRequest;
    const title = body.title?.trim();
    const pdfUrl = body.pdfUrl?.trim();

    if (!title) {
      return NextResponse.json(
        { ok: false, source: "fekm", error: "title_es_obligatorio" },
        { status: 400 },
      );
    }

    if (!pdfUrl) {
      return NextResponse.json(
        { ok: false, source: "fekm", error: "pdfUrl_es_obligatoria" },
        { status: 400 },
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(pdfUrl);
    } catch {
      return NextResponse.json(
        { ok: false, source: "fekm", error: "pdfUrl_no_valida" },
        { status: 400 },
      );
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { ok: false, source: "fekm", error: "pdfUrl_no_valida" },
        { status: 400 },
      );
    }

    const pdfResponse = await fetch(parsedUrl, {
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        Referer: FEKM_RESULTS_URL,
        Accept: "application/pdf,*/*",
      },
    });

    if (!pdfResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          source: "fekm",
          error: `No se pudo descargar el PDF. Estado ${pdfResponse.status}.`,
        },
        { status: 502 },
      );
    }

    const contentType = pdfResponse.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("pdf") && !parsedUrl.pathname.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        {
          ok: false,
          source: "fekm",
          error: "La URL no devolvió un documento PDF.",
        },
        { status: 422 },
      );
    }

    const pdf = new Uint8Array(await pdfResponse.arrayBuffer());
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [text];
    const mergedText = normalizeWhitespace(pages.join(" "));

    const discipline = inferDiscipline(title);

    const entryParticipants = deduplicateEntryParticipants(
      pages.flatMap((pageText) =>
        extractEntryParticipantsFromPage(
          String(pageText ?? ""),
          title,
          pdfUrl,
          discipline,
        ),
      ),
    );

    const pageResults = pages.flatMap((pageText, pageIndex) => {
      const normalizedPage = normalizeWhitespace(pageText);
      const pageCategories = findCategories(normalizedPage);

      return pageCategories.map((category) => ({
        page: pageIndex + 1,
        category,
        participants: extractParticipantsFromCategory(
          normalizedPage,
          category,
          title,
          pdfUrl,
          discipline,
        ),
      }));
    });

    const categories = pageResults.map((result) => ({
      ...result.category,
      page: result.page,
    }));

    const legacyParticipants = deduplicateParticipants(
      pageResults.flatMap((result) => result.participants),
    );

    const participants =
      entryParticipants.length > 0 ? entryParticipants : legacyParticipants;

    return NextResponse.json({
      ok: true,
      source: "fekm",
      document: {
        title,
        pdfUrl,
        totalPages,
      },
      summary: {
        extractedTextCharacters: mergedText.length,
        categoriesDetected: categories.length,
        participants: participants.length,
        highConfidence: participants.filter(
          (participant) => participant.confidence === "alta",
        ).length,
        reviewRequired: participants.filter(
          (participant) => participant.reviewRequired === true,
        ).length,
        extractionMode:
          entryParticipants.length > 0
            ? "sportdata_entrylist_by_athlete_id_v3"
            : "page_scoped_participants_review_safe_v2",
      },
      categories: categories.map((category) => ({
        page: category.page,
        label: category.label,
        gender: category.gender,
        ageGroup: category.ageGroup,
        weightLabel: category.weightLabel,
        limitKg: category.limitKg,
      })),
      participants,
    });
  } catch (error) {
    console.error("[FEKM participants extract]", error);

    return NextResponse.json(
      {
        ok: false,
        source: "fekm",
        error:
          error instanceof Error
            ? error.message
            : "No se pudo extraer el documento FEKM.",
      },
      { status: 500 },
    );
  }
}
