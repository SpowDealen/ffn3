import {identityCreationBlocked} from "@/app/api/_shared/identityCreationBlocked";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST() {
  return identityCreationBlocked("documento", "resolve_identity:document");
}
