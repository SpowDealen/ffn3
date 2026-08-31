import type {ReactElement} from "react";
import ReviewCenter from "../../review/components/ReviewCenter";
export default function ReviewCenterScreen({caseId}: {caseId?: string | null}): ReactElement { return <ReviewCenter initialCaseId={caseId} />; }
