import {identityCreationBlocked, identityCreationBlockedOptions} from "@/app/api/_shared/identityCreationBlocked";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = identityCreationBlockedOptions;
export function POST() { return identityCreationBlocked("combate", "resolve_identity:fight"); }
