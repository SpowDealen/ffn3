import type {ReactElement} from "react";
import type {OperationalWorkspaceZoneId} from "../nucleus";
import type {ReviewCase} from "../types";
import AutonomousInvestigationPanel from "../investigation/components/AutonomousInvestigationPanel";
import PreparedEntityMaterializationPanel from "../materialization/components/PreparedEntityMaterializationPanel";
import PreparedEntitySchemaRequirementsPanel from "../schemaRequirements/components/PreparedEntitySchemaRequirementsPanel";
import DecisionOutcomePanel from "../outcomes/components/DecisionOutcomePanel";
import DecisionMemoryPanel from "../memory/components/DecisionMemoryPanel";
import RelevantMemoryPanel from "../retrieval/components/RelevantMemoryPanel";
import InvestigationPanel from "../investigation/deep/InvestigationPanel";
import ReconciliationCasePanel from "../entityReconciliation/components/ReconciliationCasePanel";
import AutonomousReviewCenter from "./AutonomousReviewCenter";
import ExternalNewsResumePreviewPanel from "./ExternalNewsResumePreviewPanel";
import GlobalResolutionControls from "./GlobalResolutionControls";
import KnowledgeCenter from "./KnowledgeCenter";
import TransactionOperationalCenter from "./TransactionOperationalCenter";
import TransversalResolutionPlanPanel from "./TransversalResolutionPlanPanel";

type TechnicalZone = Exclude<OperationalWorkspaceZoneId, "summary">;

/** Loaded only after an explicit workspace navigation action. Authorities remain unchanged. */
export default function OperationalWorkspaceSection({zone, reviewCase, canEdit}: {zone: TechnicalZone; reviewCase: ReviewCase; canEdit: boolean}): ReactElement {
  const investigable = reviewCase.issues.some((issue) => ["missing_entity", "missing_reference", "ambiguous_reference", "contradictory_data", "low_confidence", "recoverable_error"].includes(issue.kind) && !reviewCase.resolutions.some((resolution) => resolution.issueId === issue.id && resolution.type !== "retry"));
  if (zone === "evidence") return <><AutonomousReviewCenter reviewCase={reviewCase} /><AutonomousInvestigationPanel caseId={reviewCase.id} editable={canEdit} investigable={investigable} /></>;
  if (zone === "resolution") return <><TransversalResolutionPlanPanel reviewCase={reviewCase} /><PreparedEntityMaterializationPanel reviewCase={reviewCase} /><PreparedEntitySchemaRequirementsPanel reviewCase={reviewCase} /></>;
  if (zone === "execution") return <><TransactionOperationalCenter reviewCase={reviewCase} /><GlobalResolutionControls reviewCase={reviewCase} /><ReconciliationCasePanel reviewCase={reviewCase} /><ExternalNewsResumePreviewPanel reviewCase={reviewCase} /></>;
  if (zone === "knowledge") return <KnowledgeCenter reviewCase={reviewCase} />;
  return <><DecisionOutcomePanel reviewCase={reviewCase} /><DecisionMemoryPanel reviewCase={reviewCase} /><RelevantMemoryPanel reviewCase={reviewCase} /><InvestigationPanel reviewCase={reviewCase} /></>;
}
