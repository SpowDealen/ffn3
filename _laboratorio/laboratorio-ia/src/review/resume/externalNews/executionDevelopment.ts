import {getReviewResumeExecutor, registerReviewResumeExecutor} from "../../../integrations/reviewResumeExecutors";
import {createReviewCase} from "../../store/reviewStore";
import {executeExternalNewsResume} from "./executeExternalNewsResume";
import type {ExternalNewsResumeExecutor} from "./executionTypes";

let unregisterMock: (() => void) | undefined;
export function registerMockExternalNewsResumeExecutor(options: {failBuild?: boolean; failSave?: boolean; successFalse?: boolean; delayMs?: number; draftId?: string; documentId?: string} = {}): () => void {
  unregisterMock?.();
  const executor: ExternalNewsResumeExecutor = {buildOutput(form) { if (options.failBuild) throw new Error("Fallo simulado del builder."); return {_type: "noticia", titulo: String(form.titulo ?? "")}; }, async saveDraft() { if (options.delayMs) await new Promise((resolve) => window.setTimeout(resolve, options.delayMs)); if (options.failSave) throw new Error("Fallo simulado de saveDraft."); if (options.successFalse) return {success: false, error: "saveDraft devolvió false."}; return {success: true, draftId: options.draftId ?? "draft-mock-4c2", documentId: options.documentId, message: "Guardado simulado; no se tocó Sanity."}; }};
  unregisterMock = registerReviewResumeExecutor("external_news", executor, {replace: true});
  return () => unregisterMockExternalNewsResumeExecutor();
}
export function unregisterMockExternalNewsResumeExecutor(): void { unregisterMock?.(); unregisterMock = undefined; }
export const executeExternalNewsResumeWithRegisteredExecutor = (caseId: string) => executeExternalNewsResume({caseId, executor: getReviewResumeExecutor("external_news")});

export function createExternalNewsResumeExecutionTestCase() {
  return createReviewCase({dedupeKey: "dev:external-news-resume-execution-4c2", module: "external.news", title: "Caso ready para ejecución controlada", priority: "normal", source: "Marca", subject: {type: "external_news", id: "execution-4c2", label: "Noticia ready"}, issues: [], context: {producer: "external_news", sourceId: "marca", sourceName: "Marca", sourceUrl: "https://marca.com/execution-4c2", externalItemId: "execution-4c2", canonicalUrl: "https://marca.com/execution-4c2", title: "Título válido para borrador", operation: "create_draft", createdAt: "2026-04-02T10:00:00.000Z", payloadSnapshot: {id: "execution-4c2", title: "Título válido para borrador", excerpt: "Resumen suficientemente largo para el builder real", bodyText: "Contenido editorial suficientemente largo para construir una noticia válida de prueba.", canonicalUrl: "https://marca.com/execution-4c2", publishedAt: "2026-04-02T09:00:00.000Z", image: {url: "https://marca.com/image.jpg"}}, analysisSnapshot: {analysis: {relevancia: "media"}, resolved: {disciplina: {id: "discipline-mma", label: "MMA"}, organizacion: null, evento: null, luchadoresPrincipales: [], luchadoresSecundarios: []}}, unresolvedRelations: []}});
}
