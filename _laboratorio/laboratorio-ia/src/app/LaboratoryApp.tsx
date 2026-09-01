import type {ReactElement} from "react";
import PanelIA from "../components/PanelIA";
import ActivityScreen from "./screens/ActivityScreen";
import EditorialWorkspaceScreen from "./screens/EditorialWorkspaceScreen";
import LaboratoryStatusScreen from "./screens/LaboratoryStatusScreen";
import ReviewCenterScreen from "./screens/ReviewCenterScreen";
import TelegramStatusScreen from "./screens/TelegramStatusScreen";
import LaboratoryShell from "./LaboratoryShell";
import {useLaboratoryRouter} from "./useLaboratoryRouter";
import {
  buildRx2ReviewInboxFixtures,
  buildRx3VisualReviewFixture,
  RX2_REVIEW_INBOX_FIXTURE_QUERY,
  RX3_VISUAL_REVIEW_FIXTURE_ID,
  RX3_VISUAL_REVIEW_FIXTURE_QUERY,
} from "../review/development";

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
  const fixtureQuery = developmentFixtures
    ? RX2_REVIEW_INBOX_FIXTURE_QUERY
    : developmentFixture
      ? RX3_VISUAL_REVIEW_FIXTURE_QUERY
      : undefined;
  return <LaboratoryShell route={route} onNavigate={navigate}>
    {route.id === "status" ? <LaboratoryStatusScreen onNavigate={navigate} /> : null}
    <div hidden={route.id !== "editorial"}><EditorialWorkspaceScreen><PanelIA /></EditorialWorkspaceScreen></div>
    {route.id === "revision" ? <ReviewCenterScreen caseId={requestedCaseId} developmentFixture={developmentFixture} developmentFixtures={developmentFixtures} fixtureQuery={fixtureQuery} /> : null}
    {route.id === "activity" ? <ActivityScreen /> : null}
    {route.id === "telegram" ? <TelegramStatusScreen /> : null}
  </LaboratoryShell>;
}
