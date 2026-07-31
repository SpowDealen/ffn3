import {validatePreparedEntity} from "../../../materialization";
import type {ReviewJsonValue} from "../../../types";
import {computeUniversalFingerprint} from "../../../universal";
import {GlobalResolutionInspectionRequestContractRegistry, type GlobalResolutionInspectionRequestContract} from "../requestContracts";

const fp = (value: unknown) => computeUniversalFingerprint(value as ReviewJsonValue);

function createContract(capability: string, buildSubject: GlobalResolutionInspectionRequestContract["buildSubject"]): GlobalResolutionInspectionRequestContract {
  return {id: `sanity:external_news-request:${capability}`, version: "1.0.0", producer: "external_news", capability, buildSubject};
}

export function createExternalNewsInspectionRequestContractRegistry(): GlobalResolutionInspectionRequestContractRegistry {
  const registry = new GlobalResolutionInspectionRequestContractRegistry();
  registry.register(createContract("create:luchador", ({checkpoint, operation, requireCompleteSubject}) => {
    const execution = checkpoint.execution?.operations.filter((item) => item.operationId === operation.id).at(-1);
    const draft = operation.payload && typeof operation.payload === "object" && !Array.isArray(operation.payload) ? operation.payload : undefined;
    const prepared = draft ? validatePreparedEntity({issueId: operation.id, entityType: "fighter", draft}) : undefined;
    const subject = {
      entityType: "luchador",
      expectedId: execution?.documentId,
      identityKey: operation.target?.identityKey,
      expectedPayloadFingerprint: prepared?.entity ? fp(prepared.entity.sanityPayload) : undefined,
    };
    return requireCompleteSubject && !subject.expectedId && !subject.identityKey ? {ok: false, code: "subject_incomplete"} : {ok: true, subject};
  }));
  registry.register(createContract("resume:external_news", ({reviewCase, checkpoint, operation, requireCompleteSubject}) => {
    const execution = checkpoint.execution?.operations.filter((item) => item.operationId === operation.id).at(-1);
    const expectedId = reviewCase.resumeExecution?.draftId ?? reviewCase.resumeExecution?.documentId ?? execution?.documentId;
    const subject = {entityType: "noticia", expectedId, expectedPayloadFingerprint: checkpoint.resume?.operationId === operation.id ? checkpoint.resume.payloadFingerprint : undefined};
    return requireCompleteSubject && !subject.expectedId ? {ok: false, code: "subject_incomplete"} : {ok: true, subject};
  }));
  registry.register(createContract("replace_reference:noticia:luchador", ({reviewCase, checkpoint, operation, requireCompleteSubject}) => {
    const execution = checkpoint.execution?.operations.filter((item) => item.operationId === operation.id).at(-1);
    const expectedId = reviewCase.resumeExecution?.draftId ?? reviewCase.resumeExecution?.documentId ?? execution?.documentId;
    const fighterId = checkpoint.referenceResolution?.documentId ?? checkpoint.execution?.operations.find((item) => item.capability === "create:luchador" && item.documentId)?.documentId;
    const subject = {
      entityType: "noticia",
      expectedId,
      identityKey: operation.target?.identityKey,
      expectedReferences: fighterId ? [{field: "luchadores", targetId: fighterId}] : undefined,
    };
    return requireCompleteSubject && (!subject.expectedId || !fighterId) ? {ok: false, code: "subject_incomplete"} : {ok: true, subject};
  }));
  return registry;
}
