import {validatePreparedEntity} from "../materialization/validatePreparedEntity";
import type {PreparedEntityRequirementItem} from "./types";

export function validateEnrichedPreparedEntity(item: Pick<PreparedEntityRequirementItem, "issueId" | "entityType" | "draft">) { return validatePreparedEntity(item); }
