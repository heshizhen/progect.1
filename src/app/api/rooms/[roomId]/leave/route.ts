import { NextRequest, NextResponse } from "next/server";
import {
  endOrCleanupRoom,
  getHashedIdentityFromRequest,
} from "@/lib/db/store";

export async function POST(
  req: NextRequest,
  context: { params: { roomId: string } }
) {
  try {
    const { roomId } = context.params;
    const body = await req.json().catch(() => ({}));
    const reason = body.reason === "timeout" ? "timeout" : "self_left";
    const { tokenHash } = getHashedIdentityFromRequest(req);

    const result = await endOrCleanupRoom(roomId, tokenHash, reason);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
