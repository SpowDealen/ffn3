import type {CreateReviewCaseInput, ReviewCase} from "./types";
import {createReviewCase} from "./store/reviewStore";

export function createTestReviewCase(): ReviewCase {
  return createReviewCase({
    dedupeKey: "dev:external-news:editorial-review",
    module: "external.news",
    title: "Revisión editorial de noticia externa",
    priority: "high",
    source: "Fuente externa de prueba",
    subject: {
      type: "news",
      id: "dev-external-news",
      label: "Noticia externa pendiente de revisión",
      sourceUrl: "https://example.com/noticia-de-prueba",
    },
    issues: [
      {
        id: "missing-main-image",
        kind: "missing_image",
        valueKind: "image",
        fieldPath: "imagenPrincipal",
        label: "Imagen principal",
        message: "La noticia no tiene una imagen principal válida.",
        required: true,
        blocking: true,
      },
      {
        id: "ambiguous-related-event",
        kind: "ambiguous_reference",
        valueKind: "event",
        fieldPath: "eventoRelacionado",
        label: "Evento relacionado",
        message: "Hay varios eventos posibles y se necesita una selección editorial.",
        required: true,
        blocking: true,
        candidates: [
          {
            id: "candidate-event-1",
            label: "Evento de prueba 1",
            value: {sanityId: "event-test-1"},
            entityType: "evento",
            sanityId: "event-test-1",
            confidence: 72,
            reasons: ["Coincidencia por organización y fecha"],
          },
          {
            id: "candidate-event-2",
            label: "Evento de prueba 2",
            value: {sanityId: "event-test-2"},
            entityType: "evento",
            sanityId: "event-test-2",
            confidence: 64,
            reasons: ["Coincidencia parcial por título"],
          },
        ],
      },
    ],
    context: {
      testCase: true,
      note: "Caso manual de desarrollo; no ejecuta reanudación.",
    },
  });
}

export function createTestReviewCases(): ReviewCase[] {
  const examples: CreateReviewCaseInput[] = [
    {
      dedupeKey: "dev:ufc-events:missing-category",
      module: "ufc.events",
      title: "Categoría de peso ausente",
      priority: "critical",
      source: "UFC",
      subject: {type: "event", id: "dev-ufc-event", label: "Cartelera UFC de prueba"},
      issues: [{id: "missing-weight-category", kind: "missing_entity", valueKind: "category", label: "Categoría de peso", message: "La categoría indicada por la fuente no existe.", required: true, blocking: true}],
      context: {sourceWeight: "Peso de prueba"},
    },
    {
      dedupeKey: "dev:one-news:insufficient-content",
      module: "one.news",
      title: "Contenido insuficiente para borrador",
      priority: "normal",
      source: "ONE Championship",
      subject: {type: "news", id: "dev-one-news", label: "Noticia ONE de prueba"},
      issues: [{id: "short-content", kind: "insufficient_content", valueKind: "text", fieldPath: "contenido", label: "Contenido", message: "El texto recuperado no tiene contexto editorial suficiente.", required: true, blocking: true, currentValue: "Texto breve."}],
      context: {wordCount: 2},
    },
    {
      dedupeKey: "dev:editorial-builder:required-fields",
      module: "editorial.builder",
      title: "Campos obligatorios inválidos",
      priority: "high",
      source: "Laboratorio",
      subject: {type: "draft", id: "dev-builder-draft", label: "Borrador editorial de prueba"},
      issues: [
        {id: "missing-title", kind: "required_field", valueKind: "text", fieldPath: "titulo", label: "Título", message: "El título es obligatorio.", required: true, blocking: true},
        {id: "invalid-date", kind: "invalid_value", valueKind: "date", fieldPath: "fechaPublicacion", label: "Fecha", message: "La fecha no tiene un formato válido.", required: true, blocking: true},
      ],
      context: {builder: "noticia"},
    },
    {
      dedupeKey: "dev:sanity:recoverable-image-error",
      module: "sanity",
      title: "Error recuperable importando imagen",
      priority: "normal",
      source: "Sanity",
      subject: {type: "image", id: "dev-image", label: "Imagen principal de prueba"},
      issues: [{id: "image-import-error", kind: "recoverable_error", valueKind: "image", fieldPath: "imagenPrincipal", label: "Importación de imagen", message: "La imagen no pudo importarse y la operación puede repetirse.", required: true, blocking: true, evidence: ["La fuente remota no respondió dentro del tiempo esperado."]}],
      context: {operation: "image-import", authorization: "valor-oculto-de-prueba"},
      resumeAction: {kind: "internal_operation", operation: "sanity.retry-image-import", payload: {documentId: "dev-document"}},
    },
  ];

  return [createTestReviewCase(), ...examples.map(createReviewCase)];
}

export function createUniversalEditorTestCase(): ReviewCase {
  return createReviewCase({
    dedupeKey: "dev:universal-review-editor",
    module: "editorial.builder",
    title: "Prueba completa del editor universal",
    priority: "high",
    source: "Laboratorio",
    subject: {type: "editor-test", id: "dev-universal-editor", label: "Caso de prueba del editor universal"},
    issues: [
      {id: "required-text", kind: "required_field", valueKind: "text", fieldPath: "titulo", label: "Texto obligatorio", message: "Introduce un título editorial.", required: true, blocking: true, currentValue: ""},
      {id: "invalid-date", kind: "invalid_value", valueKind: "date", fieldPath: "fecha", label: "Fecha inválida", message: "La fecha recibida no es válida.", required: true, blocking: true, currentValue: "fecha-desconocida"},
      {id: "invalid-number", kind: "invalid_value", valueKind: "number", fieldPath: "orden", label: "Número inválido", message: "El orden debe estar entre 1 y 20.", required: true, blocking: true, currentValue: "NaN", expected: {min: 1, max: 20}},
      {id: "ambiguous-boolean", kind: "contradictory_data", valueKind: "boolean", fieldPath: "destacada", label: "Booleano ambiguo", message: "No se pudo decidir si el contenido debe destacarse.", required: true, blocking: false},
      {id: "missing-image", kind: "missing_image", valueKind: "image", fieldPath: "imagenPrincipal", label: "Imagen ausente", message: "Selecciona una URL o un asset.", required: true, blocking: true},
      {id: "invalid-url", kind: "invalid_url", valueKind: "url", fieldPath: "fuenteUrl", label: "URL inválida", message: "Corrige la URL de origen.", required: true, blocking: true, currentValue: "javascript:invalid"},
      {id: "ambiguous-event", kind: "ambiguous_reference", valueKind: "event", fieldPath: "eventoRelacionado", label: "Evento ambiguo", message: "Selecciona el evento correcto.", required: true, blocking: true, candidates: [
        {id: "event-candidate-a", label: "Evento candidato A", value: {sanityId: "event-a"}, entityType: "evento", sanityId: "event-a", confidence: 0.82, reasons: ["Coincidencia por fecha"], snapshotRevision: "rev-event-a"},
        {id: "event-candidate-b", label: "Evento candidato B", value: {sanityId: "event-b"}, entityType: "evento", sanityId: "event-b", confidence: 68, reasons: ["Coincidencia por título"], snapshotRevision: "rev-event-b"},
      ]},
      {id: "missing-fighter", kind: "missing_entity", valueKind: "fighter", fieldPath: "luchador", label: "Luchador ausente", message: "Enlaza un luchador o prepara su creación.", required: true, blocking: true},
      {id: "possible-duplicate", kind: "duplicate_candidate", valueKind: "sanityReference", fieldPath: "duplicate", label: "Posible duplicado", message: "Confirma o rechaza el documento candidato.", required: true, blocking: true, candidates: [{id: "duplicate-a", label: "Documento posiblemente duplicado", value: {sanityId: "duplicate-document"}, entityType: "noticia", sanityId: "duplicate-document", confidence: 91}]},
      {id: "optional-observation", kind: "low_confidence", valueKind: "text", fieldPath: "observacion", label: "Observación opcional", message: "Puede aceptarse el valor actual o descartarse con motivo.", required: false, blocking: false, currentValue: "Valor editorial existente"},
    ],
    context: {testCase: true, editor: "universal"},
  });
}

export function createAutonomousResolverTestCase(): ReviewCase {
  return createReviewCase({
    dedupeKey: "dev:autonomous-review-resolver:phase-4a",
    module: "editorial.builder",
    title: "Prueba del motor autónomo de resolución",
    priority: "high",
    source: "Laboratorio local",
    subject: {type: "autonomous-test", id: "exact-subject", sanityId: "sanity-exact", label: "Caso autónomo deduplicable"},
    issues: [
      {id: "exact-match", kind: "low_confidence", valueKind: "text", label: "Coincidencia exacta", message: "Coincidencia", currentValue: "Valor exacto", candidates: [{id: "exact", label: "Exacto", value: " valor exacto ", confidence: 99}]},
      {id: "unique-candidate", kind: "low_confidence", valueKind: "text", label: "Candidato único", message: "Único", candidates: [{id: "unique", label: "Único", value: "Único", confidence: 94}]},
      {id: "dominant-candidate", kind: "low_confidence", valueKind: "text", label: "Candidato dominante", message: "Dominante", candidates: [{id: "dominant-a", label: "A", value: "A", confidence: 92}, {id: "dominant-b", label: "B", value: "B", confidence: 60}]},
      {id: "close-candidates", kind: "ambiguous_reference", valueKind: "event", label: "Candidatos próximos", message: "Próximos", required: true, candidates: [{id: "close-a", label: "A", value: {}, sanityId: "event-a", confidence: 90}, {id: "close-b", label: "B", value: {}, sanityId: "event-b", confidence: 82}]},
      {id: "sanity-reference", kind: "missing_reference", valueKind: "fighter", label: "Referencia", message: "Referencia", candidates: [{id: "ref", label: "Luchador", value: {}, sanityId: "fighter-1", confidence: 96}]},
      {id: "duplicate-clear", kind: "duplicate_candidate", valueKind: "sanityReference", label: "Duplicado claro", message: "Duplicado", candidates: [{id: "dup-clear", label: "Documento", value: {}, sanityId: "doc-1", confidence: 99}]},
      {id: "duplicate-ambiguous", kind: "duplicate_candidate", valueKind: "sanityReference", label: "Duplicado ambiguo", message: "Duplicado", candidates: [{id: "dup-a", label: "A", value: {}, sanityId: "doc-a", confidence: 98}, {id: "dup-b", label: "B", value: {}, sanityId: "doc-b", confidence: 91}]},
      {id: "primitive-zero", kind: "low_confidence", valueKind: "number", label: "Número", message: "Número", currentValue: 0, expected: {min: 0}},
      {id: "optional", kind: "low_confidence", valueKind: "text", label: "Opcional", message: "Opcional", required: false, blocking: false},
      {id: "entity-ready", kind: "missing_entity", valueKind: "fighter", label: "Entidad preparada", message: "Entidad", expected: {entityType: "fighter", draft: {name: "Luchador seguro"}}},
      {id: "entity-insufficient", kind: "missing_entity", valueKind: "fighter", label: "Entidad insuficiente", message: "Entidad", required: true},
      {id: "unsafe-url", kind: "invalid_url", valueKind: "url", label: "URL insegura", message: "URL", currentValue: "javascript:alert(1)"},
      {id: "contradictory-image", kind: "missing_image", valueKind: "image", label: "Imagen contradictoria", message: "Imagen", candidates: [{id: "image", label: "Imagen", value: {url: "https://example.com/image.jpg", assetId: "image-asset"}, confidence: 99}]},
      {id: "required-empty", kind: "required_field", valueKind: "text", label: "Obligatoria", message: "Sin evidencia", required: true, blocking: true},
    ],
    context: {testCase: true, phase: "4A"},
  });
}
