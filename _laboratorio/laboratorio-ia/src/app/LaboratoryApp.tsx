import type {ReactElement} from "react";
import PanelIA from "../components/PanelIA";
import ActivityScreen from "./screens/ActivityScreen";
import EditorialWorkspaceScreen from "./screens/EditorialWorkspaceScreen";
import LaboratoryStatusScreen from "./screens/LaboratoryStatusScreen";
import ReviewCenterScreen from "./screens/ReviewCenterScreen";
import TelegramStatusScreen from "./screens/TelegramStatusScreen";
import LaboratoryShell from "./LaboratoryShell";
import {useLaboratoryRouter} from "./useLaboratoryRouter";

export default function LaboratoryApp(): ReactElement {
  const {route, navigate} = useLaboratoryRouter();
  return <LaboratoryShell route={route} onNavigate={navigate}>
    {route.id === "status" ? <LaboratoryStatusScreen onNavigate={navigate} /> : null}
    <div hidden={route.id !== "editorial"}><EditorialWorkspaceScreen><PanelIA /></EditorialWorkspaceScreen></div>
    {route.id === "revision" ? <ReviewCenterScreen /> : null}
    {route.id === "activity" ? <ActivityScreen /> : null}
    {route.id === "telegram" ? <TelegramStatusScreen /> : null}
  </LaboratoryShell>;
}
