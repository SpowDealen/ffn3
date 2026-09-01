import type {ReactElement} from "react";
import ReviewCenter from "../../review/components/ReviewCenter";
import type {ReviewCase} from "../../review/types";
export default function ReviewCenterScreen({caseId, developmentFixture, developmentFixtures, fixtureQuery}: {caseId?: string | null; developmentFixture?: ReviewCase; developmentFixtures?: readonly ReviewCase[]; fixtureQuery?: string}): ReactElement {
  return <ReviewCenter initialCaseId={caseId} developmentFixture={developmentFixture} developmentFixtures={developmentFixtures} fixtureQuery={fixtureQuery} />;
}
