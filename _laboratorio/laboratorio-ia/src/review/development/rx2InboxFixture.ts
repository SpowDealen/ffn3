import type {ReviewCase} from "../types";

export const RX2_REVIEW_INBOX_FIXTURE_QUERY = "inbox" as const;

const CREATED_AT = "2026-09-01T08:00:00.000Z";

const RX2_REVIEW_INBOX_FIXTURES: readonly ReviewCase[] = Object.freeze([
  {
    schemaVersion: 1,
    id: "dev:rx2:inbox:attention",
    dedupeKey: "dev:rx2:inbox:attention",
    module: "ufc.news",
    title: "Luchador no identificado",
    status: "open",
    priority: "high",
    source: "UFC",
    subject: {type: "news", id: "dev:rx2:ufc-news", label: "Noticia UFC"},
    issues: [{
      id: "dev:rx2:attention:fighter",
      kind: "ambiguous_reference",
      valueKind: "fighter",
      label: "Luchador mencionado",
      message: "La noticia puede referirse a dos luchadores y necesita una decisión editorial.",
      required: true,
      blocking: true,
      candidates: [
        {id: "dev:rx2:alex-norte", label: "Alex Norte", value: "fighter:alex-norte", confidence: 94},
        {id: "dev:rx2:alex-sur", label: "Álex Sur", value: "fighter:alex-sur", confidence: 61},
      ],
    }],
    resolutions: [],
    context: {devOnly: true, readOnly: true, humanActionRequired: true},
    createdAt: CREATED_AT,
    updatedAt: "2026-09-01T10:00:00.000Z",
    version: 1,
    resumeAttempts: 0,
  },
  {
    schemaVersion: 1,
    id: "dev:rx2:inbox:process",
    dedupeKey: "dev:rx2:inbox:process",
    module: "one.events",
    title: "Evento ONE en preparación",
    status: "resuming",
    priority: "normal",
    source: "ONE",
    subject: {type: "event", id: "dev:rx2:one-event", label: "Evento ONE"},
    issues: [{id: "dev:rx2:process:date", kind: "invalid_value", valueKind: "date", label: "Fecha", message: "La fecha editorial ya fue corregida.", required: true, blocking: true, currentValue: "2026-09-20"}],
    resolutions: [{type: "accept_value", issueId: "dev:rx2:process:date", reason: "Fecha confirmada por la fuente."}],
    context: {devOnly: true, readOnly: true, humanActionRequired: false},
    createdAt: CREATED_AT,
    updatedAt: "2026-09-01T09:00:00.000Z",
    version: 2,
    resumeAttempts: 1,
  },
  {
    schemaVersion: 1,
    id: "dev:rx2:inbox:resolved",
    dedupeKey: "dev:rx2:inbox:resolved",
    module: "bkfc.news",
    title: "Organización confirmada",
    status: "resolved",
    priority: "low",
    source: "BKFC",
    subject: {type: "organization", id: "dev:rx2:bkfc-organization", label: "BKFC"},
    issues: [{id: "dev:rx2:resolved:organization", kind: "missing_reference", valueKind: "organization", label: "Organización", message: "La organización relacionada necesitaba confirmación.", required: true, blocking: true, candidates: [{id: "dev:rx2:bkfc", label: "BKFC", value: "organization:bkfc", confidence: 99}]}],
    resolutions: [{type: "select_candidate", issueId: "dev:rx2:resolved:organization", candidateId: "dev:rx2:bkfc"}],
    context: {devOnly: true, readOnly: true, humanActionRequired: false},
    createdAt: CREATED_AT,
    updatedAt: "2026-09-01T11:00:00.000Z",
    resolvedAt: "2026-09-01T11:00:00.000Z",
    version: 3,
    resumeAttempts: 0,
  },
]);

export function buildRx2ReviewInboxFixtures(): ReviewCase[] {
  return [...structuredClone(RX2_REVIEW_INBOX_FIXTURES)];
}

export const rx2ReviewInboxFixtureSecurity = Object.freeze({
  devOnly: true,
  readOnly: true,
  deterministic: true,
  persists: false,
  writes: false,
  accessesNetwork: false,
  invokesAu7: false,
  invokesAu8: false,
  createsStores: false,
  createsExecutors: false,
  createsPolling: false,
} as const);
