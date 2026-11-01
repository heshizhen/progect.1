import { NextRequest, NextResponse } from "next/server";
import {
  getHashedIdentityFromRequest,
  getIdentityStatus,
} from "@/lib/db/store";

export async function GET(req: NextRequest) {
  try {
    const { tokenHash, maskedId } = getHashedIdentityFromRequest(req);
    const status = await getIdentityStatus(tokenHash, maskedId);
    return NextResponse.json({
      ok: true,
      ...status,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
