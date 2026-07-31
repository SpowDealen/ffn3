import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  GlobalResolutionInspectionService,
  GlobalResolutionInspectorRegistry,
  SANITY_EXTERNAL_NEWS_INSPECTOR_ID,
  SANITY_EXTERNAL_NEWS_INSPECTOR_VERSION,
  SANITY_FIGHTER_BY_IDENTITY_QUERY,
  SANITY_NEWS_DOCUMENT_QUERY,
  SANITY_NEWS_FIGHTER_REFERENCE_QUERY,
  assessReconciliation,
  createExternalNewsInspectionRuntime,
  createSanityExternalNewsEffectInspector,
  createSanityInspectionHttpReader,
  fingerprintGlobalResolutionInspectionOperation,
  inspectionEvidenceToReconciliationEvidence,
  normalizeSanityFighterCandidate,
  normalizeSanityNewsDocumentCandidate,
  parseSanityInspectionReadRequest,
  type GlobalResolutionInspectionEvidence,
  type GlobalResolutionInspectionRequest,
  type GlobalResolutionReconciliationCase,
  type SanityExternalNewsReadExecutor,
  type SanityInspectionReadRequest,
  type SanityInspectionReadResult,
} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import type {EntityOperation} from "../_laboratorio/laboratorio-ia/src/review/entityOperations";
import type {GlobalResolutionCheckpoint} from "../_laboratorio/laboratorio-ia/src/review/globalResolution/checkpoint";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";

const now = "2026-07-29T10:00:00.000Z";
const later = "2026-07-29T10:05:00.000Z";
const expectedNewsId = "drafts.news-au4";

function operation(capability = "create:luchador"): EntityOperation {
  const create = capability === "create:luchador";
  return {
    id: `operation:${capability}`,
    kind: create ? "create_entity" : "validate_entity",
    entityType: create ? "luchador" : "noticia",
    target: create ? {identityKey: "fighter:alex-silva"} : undefined,
    payload: create ? {entityType: "fighter", name: "Alex Silva"} : {scope: "resume"},
    source: "global_resolution",
    evidence: [],
    confidence: .95,
    risk: create ? "medium" : "low",
    preconditions: [],
    postconditions: [],
    dependencyIds: [],
    requiredCapability: capability,
    idempotencyKey: `idempotency:${capability}`,
    compensatable: false,
    explanation: "AU4 B2 fixture.",
  };
}

function checkpoint(capability = "create:luchador"): GlobalResolutionCheckpoint {
  const op = operation(capability);
  return {
    schemaVersion: 1,
    id: `checkpoint:${capability}`,
    caseId: "case:au4-sanity",
    caseVersion: 1,
    storedAtCaseVersion: 1,
    producer: "external_news",
    plan: {
      schemaVersion: 1,
      planId: `plan:${capability}`,
      caseId: "case:au4-sanity",
      caseVersion: 1,
      producer: "external_news",
      originalOperation: "create_draft",
      operations: [op],
      status: "ready",
      structurallyValid: true,
      executable: true,
      blockers: [],
      warnings: [],
      assumptions: [],
      policy: {minimumCreateConfidence: .8, minimumReuseConfidence: .8, ambiguity: "block", allowSkipOperation: false, allowOptionalDependencySkip: false, allowSkippedDependencyForResume: false, maximumRisk: "medium", requireAllNodesForResume: true, unsupportedOperation: "block", insufficientInformation: "block", availableCapabilities: [capability]},
      requiredCapabilities: [capability],
      capabilityRequirements: [{id: capability, support: "executable"}],
      executorRequirements: [],
      planFingerprint: `sha256-v1:plan${capability.replace(/\W/g, "")}`,
      idempotencyKey: `plan:${capability}`,
    },
    graph: {
      schemaVersion: 1,
      graphId: `graph:${capability}`,
      planId: `plan:${capability}`,
      caseId: "case:au4-sanity",
      caseVersion: 1,
      producer: "external_news",
      originalOperation: "create_draft",
      nodes: [{id: `node:${capability}`, operationId: op.id, dependencyIds: [], state: "reconciliation_required", idempotencyKey: op.idempotencyKey, isResumeNode: capability === "resume:external_news", requiredForCompletion: true}],
      state: "reconciliation_required",
      intentFingerprint: "sha256-v1:intentau4sanity",
      fingerprint: "sha256-v1:graphau4sanity",
      idempotencyKey: `graph:${capability}`,
      metadata: {},
    },
    planFingerprint: `sha256-v1:plan${capability.replace(/\W/g, "")}`,
    graphFingerprint: "sha256-v1:graphau4sanity",
    caseFingerprint: "sha256-v1:caseau4sanity",
    checkpointFingerprint: `sha256-v1:checkpoint${capability.replace(/\W/g, "")}`,
    phase: "reconciliation_required",
    resume: capability === "resume:external_news" ? {
      operationId: op.id,
      planId: `plan:${capability}`,
      planFingerprint: `sha256-v1:plan${capability.replace(/\W/g, "")}`,
      previewFingerprint: "sha256-v1:previewau4sanity",
      payloadFingerprint: "sha256-v1:newsau4sanity",
      snapshotFingerprint: "sha256-v1:snapshotau4sanity",
      referenceIds: ["fighter-au4"],
      validation: {valid: true, blockerCodes: []},
      preparedAt: now,
    } : undefined,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

function reviewCase(capability = "create:luchador"): ReviewCase {
  return {
    schemaVersion: 1,
    id: "case:au4-sanity",
    dedupeKey: "case:au4-sanity",
    module: "external.news",
    title: "AU4 Sanity",
    status: "open",
    priority: "high",
    subject: {type: "external_news"},
    issues: [],
    resolutions: [],
    context: {producer: "external_news"},
    createdAt: now,
    updatedAt: now,
    version: 1,
    resumeAttempts: 0,
    globalResolution: checkpoint(capability),
  };
}

function request(capability = "create:luchador", overrides: Partial<GlobalResolutionInspectionRequest> = {}): GlobalResolutionInspectionRequest {
  const op = operation(capability);
  const subject = capability === "create:luchador"
    ? {entityType: "luchador", expectedId: "fighter-au4", identityKey: "fighter:alex-silva", expectedPayloadFingerprint: "sha256-v1:fighterau4"}
    : capability === "resume:external_news"
      ? {entityType: "noticia", expectedId: expectedNewsId, expectedPayloadFingerprint: "sha256-v1:newsau4sanity"}
      : {entityType: "noticia", expectedId: expectedNewsId, expectedReferences: [{field: "luchadores", targetId: "fighter-au4"}]};
  return {
    inspectorId: SANITY_EXTERNAL_NEWS_INSPECTOR_ID,
    caseId: "case:au4-sanity",
    producer: "external_news",
    capability,
    operationId: op.id,
    operationFingerprint: fingerprintGlobalResolutionInspectionOperation(op),
    checkpointFingerprint: checkpoint(capability).checkpointFingerprint,
    caseVersion: 1,
    subject,
    requestedAt: now,
    ...overrides,
  };
}

function reader(handler: (input: SanityInspectionReadRequest, options: {signal?: AbortSignal}) => Promise<SanityInspectionReadResult> | SanityInspectionReadResult): SanityExternalNewsReadExecutor {
  return {read: async (input, options) => handler(input, options)};
}

async function inspect(readExecutor: SanityExternalNewsReadExecutor, inspectionRequest = request()): Promise<GlobalResolutionInspectionEvidence> {
  return createSanityExternalNewsEffectInspector({reader: readExecutor}).inspect(inspectionRequest, {now: () => now});
}

function reconciliationCase(evidence: GlobalResolutionInspectionEvidence, capability: string): GlobalResolutionReconciliationCase {
  const adapted = inspectionEvidenceToReconciliationEvidence(evidence);
  return {
    caseId: "case:au4-sanity",
    caseVersion: 1,
    checkpointFingerprint: checkpoint(capability).checkpointFingerprint,
    operationId: operation(capability).id,
    capability,
    reason: "executor_uncertain",
    payloadFingerprint: adapted.find((item) => item.finding === "effect_confirmed")?.fingerprint,
    evidence: adapted,
    confidence: "confirmed",
    createdAt: now,
  };
}

function hasSensitiveShape(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasSensitiveShape);
  return Object.entries(value).some(([key, child]) => /(?:document|body|contenido|query|groq|dataset|projectId|token|secret|headers?|authorization|cookie|stack)/i.test(key) || hasSensitiveShape(child));
}

async function main(): Promise<void> {
  const emptyReader = reader(async (input) => input.kind === "fighter_by_identity" ? {kind: input.kind, candidates: []} : input.kind === "news_document" ? {kind: input.kind, documents: []} : {kind: input.kind, documentExists: false, referenceExists: false});
  const inspector = createSanityExternalNewsEffectInspector({reader: emptyReader});
  const registry = new GlobalResolutionInspectorRegistry();
  registry.register(inspector);
  assert.equal(registry.get(SANITY_EXTERNAL_NEWS_INSPECTOR_ID)?.version, SANITY_EXTERNAL_NEWS_INSPECTOR_VERSION);
  assert.deepEqual(inspector.supports(request()), {supported: true, specificity: 100});
  assert.equal(inspector.supports(request("create:luchador", {producer: "other"})).supported, false);
  assert.equal(inspector.supports(request("validate:noticia")).supported, false);
  assert.equal(inspector.supports(request("create:luchador", {subject: {}})).supported, false);
  assert.equal(inspector.supports(request("replace_reference:noticia:luchador", {subject: {expectedId: expectedNewsId, expectedReferences: [{field: "otro", targetId: "fighter-au4"}]}})).supported, false);

  const rawFighter = {_id: "drafts.fighter-au4", _type: "luchador", nombre: "Alex Silva", slug: {current: "alex-silva"}, disciplina: {_ref: "mma"}, organizacion: {_ref: "ufc"}, activo: true, destacadoHome: false, _rev: "secret-rev", fullDocument: {token: "no"}};
  const fighter = normalizeSanityFighterCandidate(rawFighter)!;
  assert.equal(fighter.identityKey, "fighter:alex-silva");
  const fighterExpected = request("create:luchador", {subject: {entityType: "luchador", expectedId: "fighter-au4", identityKey: fighter.identityKey, expectedPayloadFingerprint: fighter.payloadFingerprint}});
  const fighterObserved = await inspect(reader(async () => ({kind: "fighter_by_identity", candidates: [fighter]})), fighterExpected);
  assert.equal(fighterObserved.status, "observed");
  assert.equal(fighterObserved.observations.some((item) => item.kind === "payload_matches"), true);
  const fighterByIdentity = await inspect(reader(async () => ({kind: "fighter_by_identity", candidates: [{...fighter, entityId: "other-fighter"}]})), request("create:luchador", {subject: {entityType: "luchador", identityKey: fighter.identityKey, expectedPayloadFingerprint: fighter.payloadFingerprint}}));
  assert.equal(fighterByIdentity.status, "observed");
  assert.equal((await inspect(emptyReader)).status, "not_observed");
  const multiple = await inspect(
    reader(async () => ({kind: "fighter_by_identity", candidates: [fighter, {...fighter, entityId: "fighter-two"}]})),
    request("create:luchador", {subject: {entityType: "luchador", identityKey: fighter.identityKey, expectedPayloadFingerprint: fighter.payloadFingerprint}}),
  );
  assert.equal(multiple.status, "ambiguous");
  const identityMismatch = await inspect(reader(async () => ({kind: "fighter_by_identity", candidates: [{...fighter, identityKey: "fighter:other"}]})), fighterExpected);
  assert.equal(identityMismatch.status, "ambiguous");
  const fighterDifferent = await inspect(reader(async () => ({kind: "fighter_by_identity", candidates: [{...fighter, payloadFingerprint: "sha256-v1:different"}]})), fighterExpected);
  assert.equal(fighterDifferent.observations.some((item) => item.kind === "payload_differs"), true);

  const rawNews = {
    _id: expectedNewsId,
    titulo: "Título de noticia AU4",
    extracto: "Extracto editorial suficientemente completo.",
    contenido: [{_type: "block", children: [{_type: "span", text: "Contenido editorial AU4."}]}],
    fechaPublicacion: "2026-07-29T09:00:00.000Z",
    fuenteUrl: "https://example.com/news",
    fuenteId: "news-au4",
    imagenPrincipalUrl: "https://cdn.sanity.io/image.jpg",
    disciplina: {_ref: "mma"},
    organizacionRelacionada: {_ref: "ufc"},
    eventoRelacionado: {_ref: "event-au4"},
    luchadoresRelacionados: [{_ref: "fighter-b"}, {_ref: "fighter-a"}],
    destacada: false,
    fuente: "otra",
    _rev: "ignored",
    _updatedAt: later,
  };
  const news = normalizeSanityNewsDocumentCandidate(rawNews)!;
  const reordered = normalizeSanityNewsDocumentCandidate({...rawNews, _rev: "changed", _updatedAt: "2030-01-01", luchadoresRelacionados: [{_ref: "fighter-a"}, {_ref: "fighter-b"}]})!;
  assert.equal(news.payloadFingerprint, reordered.payloadFingerprint);
  assert.notEqual(news.au3PayloadFingerprint, reordered.au3PayloadFingerprint);
  const newsRequest = request("resume:external_news", {subject: {entityType: "noticia", expectedId: expectedNewsId, expectedPayloadFingerprint: news.au3PayloadFingerprint}});
  const draftObserved = await inspect(reader(async () => ({kind: "news_document", documents: [news]})), newsRequest);
  assert.equal(draftObserved.status, "observed");
  const published = {...news, entityId: "news-au4"};
  assert.equal((await inspect(reader(async () => ({kind: "news_document", documents: [published]})), newsRequest)).status, "observed");
  const equivalentPair = await inspect(reader(async () => ({kind: "news_document", documents: [news, published]})), newsRequest);
  assert.equal(equivalentPair.status, "observed");
  assert.equal(equivalentPair.warnings.includes("draft_and_published_equivalent"), true);
  const incompatiblePair = await inspect(reader(async () => ({kind: "news_document", documents: [news, {...published, payloadFingerprint: "sha256-v1:other", au3PayloadFingerprint: "sha256-v1:other"}]})), newsRequest);
  assert.equal(incompatiblePair.status, "ambiguous");
  assert.equal((await inspect(emptyReader, newsRequest)).status, "not_observed");
  const newsDifferent = await inspect(reader(async () => ({kind: "news_document", documents: [{...news, payloadFingerprint: "sha256-v1:different", au3PayloadFingerprint: "sha256-v1:different"}]})), newsRequest);
  assert.equal(newsDifferent.observations.some((item) => item.kind === "payload_differs"), true);

  const referenceRequest = request("replace_reference:noticia:luchador");
  const referenceExists = await inspect(reader(async () => ({kind: "news_fighter_reference", documentExists: true, referenceExists: true, observedDocumentId: expectedNewsId})), referenceRequest);
  assert.equal(referenceExists.observations[0]?.kind, "reference_exists");
  const referenceMissing = await inspect(reader(async () => ({kind: "news_fighter_reference", documentExists: true, referenceExists: false, observedDocumentId: expectedNewsId})), referenceRequest);
  assert.equal(referenceMissing.observations[0]?.kind, "reference_missing");

  for (const forbidden of [
    {kind: "fighter_by_identity", identityKey: "fighter:a", query: "*[]"},
    {kind: "news_document", documentId: "a", dataset: "other"},
    {kind: "news_document", documentId: "a", projectId: "other"},
    {kind: "news_document", documentId: "a", token: "secret"},
  ]) assert.equal(parseSanityInspectionReadRequest(forbidden), undefined);
  assert.equal(parseSanityInspectionReadRequest({kind: "news_fighter_reference", documentId: "a", fighterId: "b", field: "otro"}), undefined);
  assert.equal(parseSanityInspectionReadRequest({kind: "news_fighter_reference", documentId: "a", fighterId: "b", field: "luchadores"})?.kind, "news_fighter_reference");

  let fetched = 0;
  const httpReader = createSanityInspectionHttpReader({fetcher: async (_url, init) => {
    fetched += 1;
    assert.equal(init?.method, "POST");
    assert.equal(init?.credentials, "omit");
    return new Response(JSON.stringify({ok: true, result: {kind: "fighter_by_identity", candidates: []}}), {status: 200});
  }});
  await httpReader.read({kind: "fighter_by_identity", identityKey: "fighter:a"}, {});
  assert.equal(fetched, 1);

  const unavailable = await inspect(reader(async () => { throw new Error("private query token=secret"); }));
  assert.equal(unavailable.status, "unavailable");
  assert.equal(JSON.stringify(unavailable).includes("secret"), false);
  const timeout = await inspect(reader(async () => { throw new Error("sanity_inspection_timeout"); }));
  assert.equal(timeout.status, "unavailable");
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => inspector.inspect(request(), {signal: controller.signal, now: () => now}));

  let domainReads = 0;
  const observedReader = reader(async () => { domainReads += 1; return {kind: "fighter_by_identity", candidates: [fighter]}; });
  const stored = reviewCase();
  const runtime = createExternalNewsInspectionRuntime({reader: observedReader, readCase: () => structuredClone(stored), now: () => now});
  assert.equal(domainReads, 0, "la construcción del runtime no lee Sanity");
  const serviceRequest = request("create:luchador", {subject: {entityType: "luchador", expectedId: "fighter-au4", identityKey: fighter.identityKey, expectedPayloadFingerprint: fighter.payloadFingerprint}});
  const [serviceOne, serviceTwo] = await Promise.all([runtime.service.inspect(serviceRequest), runtime.service.inspect(serviceRequest)]);
  assert.equal(serviceOne.ok && serviceTwo.ok, true);
  assert.equal(domainReads, 1, "dos solicitudes concurrentes comparten una lectura externa");
  runtime.dispose();

  const preRead = 0;
  const preConflict = structuredClone(stored);
  preConflict.version = 2;
  const preService = new GlobalResolutionInspectionService(registry, () => preConflict, () => now);
  assert.equal((await preService.inspect(serviceRequest)).ok, false);
  assert.equal(preRead, 0);

  let caseReads = 0;
  let release: (() => void) | undefined;
  const delayed = new Promise<void>((resolveDelayed) => { release = resolveDelayed; });
  const slowInspector = createSanityExternalNewsEffectInspector({reader: reader(async () => {
    await delayed;
    return {kind: "fighter_by_identity", candidates: [fighter]};
  })});
  const slowRegistry = new GlobalResolutionInspectorRegistry();
  slowRegistry.register(slowInspector);
  const changed = structuredClone(stored);
  changed.globalResolution!.checkpointFingerprint = "sha256-v1:changedafterread";
  const slowService = new GlobalResolutionInspectionService(slowRegistry, () => {
    caseReads += 1;
    return caseReads === 1 ? structuredClone(stored) : structuredClone(changed);
  }, () => now);
  const late = slowService.inspect(serviceRequest);
  release?.();
  const lateResult = await late;
  assert.equal(!lateResult.ok && lateResult.code, "checkpoint_conflict");

  assert.equal(hasSensitiveShape(fighterObserved), false);
  assert.equal(JSON.stringify(fighterObserved).includes("fullDocument"), false);
  const createAssessment = assessReconciliation(reconciliationCase(fighterObserved, "create:luchador"), checkpoint("create:luchador"));
  assert.equal(createAssessment.status, "confirmed_succeeded");
  const resumeAssessment = assessReconciliation(reconciliationCase(draftObserved, "resume:external_news"), checkpoint("resume:external_news"));
  assert.equal(resumeAssessment.status, "confirmed_succeeded");
  const referenceAssessment = assessReconciliation(reconciliationCase(referenceExists, "replace_reference:noticia:luchador"), checkpoint("replace_reference:noticia:luchador"));
  assert.equal(referenceAssessment.status, "confirmed_succeeded");
  const ambiguousAbsence = inspectionEvidenceToReconciliationEvidence({...fighterObserved, status: "ambiguous", observations: [{kind: "entity_missing", entityType: "luchador", identityKey: "fighter:alex-silva"}]});
  const insufficient = reconciliationCase(fighterObserved, "create:luchador");
  insufficient.evidence = ambiguousAbsence;
  assert.equal(assessReconciliation(insufficient, checkpoint("create:luchador")).status, "conflicting_evidence");

  const routeSource = readFileSync(resolve("app/api/review/global-resolution/inspect/route.ts"), "utf8");
  const inspectorSource = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/sanity/inspector.ts"), "utf8");
  const combined = `${routeSource}\n${inspectorSource}`;
  for (const mutation of [".create(", "createIfNotExists", "createOrReplace", ".patch(", ".mutate(", ".delete(", ".transaction(", "saveDraft(", "executeUniversalExecutionPlan", "executeExternalNewsResume"]) {
    assert.equal(combined.includes(mutation), false, `ruta de escritura prohibida: ${mutation}`);
  }
  assert.equal(routeSource.includes("body.query"), false);
  assert.equal(routeSource.includes("body.dataset"), false);
  assert.equal(routeSource.includes("body.projectId"), false);
  assert.equal(routeSource.includes("body.token"), false);
  assert.equal(SANITY_FIGHTER_BY_IDENTITY_QUERY.includes("$query"), false);
  assert.equal(SANITY_NEWS_DOCUMENT_QUERY.includes("$projection"), false);
  assert.equal(SANITY_NEWS_FIGHTER_REFERENCE_QUERY.includes("$field"), false);
  console.log("AU4 Sanity external news effect inspector tests: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
