import {computeUniversalFingerprint} from "../../universal";
import {createOrUpdateReviewCaseFromIntake} from "../../intake";
import {getReviewCase, getReviewCases, removeReviewCase} from "../../store/reviewStore";
import type {ReviewCandidate, ReviewCase} from "../../types";
import {OFFICIAL_REVIEW_RESUME_PRODUCERS, type OfficialReviewResumeProducer, type ReviewOriginAuthorityResult, type ReviewOriginResumeAuthority, type ReviewOriginResumeRequest} from "./types";
import {registerReviewOriginResumeAuthority} from "../../../integrations/reviewResumeExecutors";
import {createOfficialEventRuntimeAuthority, createOfficialNewsRuntimeAuthority} from "./runtimeAuthorities";
import {readReviewOriginResumeContext} from "./contract";

const NOW = "2026-09-02T12:00:00.000Z";
const sourceFor = (producer: OfficialReviewResumeProducer) => producer.startsWith("ufc_") ? "ufc" as const : producer.startsWith("one_") ? "one" as const : "bkfc" as const;

export function createRx5ReviewFlowFixture(producer: OfficialReviewResumeProducer, suffix = "primary"): ReviewCase {
  const source = sourceFor(producer);
  const event = producer.endsWith("_events");
  const originId = `dev:rx5:${producer}:${suffix}`;
  const operation = event ? "resolve_official_event" : "analyze_official_news";
  const candidate: ReviewCandidate = {id: `${originId}:candidate`, label: event ? "Categoría verificada" : "Entidad verificada", value: {sanityId: `${originId}:entity`}, sanityId: `${originId}:entity`, confidence: 0.96};
  const fingerprint = computeUniversalFingerprint({source, producer, originId, operation});
  const created = createOrUpdateReviewCaseFromIntake({
    actionable: true,
    source,
    entityType: event ? "event" : "news",
    originId,
    subjectLabel: event ? `Evento ${source.toUpperCase()} RX5` : `Noticia ${source.toUpperCase()} RX5`,
    issueType: event ? "incomplete_event" : "ambiguous_entity",
    summary: event ? "Falta confirmar una relación del evento antes de continuar." : "Falta confirmar la entidad editorial antes de continuar.",
    title: event ? `Evento RX5 ${source.toUpperCase()}` : `Noticia RX5 ${source.toUpperCase()}`,
    candidates: [candidate],
    evidenceRefs: [{id: `${originId}:evidence`, source: "fixture-rx5"}],
    originContext: {devOnly: true, route: "/editorial", originId},
    resumeContext: {schemaVersion: 1, producer, originId, operation, fingerprint},
    now: () => NOW,
  });
  const reviewCase = created.caseId ? getReviewCase(created.caseId) : undefined;
  if (!reviewCase) throw new Error("rx5_fixture_case_not_created");
  return reviewCase;
}

export function createRx5ResumeAuthority(producer: OfficialReviewResumeProducer, handler?: (request: ReviewOriginResumeRequest) => Promise<ReviewOriginAuthorityResult> | ReviewOriginAuthorityResult): {authority: ReviewOriginResumeAuthority; calls: readonly ReviewOriginResumeRequest[]} {
  const calls: ReviewOriginResumeRequest[] = [];
  return {
    calls,
    authority: Object.freeze({
      authorityId: `dev.rx5.${producer}.v1`,
      producer,
      async continueOrigin(request) {
        calls.push({...request, resolutions: structuredClone(request.resolutions), context: structuredClone(request.context)});
        return handler ? handler(request) : {outcome: "succeeded", observed: true, resultId: `prepared:${request.originId}`};
      },
    }),
  };
}

export const RX5_BROWSER_FIXTURE_QUERY = "rx5";

export type Rx5BrowserFixtureDescriptor = Readonly<{
  caseId: string;
  producer: OfficialReviewResumeProducer;
}>;

export type Rx5BrowserFixtureAuthoritySession = Readonly<{
  caseId: string;
  producer: OfficialReviewResumeProducer;
  authority: ReviewOriginResumeAuthority;
  getInvocationCount(): number;
  unregister(): void;
  cleanup(): void;
}>;

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRx5DevelopmentCase(reviewCase: ReviewCase, producer: OfficialReviewResumeProducer): boolean {
  const context = readReviewOriginResumeContext(reviewCase);
  const intake = reviewCase.context.unifiedReviewIntake;
  const origin = object(intake) ? intake.origin : undefined;
  return context?.producer === producer
    && context.originId.startsWith(`dev:rx5:${producer}:`)
    && object(origin)
    && origin.devOnly === true;
}

export function readRx5BrowserFixtureDescriptor(search: URLSearchParams | string): Rx5BrowserFixtureDescriptor | undefined {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  if (params.get("fixture") !== RX5_BROWSER_FIXTURE_QUERY) return undefined;
  const producerValue = params.get("producer") ?? "";
  if (!(OFFICIAL_REVIEW_RESUME_PRODUCERS as readonly string[]).includes(producerValue)) return undefined;
  const producer = producerValue as OfficialReviewResumeProducer;
  const requestedCaseId = params.get("case")?.trim();
  const reviewCase = requestedCaseId
    ? getReviewCase(requestedCaseId)
    : getReviewCases().find((candidate) => readReviewOriginResumeContext(candidate)?.originId === `dev:rx5:${producer}:browser` && isRx5DevelopmentCase(candidate, producer));
  if (!reviewCase || !isRx5DevelopmentCase(reviewCase, producer)) return undefined;
  return Object.freeze({caseId: reviewCase.id, producer});
}

function createRx5BrowserFixtureAuthority(descriptor: Rx5BrowserFixtureDescriptor): {authority: ReviewOriginResumeAuthority; getInvocationCount(): number} {
  const context = readReviewOriginResumeContext(getReviewCase(descriptor.caseId)!);
  if (!context) throw new Error("rx5_fixture_resume_context_invalid");
  let invocationCount = 0;
  const authority = descriptor.producer.endsWith("_events")
    ? createOfficialEventRuntimeAuthority(descriptor.producer as Extract<OfficialReviewResumeProducer, `${string}_events`>, {
        getEvent: (originId) => originId === context.originId ? {id: originId, name: `Fixture ${descriptor.producer}`} : undefined,
        resolve: async () => {
          invocationCount += 1;
          return {event: {found: true, sanityId: `dev-safe:event:${descriptor.producer}:${context.originId}`}, discipline: {found: true}, organization: {found: true}, counts: {missingFighters: 0, unresolvedCategories: 0}, missingFighters: [], unresolvedCategories: [], fights: []};
        },
      })
    : createOfficialNewsRuntimeAuthority(descriptor.producer as Extract<OfficialReviewResumeProducer, `${string}_news`>, {
        getItem: (originId) => originId === context.originId ? {id: originId, title: `Fixture ${descriptor.producer}`} : undefined,
        analyze: async (item) => {
          invocationCount += 1;
          return {sourceId: item.id, status: "nueva_apta"};
        },
      });
  return {authority, getInvocationCount: () => invocationCount};
}

export function registerRx5BrowserFixtureAuthority(descriptor: Rx5BrowserFixtureDescriptor): Rx5BrowserFixtureAuthoritySession {
  const reviewCase = getReviewCase(descriptor.caseId);
  if (!reviewCase || !isRx5DevelopmentCase(reviewCase, descriptor.producer)) throw new Error("rx5_fixture_case_invalid");
  const runtime = createRx5BrowserFixtureAuthority(descriptor);
  const unregisterAuthority = registerReviewOriginResumeAuthority(descriptor.producer, runtime.authority, {replace: true});
  let active = true;
  const unregister = (): void => {
    if (!active) return;
    active = false;
    unregisterAuthority();
  };
  const cleanup = (): void => {
    unregister();
    removeRx5BrowserFixtureCase(descriptor.caseId);
  };
  return Object.freeze({...descriptor, authority: runtime.authority, getInvocationCount: runtime.getInvocationCount, unregister, cleanup});
}

export function rehydrateRx5BrowserFixtureAuthority(search: URLSearchParams | string): Rx5BrowserFixtureAuthoritySession | undefined {
  const descriptor = readRx5BrowserFixtureDescriptor(search);
  return descriptor ? registerRx5BrowserFixtureAuthority(descriptor) : undefined;
}

export function removeRx5BrowserFixtureCase(caseId: string): boolean {
  const reviewCase = getReviewCase(caseId);
  if (!reviewCase) return false;
  const producer = readReviewOriginResumeContext(reviewCase)?.producer;
  if (!producer || !isRx5DevelopmentCase(reviewCase, producer)) return false;
  removeReviewCase(caseId);
  return true;
}

export function cleanupRx5BrowserFixtureFromLocation(): boolean {
  if (typeof window === "undefined") return false;
  const descriptor = readRx5BrowserFixtureDescriptor(window.location.search);
  if (!descriptor) return false;
  removeRx5BrowserFixtureCase(descriptor.caseId);
  const url = new URL(window.location.href);
  url.searchParams.delete("fixture");
  url.searchParams.delete("producer");
  url.searchParams.delete("case");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new Event("popstate"));
  return true;
}

export function prepareRx5BrowserFixture(producer: OfficialReviewResumeProducer = "ufc_news"): {caseId: string; producer: OfficialReviewResumeProducer; url: string; getInvocationCount(): number; unregister(): void; cleanup(): void} {
  const reviewCase = createRx5ReviewFlowFixture(producer, "browser");
  const descriptor = Object.freeze({caseId: reviewCase.id, producer});
  const session = registerRx5BrowserFixtureAuthority(descriptor);
  const params = new URLSearchParams({fixture: RX5_BROWSER_FIXTURE_QUERY, producer, case: reviewCase.id});
  return Object.freeze({caseId: reviewCase.id, producer, url: `/revision?${params.toString()}`, getInvocationCount: session.getInvocationCount, unregister: session.unregister, cleanup: session.cleanup});
}

export const rx5ReviewFlowFixtureSecurity = Object.freeze({devOnly: true, deterministic: true, usesCanonicalReviewStore: true, externalWrites: false, network: false, sanity: false, telegram: false, polling: false, agents: false, createsStore: false, createsExecutor: false});
