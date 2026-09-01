import type {ReactElement} from "react";
import ReviewCenter from "../../review/components/ReviewCenter";
import type {ReviewCase} from "../../review/types";
export default function ReviewCenterScreen({caseId, developmentFixture}: {caseId?: string | null; developmentFixture?: ReviewCase}): ReactElement {
  return <ReviewCenter initialCaseId={caseId} developmentFixture={developmentFixture} />;
}
