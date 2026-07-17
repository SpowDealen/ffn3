import assert from "node:assert/strict";
import {applyAutonomousReview, previewAutonomousReview} from "../_laboratorio/laboratorio-ia/src/review/autonomous";
import {addReviewResolution, createReviewCase, getReviewCase, getReviewCases, removeReviewResolution, setReviewCaseRepositoryForTests} from "../_laboratorio/laboratorio-ia/src/review/store/reviewStore";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";
import {confirmEditorialOutcome, createMemoryOutcomeRepository, exportOutcomeLedger, getOutcomeEvents, getOutcomesForCase, migrateOutcomeLedger, reconcileOutcome, setOutcomeRepositoryForTests} from "../_laboratorio/laboratorio-ia/src/review/outcomes";
import {createMemoryFromOutcome, createMemoryRepository, emptyMemoryLedger, exportDecisionMemory, getDecisionMemories, getMemoryEvents, migrateMemoryLedger, setMemoryRepositoryForTests} from "../_laboratorio/laboratorio-ia/src/review/memory";
import {buildRetrievalQuery} from "../_laboratorio/laboratorio-ia/src/review/retrieval/buildRetrievalQuery";
import {createMemoryRetrievalRepository, exportDecisionRetrieval, getRetrievalResults, migrateRetrievalLedger, persistRetrieval, setRetrievalRepositoryForTests} from "../_laboratorio/laboratorio-ia/src/review/retrieval";
import {getReviewInvestigations, investigateReviewIssue, MemoryInvestigationRepository, setInvestigationRepositoryForTests} from "../_laboratorio/laboratorio-ia/src/review/investigation/deep";
import {buildExternalNewsResumePreview, createExternalNewsPreviewFingerprint, executeExternalNewsResume, type ExternalNewsResumeExecutor} from "../_laboratorio/laboratorio-ia/src/review/resume/externalNews";
import {inspectPreparedEntityRequirements} from "../_laboratorio/laboratorio-ia/src/review/schemaRequirements";
import {registerEditorialSchemaRequirements} from "../_laboratorio/laboratorio-ia/src/integrations/editorialSchemaRequirements";

const now = "2026-07-18T12:00:00.000Z";
class ReviewMemoryRepository { constructor(private cases: ReviewCase[] = []) {} load() { return structuredClone(this.cases); } save(cases: readonly ReviewCase[]) { this.cases = structuredClone([...cases]); } snapshot() { return structuredClone(this.cases); } }
class MemoryStorage { private values = new Map<string, string>(); get length() { return this.values.size; } clear() { this.values.clear(); } getItem(key: string) { return this.values.get(key) ?? null; } key(index: number) { return [...this.values.keys()][index] ?? null; } removeItem(key: string) { this.values.delete(key); } setItem(key: string, value: string) { this.values.set(key, value); } }
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));
const withoutGeneratedAt = <T>(value: T): T => JSON.parse(JSON.stringify(value, (key, child) => key === "generatedAt" ? undefined : child)) as T;

async function main() {
  const reviewRepo = new ReviewMemoryRepository(); const outcomeRepo = createMemoryOutcomeRepository(); const memoryRepo = createMemoryRepository(emptyMemoryLedger()); const retrievalRepo = createMemoryRetrievalRepository(); const investigationRepo = new MemoryInvestigationRepository();
  const restores = [setReviewCaseRepositoryForTests(reviewRepo), setOutcomeRepositoryForTests(outcomeRepo), setMemoryRepositoryForTests(memoryRepo), setRetrievalRepositoryForTests(retrievalRepo), setInvestigationRepositoryForTests(investigationRepo), registerEditorialSchemaRequirements()];
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {value: {localStorage: storage}, configurable: true, writable: true});
  const notificationStore = await import("../_laboratorio/laboratorio-ia/src/notifications/store");
  let restoreTransport: () => void = () => {};
  try {
    const input = {dedupeKey: "phase-6d:case", module: "external.news" as const, title: "Idempotencia 6D", priority: "high" as const, source: "controlled", subject: {type: "external_news", id: "6d-item"}, issues: [{id: "6d:discipline", kind: "missing_reference" as const, valueKind: "discipline" as const, fieldPath: "discipline", label: "Disciplina", message: "Falta", required: true, blocking: true, candidates: [{id: "mma", label: "MMA", value: {id: "mma"}, sanityId: "mma", confidence: 99}]}], context: {producer: "external_news", sourceId: "controlled", sourceName: "Controlled", sourceUrl: "https://example.test/6d", canonicalUrl: "https://example.test/6d", externalItemId: "6d-item", title: "Idempotencia 6D", operation: "create_draft", createdAt: now, payloadSnapshot: {id: "6d-item", title: "Idempotencia", excerpt: "Resumen", bodyText: "Contenido controlado suficientemente largo.", canonicalUrl: "https://example.test/6d", publishedAt: now, image: {url: "https://example.test/6d.jpg"}}, analysisSnapshot: {analysis: {relevancia: "alta", disciplinaPrincipal: "MMA"}, resolved: {disciplina: {id: "discipline-old", label: "Old"}, organizacion: null, evento: null, luchadoresPrincipales: [], luchadoresSecundarios: []}}}};
    const first = createReviewCase(input); for (let index = 0; index < 10; index += 1) assert.equal(createReviewCase(input).id, first.id); assert.equal(getReviewCases().length, 1);

    const resolutionA = {type: "link_reference" as const, issueId: "6d:discipline", sanityId: "mma"};
    const resolved = addReviewResolution(first.id, resolutionA)!; const versionAfterResolution = resolved.version;
    const resolutionB = {sanityId: "mma", issueId: "6d:discipline", type: "link_reference" as const};
    assert.equal(addReviewResolution(first.id, resolutionB)?.version, versionAfterResolution, "orden de claves no debe cambiar versión");
    assert.equal(getReviewCase(first.id)?.resolutions.length, 1);
    removeReviewResolution(first.id, resolutionA.issueId); const afterRemove = JSON.stringify(getReviewCase(first.id)); removeReviewResolution(first.id, resolutionA.issueId); assert.equal(JSON.stringify(getReviewCase(first.id)), afterRemove);

    const dryBefore = JSON.stringify(reviewRepo.snapshot()); const previewA = previewAutonomousReview(first.id); const previewB = previewAutonomousReview(first.id); assert.deepEqual(withoutGeneratedAt(previewB), withoutGeneratedAt(previewA)); assert.equal(JSON.stringify(reviewRepo.snapshot()), dryBefore);
    applyAutonomousReview(first.id); const afterApply = JSON.stringify(reviewRepo.snapshot()); applyAutonomousReview(first.id); assert.equal(JSON.stringify(reviewRepo.snapshot()), afterApply);
    const current = getReviewCase(first.id)!; const resumePreviewA = buildExternalNewsResumePreview(current, {now: () => now}); const resumePreviewB = buildExternalNewsResumePreview(current, {now: () => now}); assert.deepEqual(resumePreviewB, resumePreviewA); assert.equal(createExternalNewsPreviewFingerprint(current, resumePreviewA), createExternalNewsPreviewFingerprint(current, resumePreviewB));

    let saveCalls = 0; let releaseSave: (() => void) | undefined; const gate = new Promise<void>((resolve) => { releaseSave = resolve; });
    const executor: ExternalNewsResumeExecutor = {buildOutput: () => ({title: "6D"}), saveDraft: async () => { saveCalls += 1; await gate; return {success: true, draftId: "draft-6d"}; }};
    const execution = executeExternalNewsResume({caseId: first.id, executor}); const concurrent = await executeExternalNewsResume({caseId: first.id, executor}); assert.equal(concurrent.status, "already_resuming"); releaseSave?.(); assert.equal((await execution).status, "succeeded"); assert.equal((await executeExternalNewsResume({caseId: first.id, executor})).status, "already_resumed"); assert.equal(saveCalls, 1);

    const outcomes = getOutcomesForCase(first.id); assert.equal(outcomes.length, 1); const outcomeSnapshot = JSON.stringify(exportOutcomeLedger()); for (let index = 0; index < 10; index += 1) reconcileOutcome(outcomes[0].id, () => now); assert.equal(JSON.stringify(exportOutcomeLedger()), outcomeSnapshot);
    const confirmed = confirmEditorialOutcome(outcomes[0].id, "6d", "Confirmación").record; const memory = createMemoryFromOutcome(confirmed).record!; for (let index = 0; index < 10; index += 1) createMemoryFromOutcome(confirmed); assert.equal(getDecisionMemories().length, 1); assert.equal(getMemoryEvents(memory.id).filter((event) => event.type === "memory_confirmed").length, 1);
    const query = buildRetrievalQuery(getReviewCase(first.id)!, getReviewCase(first.id)!.issues[0], {now}); for (let index = 0; index < 10; index += 1) persistRetrieval(query); assert.equal(getRetrievalResults().length, 1); assert.equal(getReviewCase(first.id)?.resolutions.length, 1, "Retrieval no aplica decisiones");
    const beforeInvestigation = JSON.stringify(reviewRepo.snapshot()); const investigationA = await investigateReviewIssue(first.id, "6d:discipline", {mode: "local_only"}); const investigationB = await investigateReviewIssue(first.id, "6d:discipline", {mode: "local_only"}); assert.equal(getReviewInvestigations().length, 2, "repetición explícita conserva historia legítima"); assert.deepEqual(investigationB.evidence.map(({providerId, sourceFingerprint}) => ({providerId, sourceFingerprint})), investigationA.evidence.map(({providerId, sourceFingerprint}) => ({providerId, sourceFingerprint}))); assert.equal(JSON.stringify(reviewRepo.snapshot()), beforeInvestigation);

    const blocked = createReviewCase({...input, dedupeKey: "phase-6d:blocked", title: "Bloqueada", subject: {type: "fighter", id: "blocked"}, issues: [{id: "6d:fighter", kind: "missing_entity", valueKind: "fighter", label: "Fighter", message: "Falta", required: true, blocking: true}]}); addReviewResolution(blocked.id, {type: "create_entity", issueId: "6d:fighter", entityType: "fighter", draft: {name: "Fighter"}}); const blockedA = inspectPreparedEntityRequirements(blocked.id, () => now); const blockedB = inspectPreparedEntityRequirements(blocked.id, () => now); assert.deepEqual(blockedB, blockedA); assert.equal(blockedA.status, "blocked"); assert.equal(getReviewCase(blocked.id)?.entityMaterialization, undefined);

    for (const [name, exported, migrate] of [["outcome", exportOutcomeLedger(), migrateOutcomeLedger], ["memory", exportDecisionMemory(), migrateMemoryLedger], ["retrieval", exportDecisionRetrieval(), migrateRetrievalLedger]] as const) { let snapshot: unknown = exported; for (let index = 0; index < 10; index += 1) snapshot = migrate(JSON.parse(JSON.stringify(snapshot)) as never); assert.deepEqual(snapshot, migrate(JSON.parse(JSON.stringify(exported)) as never), `${name} migration unstable`); }

    let telegramCalls = 0; restoreTransport = notificationStore.setNotificationTransportForTests(async () => { telegramCalls += 1; return {ok: true}; }); const delivered = notificationStore.createNotification({level: "success", title: "6D", message: "Sent", channels: {activityCenter: true, telegram: true}}); await tick(); assert.equal(notificationStore.getNotifications()[0].deliveryStatus, "sent"); await notificationStore.retryNotificationDelivery(delivered.id); assert.equal(telegramCalls, 1, "retry tras sent no debe reenviar");
    const groupedA = notificationStore.createNotification({level: "success", title: "G", message: "1", groupKey: "6d:group", channels: {activityCenter: true, telegram: false}}); for (let index = 0; index < 10; index += 1) notificationStore.createNotification({level: "success", title: "G", message: String(index), groupKey: "6d:group", channels: {activityCenter: true, telegram: false}}); assert.equal(notificationStore.getNotifications().filter((item) => item.groupKey === "6d:group").length, 1); assert.equal(notificationStore.getNotifications().find((item) => item.groupKey === "6d:group")?.id, groupedA.id);

    assert.equal(getOutcomeEvents(outcomes[0].id).filter((event, index, events) => events.findIndex((candidate) => candidate.idempotencyKey === event.idempotencyKey) !== index).length, 0);
    console.log(`Phase 6D idempotency summary: ${JSON.stringify({reviewCases: "reuse", resolutions: "no-op", autonomousDryRun: "stable", previewFingerprint: "stable", concurrentResume: "single-save", outcomes: "stable", memory: "stable", retrieval: "stable", investigation: "stable-evidence-new-history", schemaBlocking: "stable", migrations: "stable", notifications: "single-delivery", externalEffects: 0})}`);
    console.log("Phase 6D idempotency tests: OK");
  } finally {
    restoreTransport(); notificationStore.clearNotifications(); restores.reverse().forEach((restore) => restore());
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
