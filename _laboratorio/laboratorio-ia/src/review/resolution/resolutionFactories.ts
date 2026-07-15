import type {ReviewJsonObject, ReviewJsonValue, ReviewResolution} from "../types";

export const resolutionFactories = {
  setValue(issueId: string, value: ReviewJsonValue): ReviewResolution {
    return {type: "set_value", issueId, value};
  },
  selectCandidate(issueId: string, candidateId: string): ReviewResolution {
    return {type: "select_candidate", issueId, candidateId};
  },
  linkReference(issueId: string, sanityId: string): ReviewResolution {
    return {type: "link_reference", issueId, sanityId: sanityId.trim()};
  },
  createEntity(issueId: string, entityType: string, draft: ReviewJsonObject): ReviewResolution {
    return {type: "create_entity", issueId, entityType: entityType.trim(), draft};
  },
  selectImage(issueId: string, url?: string, assetId?: string): ReviewResolution {
    return {type: "select_image", issueId, url: url?.trim() || undefined, assetId: assetId?.trim() || undefined};
  },
  confirmDuplicate(issueId: string, duplicateId: string): ReviewResolution {
    return {type: "confirm_duplicate", issueId, duplicateId: duplicateId.trim()};
  },
  rejectDuplicate(issueId: string, reason?: string): ReviewResolution {
    return {type: "reject_duplicate", issueId, reason: reason?.trim() || undefined};
  },
  acceptValue(issueId: string, reason?: string): ReviewResolution {
    return {type: "accept_value", issueId, reason: reason?.trim() || undefined};
  },
  discard(issueId: string, reason: string): ReviewResolution {
    return {type: "discard", issueId, reason: reason.trim()};
  },
  retry(issueId: string): ReviewResolution {
    return {type: "retry", issueId};
  },
};
