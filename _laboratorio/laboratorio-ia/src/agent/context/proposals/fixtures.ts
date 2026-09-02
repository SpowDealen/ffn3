import {composeAgentContext} from "../composer";
import {createAgentContextComposerFixture} from "../fixtures";
import {buildStructuredProposals} from "./builder";

export function createStructuredProposalFixture() {
  const context = composeAgentContext(createAgentContextComposerFixture());
  return Object.freeze({context, proposals: buildStructuredProposals(context)});
}

export const structuredProposalFixtureSecurity = Object.freeze({pure: true, deterministic: true, devOnly: true, createsStore: false, persists: false, fetches: false, writes: false, executes: false, sanity: false, telegram: false, externalApis: false} as const);
