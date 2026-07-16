import type {ReactElement} from "react";
export default function OutcomeStatusBadge({label, status}: {label: string; status: string}): ReactElement { return <span className={`outcome-status outcome-status-${status.replace(/_/g, "-")}`}><strong>{label}:</strong> {status.replace(/_/g, " ")}</span>; }
