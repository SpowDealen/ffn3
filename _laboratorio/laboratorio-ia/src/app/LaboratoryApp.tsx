import {useEffect, useRef, type ReactElement} from "react";
import PanelIA from "../components/PanelIA";
import ActivityScreen from "./screens/ActivityScreen";
import EditorialWorkspaceScreen from "./screens/EditorialWorkspaceScreen";
import LaboratoryStatusScreen from "./screens/LaboratoryStatusScreen";
import ReviewCenterScreen from "./screens/ReviewCenterScreen";
import TelegramStatusScreen from "./screens/TelegramStatusScreen";
import LaboratoryShell from "./LaboratoryShell";
import {removeLaboratoryQueryParam, useLaboratoryRouter} from "./useLaboratoryRouter";
import {buildReviewContextSearch} from "../review/navigation";
import {
  buildRx2ReviewInboxFixtures,
  buildRx3VisualReviewFixture,
  RX2_REVIEW_INBOX_FIXTURE_QUERY,
  RX3_VISUAL_REVIEW_FIXTURE_ID,
  RX3_VISUAL_REVIEW_FIXTURE_QUERY,
} from "../review/development";
import {
  readRx5BrowserFixtureDescriptor,
  rehydrateRx5BrowserFixtureAuthority,
  removeRx5BrowserFixtureCase,
} from "../review/resume/origin";

export default function LaboratoryApp(): ReactElement {
  const {route, search, navigate} = useLaboratoryRouter();
  const requestedCaseId = search.get("case");
  const developmentFixture = import.meta.env.DEV &&
    search.get("fixture") === RX3_VISUAL_REVIEW_FIXTURE_QUERY &&
    requestedCaseId === RX3_VISUAL_REVIEW_FIXTURE_ID
      ? buildRx3VisualReviewFixture()
      : undefined;
  const developmentFixtures = import.meta.env.DEV && search.get("fixture") === RX2_REVIEW_INBOX_FIXTURE_QUERY
    ? buildRx2ReviewInboxFixtures()
    : undefined;
  const searchKey = search.toString();
  const rx5Fixture = import.meta.env.DEV ? readRx5BrowserFixtureDescriptor(searchKey) : undefined;
  const fixtureQuery = developmentFixtures
    ? RX2_REVIEW_INBOX_FIXTURE_QUERY
    : developmentFixture
      ? RX3_VISUAL_REVIEW_FIXTURE_QUERY
      : rx5Fixture
        ? buildReviewContextSearch(search)
        : undefined;
  const previousRx5FixtureCaseId = useRef<string>();
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const descriptor = readRx5BrowserFixtureDescriptor(searchKey);
    const previousCaseId = previousRx5FixtureCaseId.current;
    if (previousCaseId && previousCaseId !== descriptor?.caseId) removeRx5BrowserFixtureCase(previousCaseId);
    previousRx5FixtureCaseId.current = descriptor?.caseId;
  }, [searchKey]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let active = true;
    let unregister: (() => void) | undefined;
    queueMicrotask(() => {
      if (!active) return;
      unregister = rehydrateRx5BrowserFixtureAuthority(searchKey)?.unregister;
    });
    return () => {
      active = false;
      unregister?.();
    };
  }, [searchKey]);
  const reviewInboxSearch = removeLaboratoryQueryParam(search, "case");
  return <LaboratoryShell route={route} onNavigate={navigate}>
    {route.id === "status" ? <LaboratoryStatusScreen onNavigate={navigate} /> : null}
    <div hidden={route.id !== "editorial"}><EditorialWorkspaceScreen><PanelIA /></EditorialWorkspaceScreen></div>
    {route.id === "revision" ? <ReviewCenterScreen caseId={requestedCaseId} developmentFixture={developmentFixture} developmentFixtures={developmentFixtures} fixtureQuery={fixtureQuery} onReturnToInbox={() => navigate("/revision", reviewInboxSearch)} /> : null}
    {route.id === "activity" ? <ActivityScreen /> : null}
    {route.id === "telegram" ? <TelegramStatusScreen /> : null}
  </LaboratoryShell>;
}
