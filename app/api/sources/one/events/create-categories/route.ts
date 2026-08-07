import {identityCreationBlocked, identityCreationBlockedOptions} from "@/app/api/_shared/identityCreationBlocked";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = identityCreationBlockedOptions;
export function POST() { return identityCreationBlocked("categoriaPeso", "resolve_identity:weight_category"); }
