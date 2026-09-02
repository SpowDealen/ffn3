import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  agentContextComposerSecurity,
  buildDecisionSupport,
  buildStructuredProposals,
  composeAgentContext,
  createAgentContextComposerFixture,
  decisionSupportBuilderSecurity,
  structuredProposalBuilderSecurity,
} from "../_laboratorio/laboratorio-ia/src/agent/context";

let assertions = 0;
const check = (value: unknown, message: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");

function main(): void {
  const input = createAgentContextComposerFixture();
  const before = JSON.stringify(input);
  const context = composeAgentContext(input);
  const proposals = buildStructuredProposals(context);
  const decisions = buildDecisionSupport(proposals);

  equal(context.items.length, 11, "1 B1 context completo");
  equal(proposals.length, context.items.length, "2 B2 conserva cardinalidad correlacionada");
  equal(decisions.length, proposals.length, "3 B3 conserva proposals");
  equal(new Set(context.items.map((item) => item.id)).size, 11, "4 B1 IDs únicos");
  equal(new Set(proposals.map((proposal) => proposal.id)).size, 11, "5 B2 IDs únicos");
  equal(new Set(decisions.map((decision) => decision.id)).size, 11, "6 B3 IDs únicos");

  for (const item of context.items) {
    const proposal = proposals.find((candidate) => candidate.trace.contextItemId === item.id);
    const decision = proposal ? decisions.find((candidate) => candidate.proposalId === proposal.id) : undefined;
    check(Boolean(proposal), `7 B1→B2 ${item.id}`);
    check(Boolean(decision), `8 B2→B3 ${item.id}`);
    equal(proposal?.trace.agentContextSnapshotIdentity, context.snapshotIdentity, "9 snapshot B1→B2");
    equal(decision?.trace.agentContextSnapshotIdentity, context.snapshotIdentity, "10 snapshot B2→B3");
    equal(decision?.trace.structuredProposalId, proposal?.id, "11 proposal trace");
    equal(proposal?.durable, false, "12 proposal no durable");
    equal(decision?.boundary.derived, true, "13 decision derived");
  }

  const contextUfc = context.items.find((item) => item.id === "review:case:ufc:identity")!;
  const proposalUfc = proposals.find((proposal) => proposal.trace.contextItemId === contextUfc.id)!;
  const decisionUfc = decisions.find((decision) => decision.proposalId === proposalUfc.id)!;
  equal(contextUfc.references.reviewCaseId, "case:ufc:identity", "14 ReviewCase llega a B1");
  check(contextUfc.references.diagnosisIds.length > 0, "15 AG1 llega a B1");
  check(contextUfc.references.insightIds.length > 0, "16 AG2 llega a B1");
  equal(contextUfc.decisionOptions?.length, 2, "17 RX3 alternatives llegan a B1");
  equal(contextUfc.decisionOptions?.find((option) => option.label === "Alex Norte")?.confidence?.value, 94, "18 Alex 94 B1");
  equal(contextUfc.decisionOptions?.find((option) => option.label === "Álex Sur")?.confidence?.value, 61, "19 Álex 61 B1");

  equal(proposalUfc.alternatives.length, 2, "20 alternatives B2");
  equal(proposalUfc.recommendation?.confidence?.value, 94, "21 recommendation confidence B2");
  equal(proposalUfc.confidence.status, "mixed", "22 no averaging B2");
  equal(proposalUfc.sufficiency.determinesReadiness, false, "23 B2 no readiness");
  equal(proposalUfc.humanDecision.status, "required", "24 B2 human decision");
  check(proposalUfc.hypotheses.length > 0 && proposalUfc.facts.length > 0, "25 B2 epistemic separation");
  equal(proposalUfc.expectedOutcome?.observed, false, "26 B2 expected not observed");

  equal(decisionUfc.decisionState, "recommendation_with_caveats", "27 B3 state");
  equal(decisionUfc.preferredOption?.label, "Usar Alex Norte", "28 B3 preferred");
  equal(decisionUfc.preferredOption?.confidence?.value, 94, "29 B3 confidence preserved");
  equal(decisionUfc.alternatives.find((alternative) => alternative.label === "Usar Álex Sur")?.confidence?.value, 61, "30 B3 alternative preserved");
  check(decisionUfc.explanation.why.length > 0, "31 B3 why preferred");
  check(decisionUfc.explanation.whyNot.length > 0, "32 B3 why not");
  check(decisionUfc.explanation.caveats.length > 0, "33 B3 caveats");
  equal(decisionUfc.evidenceAssessment.synthesizedConfidence, false, "34 no synthetic confidence");
  equal(decisionUfc.ambiguities.length, 1, "35 ambiguity");
  equal(decisionUfc.contradictions.length, 0, "36 no false contradiction");
  check(decisionUfc.missingInformation.length > 0, "37 missing information");
  check(decisionUfc.decisionQuestions.length > 0, "38 decision question");
  equal(decisionUfc.humanDecision.status, "required", "39 human decision preserved");
  equal(decisionUfc.authorityHint.target, "Review", "40 authority preserved");
  equal(decisionUfc.authorityHint.invokes, false, "41 no authority invocation");
  equal(decisionUfc.expectedOutcome?.observed, false, "42 outcome remains expected");
  equal(decisionUfc.trace.reviewCaseId, "case:ufc:identity", "43 trace complete");
  equal(decisionUfc.freshness.refreshPerformed, false, "44 no refresh");

  const conflict = decisions.find((decision) => decision.trace.contextItemId.includes("evidence_conflicting"))!;
  equal(conflict.decisionState, "blocked_by_contradiction", "45 contradiction fail-closed");
  equal(conflict.preferredOption, null, "46 contradiction no preference");
  equal(conflict.evidenceAssessment.strength, "contradictory", "47 contradiction strength");
  const noAction = decisions.find((decision) => decision.trace.contextItemId === "review:case:external:dismissed")!;
  equal(noAction.decisionState, "no_action_needed", "48 no action distinct");
  equal(noAction.humanDecision.status, "not_required", "49 no action no human");
  const stale = decisions.find((decision) => decision.trace.contextItemId === "review:case:one:stale")!;
  equal(stale.decisionState, "blocked_by_missing_information", "50 stale fail-closed");
  equal(stale.freshness.status, "stale", "51 freshness preserved");

  const secondContext = composeAgentContext(createAgentContextComposerFixture());
  const secondProposals = buildStructuredProposals(secondContext);
  const secondDecisions = buildDecisionSupport(secondProposals);
  assert.deepEqual(secondContext, context); assertions += 1;
  assert.deepEqual(secondProposals, proposals); assertions += 1;
  assert.deepEqual(secondDecisions, decisions); assertions += 1;
  equal(JSON.stringify(input), before, "52 source fixture not mutated");
  equal(JSON.stringify(JSON.parse(JSON.stringify(decisions))), JSON.stringify(decisions), "53 pipeline JSON-safe");

  equal(agentContextComposerSecurity.executes, false, "54 B1 no execute");
  equal(structuredProposalBuilderSecurity.executes, false, "55 B2 no execute");
  equal(decisionSupportBuilderSecurity.executes, false, "56 B3 no execute");
  equal(agentContextComposerSecurity.persists, false, "57 B1 no persist");
  equal(structuredProposalBuilderSecurity.persists, false, "58 B2 no persist");
  equal(decisionSupportBuilderSecurity.persists, false, "59 B3 no persist");
  equal(structuredProposalBuilderSecurity.invokesReview, false, "60 B2 no Review invoke");
  equal(decisionSupportBuilderSecurity.invokesReview, false, "61 B3 no Review invoke");
  equal(decisionSupportBuilderSecurity.invokesAu7, false, "62 no AU7");
  equal(decisionSupportBuilderSecurity.invokesAu8, false, "63 no AU8");
  equal(decisionSupportBuilderSecurity.decidesAutonomy, false, "64 no autonomy");
  equal(decisionSupportBuilderSecurity.usesLlm, false, "65 no LLM");
  check(decisions.every((decision) => !decision.boundary.executes && !decision.boundary.plans && !decision.boundary.persists && !decision.boundary.createsAuthority), "66 boundary completa");

  const sourceText = [
    source("_laboratorio/laboratorio-ia/src/agent/context/composer.ts"),
    source("_laboratorio/laboratorio-ia/src/agent/context/proposals/builder.ts"),
    source("_laboratorio/laboratorio-ia/src/agent/context/decisions/builder.ts"),
  ].join("\n");
  check(!/\b(fetch|axios|XMLHttpRequest)\s*\(/.test(sourceText), "67 pipeline no network");
  check(!/localStorage|sessionStorage|indexedDB/.test(sourceText), "68 pipeline no store");
  check(!/runAutonomousSupervisedLoop|executeTransaction|dispatchReviewResume/.test(sourceText), "69 pipeline no execution");
  check(!/openai|chatCompletion|streaming|conversationEngine/i.test(sourceText), "70 pipeline no AG4/LLM");
  check(assertions >= 120, `expected at least 120 assertions, got ${assertions}`);
  console.log(`AG3 Full Certification B1→B2→B3: OK (${assertions} assertions; stable end-to-end identity, evidence and epistemic preservation, alternatives, recommendation, decision framing, traceability, fail-closed behavior and zero effects)`);
}

main();
