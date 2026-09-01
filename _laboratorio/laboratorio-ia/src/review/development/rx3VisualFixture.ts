import type {ReviewCase} from "../types";

export const RX3_VISUAL_REVIEW_FIXTURE_ID = "dev:rx3:review-case-visual" as const;
export const RX3_VISUAL_REVIEW_FIXTURE_QUERY = "rx3" as const;

const RX3_VISUAL_REVIEW_FIXTURE: ReviewCase = Object.freeze<ReviewCase>({
  schemaVersion: 1,
  id: RX3_VISUAL_REVIEW_FIXTURE_ID,
  dedupeKey: "dev:rx3:review-case-visual",
  module: "ufc.news",
  title: "Identidad editorial pendiente en noticia UFC",
  status: "open",
  priority: "high",
  source: "UFC",
  subject: {
    type: "news",
    id: "dev:rx3:ufc-news-visual",
    label: "Noticia UFC de validación visual",
    sourceUrl: "https://example.test/ffn3/rx3-visual",
  },
  issues: [{
    id: "dev:rx3:ambiguous-fighter",
    kind: "ambiguous_reference",
    valueKind: "fighter",
    fieldPath: "luchadoresRelacionados",
    label: "Luchador mencionado",
    message: "No podemos identificar con suficiente seguridad qué luchador menciona esta noticia.",
    required: true,
    blocking: true,
    candidates: [
      {
        id: "dev:rx3:candidate:alex-norte",
        label: "Alex Norte",
        value: {sanityId: "fighter:dev:alex-norte"},
        entityType: "luchador",
        sanityId: "fighter:dev:alex-norte",
        confidence: 94,
        reasons: [
          "El nombre, la organización y la categoría coinciden con la noticia.",
          "Es el único candidato relacionado con el evento mencionado.",
        ],
      },
      {
        id: "dev:rx3:candidate:alex-sur",
        label: "Álex Sur",
        value: {sanityId: "fighter:dev:alex-sur"},
        entityType: "luchador",
        sanityId: "fighter:dev:alex-sur",
        confidence: 61,
        reasons: ["El nombre es parecido, pero la organización no coincide."],
      },
    ],
    evidence: [
      "La fuente menciona a Alex Norte y el evento UFC de prueba.",
      "La relación editorial actual todavía no identifica a ningún luchador.",
    ],
  }],
  resolutions: [{
    type: "select_candidate",
    issueId: "dev:rx3:ambiguous-fighter",
    candidateId: "dev:rx3:candidate:alex-norte",
  }],
  context: {
    producer: "rx3_visual_fixture",
    testCase: true,
    devOnly: true,
    readOnly: true,
    humanActionRequired: true,
    unifiedReviewIntake: {
      source: "ufc",
      sourceLabel: "UFC",
      entityType: "news",
      entityLabel: "Noticia",
      issueType: "ambiguous_entity",
      problemTitle: "No está confirmado el luchador de esta noticia",
      problemSummary: "La noticia menciona a un luchador, pero existen dos fichas posibles y necesitamos confirmar cuál es la correcta.",
      evidenceRefs: ["dev:rx3:evidence:source", "dev:rx3:evidence:relation"],
      resume: {},
    },
    technicalDiagnostics: {
      authority: "Review",
      checkpointVersion: 3,
      evidenceFingerprint: "fp1:rx3:visual:safe",
      reconciliation: "not_required",
      compensation: "not_required",
      au7: "not_invoked",
      au8: "not_invoked",
    },
  },
  createdAt: "2026-08-31T10:00:00.000Z",
  updatedAt: "2026-08-31T10:00:00.000Z",
  version: 3,
  resumeAttempts: 0,
});

export function buildRx3VisualReviewFixture(): ReviewCase {
  return structuredClone(RX3_VISUAL_REVIEW_FIXTURE);
}

export const rx3VisualReviewFixtureSecurity = Object.freeze({
  devOnly: true,
  readOnly: true,
  deterministic: true,
  persists: false,
  writes: false,
  accessesSanity: false,
  accessesTelegram: false,
  accessesNetwork: false,
  invokesAu7: false,
  invokesAu8: false,
  createsStores: false,
  createsExecutors: false,
  createsPlanners: false,
  createsResumeEngines: false,
  registersRetry: false,
  runsReconciliation: false,
  runsCompensation: false,
} as const);
