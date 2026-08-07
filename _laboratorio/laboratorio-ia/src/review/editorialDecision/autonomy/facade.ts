import type {ReviewJsonValue} from "../../types";
import {computeUniversalFingerprint} from "../../universal";
import {decideAutonomousEditorialAction} from "../engine";
import {evaluateAutonomyRiskPolicy} from "./policy";
import type {AutonomousEditorialGovernanceInput, AutonomousEditorialGovernanceResult, AutonomySufficiencyDescriptor} from "./types";

/** Fachada pura: B1 ya aplica B2 antes de entregar la decisión a B3. */
export function evaluateAutonomousEditorialGovernance(input: AutonomousEditorialGovernanceInput): AutonomousEditorialGovernanceResult {
  const decision = decideAutonomousEditorialAction(input.decisionInput);
  const contradictionCodes = decision.blockingReasons.filter((item) => item.code.includes("conflict") || item.code.includes("contradictory")).map((item) => item.code).sort();
  const sufficiency: AutonomySufficiencyDescriptor = Object.freeze({classification: decision.evidenceSufficiency, canDecideNow: decision.canDecideNow, evaluationFingerprint: decision.evidenceSufficiencyFingerprint, contradictionCodes: Object.freeze(contradictionCodes)});
  const autonomy = evaluateAutonomyRiskPolicy({...input.autonomy, decision, sufficiency});
  const semantic = {decisionFingerprint: decision.decisionFingerprint, sufficiencyFingerprint: sufficiency.evaluationFingerprint, autonomyFingerprint: autonomy.policyFingerprint, executionAllowed: false as const, writes: false as const};
  return Object.freeze({decision, sufficiency, autonomy, fingerprint: computeUniversalFingerprint(semantic as unknown as ReviewJsonValue), executionAllowed: false, writes: false});
}
